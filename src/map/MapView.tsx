// MapView — the map layer for the Baltimore–Washington corridor app.
//
// Basemap: OpenFreeMap vector styles (keyless, free), one per theme, with an
// automatic CARTO raster fallback if the vector style can't be fetched.
// Category data renders as clustered GeoJSON sources. Filtering (subcategories
// + search) works by swapping each source's data via setData() with a filtered
// FeatureCollection — so clusters and their counts always reflect exactly the
// visible set.

import { useEffect, useRef } from "preact/hooks";
import { effect, signal } from "@preact/signals";
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
  matchesSearch,
  searchQuery,
  selectedPlaceId,
  theme,
  viewport,
  viewportBounds,
} from "../store";
import { loadCore, loadCategory } from "../data/loader";
import { safeUrl } from "../data/sanitize";
import { initialView } from "../urlState";
import { CATEGORIES, CATEGORY_BY_ID, subcategoryLabel } from "../data/taxonomy";
import { MAP_BOUNDS, MAP_CENTER, INITIAL_ZOOM } from "../data/config";
import type {
  CategoryId,
  FeatureCollection,
  PlaceFeature,
} from "../data/types";

const CATEGORY_IDS: CategoryId[] = CATEGORIES.map((c) => c.id);

// ---- Basemap styles ----

const VECTOR_STYLE_URL: Record<"light" | "dark", string> = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
};

// Raster fallback (CARTO, keyless) used when the vector style can't load.
// Includes a glyphs endpoint so symbol layers (cluster counts) still work.
function rasterFallbackStyle(mode: "light" | "dark"): StyleSpecification {
  const variant = mode === "dark" ? "dark_all" : "light_all";
  return {
    version: 8,
    glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
    sources: {
      carto: {
        type: "raster",
        tiles: ["a", "b", "c"].map(
          (s) => `https://${s}.basemaps.cartocdn.com/${variant}/{z}/{x}/{y}.png`,
        ),
        tileSize: 256,
        attribution: "© OpenStreetMap contributors, © CARTO",
      },
    },
    layers: [{ id: "carto", type: "raster", source: "carto" }],
  };
}

// ---- Small helpers ----

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!),
  );

function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  let t: ReturnType<typeof setTimeout> | undefined;
  const wrapped = (...args: A) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
  wrapped.cancel = () => clearTimeout(t);
  return wrapped as typeof wrapped & { cancel: () => void };
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

const SELECT_SRC = "src-selected";
const SELECT_LAYER = "selected-ring";

const EMPTY_FC: FeatureCollection = { type: "FeatureCollection", features: [] };

// Subcategory + search filter applied to one category's full FeatureCollection.
function filteredFC(
  cat: CategoryId,
  full: FeatureCollection,
  filters: Set<string>,
  q: string,
): FeatureCollection {
  const features = full.features.filter((f) => {
    const p = f.properties;
    if (!filters.has(`${cat}:${p.subcategory}`)) return false;
    return matchesSearch(p.name, p.town, q);
  });
  return { type: "FeatureCollection", features };
}

// ---- Popup HTML ----

function popupHTML(props: PlaceFeature["properties"]): string {
  const name = esc(props.name || "Unnamed");
  const tags = props.tags ?? {};

  if (props.category === "apartments") {
    const where = esc(props.address || props.town || "");
    const rows: string[] = [];
    const levels = tags["building:levels"] || tags.levels;
    if (levels) rows.push(`<div>Floors: ${esc(levels)}</div>`);
    if (tags.units) rows.push(`<div>Units: ${esc(tags.units)}</div>`);
    if (tags.operator) rows.push(`<div>Managed by ${esc(tags.operator)}</div>`);
    // OSM tag values are untrusted — only render scheme-safe web URLs.
    const website = safeUrl(tags.website || tags["contact:website"]);
    if (website) {
      rows.push(
        `<div><a href="${esc(website)}" target="_blank" rel="noopener noreferrer">Official website</a></div>`,
      );
    }
    const links = props.links;
    const linkBtns = links
      ? `<div class="pop-links">
          <a href="${esc(links.googleMaps)}" target="_blank" rel="noopener">Google Maps</a>
          <a href="${esc(links.apartmentsCom)}" target="_blank" rel="noopener">Apartments.com</a>
          <a href="${esc(links.zillow)}" target="_blank" rel="noopener">Zillow</a>
        </div>`
      : "";
    return `<h3>${name}</h3>
      ${where ? `<p class="pop-sub">${where}</p>` : ""}
      ${rows.length ? `<div class="pop-tags">${rows.join("")}</div>` : ""}
      ${linkBtns}`;
  }

  const subLabel = subcategoryLabel(props.category, props.subcategory);
  const detail: string[] = [esc(subLabel)];
  if (props.town) detail.push(esc(props.town));
  const website = safeUrl(tags.website || tags["contact:website"]);
  return `<h3>${name}</h3>
    <p class="pop-sub">${detail.join(" · ")}</p>
    ${
      website
        ? `<div class="pop-links"><a href="${esc(website)}" target="_blank" rel="noopener noreferrer">Website</a></div>`
        : ""
    }`;
}

