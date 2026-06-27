// MapView — the map layer for the Baltimore–Washington corridor app.
//
// Renders a MapLibre GL map (keyless CARTO dark raster basemap), one clustered
// source/layer set per category, a clickable apartments layer, and wires itself
// into the shared signal store (filters, selection, viewport, mapActions).
//
// NOTE: This uses CARTO's public raster tiles, which are keyless and match the
// dark UI. The documented faster upgrade is to self-host a pmtiles vector
// extract of the corridor (pmtiles@3 is already a dependency) and swap the
// `carto` raster source for a `pmtiles://` vector source + vector style — that
// removes the per-tile network round-trips and renders crisper at all zooms.

import { useEffect, useRef } from "preact/hooks";
import { effect } from "@preact/signals";
import maplibregl from "maplibre-gl";
import type {
  GeoJSONSource,
  MapGeoJSONFeature,
  MapLayerMouseEvent,
  StyleSpecification,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import {
  activeFilters,
  categoryData,
  enabledCategories,
  mapActions,
  selectedPlaceId,
  viewportBounds,
} from "../store";
import { loadCore, loadCategory } from "../data/loader";
import { CATEGORIES, CATEGORY_BY_ID } from "../data/taxonomy";
import { MAP_BOUNDS, MAP_CENTER, INITIAL_ZOOM } from "../data/config";
import type {
  CategoryId,
  FeatureCollection,
  PlaceFeature,
} from "../data/types";

const CATEGORY_IDS: CategoryId[] = CATEGORIES.map((c) => c.id);

// Keyless dark raster basemap (CARTO dark_all). See file header for the
// pmtiles upgrade path.
const BASEMAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    carto: {
      type: "raster",
      tiles: [
        "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
        "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
        "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      attribution: "© OpenStreetMap, © CARTO",
    },
  },
  layers: [{ id: "carto", type: "raster", source: "carto" }],
};

const POPUP_STYLE_ID = "mapview-popup-style";

// Inject a small style block so popups are legible on the dark theme.
function ensurePopupStyles(): void {
  if (document.getElementById(POPUP_STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = POPUP_STYLE_ID;
  el.textContent = `
.maplibregl-popup.mv-popup .maplibregl-popup-content {
  background: #1b1d21;
  color: #e9ecef;
  border: 1px solid #343a40;
  border-radius: 8px;
  padding: 10px 12px;
  font: 13px/1.4 system-ui, sans-serif;
  max-width: 260px;
  box-shadow: 0 6px 24px rgba(0,0,0,0.5);
}
.maplibregl-popup.mv-popup .maplibregl-popup-tip { border-top-color: #1b1d21; border-bottom-color: #1b1d21; }
.maplibregl-popup.mv-popup .maplibregl-popup-close-button { color: #adb5bd; font-size: 16px; }
.mv-popup h3 { margin: 0 0 4px; font-size: 14px; color: #fff; }
.mv-popup .mv-sub { color: #adb5bd; margin: 0 0 6px; font-size: 12px; }
.mv-popup .mv-tags { margin: 0 0 8px; color: #ced4da; font-size: 12px; }
.mv-popup .mv-tags div { margin: 1px 0; }
.mv-popup .mv-links { display: flex; gap: 6px; flex-wrap: wrap; }
.mv-popup .mv-links a {
  display: inline-block;
  padding: 4px 8px;
  background: #2b2f36;
  border: 1px solid #495057;
  border-radius: 5px;
  color: #e9ecef;
  text-decoration: none;
  font-size: 11px;
  white-space: nowrap;
}
.mv-popup .mv-links a:hover { background: #3a3f47; }
`;
  document.head.appendChild(el);
}

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!),
  );

// Active subcategory ids for one category, derived from the global filter set.
function activeSubsFor(cat: CategoryId): string[] {
  const out: string[] = [];
  for (const key of activeFilters.value) {
    const [c, sub] = key.split(":");
    if (c === cat) out.push(sub);
  }
  return out;
}

function srcId(cat: CategoryId): string {
  return `src-${cat}`;
}
function clusterLayerId(cat: CategoryId): string {
  return `${cat}-clusters`;
}
function countLayerId(cat: CategoryId): string {
  return `${cat}-cluster-count`;
}
function pointLayerId(cat: CategoryId): string {
  return `${cat}-points`;
}

