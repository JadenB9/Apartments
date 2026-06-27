// Shared app state (signals) — the integration contract between the map layer
// and the side panels. Both read/write these signals; no prop-drilling.

import { signal, computed } from "@preact/signals";
import type {
  Apartment,
  CategoriesPayload,
  CategoryId,
  FeatureCollection,
  PlaceFeature,
  Town,
} from "./data/types";
import { CATEGORIES } from "./data/taxonomy";

// ---- Loaded data ----
export const categoriesMeta = signal<CategoriesPayload | null>(null);
export const towns = signal<Town[]>([]);
export const apartments = signal<Apartment[]>([]);
// Lazily-loaded GeoJSON per category (apartments loaded eagerly).
export const categoryData = signal<Partial<Record<CategoryId, FeatureCollection>>>({});

// ---- Filters / selection ----
// Enabled subcategory keys: `${categoryId}:${subId}` for food/shopping/
// entertainment only. Apartments are driven by area selection (selectedTowns),
// not subcategories. Everything starts OFF so nothing shows until the user
// drills into an area / enables a layer.
export const activeFilters = signal<Set<string>>(new Set());

export const searchQuery = signal<string>("");
export const selectedPlaceId = signal<string | null>(null);

// ---- Apartment area selection (County → Town drill-down) ----
// The set of town names whose apartments are shown. Empty = nothing shown.
export const selectedTowns = signal<Set<string>>(new Set());

// Towns grouped by county, each list sorted by name. Drives the area picker.
export const townsByCounty = computed<Map<string, Town[]>>(() => {
  const m = new Map<string, Town[]>();
  for (const t of towns.value) {
    const c = t.county ?? "Other";
    if (!m.has(c)) m.set(c, []);
    m.get(c)!.push(t);
  }
  for (const list of m.values()) list.sort((a, b) => a.name.localeCompare(b.name));
  return m;
});

// Apartment counts per town (for the area picker badges).
export const apartmentCountByTown = computed<Map<string, number>>(() => {
  const m = new Map<string, number>();
  for (const a of apartments.value) {
    if (!a.town) continue;
    m.set(a.town, (m.get(a.town) ?? 0) + 1);
  }
  return m;
});

export function isTownSelected(name: string): boolean {
  return selectedTowns.value.has(name);
}

export function toggleTown(name: string): void {
  const next = new Set(selectedTowns.value);
  if (next.has(name)) next.delete(name);
  else next.add(name);
  selectedTowns.value = next;
}

export function setCountySelected(county: string, on: boolean): void {
  const next = new Set(selectedTowns.value);
  for (const t of townsByCounty.value.get(county) ?? []) {
    if (on) next.add(t.name);
    else next.delete(t.name);
  }
  selectedTowns.value = next;
}

export function clearSelectedTowns(): void {
  selectedTowns.value = new Set();
}

// ---- Bookmarks (persisted to localStorage) ----
// Apartments the user has starred. Bookmarked apartments render in a distinct
// dot color on the map and a highlighted tile in the list.
const BOOKMARKS_KEY = "bw-corridor-bookmarks";

function loadBookmarks(): Set<string> {
  try {
    const raw = localStorage.getItem(BOOKMARKS_KEY);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch {
    /* ignore malformed / unavailable storage */
  }
  return new Set();
}

export const bookmarks = signal<Set<string>>(loadBookmarks());

export function isBookmarked(id: string): boolean {
  return bookmarks.value.has(id);
}

export function toggleBookmark(id: string): void {
  const next = new Set(bookmarks.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  bookmarks.value = next;
  try {
    localStorage.setItem(BOOKMARKS_KEY, JSON.stringify([...next]));
  } catch {
    /* ignore storage write failures (private mode, quota) */
  }
}

// Current map viewport bounds [w,s,e,n] — kept in sync by the map so the tile
// panel can show only what's visible.
export const viewportBounds = signal<[number, number, number, number] | null>(null);

// ---- Actions wired by the map at mount ----
export interface MapActions {
  flyTo: (lng: number, lat: number, zoom?: number) => void;
  fitBounds: (bounds: [number, number, number, number]) => void;
  openPopup: (placeId: string) => void;
}
export const mapActions = signal<MapActions | null>(null);

// ---- Derived helpers ----
export const enabledCategories = computed<Set<CategoryId>>(() => {
  const cats = new Set<CategoryId>();
  for (const key of activeFilters.value) {
    cats.add(key.split(":")[0] as CategoryId);
  }
  return cats;
});

export function isSubActive(category: CategoryId, sub: string): boolean {
  return activeFilters.value.has(`${category}:${sub}`);
}

export function toggleSub(category: CategoryId, sub: string): void {
  const next = new Set(activeFilters.value);
  const key = `${category}:${sub}`;
  if (next.has(key)) next.delete(key);
  else next.add(key);
  activeFilters.value = next;
}

export function toggleCategory(category: CategoryId, on: boolean): void {
  const next = new Set(activeFilters.value);
  const def = CATEGORIES.find((c) => c.id === category);
  if (!def) return;
  for (const sub of def.subcategories) {
    const key = `${category}:${sub.id}`;
    if (on) next.add(key);
    else next.delete(key);
  }
  activeFilters.value = next;
}

// Filtered apartment list for the tiles panel: selected areas ∩ search ∩
// viewport. Nothing selected => empty list.
export const visibleApartments = computed<Apartment[]>(() => {
  const sel = selectedTowns.value;
  if (sel.size === 0) return [];
  const q = searchQuery.value.trim().toLowerCase();
  const bounds = viewportBounds.value;
  return apartments.value.filter((a) => {
    if (!a.town || !sel.has(a.town)) return false;
    if (q && !a.name.toLowerCase().includes(q) && !(a.town ?? "").toLowerCase().includes(q)) {
      return false;
    }
    if (bounds) {
      const [w, s, e, n] = bounds;
      if (a.lng < w || a.lng > e || a.lat < s || a.lat > n) return false;
    }
    return true;
  });
});

// ---- "Nearby" focus: show food/shopping/entertainment within a radius of a
// chosen apartment. Null = off. ----
export interface NearbyFocus {
  id: string;
  name: string;
  lng: number;
  lat: number;
  radiusMi: number;
}
export const nearbyFocus = signal<NearbyFocus | null>(null);

const NEARBY_CATEGORIES: CategoryId[] = ["food", "shopping", "entertainment"];

// Reveal all food/shopping/entertainment within the focus radius. Enables those
// categories (the map lazy-loads + shows them); the map narrows their data to
// the radius and draws a ring.
export function showNearby(focus: NearbyFocus): void {
  nearbyFocus.value = focus;
  for (const cat of NEARBY_CATEGORIES) toggleCategory(cat, true);
}

export function clearNearby(): void {
  const had = nearbyFocus.value;
  nearbyFocus.value = null;
  if (had) for (const cat of NEARBY_CATEGORIES) toggleCategory(cat, false);
}

// Helper to know whether a feature passes the active subcategory filter.
export function featurePassesFilter(f: PlaceFeature): boolean {
  const p = f.properties;
  return activeFilters.value.has(`${p.category}:${p.subcategory}`);
}
