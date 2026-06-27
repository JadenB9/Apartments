/**
 * Data pipeline for the Baltimore–Washington corridor map.
 *
 * Queries the OpenStreetMap Overpass API and pre-bakes static JSON into
 * `public/data/`. The web app makes ZERO runtime API calls — this output is the
 * entire dataset.
 *
 * Run with: `bun run fetch-data`  (== `bun run scripts/fetch-data.ts`)
 *
 * Design notes:
 *  - We run one Overpass query PER category group (apartments / food / shopping
 *    / entertainment / towns) instead of one giant query, to stay under the
 *    timeout and keep each request cheap.
 *  - `out center tags;` is used so ways/relations carry a `center` lat/lon.
 *  - Every element is classified with the shared `classify()` taxonomy; anything
 *    that classify() rejects is dropped.
 *  - If Overpass is unreachable after retries on BOTH endpoints we FAIL LOUDLY
 *    and write nothing — never fake data.
 */

import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

import { BBOX } from "../src/data/config";
import { classify } from "../src/data/taxonomy";
import { CATEGORIES } from "../src/data/taxonomy";
import { buildApartmentLinks } from "../src/data/links";
import type {
  Apartment,
  CategoriesPayload,
  CategoryId,
  FeatureCollection,
  Place,
  PlaceFeature,
  Town,
} from "../src/data/types";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
] as const;

const OUTPUT_DIR = resolve(import.meta.dirname, "../public/data");

// Overpass bbox literal is (south, west, north, east).
const BBOX_LITERAL = `${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east}`;

// Tag keys we keep on each place (a curated subset — don't bloat the JSON).
const KEPT_TAG_KEYS = [
  "cuisine",
  "website",
  "phone",
  "opening_hours",
  "building:levels",
  "brand",
  "operator",
  "addr:street",
] as const;

const POLITE_DELAY_MS = 1500; // delay between Overpass queries
const MAX_RETRIES = 3;

// ---------------------------------------------------------------------------
// Overpass types (minimal)
// ---------------------------------------------------------------------------

interface LatLon {
  lat: number;
  lon: number;
}

interface OverpassMember {
  type: "node" | "way" | "relation";
  ref: number;
  role: string;
  geometry?: LatLon[];
}

interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
  geometry?: LatLon[];
  members?: OverpassMember[];
}

interface OverpassResponse {
  elements: OverpassElement[];
}

// ---------------------------------------------------------------------------
// Overpass query strings (per category group)
// ---------------------------------------------------------------------------

const b = BBOX_LITERAL;

const QUERIES = {
  apartments: `[out:json][timeout:180];
(
  nwr["building"~"apartments|residential|dormitory"](${b});
  nwr["residential"="apartments"](${b});
  nwr["building:use"="apartments"](${b});
  nwr["landuse"="residential"]["residential"="apartments"](${b});
  nwr["building"]["name"~"apartment|condominium|condo|residence|tower|loft|avalon|the reserve",i](${b});
);
out center tags;`,

  food: `[out:json][timeout:120];
(
  nwr["amenity"~"restaurant|fast_food|cafe|bar|pub|food_court|ice_cream"](${b});
);
out center tags;`,

  shopping: `[out:json][timeout:120];
(
  nwr["shop"](${b});
);
out center tags;`,

  entertainment: `[out:json][timeout:120];
(
  nwr["amenity"~"cinema|theatre|nightclub|arts_centre"](${b});
  nwr["leisure"](${b});
  nwr["tourism"](${b});
);
out center tags;`,

  towns: `[out:json][timeout:120];
(
  node["place"~"city|town|village|suburb|neighbourhood|hamlet"](${b});
);
out;`,

  // The Fort George G. Meade installation boundary (a multipolygon relation),
  // so we can draw the real outline instead of an approximation.
  fortMeade: `[out:json][timeout:60];
(
  relation["landuse"="military"]["name"~"Meade",i](${b});
  way["landuse"="military"]["name"~"Meade",i](${b});
);
out geom;`,
} as const;

// ---------------------------------------------------------------------------
// Networking
// ---------------------------------------------------------------------------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * POST an Overpass query. Tries each endpoint, retrying up to MAX_RETRIES with
 * exponential backoff on network errors and 429/5xx. Throws if all fail.
 */
