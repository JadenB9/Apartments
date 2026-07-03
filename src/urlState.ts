// Shareable deep links: the viewport and active filters live in location.hash.
//
//   #v=11.2/39.105/-76.71&f=apartments,food:italian.cafe
//
// `v` = zoom/lat/lng. `f` = comma list of categories; a bare category id means
// "all its subcategories", `cat:sub1.sub2` means just those. Writes use
// replaceState (no history spam) and are debounced.

import { effect } from "@preact/signals";
import { CATEGORIES } from "./data/taxonomy";
import type { CategoryId } from "./data/types";
import { activeFilters, viewport } from "./store";

export interface ViewState {
  lng: number;
  lat: number;
  zoom: number;
}

interface ParsedHash {
  view?: ViewState;
  filters?: Set<string>;
}

const VALID_KEYS = new Set(
  CATEGORIES.flatMap((c) => c.subcategories.map((s) => `${c.id}:${s.id}`)),
);
const CATEGORY_IDS = new Set(CATEGORIES.map((c) => c.id));

export function parseHash(hash: string): ParsedHash {
  const out: ParsedHash = {};
  const params = new URLSearchParams(hash.replace(/^#/, ""));

  const v = params.get("v");
  if (v) {
    const [zoom, lat, lng] = v.split("/").map(Number);
    if ([zoom, lat, lng].every(Number.isFinite)) {
      out.view = { zoom, lat, lng };
    }
  }

  const f = params.get("f");
  if (f !== null) {
    const filters = new Set<string>();
    for (const part of f.split(",").filter(Boolean)) {
      const [cat, subs] = part.split(":");
      if (!CATEGORY_IDS.has(cat as CategoryId)) continue;
      const def = CATEGORIES.find((c) => c.id === cat)!;
      if (!subs) {
        for (const sub of def.subcategories) filters.add(`${cat}:${sub.id}`);
      } else {
        for (const sub of subs.split(".")) {
          const key = `${cat}:${sub}`;
          if (VALID_KEYS.has(key)) filters.add(key);
        }
      }
    }
    out.filters = filters;
  }

  return out;
}

export function encodeFilters(filters: Set<string>): string {
  const parts: string[] = [];
  for (const cat of CATEGORIES) {
    const subs = cat.subcategories
      .map((s) => s.id)
      .filter((id) => filters.has(`${cat.id}:${id}`));
    if (subs.length === 0) continue;
    if (subs.length === cat.subcategories.length) parts.push(cat.id);
    else parts.push(`${cat.id}:${subs.join(".")}`);
  }
  return parts.join(",");
}

export function buildHash(view: ViewState | null, filters: Set<string>): string {
  const params = new URLSearchParams();
  if (view) {
    params.set(
      "v",
      `${view.zoom.toFixed(2)}/${view.lat.toFixed(5)}/${view.lng.toFixed(5)}`,
    );
  }
  params.set("f", encodeFilters(filters));
  return `#${params.toString()}`;
}

// The view encoded in the URL at boot (used as the map's initial camera).
export function initialView(): ViewState | undefined {
  if (typeof location === "undefined") return undefined;
  return parseHash(location.hash).view;
}

// Apply hash filters to the store. Call before render.
export function initUrlState(): void {
  if (typeof location === "undefined") return;
  const { filters } = parseHash(location.hash);
  if (filters) activeFilters.value = filters;
}

// Start syncing store → URL. Returns a disposer.
export function startUrlSync(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const dispose = effect(() => {
    const view = viewport.value;
    const filters = activeFilters.value;
    clearTimeout(timer);
    timer = setTimeout(() => {
      history.replaceState(null, "", buildHash(view, filters));
    }, 300);
  });
  return () => {
    clearTimeout(timer);
    dispose();
  };
}
