// MapView — the map layer for the Baltimore–Washington corridor app.
//
// Renders a MapLibre GL map (keyless CARTO dark raster basemap), one clustered
// source/layer set per category, a clickable apartments layer, and wires itself
// into the shared signal store (filters, selection, viewport, mapActions).
//
// NOTE: This uses Esri's public World Imagery raster tiles (keyless) plus Esri
// reference overlays for roads/labels. The documented faster upgrade is to
// self-host a pmtiles extract of the corridor (pmtiles@3 is already a
// dependency) and swap these raster sources for a vector style.

import { useEffect, useRef } from "preact/hooks";
import { effect } from "@preact/signals";
import maplibregl from "maplibre-gl";
import type {
  ExpressionSpecification,
  GeoJSONSource,
  MapGeoJSONFeature,
  MapLayerMouseEvent,
  StyleSpecification,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import {
  activeFilters,
  bookmarks,
  categoryData,
  clearNearby,
  enabledCategories,
  isBookmarked,
  mapActions,
  nearbyFocus,
  selectedPlaceId,
  selectedTowns,
  showNearby,
  toggleBookmark,
  towns,
  viewportBounds,
} from "../store";
import { loadCore, loadCategory } from "../data/loader";
import { CATEGORIES, CATEGORY_BY_ID } from "../data/taxonomy";
import { MAP_BOUNDS, MAP_CENTER, INITIAL_ZOOM } from "../data/config";
import type { CategoryId, PlaceFeature } from "../data/types";

const CATEGORY_IDS: CategoryId[] = CATEGORIES.map((c) => c.id);

// Keyless real-satellite basemap: Esri World Imagery + transparent reference
// overlays (roads + place/street labels) for a Google-style hybrid — realistic
// aerial imagery with enough labelling to navigate.
const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services";
const BASEMAP_STYLE: StyleSpecification = {
  version: 8,
  // Keyless public glyph endpoint so our symbol layers (town labels, the Fort
  // Meade label, cluster counts) can render text over the raster basemap.
  glyphs: "https://fonts.openmaptiles.org/{fontstack}/{range}.pbf",
  sources: {
    imagery: {
      type: "raster",
      tiles: [`${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`],
      tileSize: 256,
      maxzoom: 19,
      attribution: "Esri, Maxar, Earthstar Geographics, © OpenStreetMap",
    },
    transportation: {
      type: "raster",
      tiles: [`${ESRI}/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}`],
      tileSize: 256,
      maxzoom: 19,
    },
    places: {
      type: "raster",
      tiles: [
        `${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`,
      ],
      tileSize: 256,
      maxzoom: 19,
    },
  },
  layers: [
    { id: "imagery", type: "raster", source: "imagery" },
    { id: "transportation", type: "raster", source: "transportation" },
    { id: "places", type: "raster", source: "places" },
  ],
};

// Single font (no comma-joined composite) the openmaptiles glyph server serves
// as a clean SDF PBF.
const LABEL_FONT = ["Open Sans Bold"];

// Distinct dot color for bookmarked apartments (vs the orange default).
const BOOKMARK_COLOR = "#1971c2";

// Data-driven paint expressions: bookmarked apartment ids render bigger and in
// the bookmark color. Rebuilt whenever the bookmark set changes.
function bookmarkColorExpr(ids: string[]): ExpressionSpecification {
  return [
    "case",
    ["in", ["get", "id"], ["literal", ids]],
    BOOKMARK_COLOR,
    CATEGORY_BY_ID.apartments.color,
  ];
}
function bookmarkRadiusExpr(ids: string[]): ExpressionSpecification {
  return ["case", ["in", ["get", "id"], ["literal", ids]], 7.5, 6];
}

const EMPTY_FC: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

// Great-circle distance in miles.
function haversineMi(aLng: number, aLat: number, bLng: number, bLat: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 3958.7613; // earth radius, miles
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Apartments limited to the currently selected towns (empty when none selected).
function selectedApartmentFC(): GeoJSON.FeatureCollection {
  const fc = categoryData.value.apartments;
  const sel = selectedTowns.value;
  if (!fc || sel.size === 0) return EMPTY_FC;
  const features = fc.features.filter((f) => {
    const t = f.properties.town;
    return !!t && sel.has(t);
  });
  return { type: "FeatureCollection", features: features as unknown as GeoJSON.Feature[] };
}

// POI category data, narrowed to the nearby radius when a focus is active.
function poiSourceFC(cat: CategoryId): GeoJSON.FeatureCollection {
  const fc = categoryData.value[cat];
  if (!fc) return EMPTY_FC;
  const focus = nearbyFocus.value;
  if (!focus) return fc as unknown as GeoJSON.FeatureCollection;
  const features = fc.features.filter((f) => {
    const [lng, lat] = f.geometry.coordinates;
    return haversineMi(lng, lat, focus.lng, focus.lat) <= focus.radiusMi;
  });
  return { type: "FeatureCollection", features: features as unknown as GeoJSON.Feature[] };
}

function sourceDataFor(cat: CategoryId): GeoJSON.FeatureCollection {
  return cat === "apartments" ? selectedApartmentFC() : poiSourceFC(cat);
}

// A circle polygon (for the nearby radius ring), miles → ring of lng/lat points.
function circlePolygon(lng: number, lat: number, radiusMi: number): GeoJSON.Feature {
  const pts: [number, number][] = [];
  const latR = radiusMi / 69; // ~69 mi per degree latitude
  const lngR = radiusMi / (69 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * 2 * Math.PI;
    pts.push([lng + lngR * Math.cos(a), lat + latR * Math.sin(a)]);
  }
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [pts] } };
}

