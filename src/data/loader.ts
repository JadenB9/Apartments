// Loads pre-baked static JSON from /public/data. No external API calls at
// runtime — everything was fetched at build time by scripts/fetch-data.ts.

import type {
  Apartment,
  CategoriesPayload,
  CategoryId,
  FeatureCollection,
  Town,
} from "./types";
import { buildApartmentLinks } from "./links";
import {
  apartments,
  categoriesMeta,
  categoryData,
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
  const [meta, townList, aptFC] = await Promise.all([
    getJSON<CategoriesPayload>("categories.json"),
    getJSON<Town[]>("towns.json"),
    getJSON<FeatureCollection>("apartments.json"),
  ]);
  categoriesMeta.value = meta;
  towns.value = townList;
  // Outbound links aren't baked into the JSON; build them here so they always
  // follow the rules in links.ts. Written onto the feature too, since the map
  // popup reads the feature's properties.
  for (const f of aptFC.features) {
    const p = f.properties;
    p.links = buildApartmentLinks({ name: p.name, lat: p.lat, lng: p.lng, town: p.town });
  }
  apartments.value = aptFC.features.map((f) => f.properties as Apartment);
  categoryData.value = { ...categoryData.value, apartments: aptFC };
}

const FILE_BY_CATEGORY: Record<CategoryId, string> = {
  apartments: "apartments.json",
  food: "food.json",
  shopping: "shopping.json",
  entertainment: "entertainment.json",
};

const inflight = new Map<CategoryId, Promise<FeatureCollection>>();

// Lazy: load a category's GeoJSON the first time it's toggled on.
export async function loadCategory(cat: CategoryId): Promise<FeatureCollection> {
  const existing = categoryData.value[cat];
  if (existing) return existing;
  let p = inflight.get(cat);
  if (!p) {
    p = getJSON<FeatureCollection>(FILE_BY_CATEGORY[cat]).then((fc) => {
      categoryData.value = { ...categoryData.value, [cat]: fc };
      return fc;
    });
    inflight.set(cat, p);
  }
  return p;
}