// ---- Reset-view control ----

class ResetViewControl implements maplibregl.IControl {
  private container: HTMLDivElement | null = null;

  onAdd(map: maplibregl.Map): HTMLElement {
    this.container = document.createElement("div");
    this.container.className = "maplibregl-ctrl maplibregl-ctrl-group";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "bwc-reset-view";
    btn.title = "Reset view to the full corridor";
    btn.setAttribute("aria-label", "Reset view to the full corridor");
    btn.innerHTML =
      '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 6V2h4M14 10v4h-4M2 2l4.5 4.5M14 14 9.5 9.5"/></svg>';
    btn.addEventListener("click", () => {
      map.fitBounds(
        [
          [MAP_BOUNDS[0], MAP_BOUNDS[1]],
          [MAP_BOUNDS[2], MAP_BOUNDS[3]],
        ],
        { padding: 24 },
      );
    });
    this.container.appendChild(btn);
    return this.container;
  }

  onRemove(): void {
    this.container?.remove();
    this.container = null;
  }
}

// ---- Component ----

export function MapView() {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Load core data immediately — independent of the basemap, so the side
    // panels work even if map tiles are slow or blocked.
    void loadCore();

    // Local reactive flag: true whenever the current style is ready for our
    // sources/layers. Flips false on every setStyle, true on style.load —
    // effects below re-run on that transition and re-install everything.
    const styleReady = signal(false);
    // Set of categories with sources/layers installed on the CURRENT style.
    let installed = new Set<CategoryId>();
    let usedFallback = false;
    let popup: maplibregl.Popup | null = null;

    const [w, s, e, n] = MAP_BOUNDS;
    const padX = (e - w) * 0.15;
    const padY = (n - s) * 0.15;

    // Restore camera from the URL hash if present (shareable deep links).
    const fromUrl = initialView();

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: VECTOR_STYLE_URL[theme.value],
      center: fromUrl ? [fromUrl.lng, fromUrl.lat] : MAP_CENTER,
      zoom: fromUrl ? fromUrl.zoom : INITIAL_ZOOM,
      maxBounds: [
        [w - padX, s - padY],
        [e + padX, n + padY],
      ],
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        fitBoundsOptions: { maxZoom: 14 },
        showUserLocation: true,
      }),
      "top-right",
    );
    map.addControl(new ResetViewControl(), "top-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "imperial" }), "bottom-left");

    // If the vector style itself can't be fetched (offline/blocked), fall back
    // to a locally-defined raster style so the app still has a working map.
    map.on("error", (ev) => {
      const msg = String(ev.error?.message ?? "");
      if (!usedFallback && !map.isStyleLoaded() && /style|fetch|failed|abort/i.test(msg)) {
        usedFallback = true;
        map.setStyle(rasterFallbackStyle(theme.value));
      }
    });

    // ---- Source/layer installation (runs after every style load) ----

    function installCategory(cat: CategoryId, data: FeatureCollection): void {
      if (installed.has(cat) || map.getSource(srcId(cat))) return;
      const color = CATEGORY_BY_ID[cat].color;

      map.addSource(srcId(cat), {
        type: "geojson",
        data: data as unknown as GeoJSON.FeatureCollection,
        cluster: true,
        clusterRadius: 50,
        clusterMaxZoom: 14,
      });

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
          "circle-stroke-color": "rgba(0,0,0,0.35)",
        },
      });

      map.addLayer({
        id: countLayerId(cat),
        type: "symbol",
        source: srcId(cat),
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-font": ["Noto Sans Regular"],
          "text-size": 12,
          "text-allow-overlap": true,
        },
        paint: { "text-color": "#ffffff" },
      });

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

      map.on("mouseenter", clusterLayerId(cat), onEnter);
      map.on("mouseleave", clusterLayerId(cat), onLeave);
      map.on("mouseenter", pointLayerId(cat), onEnter);
      map.on("mouseleave", pointLayerId(cat), onLeave);
      map.on("click", clusterLayerId(cat), onClusterClick);
      map.on("click", pointLayerId(cat), onPointClick);

      installed.add(cat);
    }

    function installSelectionLayer(): void {
      if (map.getSource(SELECT_SRC)) return;
      map.addSource(SELECT_SRC, {
        type: "geojson",
        data: EMPTY_FC as unknown as GeoJSON.FeatureCollection,
      });
      map.addLayer({
        id: SELECT_LAYER,
        type: "circle",
        source: SELECT_SRC,
        paint: {
          "circle-radius": 11,
          "circle-color": "rgba(0,0,0,0)",
          "circle-stroke-width": 2.5,
          "circle-stroke-color": "#ffffff",
          "circle-opacity": 0,
          "circle-stroke-opacity": 0.95,
        },
      });
    }

    // Push current (filtered) data into a category's source + set visibility.
    function syncCategory(cat: CategoryId): void {
      const src = map.getSource(srcId(cat)) as GeoJSONSource | undefined;
      if (!src) return;
      const full = categoryData.peek()[cat];
      if (!full) return;
      const filters = activeFilters.peek();
      const q = searchQuery.peek().trim();
      const fc = filteredFC(cat, full, filters, q);
      src.setData(fc as unknown as GeoJSON.FeatureCollection);
      const visible = fc.features.length > 0 ? "visible" : "none";
      for (const id of [pointLayerId(cat), clusterLayerId(cat), countLayerId(cat)]) {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visible);
      }
    }

    const syncAllDebounced = debounce(() => {
      if (!styleReady.peek()) return;
      for (const cat of installed) syncCategory(cat);
    }, 120);

    // ---- Interactions ----

    function onEnter(): void {
      map.getCanvas().style.cursor = "pointer";
    }
    function onLeave(): void {
      map.getCanvas().style.cursor = "";
    }

    function onClusterClick(e: MapLayerMouseEvent): void {
      const feature = e.features?.[0] as MapGeoJSONFeature | undefined;
      if (!feature) return;
      const clusterId = feature.properties?.cluster_id;
      const src = map.getSource(feature.source) as GeoJSONSource | undefined;
      if (clusterId == null || !src) return;
      const coords = (feature.geometry as GeoJSON.Point).coordinates as [number, number];
      src
        .getClusterExpansionZoom(clusterId)
        .then((zoom) => map.easeTo({ center: coords, zoom }))
        .catch(() => {});
    }

    function onPointClick(e: MapLayerMouseEvent): void {
      const feature = e.features?.[0];
      if (!feature) return;
      const props = feature.properties as unknown as PlaceFeature["properties"];
      // Nested objects come back JSON-stringified from the map layer; revive.
      const raw = props as unknown as Record<string, unknown>;
      for (const key of ["links", "tags"]) {
        if (typeof raw[key] === "string") {
          try {
            raw[key] = JSON.parse(raw[key] as string);
          } catch {
            raw[key] = undefined;
          }
        }
      }
      const coords = (feature.geometry as GeoJSON.Point).coordinates as [number, number];
      selectedPlaceId.value = props.id ?? null;
      openPopupAt(coords, props);
    }

    function openPopupAt(
      coords: [number, number],
      props: PlaceFeature["properties"],
    ): void {
      popup?.remove();
      popup = new maplibregl.Popup({
        className: "bwc-popup",
        closeButton: true,
        maxWidth: "280px",
      })
        .setLngLat(coords)
        .setHTML(popupHTML(props))
        .addTo(map);
      popup.on("close", () => {
        // Only clear selection if this popup is still the active one.
        if (selectedPlaceId.peek() === props.id) selectedPlaceId.value = null;
      });
    }

    // ---- Map actions for panels ----

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
          const fc = categoryData.peek()[cat];
          const f = fc?.features.find((feat) => feat.properties.id === placeId);
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

    // ---- Viewport sync ----

    function onMoveEnd(): void {
      const b = map.getBounds();
      viewportBounds.value = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
      const c = map.getCenter();
      viewport.value = { lng: c.lng, lat: c.lat, zoom: map.getZoom() };
    }
    map.on("moveend", onMoveEnd);

    // Esc closes the popup and clears the selection ring from anywhere.
    function onKeyDown(ev: KeyboardEvent): void {
      if (ev.key !== "Escape") return;
      if (popup) {
        popup.remove();
        popup = null;
      }
      if (selectedPlaceId.peek() !== null) selectedPlaceId.value = null;
    }
    document.addEventListener("keydown", onKeyDown);

    // ---- Style lifecycle ----
    // style.load fires on initial load AND after every setStyle (theme swap /
    // fallback). Custom sources/layers are wiped by setStyle, so reset our
    // bookkeeping and let the effects below re-install.
    map.on("style.load", () => {
      installed = new Set();
      styleReady.value = false; // force effect re-run even within same tick
      styleReady.value = true;
      onMoveEnd();
    });

    // ---- Reactive wiring (created NOW, disposed on unmount — no leak if the
    // component unmounts before the style ever loads). ----
    const disposers: Array<() => void> = [];

    // Install + sync sources for loaded categories whenever style or data changes.
    disposers.push(
      effect(() => {
        if (!styleReady.value) return;
        const data = categoryData.value;
        for (const cat of CATEGORY_IDS) {
          const fc = data[cat];
          if (fc) installCategory(cat, fc);
        }
        installSelectionLayer();
        // New data / fresh style: push filtered data immediately (not debounced).
        for (const cat of installed) syncCategory(cat);
      }),
    );

    // Lazy-load categories that become enabled but aren't loaded yet.
    disposers.push(
      effect(() => {
        const enabled = enabledCategories.value;
        for (const cat of CATEGORY_IDS) {
          if (cat === "apartments") continue; // loaded by loadCore
          if (enabled.has(cat) && !categoryData.value[cat]) {
            void loadCategory(cat);
          }
        }
      }),
    );

    // Re-filter sources when filters or search change (debounced).
    disposers.push(
      effect(() => {
        void activeFilters.value;
        void searchQuery.value;
        syncAllDebounced();
      }),
    );

    // Selection highlight ring.
    disposers.push(
      effect(() => {
        const id = selectedPlaceId.value;
        if (!styleReady.value) return;
        const src = map.getSource(SELECT_SRC) as GeoJSONSource | undefined;
        if (!src) return;
        let fc: FeatureCollection = EMPTY_FC;
        if (id) {
          for (const cat of CATEGORY_IDS) {
            const f = categoryData.peek()[cat]?.features.find(
              (feat) => feat.properties.id === id,
            );
            if (f) {
              fc = { type: "FeatureCollection", features: [f] };
              break;
            }
          }
        }
        src.setData(fc as unknown as GeoJSON.FeatureCollection);
      }),
    );

    // Theme → basemap style swap (skip the initial value; constructor set it).
    let firstThemeRun = true;
    disposers.push(
      effect(() => {
        const mode = theme.value;
        if (firstThemeRun) {
          firstThemeRun = false;
          return;
        }
        usedFallback = false;
        map.setStyle(VECTOR_STYLE_URL[mode]);
      }),
    );

    // ---- Cleanup ----
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      for (const dispose of disposers) dispose();
      syncAllDebounced.cancel();
      popup?.remove();
      popup = null;
      if (mapActions.value) mapActions.value = null;
      map.remove();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label="Map of the Baltimore–Washington corridor"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
    />
  );
}
