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
// Enabled subcategory keys: `${categoryId}:${subId}`. Empty set for a category
// means "all of that category hidden". We seed apartments on + everything else
// off so the first paint is light.
const seedFilters = (): Set<string> => {
  const s = new Set<string>();
  for (const sub of CATEGORIES.find((c) => c.id === "apartments")!.subcategories) {
    s.add(`apartments:${sub.id}`);
  }
  return s;
};
export const activeFilters = signal<Set<string>>(seedFilters());

export const searchQuery = signal<string>("");
export const selectedPlaceId = signal<string | null>(null);

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

// Filtered apartment list for the tiles panel (search + viewport aware).
export const visibleApartments = computed<Apartment[]>(() => {
  const q = searchQuery.value.trim().toLowerCase();
  const bounds = viewportBounds.value;
  return apartments.value.filter((a) => {
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

// Helper to know whether a feature passes the active subcategory filter.
export function featurePassesFilter(f: PlaceFeature): boolean {
  const p = f.properties;
  return activeFilters.value.has(`${p.category}:${p.subcategory}`);
}