async function runOverpass(label: string, query: string): Promise<OverpassElement[]> {
  let lastErr: unknown;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            // Overpass returns 406 to requests without a descriptive User-Agent.
            "User-Agent": "bw-corridor-map/1.0 (personal apartment-finder project)",
          },
          body: new URLSearchParams({ data: query }).toString(),
        });

        if (res.status === 429 || res.status >= 500) {
          throw new Error(`Overpass ${res.status} ${res.statusText}`);
        }
        if (!res.ok) {
          // Non-retryable (e.g. 400 bad query) — surface the body and bail.
          const body = await res.text().catch(() => "");
          throw new Error(
            `Overpass ${res.status} ${res.statusText} (non-retryable): ${body.slice(0, 300)}`,
          );
        }

        const json = (await res.json()) as OverpassResponse;
        const elements = json.elements ?? [];
        console.log(
          `  [${label}] ${elements.length} raw elements from ${endpoint}`,
        );
        return elements;
      } catch (err) {
        lastErr = err;
        const backoff = POLITE_DELAY_MS * attempt * attempt;
        console.warn(
          `  [${label}] attempt ${attempt}/${MAX_RETRIES} on ${endpoint} failed: ${
            (err as Error).message
          }${attempt < MAX_RETRIES ? ` — retrying in ${backoff}ms` : ""}`,
        );
        if (attempt < MAX_RETRIES) await sleep(backoff);
      }
    }
    console.warn(`  [${label}] endpoint ${endpoint} exhausted, trying fallback…`);
  }

  throw new Error(
    `Overpass UNREACHABLE for "${label}" after ${MAX_RETRIES} retries on ${OVERPASS_ENDPOINTS.length} endpoints. Last error: ${
      (lastErr as Error)?.message ?? lastErr
    }`,
  );
}

// ---------------------------------------------------------------------------
// Normalization helpers
// ---------------------------------------------------------------------------

/** Resolve a usable [lat, lon] for an element, or null if none. */
function coordsOf(el: OverpassElement): { lat: number; lng: number } | null {
  if (typeof el.lat === "number" && typeof el.lon === "number") {
    return { lat: el.lat, lng: el.lon };
  }
  if (el.center && typeof el.center.lat === "number" && typeof el.center.lon === "number") {
    return { lat: el.center.lat, lng: el.center.lon };
  }
  return null;
}

/** Compose a human address from addr:* tags, when present. */
function composeAddress(tags: Record<string, string>): string | undefined {
  const line1 = [tags["addr:housenumber"], tags["addr:street"]]
    .filter(Boolean)
    .join(" ");
  const parts = [line1, tags["addr:city"], tags["addr:postcode"]].filter(Boolean);
  return parts.length ? parts.join(", ") : undefined;
}

/** Carry only the curated subset of tags worth surfacing in the UI. */
function pickTags(tags: Record<string, string>): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const k of KEPT_TAG_KEYS) {
    if (tags[k]) out[k] = tags[k];
  }
  return Object.keys(out).length ? out : undefined;
}

/** Pick a display name, with apartment-friendly fallbacks. */
function deriveName(tags: Record<string, string>, category: CategoryId): string {
  if (tags.name) return tags.name;
  if (tags["addr:housename"]) return tags["addr:housename"];
  if (category === "apartments") {
    const street = tags["addr:street"];
    return street ? `Apartment Building (${street})` : "Apartment Building";
  }
  // Non-apartment unnamed: fall back to brand/operator/street, else generic.
  return tags.brand ?? tags.operator ?? tags["addr:street"] ?? "Unnamed";
}

const toRad = (d: number) => (d * Math.PI) / 180;

/** Cheap great-circle distance (km) for nearest-town lookup. */
function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Nearest town name by centroid, or undefined if towns is empty. */
function nearestTown(lat: number, lng: number, towns: Town[]): string | undefined {
  let best: string | undefined;
  let bestKm = Infinity;
  for (const t of towns) {
    const km = haversineKm(lat, lng, t.lat, t.lng);
    if (km < bestKm) {
      bestKm = km;
      best = t.name;
    }
  }
  return best;
}

/** Build a GeoJSON Point feature from a Place/Apartment. */
function toFeature(place: Place & Partial<Apartment>): PlaceFeature {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [place.lng, place.lat] },
    properties: place,
  };
}

// ---------------------------------------------------------------------------
// Towns
// ---------------------------------------------------------------------------

const EXCLUDED_TOWNS = new Set(["Baltimore", "Washington"]);

// Recognizable places only — drop the hundreds of tiny neighbourhood/hamlet
// nodes that would otherwise bury the town list and the map labels.
const MEANINGFUL_PLACE_TYPES = new Set(["city", "town", "village", "suburb"]);