// Build the popup HTML for a clicked feature.
function popupHTML(props: PlaceFeature["properties"]): string {
  const name = esc(props.name || "Unnamed");

  if (props.category === "apartments") {
    const where = esc(props.town || props.address || "");
    const tags = props.tags ?? {};
    const tagRows: string[] = [];
    if (tags.levels || tags["building:levels"]) {
      tagRows.push(`<div>Levels: ${esc(tags.levels || tags["building:levels"])}</div>`);
    }
    if (tags.units) tagRows.push(`<div>Units: ${esc(tags.units)}</div>`);
    if (tags.website) {
      tagRows.push(
        `<div>Website: <a href="${esc(tags.website)}" target="_blank" rel="noopener">link</a></div>`,
      );
    }
    const links = props.links;
    const linkBtns = links
      ? `<div class="mv-links">
          <a href="${esc(links.googleMaps)}" target="_blank" rel="noopener">Google Maps</a>
          <a href="${esc(links.apartmentsCom)}" target="_blank" rel="noopener">Apartments.com</a>
          <a href="${esc(links.zillow)}" target="_blank" rel="noopener">Zillow</a>
        </div>`
      : "";
    return `<div class="mv-popup">
      <h3>${name}</h3>
      ${where ? `<p class="mv-sub">${where}</p>` : ""}
      ${tagRows.length ? `<div class="mv-tags">${tagRows.join("")}</div>` : ""}
      ${linkBtns}
    </div>`;
  }

  // Non-apartment place: simpler popup.
  const catDef = CATEGORY_BY_ID[props.category as CategoryId];
  const subLabel =
    catDef?.subcategories.find((s: { id: string; label: string }) => s.id === props.subcategory)
      ?.label || props.subcategory;
  const tags = props.tags ?? {};
  const website = tags.website || tags["contact:website"];
  return `<div class="mv-popup">
    <h3>${name}</h3>
    <p class="mv-sub">${esc(subLabel)}</p>
    ${
      website
        ? `<div class="mv-links"><a href="${esc(website)}" target="_blank" rel="noopener">Website</a></div>`
        : ""
    }
  </div>`;
}

