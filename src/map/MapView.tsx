// MapView — the map layer for the Baltimore–Washington corridor app.
//
// Renders a MapLibre GL map (keyless Esri satellite basemap), one clustered
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
  addPin,
  bookmarks,
  categoryData,
  clearNearby,
  customPins,
  distanceToFortMeadeMi,
  enabledCategories,
  isBookmarked,
  mapActions,
  milesBetween,
  nearbyFocus,
  nearbyRadiusMi,
  pinPlacingMode,
  removePin,
  selectedCountyNames,
  selectedPlaceId,
  selectedTowns,
  setTownsSelected,
  showNearby,
  toggleBookmark,
  towns,
  viewportBounds,
} from "../store";
import { loadCore, loadCategory } from "../data/loader";
import { googleMapsLink } from "../data/links";
import { CATEGORIES, CATEGORY_BY_ID } from "../data/taxonomy";
import { FORT_MEADE_CENTER, MAP_BOUNDS, MAP_CENTER, INITIAL_ZOOM } from "../data/config";
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

// POI category data limited to the enabled subcategories, and narrowed to the
// nearby radius when a focus is active. Filtering the source (not just the
// point layer) keeps cluster bubbles from counting hidden places.
function poiSourceFC(cat: CategoryId): GeoJSON.FeatureCollection {
  const fc = categoryData.value[cat];
  const subs = new Set(activeSubsFor(cat));
  if (!fc || subs.size === 0) return EMPTY_FC;
  const focus = nearbyFocus.value;
  const radius = nearbyRadiusMi.value;
  const features = fc.features.filter((f) => {
    if (!subs.has(f.properties.subcategory)) return false;
    if (!focus) return true;
    const [lng, lat] = f.geometry.coordinates;
    return milesBetween(lng, lat, focus.lng, focus.lat) <= radius;
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

// Inject a small style block so popups and controls follow the app theme.
function ensurePopupStyles(): void {
  if (document.getElementById(POPUP_STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = POPUP_STYLE_ID;
  el.textContent = `
.maplibregl-popup.mv-popup .maplibregl-popup-content {
  background: var(--panel);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 11px 13px;
  font: 13px/1.4 system-ui, sans-serif;
  max-width: 260px;
  box-shadow: 0 8px 24px var(--shadow);
}
.maplibregl-popup.mv-popup .maplibregl-popup-tip { border-top-color: var(--panel); border-bottom-color: var(--panel); }
.maplibregl-popup.mv-popup .maplibregl-popup-close-button { color: var(--muted); font-size: 16px; }
.mv-popup h3 { margin: 0 0 4px; padding-right: 14px; font-size: 14px; color: var(--text); }
.mv-popup .mv-sub { color: var(--muted); margin: 0 0 6px; font-size: 12px; }
.mv-popup .mv-tags { margin: 0 0 8px; color: var(--muted); font-size: 12px; }
.mv-popup .mv-tags div { margin: 1px 0; }
.mv-popup .mv-links { display: flex; gap: 6px; flex-wrap: wrap; }
.mv-popup .mv-links a {
  display: inline-block;
  padding: 4px 8px;
  background: var(--panel-2);
  border: 1px solid var(--border);
  border-radius: 5px;
  color: var(--accent);
  text-decoration: none;
  font-size: 11px;
  white-space: nowrap;
}
.mv-popup .mv-links a:hover { border-color: var(--accent); }
.mv-popup .mv-bm {
  display: inline-block;
  margin: 0 0 8px;
  padding: 5px 10px;
  font-size: 12px;
  font-weight: 600;
  color: var(--bookmark);
  background: var(--bookmark-soft);
  border: 1px solid var(--bookmark-line);
  border-radius: 6px;
}
.mv-popup .mv-bm:hover { background: var(--bookmark-hover); }
.mv-popup .mv-bm.on { color: #fff; background: #1971c2; border-color: #1971c2; }
.mv-popup .mv-actions { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 8px; }
.mv-popup .mv-actions .mv-bm { margin: 0; }
.mv-popup .mv-nearby {
  padding: 5px 10px;
  font-size: 12px;
  font-weight: 600;
  color: var(--nearby);
  background: var(--nearby-soft);
  border: 1px solid var(--nearby-line);
  border-radius: 6px;
}
.mv-popup .mv-nearby:hover { background: var(--nearby-hover); }
.mv-popup .mv-nearby.on { color: #fff; background: #2b8a3e; border-color: #2b8a3e; }
.mv-popup .mv-pin-remove {
  margin-top: 4px;
  padding: 5px 10px;
  font-size: 12px;
  font-weight: 600;
  color: var(--pin);
  background: var(--pin-chip);
  border: 1px solid var(--pin-line);
  border-radius: 6px;
}
.mv-popup .mv-pin-remove:hover { border-color: var(--pin-strong); }
.mv-pin-ctrl button { font-size: 15px; line-height: 29px; }
.mv-pin-ctrl button.active { background: #e64980; }
:root[data-theme="dark"] .maplibregl-ctrl-group { background: var(--panel-2); }
:root[data-theme="dark"] .maplibregl-ctrl-group button + button { border-top-color: var(--border); }
:root[data-theme="dark"] .maplibregl-ctrl button .maplibregl-ctrl-icon { filter: invert(1); }
:root[data-theme="dark"] .maplibregl-ctrl-attrib { background: rgba(27, 25, 21, 0.85); color: var(--text); }
:root[data-theme="dark"] .maplibregl-ctrl-attrib a { color: var(--text); }
:root[data-theme="dark"] .maplibregl-ctrl-attrib-button { filter: invert(1); }
`;
  document.head.appendChild(el);
}

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!),
  );

// Website tags come straight from OpenStreetMap, so only let real http(s)
// URLs become links (a "javascript:" value would otherwise run on click).
function safeUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  const url = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  return /^https?:\/\//i.test(url) ? url : null;
}

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
    tagRows.push(
      `<div>🪖 ${distanceToFortMeadeMi(props.lat, props.lng).toFixed(1)} mi to Fort Meade</div>`,
    );
    const website = safeUrl(tags.website);
    if (website) {
      tagRows.push(
        `<div>Website: <a href="${esc(website)}" target="_blank" rel="noopener">link</a></div>`,
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
      nearbyOn ? "✕ Hide nearby" : "🍽 Food & fun nearby"
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
  const website = safeUrl(tags.website || tags["contact:website"]);
  const gmaps = googleMapsLink({ name: props.name, lat: props.lat, lng: props.lng });
  const details: string[] = [];
  if (props.address) details.push(`<div>${esc(props.address)}</div>`);
  if (tags.opening_hours) details.push(`<div>Hours: ${esc(tags.opening_hours)}</div>`);
  if (tags.phone) {
    const tel = tags.phone.split(";")[0].replace(/[^\d+]/g, "");
    details.push(`<div>Phone: <a href="tel:${esc(tel)}">${esc(tags.phone.split(";")[0])}</a></div>`);
  }
  return `<div class="mv-popup">
    <h3>${name}</h3>
    <p class="mv-sub">${esc(subLabel)}</p>
    ${details.length ? `<div class="mv-tags">${details.join("")}</div>` : ""}
    <div class="mv-links">
      <a href="${esc(gmaps)}" target="_blank" rel="noopener">Google Maps</a>
      ${website ? `<a href="${esc(website)}" target="_blank" rel="noopener">Website</a>` : ""}
    </div>
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
    // The overlay outlines don't depend on the basemap either, so start
    // fetching them now rather than after the style is up.
    const base = import.meta.env.BASE_URL || "/";
    const getOverlay = (file: string) =>
      fetch(`${base}data/${file}`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
    const fortMeadeReq = getOverlay("fort-meade.json") as Promise<GeoJSON.Feature | null>;
    const countiesReq = getOverlay("counties.json") as Promise<GeoJSON.FeatureCollection | null>;

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

    // Custom-pin control: toggles pin-placing mode.
    let pinBtnRef: HTMLButtonElement | null = null;
    const pinControl: maplibregl.IControl = {
      onAdd() {
        const c = document.createElement("div");
        c.className = "maplibregl-ctrl maplibregl-ctrl-group mv-pin-ctrl";
        const b = document.createElement("button");
        b.type = "button";
        b.title = "Drop a custom pin, then click the map";
        b.setAttribute("aria-label", "Drop a custom pin");
        b.setAttribute("aria-pressed", "false");
        b.textContent = "📍";
        b.addEventListener("click", () => {
          pinPlacingMode.value = !pinPlacingMode.value;
        });
        c.appendChild(b);
        pinBtnRef = b;
        return c;
      },
      onRemove() {
        pinBtnRef = null;
      },
    };
    map.addControl(pinControl, "top-right");

    const disposers: Array<() => void> = [];

    // Escape backs out of pin-placing mode.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && pinPlacingMode.value) pinPlacingMode.value = false;
    };
    window.addEventListener("keydown", onKey);
    disposers.push(() => window.removeEventListener("keydown", onKey));

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
          // Compact bubbles when zoomed out — even big groups stay small.
          "circle-radius": ["step", ["get", "point_count"], 8, 30, 10, 150, 12],
          "circle-stroke-width": 1.25,
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
          "text-size": 10,
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

      // The source data already holds only what should show (selected towns
      // for apartments, enabled subcategories for the rest); this just hides
      // an amenity layer outright while none of its subcategories are on.
      const visible =
        cat === "apartments" || activeSubsFor(cat).length > 0 ? "visible" : "none";
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
      if (pinPlacingMode.value) return;
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

    // Look up a feature's FULL properties (with nested links/tags intact) by id.
    // MapLibre flattens nested props on rendered features, so a raw map-click
    // feature loses its links — we re-read from the source data instead.
    function fullPropsById(id: string): PlaceFeature["properties"] | null {
      for (const cat of CATEGORY_IDS) {
        const fc = categoryData.value[cat];
        if (!fc) continue;
        const f = fc.features.find((feat) => feat.properties.id === id);
        if (f) return f.properties;
      }
      return null;
    }

    // ---- Point click: open the same detailed popup as the sidebar. ----
    function onPointClick(e: MapLayerMouseEvent): void {
      if (pinPlacingMode.value) return;
      const feature = e.features?.[0];
      if (!feature) return;
      const coords = (feature.geometry as GeoJSON.Point).coordinates as [number, number];
      const id = (feature.properties as { id?: string }).id;
      const props =
        (id && fullPropsById(id)) ||
        (feature.properties as unknown as PlaceFeature["properties"]);
      selectedPlaceId.value = id ?? null;
      openPopupAt(coords, props);
    }

    // Popup for a custom pin (maps link + remove).
    function openPinPopup(id: string, name: string, coords: [number, number]): void {
      popupRef.current?.remove();
      const gmaps = `https://www.google.com/maps/search/?api=1&query=${coords[1]},${coords[0]}`;
      const html = `<div class="mv-popup">
        <h3>📍 ${esc(name)}</h3>
        <div class="mv-links"><a href="${gmaps}" target="_blank" rel="noopener">Open in Google Maps</a></div>
        <button type="button" class="mv-pin-remove" data-id="${esc(id)}">✕ Remove pin</button>
      </div>`;
      popupRef.current = new maplibregl.Popup({
        className: "mv-popup",
        closeButton: true,
        maxWidth: "260px",
      })
        .setLngLat(coords)
        .setHTML(html)
        .addTo(map);
      const rm = popupRef.current.getElement()?.querySelector(".mv-pin-remove");
      if (rm) {
        rm.addEventListener("click", () => {
          removePin(id);
          popupRef.current?.remove();
        });
      }
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
            nb.textContent = "🍽 Food & fun nearby";
            nb.classList.remove("on");
          } else {
            showNearby({ id, name: nm, lng, lat });
            const r = nearbyRadiusMi.value;
            const dLat = r / 60;
            const dLng = r / (60 * Math.cos((lat * Math.PI) / 180));
            map.fitBounds(
              [
                [lng - dLng, lat - dLat],
                [lng + dLng, lat + dLat],
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
              map.flyTo({ center: coords, zoom: Math.max(map.getZoom(), 16) });
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
    // "style.load" rather than "load": "load" waits for every satellite tile
    // in view, which held back the dots and labels by seconds.
    map.once("style.load", () => {
      registerActions();
      onMoveEnd(); // seed initial bounds

      // ---- Fort Meade installation outline (real OSM boundary, baked JSON). ----
      fortMeadeReq.then((geo) => {
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
          // One label at the installation's center. Labelling the polygon
          // itself printed "FORT MEADE" once per piece of the boundary.
          map.addSource("src-fort-meade-label", {
            type: "geojson",
            data: {
              type: "Feature",
              properties: {},
              geometry: { type: "Point", coordinates: FORT_MEADE_CENTER },
            },
          });
          map.addLayer({
            id: "fort-meade-label",
            type: "symbol",
            source: "src-fort-meade-label",
            layout: {
              "text-field": "Fort Meade",
              "text-font": LABEL_FONT,
              "text-size": 13,
              "text-letter-spacing": 0.05,
              "text-transform": "uppercase",
            },
            paint: {
              "text-color": "#ffe066",
              "text-halo-color": "rgba(0,0,0,0.85)",
              "text-halo-width": 1.8,
            },
          });
      });

      // ---- County outlines: show the boundary of each selected county. ----
      countiesReq.then((fc) => {
          if (!fc || map.getSource("src-counties")) return;
          map.addSource("src-counties", { type: "geojson", data: fc });
          // Insert below Fort Meade so the base stays prominent.
          const before = map.getLayer("fort-meade-fill") ? "fort-meade-fill" : undefined;
          map.addLayer(
            {
              id: "county-fill",
              type: "fill",
              source: "src-counties",
              filter: ["in", ["get", "name"], ["literal", []]],
              paint: { "fill-color": "#4dabf7", "fill-opacity": 0.05 },
            },
            before,
          );
          map.addLayer(
            {
              id: "county-outline",
              type: "line",
              source: "src-counties",
              filter: ["in", ["get", "name"], ["literal", []]],
              paint: {
                "line-color": "#74c0fc",
                "line-width": 2,
                "line-dasharray": [4, 2],
                "line-opacity": 0.9,
              },
            },
            before,
          );

          const countyEffect = effect(() => {
            const names = selectedCountyNames.value;
            const f: ExpressionSpecification = ["in", ["get", "name"], ["literal", names]];
            if (map.getLayer("county-fill")) map.setFilter("county-fill", f);
            if (map.getLayer("county-outline")) map.setFilter("county-outline", f);
          });
          disposers.push(countyEffect);
      });

      // ---- Highlight the selected/clicked place so it's obvious when zoomed
      // out (a bright ring that never clusters and always renders). ----
      map.addSource("src-selected", { type: "geojson", data: EMPTY_FC });
      map.addLayer({
        id: "selected-halo",
        type: "circle",
        source: "src-selected",
        paint: {
          "circle-radius": 13,
          "circle-color": "rgba(255,212,59,0.18)",
          "circle-stroke-color": "#ffd43b",
          "circle-stroke-width": 3,
        },
      });
      const selectedEffect = effect(() => {
        const id = selectedPlaceId.value;
        const src = map.getSource("src-selected") as GeoJSONSource | undefined;
        if (!src) return;
        const props = id ? fullPropsById(id) : null;
        if (id && props) {
          src.setData({
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                properties: {},
                geometry: { type: "Point", coordinates: [props.lng, props.lat] },
              },
            ],
          });
        } else {
          src.setData(EMPTY_FC);
        }
      });
      disposers.push(selectedEffect);

      // ---- Click a town label/dot to focus it: select it + reveal nearby. ----
      function onTownClick(e: MapLayerMouseEvent): void {
        if (pinPlacingMode.value) return;
        const f = e.features?.[0];
        if (!f) return;
        const name = (f.properties as { name?: string }).name;
        if (!name) return;
        const [lng, lat] = (f.geometry as GeoJSON.Point).coordinates as [number, number];
        setTownsSelected([name], true);
        showNearby({ id: `town:${name}`, name, lng, lat });
        map.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 13) });
      }
      for (const id of ["town-labels", "town-dots"]) {
        map.on("click", id, onTownClick);
        map.on("mouseenter", id, onEnter);
        map.on("mouseleave", id, onLeave);
      }

      // ---- Custom pins: user-dropped markers. ----
      map.addSource("src-pins", { type: "geojson", data: EMPTY_FC });
      map.addLayer({
        id: "pins",
        type: "circle",
        source: "src-pins",
        paint: {
          "circle-radius": 8,
          "circle-color": "#e64980",
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2.5,
        },
      });
      map.addLayer({
        id: "pin-labels",
        type: "symbol",
        source: "src-pins",
        layout: {
          "text-field": ["get", "name"],
          "text-font": LABEL_FONT,
          "text-size": 11,
          "text-anchor": "top",
          "text-offset": [0, 0.8],
          "text-padding": 4,
        },
        paint: {
          "text-color": "#ffd6e7",
          "text-halo-color": "rgba(0,0,0,0.85)",
          "text-halo-width": 1.5,
        },
      });

      const pinsEffect = effect(() => {
        const src = map.getSource("src-pins") as GeoJSONSource | undefined;
        if (!src) return;
        src.setData({
          type: "FeatureCollection",
          features: customPins.value.map((p) => ({
            type: "Feature",
            properties: { id: p.id, name: p.name },
            geometry: { type: "Point", coordinates: [p.lng, p.lat] },
          })),
        });
      });
      disposers.push(pinsEffect);

      // Click an existing pin -> popup with a maps link + remove.
      map.on("click", "pins", (e: MapLayerMouseEvent) => {
        if (pinPlacingMode.value) return;
        const f = e.features?.[0];
        if (!f) return;
        const id = (f.properties as { id?: string }).id;
        const nm = (f.properties as { name?: string }).name || "Pin";
        const [lng, lat] = (f.geometry as GeoJSON.Point).coordinates as [number, number];
        if (!id) return;
        selectedPlaceId.value = null;
        openPinPopup(id, nm, [lng, lat]);
      });
      map.on("mouseenter", "pins", onEnter);
      map.on("mouseleave", "pins", onLeave);

      // Pin-placing mode: next map click drops a pin there.
      map.on("click", (e) => {
        if (!pinPlacingMode.value) return;
        const id = addPin(e.lngLat.lng, e.lngLat.lat);
        pinPlacingMode.value = false;
        const pin = customPins.value.find((p) => p.id === id);
        if (pin) openPinPopup(pin.id, pin.name, [pin.lng, pin.lat]);
      });

      // Cursor + body class reflect placing mode.
      const placingEffect = effect(() => {
        const on = pinPlacingMode.value;
        map.getCanvas().style.cursor = on ? "crosshair" : "";
        if (pinBtnRef) {
          pinBtnRef.classList.toggle("active", on);
          pinBtnRef.setAttribute("aria-pressed", String(on));
        }
      });
      disposers.push(placingEffect);

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

      // Refresh POI sources when filters, the nearby focus/radius or the data
      // change (poiSourceFC reads all of them), and draw the radius ring.
      const nearbyEffect = effect(() => {
        const focus = nearbyFocus.value;
        const radius = nearbyRadiusMi.value;
        for (const cat of ["food", "shopping", "entertainment"] as CategoryId[]) {
          const src = map.getSource(srcId(cat)) as GeoJSONSource | undefined;
          if (src) src.setData(poiSourceFC(cat));
        }
        // Radius ring.
        const ringSrc = map.getSource("src-nearby-ring") as GeoJSONSource | undefined;
        const ringData = focus
          ? circlePolygon(focus.lng, focus.lat, radius)
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

      // Show/hide amenity layers as their subcategories are toggled.
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