function buildTowns(elements: OverpassElement[]): Town[] {
  const seen = new Set<string>();
  const towns: Town[] = [];
  for (const el of elements) {
    const tags = el.tags ?? {};
    const name = tags.name;
    const placeType = tags.place;
    if (!name || !placeType) continue;
    if (!MEANINGFUL_PLACE_TYPES.has(placeType)) continue;
    if (EXCLUDED_TOWNS.has(name)) continue;
    const coords = coordsOf(el);
    if (!coords) continue;
    const key = `${el.type}/${el.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    towns.push({ name, lat: coords.lat, lng: coords.lng, placeType });
  }
  return towns;
}

// ---------------------------------------------------------------------------
// Fort Meade boundary (stitch multipolygon outer ways into closed rings)
// ---------------------------------------------------------------------------

type Ring = [number, number][];

const ptKey = (p: [number, number]) => `${p[0].toFixed(7)},${p[1].toFixed(7)}`;

/** Greedily connect way segments end-to-end into closed rings. */
function stitchRings(ways: Ring[]): Ring[] {
  const segs = ways.filter((w) => w.length > 1).map((w) => w.slice());
  const used = new Array(segs.length).fill(false);
  const rings: Ring[] = [];

  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    let ring = segs[i].slice();
    let extended = true;
    while (extended) {
      extended = false;
      const end = ring[ring.length - 1];
      for (let j = 0; j < segs.length; j++) {
        if (used[j]) continue;
        const s = segs[j];
        if (ptKey(s[0]) === ptKey(end)) {
          ring = ring.concat(s.slice(1));
          used[j] = true;
          extended = true;
          break;
        }
        if (ptKey(s[s.length - 1]) === ptKey(end)) {
          ring = ring.concat(s.slice().reverse().slice(1));
          used[j] = true;
          extended = true;
          break;
        }
      }
    }
    if (ring.length >= 4) rings.push(ring);
  }
  return rings;
}

/** Build a GeoJSON Feature (Polygon/MultiPolygon) for the Fort Meade boundary. */
function buildFortMeade(elements: OverpassElement[]): unknown | null {
  const rel = elements.find((e) => e.type === "relation" && e.members?.length);
  let outerWays: Ring[] = [];
  let name = "Fort George G. Meade";

  if (rel) {
    name = rel.tags?.name ?? name;
    outerWays = (rel.members ?? [])
      .filter((m) => m.role === "outer" && m.geometry && m.geometry.length > 1)
      .map((m) => m.geometry!.map((g) => [g.lon, g.lat] as [number, number]));
  } else {
    const ways = elements.filter((e) => e.type === "way" && e.geometry?.length);
    outerWays = ways.map((w) => w.geometry!.map((g) => [g.lon, g.lat] as [number, number]));
    name = ways[0]?.tags?.name ?? name;
  }

  const rings = stitchRings(outerWays);
  if (!rings.length) return null;

  const geometry =
    rings.length === 1
      ? { type: "Polygon", coordinates: [rings[0]] }
      : { type: "MultiPolygon", coordinates: rings.map((r) => [r]) };

  return { type: "Feature", properties: { name }, geometry };
}

// ---------------------------------------------------------------------------
// Places (food / shopping / entertainment / apartments)
// ---------------------------------------------------------------------------

interface NormalizeResult {
  apartments: Apartment[];
  food: Place[];
  shopping: Place[];
  entertainment: Place[];
}

/**
 * Normalize raw Overpass elements into typed places, routed by classify().
 * Deduplicates by id across the whole run.
 */
function normalize(
  groups: {
    apartments: OverpassElement[];
    food: OverpassElement[];
    shopping: OverpassElement[];
    entertainment: OverpassElement[];
  },
  towns: Town[],
): NormalizeResult {
  const result: NormalizeResult = {
    apartments: [],
    food: [],
    shopping: [],
    entertainment: [],
  };
  const seen = new Set<string>();

  // Order matters only for dedup precedence; all elements run through classify.
  const all = [
    ...groups.apartments,
    ...groups.food,
    ...groups.shopping,
    ...groups.entertainment,
  ];

  for (const el of all) {
    const id = `${el.type}/${el.id}`;
    if (seen.has(id)) continue;

    const tags = el.tags ?? {};
    const classified = classify(tags);
    if (!classified) continue; // not one of our categories

    const coords = coordsOf(el);
    if (!coords) continue; // no usable coordinate — skip

    seen.add(id);

    const { category, subcategory } = classified;
    const name = deriveName(tags, category);
    const address = composeAddress(tags);
    const town = tags["addr:city"] ?? nearestTown(coords.lat, coords.lng, towns);
    const keptTags = pickTags(tags);

    const base: Place = {
      id,
      name,
      category,
      subcategory,
      lat: coords.lat,
      lng: coords.lng,
      ...(town ? { town } : {}),
      ...(address ? { address } : {}),
      ...(keptTags ? { tags: keptTags } : {}),
    };

    if (category === "apartments") {
      const apt: Apartment = {
        ...base,
        category: "apartments",
        links: buildApartmentLinks({
          name,
          lat: coords.lat,
          lng: coords.lng,
          town,
          address,
        }),
      };
      result.apartments.push(apt);
    } else if (category === "food") {
      result.food.push(base);
    } else if (category === "shopping") {
      result.shopping.push(base);
    } else if (category === "entertainment") {
      result.entertainment.push(base);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Counts payload
// ---------------------------------------------------------------------------

function buildCounts(r: NormalizeResult): Record<string, number> {
  const counts: Record<string, number> = {};
  const bump = (key: string) => {
    counts[key] = (counts[key] ?? 0) + 1;
  };

  const tally = (places: Place[]) => {
    for (const p of places) {
      bump(p.category);
      bump(`${p.category}:${p.subcategory}`);
    }
  };

  tally(r.apartments);
  tally(r.food);
  tally(r.shopping);
  tally(r.entertainment);
  return counts;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

function fc(features: PlaceFeature[]): FeatureCollection {
  return { type: "FeatureCollection", features };
}

async function writeJson(file: string, data: unknown): Promise<void> {
  const path = resolve(OUTPUT_DIR, file);
  await Bun.write(path, JSON.stringify(data));
  console.log(`  wrote ${file}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("BW-corridor data pipeline");
  console.log(`bbox (S,W,N,E) = ${BBOX_LITERAL}`);
  console.log(`output dir     = ${OUTPUT_DIR}\n`);

  await mkdir(OUTPUT_DIR, { recursive: true });

  // 1. Towns first (apartments/places need them for nearest-town fallback).
  console.log("Querying Overpass…");
  const townsRaw = await runOverpass("towns", QUERIES.towns);
  await sleep(POLITE_DELAY_MS);

  const apartmentsRaw = await runOverpass("apartments", QUERIES.apartments);
  await sleep(POLITE_DELAY_MS);

  const foodRaw = await runOverpass("food", QUERIES.food);
  await sleep(POLITE_DELAY_MS);

  const shoppingRaw = await runOverpass("shopping", QUERIES.shopping);
  await sleep(POLITE_DELAY_MS);

  const entertainmentRaw = await runOverpass("entertainment", QUERIES.entertainment);
  await sleep(POLITE_DELAY_MS);

  const fortMeadeRaw = await runOverpass("fortMeade", QUERIES.fortMeade);

  // 2. Normalize.
  console.log("\nNormalizing…");
  const towns = buildTowns(townsRaw);
  const places = normalize(
    {
      apartments: apartmentsRaw,
      food: foodRaw,
      shopping: shoppingRaw,
      entertainment: entertainmentRaw,
    },
    towns,
  );

  // 3. Write output.
  console.log("\nWriting JSON…");
  await writeJson("towns.json", towns);
  await writeJson("apartments.json", fc(places.apartments.map(toFeature)));
  await writeJson("food.json", fc(places.food.map(toFeature)));
  await writeJson("shopping.json", fc(places.shopping.map(toFeature)));
  await writeJson("entertainment.json", fc(places.entertainment.map(toFeature)));

  const fortMeade = buildFortMeade(fortMeadeRaw);
  if (fortMeade) {
    await writeJson("fort-meade.json", fortMeade);
  } else {
    console.warn("  !! Fort Meade boundary not found — skipping fort-meade.json");
  }

  const counts = buildCounts(places);
  const categoriesPayload: CategoriesPayload = {
    categories: CATEGORIES,
    counts,
    generatedAt: new Date().toISOString(),
  };
  await writeJson("categories.json", categoriesPayload);

  // 4. Summary + sanity checks.
  console.log("\n=== Summary ===");
  console.log(`towns:         ${towns.length}`);
  console.log(`apartments:    ${places.apartments.length}`);
  console.log(`food:          ${places.food.length}`);
  console.log(`shopping:      ${places.shopping.length}`);
  console.log(`entertainment: ${places.entertainment.length}`);
  console.log("\nPer-subcategory counts:");
  for (const [k, v] of Object.entries(counts).sort()) {
    if (k.includes(":")) console.log(`  ${k}: ${v}`);
  }

  if (places.apartments.length < 50) {
    console.error(
      `\n!! WARNING: only ${places.apartments.length} apartment buildings — expected hundreds-to-thousands. ` +
        `The corridor should yield far more; the query may be wrong or Overpass returned a partial result.`,
    );
    process.exitCode = 1;
  }
  if (towns.length === 0) {
    console.error("\n!! WARNING: zero towns — towns query returned nothing.");
    process.exitCode = 1;
  }

  console.log("\nDone.");
}

main().catch((err) => {
  // FAIL LOUDLY — never write fake data.
  console.error("\n=== DATA PIPELINE FAILED ===");
  console.error(err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});