export function MapView() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  // Tracks which categories already have source+layers added to the map.
  const installedRef = useRef<Set<CategoryId>>(new Set());

  useEffect(() => {
    if (!containerRef.current) return;
    ensurePopupStyles();

    // Load core data immediately on mount — independent of the basemap. The
    // side panels (tiles/towns/counts) must work even if map tiles are slow or
    // blocked. Map layers are installed later by the post-`load` effect, which
    // reads whatever data has arrived by then.
    void loadCore();

    // maxBounds: pad slightly around MAP_BOUNDS so the corridor stays framed.
    const [w, s, e, n] = MAP_BOUNDS;
    const padX = (e - w) * 0.15;
    const padY = (n - s) * 0.15;
    const maxBounds: maplibregl.LngLatBoundsLike = [
      [w - padX, s - padY],
      [e + padX, n + padY],
    ];

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASEMAP_STYLE,
      center: MAP_CENTER,
      zoom: INITIAL_ZOOM,
      maxBounds,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    const disposers: Array<() => void> = [];

    // ---- Adds a clustered source + 3 layers for one category. ----
    function installCategory(cat: CategoryId, data: FeatureCollection): void {
      if (installedRef.current.has(cat)) return;
      if (map.getSource(srcId(cat))) return;
      const color = CATEGORY_BY_ID[cat].color;

      map.addSource(srcId(cat), {
        type: "geojson",
        data: data as unknown as GeoJSON.FeatureCollection,
        cluster: true,
        clusterRadius: 50,
        clusterMaxZoom: 14,
      });

      // Cluster circles.
      map.addLayer({
        id: clusterLayerId(cat),
        type: "circle",
        source: srcId(cat),
        filter: ["has", "point_count"],
        paint: {
          "circle-color": color,
          "circle-opacity": 0.85,
          "circle-radius": [
            "step",
            ["get", "point_count"],
            14,
            25,
            18,
            100,
            24,
          ],
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "rgba(0,0,0,0.4)",
        },
      });

      // Cluster counts.
      map.addLayer({
        id: countLayerId(cat),
        type: "symbol",
        source: srcId(cat),
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
          "text-size": 12,
          "text-allow-overlap": true,
        },
        paint: {
          "text-color": "#ffffff",
        },
      });

      // Unclustered points.
      map.addLayer({
        id: pointLayerId(cat),
        type: "circle",
        source: srcId(cat),
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": color,
          "circle-radius": 6,
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#ffffff",
        },
      });

      // Interactions on the interactive layers for this category.
      const interactive = [
        clusterLayerId(cat),
        pointLayerId(cat),
      ];
      for (const id of interactive) {
        map.on("mouseenter", id, onEnter);
        map.on("mouseleave", id, onLeave);
      }
      map.on("click", clusterLayerId(cat), onClusterClick);
      map.on("click", pointLayerId(cat), onPointClick);

      installedRef.current.add(cat);
      applyFilterFor(cat);
    }

    // ---- Apply the active-subcategory filter to a category's point layer. ----
    function applyFilterFor(cat: CategoryId): void {
      if (!installedRef.current.has(cat)) return;
      const subs = activeSubsFor(cat);
      const visible = subs.length > 0 ? "visible" : "none";

      // Filter the unclustered point layer to active subcategories.
      map.setFilter(pointLayerId(cat), [
        "all",
        ["!", ["has", "point_count"]],
        ["in", ["get", "subcategory"], ["literal", subs]],
      ]);

      for (const id of [
        pointLayerId(cat),
        clusterLayerId(cat),
        countLayerId(cat),
      ]) {
        map.setLayoutProperty(id, "visibility", visible);
      }
    }

    // ---- Pointer cursor over interactive layers. ----
    function onEnter(): void {
      map.getCanvas().style.cursor = "pointer";
    }
    function onLeave(): void {
      map.getCanvas().style.cursor = "";
    }

    // ---- Cluster click: zoom to expansion zoom. ----
    function onClusterClick(e: MapLayerMouseEvent): void {
      const feature = e.features?.[0] as MapGeoJSONFeature | undefined;
      if (!feature) return;
      const clusterId = feature.properties?.cluster_id;
      const src = map.getSource(feature.source) as GeoJSONSource | undefined;
      if (clusterId == null || !src) return;
      const coords = (feature.geometry as GeoJSON.Point).coordinates as [number, number];
      src
        .getClusterExpansionZoom(clusterId)
        .then((zoom) => {
          map.easeTo({ center: coords, zoom });
        })
        .catch(() => {});
    }

    // ---- Point click: open popup + set selection. ----
    function onPointClick(e: MapLayerMouseEvent): void {
      const feature = e.features?.[0];
      if (!feature) return;
      const props = feature.properties as unknown as PlaceFeature["properties"];
      const coords = (feature.geometry as GeoJSON.Point).coordinates as [number, number];
      selectedPlaceId.value = props.id ?? null;
      openPopupAt(coords, props);
    }

    function openPopupAt(
      coords: [number, number],
      props: PlaceFeature["properties"],
    ): void {
      popupRef.current?.remove();
      popupRef.current = new maplibregl.Popup({
        className: "mv-popup",
        closeButton: true,
        maxWidth: "280px",
      })
        .setLngLat(coords)
        .setHTML(popupHTML(props))
        .addTo(map);
    }

    // ---- Register map actions for the rest of the app. ----
    function registerActions(): void {
      mapActions.value = {
        flyTo(lng: number, lat: number, zoom = 15) {
          map.flyTo({ center: [lng, lat], zoom });
        },
        fitBounds(b: [number, number, number, number]) {
          map.fitBounds(
            [
              [b[0], b[1]],
              [b[2], b[3]],
            ],
            { padding: 40 },
          );
        },
        openPopup(placeId: string) {
          for (const cat of CATEGORY_IDS) {
            const fc = categoryData.value[cat];
            if (!fc) continue;
            const f = fc.features.find((feat) => feat.properties.id === placeId);
            if (f) {
              const coords = f.geometry.coordinates as [number, number];
              selectedPlaceId.value = placeId;
              map.flyTo({ center: coords, zoom: Math.max(map.getZoom(), 15) });
              openPopupAt(coords, f.properties);
              return;
            }
          }
        },
      };
    }

    // ---- Keep viewportBounds in sync. ----
    function onMoveEnd(): void {
      const b = map.getBounds();
      viewportBounds.value = [
        b.getWest(),
        b.getSouth(),
        b.getEast(),
        b.getNorth(),
      ];
    }
    map.on("moveend", onMoveEnd);

    // ---- Everything that depends on the style being ready. ----
    map.on("load", () => {
      registerActions();
      onMoveEnd(); // seed initial bounds

      // Reactively install + filter category layers as data and filters change.
      const dataEffect = effect(() => {
        const data = categoryData.value;
        for (const cat of CATEGORY_IDS) {
          const fc = data[cat];
          if (fc && !installedRef.current.has(cat)) {
            installCategory(cat, fc);
          }
        }
      });
      disposers.push(dataEffect);

      // Lazy-load categories that become enabled but aren't loaded yet.
      const loadEffect = effect(() => {
        const enabled = enabledCategories.value;
        for (const cat of CATEGORY_IDS) {
          if (cat === "apartments") continue; // loaded by loadCore
          if (enabled.has(cat) && !categoryData.value[cat]) {
            void loadCategory(cat);
          }
        }
      });
      disposers.push(loadEffect);

      // Re-apply per-category subcategory filters whenever they change.
      const filterEffect = effect(() => {
        // Touch activeFilters so this effect re-runs on every change.
        void activeFilters.value;
        for (const cat of CATEGORY_IDS) {
          if (installedRef.current.has(cat)) applyFilterFor(cat);
        }
      });
      disposers.push(filterEffect);
    });

    // ---- Cleanup. ----
    return () => {
      for (const dispose of disposers) dispose();
      popupRef.current?.remove();
      popupRef.current = null;
      if (mapActions.value) mapActions.value = null;
      map.remove();
      mapRef.current = null;
      installedRef.current = new Set();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
    />
  );
}

export default MapView;