// Per-category clustering config. Apartments use a tight radius + low max-zoom
// so bubbles stay local and break into individual dots quickly when you zoom in.
const CLUSTER_CFG: Record<CategoryId, { radius: number; maxZoom: number }> = {
  apartments: { radius: 38, maxZoom: 12 },
  food: { radius: 50, maxZoom: 14 },
  shopping: { radius: 50, maxZoom: 14 },
  entertainment: { radius: 50, maxZoom: 14 },
};

const POPUP_STYLE_ID = "mapview-popup-style";

// Inject a small style block so popups match the warm light theme.
function ensurePopupStyles(): void {
  if (document.getElementById(POPUP_STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = POPUP_STYLE_ID;
  el.textContent = `
.maplibregl-popup.mv-popup .maplibregl-popup-content {
  background: #fffdf8;
  color: #2a2620;
  border: 1px solid #ddd3c0;
  border-radius: 10px;
  padding: 11px 13px;
  font: 13px/1.4 system-ui, sans-serif;
  max-width: 260px;
  box-shadow: 0 8px 24px rgba(60,50,30,0.18);
}
.maplibregl-popup.mv-popup .maplibregl-popup-tip { border-top-color: #fffdf8; border-bottom-color: #fffdf8; }
.maplibregl-popup.mv-popup .maplibregl-popup-close-button { color: #857b68; font-size: 16px; }
.mv-popup h3 { margin: 0 0 4px; font-size: 14px; color: #1f1b16; }
.mv-popup .mv-sub { color: #857b68; margin: 0 0 6px; font-size: 12px; }
.mv-popup .mv-tags { margin: 0 0 8px; color: #5f574a; font-size: 12px; }
.mv-popup .mv-tags div { margin: 1px 0; }
.mv-popup .mv-links { display: flex; gap: 6px; flex-wrap: wrap; }
.mv-popup .mv-links a {
  display: inline-block;
  padding: 4px 8px;
  background: #f0eadd;
  border: 1px solid #ddd3c0;
  border-radius: 5px;
  color: #1f6f6b;
  text-decoration: none;
  font-size: 11px;
  white-space: nowrap;
}
.mv-popup .mv-links a:hover { background: #e6dcc8; }
.mv-popup .mv-bm {
  display: inline-block;
  margin: 0 0 8px;
  padding: 5px 10px;
  font-size: 12px;
  font-weight: 600;
  color: #1971c2;
  background: #e7f1fb;
  border: 1px solid #a5c8ec;
  border-radius: 6px;
}
.mv-popup .mv-bm:hover { background: #d7e7f8; }
.mv-popup .mv-bm.on { color: #fff; background: #1971c2; border-color: #1971c2; }
.mv-popup .mv-actions { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 8px; }
.mv-popup .mv-actions .mv-bm { margin: 0; }
.mv-popup .mv-nearby {
  padding: 5px 10px;
  font-size: 12px;
  font-weight: 600;
  color: #2b8a3e;
  background: #e9f6ec;
  border: 1px solid #a3d9b1;
  border-radius: 6px;
}
.mv-popup .mv-nearby:hover { background: #dcf0e1; }
.mv-popup .mv-nearby.on { color: #fff; background: #2b8a3e; border-color: #2b8a3e; }
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
    const marked = isBookmarked(props.id);
    const bmBtn = `<button type="button" class="mv-bm${marked ? " on" : ""}" data-id="${esc(props.id)}">${
      marked ? "★ Bookmarked" : "☆ Bookmark"
    }</button>`;
    const nearbyOn = nearbyFocus.value?.id === props.id;
    const nbBtn = `<button type="button" class="mv-nearby${nearbyOn ? " on" : ""}" data-id="${esc(props.id)}" data-name="${esc(
      props.name || "Apartment",
    )}" data-lng="${props.lng}" data-lat="${props.lat}">${
      nearbyOn ? "✕ Hide nearby" : "🍽 Food & fun within 10 mi"
    }</button>`;
    return `<div class="mv-popup">
      <h3>${name}</h3>
      ${where ? `<p class="mv-sub">${where}</p>` : ""}
      ${tagRows.length ? `<div class="mv-tags">${tagRows.join("")}</div>` : ""}
      <div class="mv-actions">${bmBtn}${nbBtn}</div>
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

    // maxBounds: generous padding around MAP_BOUNDS so there's room to pan and
    // look around the edges (toward Baltimore / DC) without loading more data.
    const [w, s, e, n] = MAP_BOUNDS;
    const padX = (e - w) * 0.45;
    const padY = (n - s) * 0.45;
    const maxBounds: maplibregl.LngLatBoundsLike = [
      [w - padX, s - padY],
      [e + padX, n + padY],
    ];

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASEMAP_STYLE,
      center: MAP_CENTER,
      zoom: INITIAL_ZOOM,
      minZoom: 9,
      maxBounds,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    const disposers: Array<() => void> = [];

    // ---- Adds a clustered source + 3 layers for one category. ----
    function installCategory(cat: CategoryId): void {
      if (installedRef.current.has(cat)) return;
      if (map.getSource(srcId(cat))) return;
      const color = CATEGORY_BY_ID[cat].color;
      const cfg = CLUSTER_CFG[cat];

      map.addSource(srcId(cat), {
        type: "geojson",
        data: sourceDataFor(cat),
        cluster: true,
        clusterRadius: cfg.radius,
        clusterMaxZoom: cfg.maxZoom,
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
          "circle-radius": ["step", ["get", "point_count"], 14, 25, 18, 100, 24],
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "rgba(255,255,255,0.85)",
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
          "text-font": LABEL_FONT,
          "text-size": 12,
          "text-allow-overlap": true,
        },
        paint: {
          "text-color": "#ffffff",
          "text-halo-color": "rgba(0,0,0,0.5)",
          "text-halo-width": 1,
        },
      });

      // Unclustered points. Apartments use bookmark-aware color/size.
      const isApt = cat === "apartments";
      const bmIds = [...bookmarks.value];
      map.addLayer({
        id: pointLayerId(cat),
        type: "circle",
        source: srcId(cat),
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": isApt ? bookmarkColorExpr(bmIds) : color,
          "circle-radius": isApt ? bookmarkRadiusExpr(bmIds) : 6,
          "circle-stroke-width": 1.5,
          // White halo keeps dots legible over satellite imagery.
          "circle-stroke-color": "rgba(255,255,255,0.95)",
          "circle-stroke-opacity": 1,
        },
      });

      map.on("mouseenter", pointLayerId(cat), onEnter);
      map.on("mouseleave", pointLayerId(cat), onLeave);
      map.on("click", pointLayerId(cat), onPointClick);
      map.on("mouseenter", clusterLayerId(cat), onEnter);
      map.on("mouseleave", clusterLayerId(cat), onLeave);
      map.on("click", clusterLayerId(cat), onClusterClick);

      installedRef.current.add(cat);
      applyFilterFor(cat);
    }

    // ---- Apply visibility/filters for a category's layers. ----
    function applyFilterFor(cat: CategoryId): void {
      if (!installedRef.current.has(cat)) return;
      const layerIds = [pointLayerId(cat), clusterLayerId(cat), countLayerId(cat)];

      // Apartments: visibility is driven entirely by the source data (selected
      // towns). Show all of its points/clusters, no subcategory filtering.
      if (cat === "apartments") {
        map.setFilter(pointLayerId(cat), ["!", ["has", "point_count"]]);
        for (const id of layerIds) {
          if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "visible");
        }
        return;
      }

      const subs = activeSubsFor(cat);
      const visible = subs.length > 0 ? "visible" : "none";

      // Filter the unclustered point layer to active subcategories.
      map.setFilter(pointLayerId(cat), [
        "all",
        ["!", ["has", "point_count"]],
        ["in", ["get", "subcategory"], ["literal", subs]],
      ]);

      for (const id of layerIds) {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visible);
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

      // Wire the in-popup bookmark toggle (apartments only).
      const el = popupRef.current.getElement();
      const btn = el?.querySelector(".mv-bm");
      if (btn) {
        btn.addEventListener("click", () => {
          const id = btn.getAttribute("data-id");
          if (!id) return;
          toggleBookmark(id);
          const on = isBookmarked(id);
          btn.textContent = on ? "★ Bookmarked" : "☆ Bookmark";
          btn.classList.toggle("on", on);
        });
      }

      // Wire the "nearby within 10 mi" toggle.
      const nb = el?.querySelector(".mv-nearby");
      if (nb) {
        nb.addEventListener("click", () => {
          const id = nb.getAttribute("data-id");
          const nm = nb.getAttribute("data-name") || "Apartment";
          const lng = Number(nb.getAttribute("data-lng"));
          const lat = Number(nb.getAttribute("data-lat"));
          if (!id || !Number.isFinite(lng) || !Number.isFinite(lat)) return;
          if (nearbyFocus.value?.id === id) {
            clearNearby();
            nb.textContent = "🍽 Food & fun within 10 mi";
            nb.classList.remove("on");
          } else {
            showNearby({ id, name: nm, lng, lat, radiusMi: 10 });
            map.fitBounds(
              [
                [lng - 0.22, lat - 0.16],
                [lng + 0.22, lat + 0.16],
              ],
              { padding: 30 },
            );
            nb.textContent = "✕ Hide nearby";
            nb.classList.add("on");
          }
        });
      }
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

      // ---- Fort Meade installation outline (real OSM boundary, baked JSON). ----
      const fmBase = import.meta.env.BASE_URL || "/";
      fetch(`${fmBase}data/fort-meade.json`)
        .then((r) => (r.ok ? r.json() : null))
        .then((geo: GeoJSON.Feature | null) => {
          if (!geo || map.getSource("src-fort-meade")) return;
          map.addSource("src-fort-meade", { type: "geojson", data: geo });
          map.addLayer({
            id: "fort-meade-fill",
            type: "fill",
            source: "src-fort-meade",
            paint: { "fill-color": "#ffd43b", "fill-opacity": 0.06 },
          });
          map.addLayer({
            id: "fort-meade-outline",
            type: "line",
            source: "src-fort-meade",
            paint: {
              // Bright yellow dashed line stands out on satellite imagery.
              "line-color": "#ffd43b",
              "line-width": 2.5,
              "line-dasharray": [3, 2],
            },
          });
          map.addLayer({
            id: "fort-meade-label",
            type: "symbol",
            source: "src-fort-meade",
            layout: {
              "text-field": "Fort Meade",
              "text-font": LABEL_FONT,
              "text-size": 13,
              "text-letter-spacing": 0.05,
              "text-transform": "uppercase",
              "symbol-placement": "point",
            },
            paint: {
              "text-color": "#ffe066",
              "text-halo-color": "rgba(0,0,0,0.85)",
              "text-halo-width": 1.8,
            },
          });
        })
        .catch(() => {});

      // ---- Clear, bold corridor town labels (drawn on top). ----
      const townsEffect = effect(() => {
        const list = towns.value;
        if (!list.length) return;
        const townsFC: GeoJSON.FeatureCollection = {
          type: "FeatureCollection",
          features: list.map((t) => ({
            type: "Feature",
            geometry: { type: "Point", coordinates: [t.lng, t.lat] },
            properties: { name: t.name, placeType: t.placeType },
          })),
        };
        const src = map.getSource("src-towns") as GeoJSONSource | undefined;
        if (src) {
          src.setData(townsFC);
          return;
        }
        map.addSource("src-towns", { type: "geojson", data: townsFC });
        map.addLayer({
          id: "town-dots",
          type: "circle",
          source: "src-towns",
          paint: {
            "circle-radius": 3,
            "circle-color": "#ffd43b",
            "circle-stroke-color": "rgba(0,0,0,0.7)",
            "circle-stroke-width": 1.2,
          },
        });
        map.addLayer({
          id: "town-labels",
          type: "symbol",
          source: "src-towns",
          layout: {
            "text-field": ["get", "name"],
            "text-font": LABEL_FONT,
            "text-size": ["interpolate", ["linear"], ["zoom"], 9, 11, 13, 16],
            "text-anchor": "top",
            "text-offset": [0, 0.5],
            "text-padding": 6,
          },
          paint: {
            // White text + dark halo reads clearly over satellite imagery.
            "text-color": "#ffffff",
            "text-halo-color": "rgba(0,0,0,0.85)",
            "text-halo-width": 1.6,
            "text-halo-blur": 0.3,
          },
        });
      });
      disposers.push(townsEffect);

      // Reactively install category layers as their data arrives.
      const dataEffect = effect(() => {
        const data = categoryData.value;
        for (const cat of CATEGORY_IDS) {
          if (data[cat] && !installedRef.current.has(cat)) {
            installCategory(cat);
          }
        }
      });
      disposers.push(dataEffect);

      // Update the apartments source to the selected towns' subset (empty when
      // nothing is selected). Also re-runs when the apartment data first loads.
      const areaEffect = effect(() => {
        void selectedTowns.value;
        void categoryData.value.apartments;
        const src = map.getSource(srcId("apartments")) as GeoJSONSource | undefined;
        if (src) src.setData(selectedApartmentFC());
      });
      disposers.push(areaEffect);

      // Narrow POI sources to the nearby radius (or restore full) + draw ring.
      const nearbyEffect = effect(() => {
        const focus = nearbyFocus.value;
        void categoryData.value;
        for (const cat of ["food", "shopping", "entertainment"] as CategoryId[]) {
          const src = map.getSource(srcId(cat)) as GeoJSONSource | undefined;
          if (src) src.setData(poiSourceFC(cat));
        }
        // Radius ring.
        const ringSrc = map.getSource("src-nearby-ring") as GeoJSONSource | undefined;
        const ringData = focus
          ? circlePolygon(focus.lng, focus.lat, focus.radiusMi)
          : EMPTY_FC;
        if (ringSrc) {
          ringSrc.setData(ringData as GeoJSON.GeoJSON);
        } else if (focus) {
          map.addSource("src-nearby-ring", { type: "geojson", data: ringData });
          map.addLayer({
            id: "nearby-ring",
            type: "line",
            source: "src-nearby-ring",
            paint: {
              "line-color": "#ffffff",
              "line-width": 2,
              "line-dasharray": [2, 2],
              "line-opacity": 0.9,
            },
          });
        }
      });
      disposers.push(nearbyEffect);

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

      // Recolor/resize apartment dots when the bookmark set changes.
      const bookmarkEffect = effect(() => {
        const ids = [...bookmarks.value];
        const layer = pointLayerId("apartments");
        if (installedRef.current.has("apartments") && map.getLayer(layer)) {
          map.setPaintProperty(layer, "circle-color", bookmarkColorExpr(ids));
          map.setPaintProperty(layer, "circle-radius", bookmarkRadiusExpr(ids));
        }
      });
      disposers.push(bookmarkEffect);

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
