// Loads pre-baked static JSON from /public/data. No external API calls at
// runtime — everything was fetched at build time by scripts/fetch-data.ts.
//
// Failures are recoverable: statuses land in the store so the UI can show
// loading/error states, and failed loads are evicted from the inflight cache
// so a retry actually retries.

import type {
  Apartment,
  CategoriesPayload,
  CategoryId,
  FeatureCollection,
  Town,
} from "./types";
import {
  apartments,
  categoriesMeta,
  categoryData,
  coreStatus,
  setCategoryStatus,
  towns,
} from "../store";

const base = import.meta.env.BASE_URL || "/";

async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${base}data/${path}`);
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return (await res.json()) as T;
}

// Eager: things needed for first paint (taxonomy counts, towns, apartments).
export async function loadCore(): Promise<void> {
  if (coreStatus.peek() === "loading" || coreStatus.peek() === "ready") return;
  coreStatus.value = "loading";
  setCategoryStatus("apartments", "loading");
  try {
    const [meta, townList, aptFC] = await Promise.all([
      getJSON<CategoriesPayload>("categories.json"),
      getJSON<Town[]>("towns.json"),
      getJSON<FeatureCollection>("apartments.json"),
    ]);
    categoriesMeta.value = meta;
    towns.value = townList;
    apartments.value = aptFC.features.map((f) => f.properties as Apartment);
    categoryData.value = { ...categoryData.value, apartments: aptFC };
    coreStatus.value = "ready";
    setCategoryStatus("apartments", "ready");
  } catch (err) {
    console.error("[loader] core data failed:", err);
    coreStatus.value = "error";
    setCategoryStatus("apartments", "error");
  }
}

const FILE_BY_CATEGORY: Record<CategoryId, string> = {
  apartments: "apartments.json",
  food: "food.json",
  shopping: "shopping.json",
  entertainment: "entertainment.json",
};

const inflight = new Map<CategoryId, Promise<FeatureCollection | null>>();

// Lazy: load a category's GeoJSON the first time it's toggled on. Resolves to
// null on failure (status signal carries the error); callers don't need to
// catch. A later call after a failure retries the fetch.
export async function loadCategory(cat: CategoryId): Promise<FeatureCollection | null> {
  const existing = categoryData.value[cat];
  if (existing) return existing;
  let p = inflight.get(cat);
  if (!p) {
    setCategoryStatus(cat, "loading");
    p = getJSON<FeatureCollection>(FILE_BY_CATEGORY[cat])
      .then((fc) => {
        categoryData.value = { ...categoryData.value, [cat]: fc };
        setCategoryStatus(cat, "ready");
        return fc;
      })
      .catch((err) => {
        console.error(`[loader] ${cat} failed:`, err);
        inflight.delete(cat); // allow retry
        setCategoryStatus(cat, "error");
        return null;
      });
    inflight.set(cat, p);
  }
  return p;
}

// Retry hook for the error banner.
export function retryCore(): void {
  coreStatus.value = "idle";
  void loadCore();
}
