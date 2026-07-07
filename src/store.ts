// Shared app state (signals) — the integration contract between the map layer
// and the side panels. Both read/write these signals; no prop-drilling.

import { signal, computed } from "@preact/signals";
import type {
  Apartment,
  CategoriesPayload,
  CategoryId,
  FeatureCollection,
  Town,
} from "./data/types";
import { CATEGORIES } from "./data/taxonomy";

// ---- Theme ----
export type Theme = "light" | "dark";

const THEME_KEY = "bwc-theme";

function initialTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    /* storage unavailable (private mode, tests) — fall through */
  }
  if (typeof matchMedia === "function") {
    return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return "dark";
}

export const theme = signal<Theme>(initialTheme());

export function setTheme(next: Theme): void {
  theme.value = next;
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch {
    /* non-fatal */
  }
}

// ---- Welcome overlay (shown on first visit, reopenable from the header) ----
const WELCOME_KEY = "bwc-welcomed";

function initialWelcome(): boolean {
  try {
    return localStorage.getItem(WELCOME_KEY) !== "1";
  } catch {
    return false; // no storage (tests/private mode): don't nag every load
  }
}

export const welcomeOpen = signal<boolean>(initialWelcome());

export function dismissWelcome(): void {
  welcomeOpen.value = false;
  try {
    localStorage.setItem(WELCOME_KEY, "1");
  } catch {
    /* non-fatal */
  }
}

// ---- Data-loading status ----
export type LoadStatus = "idle" | "loading" | "ready" | "error";

// Core = towns + apartments + taxonomy counts (needed for first paint).
export const coreStatus = signal<LoadStatus>("idle");
// Per-category status for the lazily loaded layers.
export const categoryStatus = signal<Record<CategoryId, LoadStatus>>({
  apartments: "idle",
  food: "idle",
  shopping: "idle",
  entertainment: "idle",
});

export function setCategoryStatus(cat: CategoryId, status: LoadStatus): void {
  categoryStatus.value = { ...categoryStatus.value, [cat]: status };
}

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

// Current map viewport bounds [w,s,e,n] — kept in sync by the map so the tile
// panel can show only what's visible.
export const viewportBounds = signal<[number, number, number, number] | null>(null);

// Current camera (center + zoom) — kept in sync by the map for URL deep links.
export const viewport = signal<{ lng: number; lat: number; zoom: number } | null>(null);

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
  const def = CATEGORIES.find((c) => c.id === category);
  if (!def || def.subcategories.length === 0) return;
  const next = new Set(activeFilters.value);
  for (const sub of def.subcategories) {
    const key = `${category}:${sub.id}`;
    if (on) next.add(key);
    else next.delete(key);
  }
  activeFilters.value = next;
}

// Does a place's name/town match the current search query?
export function matchesSearch(
  name: string | undefined,
  town: string | undefined,
  q: string,
): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  return (
    (name ?? "").toLowerCase().includes(needle) ||
    (town ?? "").toLowerCase().includes(needle)
  );
}

// Tile-grid sort order.
export type TileSort = "name" | "town";
export const tileSort = signal<TileSort>("name");

// Filtered apartment list for the tiles panel (search + subcategory + viewport
// aware), sorted so the render cap keeps a deterministic, useful set.
export const visibleApartments = computed<Apartment[]>(() => {
  const q = searchQuery.value.trim();
  const bounds = viewportBounds.value;
  const filters = activeFilters.value;
  const sort = tileSort.value;
  const out = apartments.value.filter((a) => {
    if (!filters.has(`apartments:${a.subcategory}`)) return false;
    if (!matchesSearch(a.name, a.town, q)) return false;
    if (bounds) {
      const [w, s, e, n] = bounds;
      if (a.lng < w || a.lng > e || a.lat < s || a.lat > n) return false;
    }
    return true;
  });
  return out.sort((a, b) =>
    sort === "town"
      ? (a.town ?? "").localeCompare(b.town ?? "") || a.name.localeCompare(b.name)
      : a.name.localeCompare(b.name),
  );
});

// Apartment count per town name (for the towns panel).
export const apartmentsPerTown = computed<Map<string, number>>(() => {
  const map = new Map<string, number>();
  for (const a of apartments.value) {
    if (!a.town) continue;
    map.set(a.town, (map.get(a.town) ?? 0) + 1);
  }
  return map;
});
