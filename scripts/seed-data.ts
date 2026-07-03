// Seed / demo dataset generator (NO NETWORK REQUIRED).
//
// WHY THIS EXISTS: the live pipeline (scripts/fetch-data.ts) pulls the COMPLETE
// dataset from the OpenStreetMap Overpass API. In some locked-down environments
// Overpass egress is blocked by policy, so this script produces a realistic,
// clearly-labeled SEED dataset for the Baltimore–Washington corridor so the app
// is fully functional out of the box. Run `bun run fetch-data` anywhere Overpass
// is reachable to REPLACE this with the full, authoritative data.
//
// Output matches the exact same JSON shapes as the live pipeline.

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { CATEGORIES, classify } from "../src/data/taxonomy.ts";
import { buildApartmentLinks } from "../src/data/links.ts";
import type {
  Apartment,
  CategoriesPayload,
  FeatureCollection,
  Place,
  PlaceFeature,
  Town,
} from "../src/data/types.ts";

const OUT = path.resolve(import.meta.dirname, "../public/data");

// Real corridor towns with approximate centroids (within the bbox).
const TOWNS: Array<{ name: string; lat: number; lng: number; placeType: string }> = [
  { name: "Columbia", lat: 39.204, lng: -76.861, placeType: "town" },
  { name: "Ellicott City", lat: 39.267, lng: -76.798, placeType: "town" },
  { name: "Elkridge", lat: 39.212, lng: -76.714, placeType: "suburb" },
  { name: "Laurel", lat: 39.099, lng: -76.848, placeType: "town" },
  { name: "Jessup", lat: 39.15, lng: -76.775, placeType: "village" },
  { name: "Savage", lat: 39.138, lng: -76.825, placeType: "village" },
  { name: "Hanover", lat: 39.193, lng: -76.724, placeType: "suburb" },
  { name: "Odenton", lat: 39.084, lng: -76.7, placeType: "town" },
  { name: "Severn", lat: 39.137, lng: -76.698, placeType: "suburb" },
  { name: "Fort Meade", lat: 39.108, lng: -76.743, placeType: "suburb" },
  { name: "Annapolis Junction", lat: 39.115, lng: -76.785, placeType: "village" },
  { name: "Maple Lawn", lat: 39.143, lng: -76.866, placeType: "neighbourhood" },
  { name: "Fulton", lat: 39.153, lng: -76.918, placeType: "village" },
  { name: "Clarksville", lat: 39.205, lng: -76.943, placeType: "village" },
  { name: "Beltsville", lat: 39.035, lng: -76.907, placeType: "suburb" },
  { name: "Greenbelt", lat: 39.005, lng: -76.875, placeType: "town" },
  { name: "College Park", lat: 38.98, lng: -76.937, placeType: "town" },
  { name: "Hyattsville", lat: 38.956, lng: -76.945, placeType: "town" },
  { name: "Glen Burnie", lat: 39.163, lng: -76.625, placeType: "town" },
  { name: "Arbutus", lat: 39.245, lng: -76.697, placeType: "suburb" },
  { name: "Catonsville", lat: 39.272, lng: -76.732, placeType: "town" },
  { name: "Bowie", lat: 39.006, lng: -76.779, placeType: "town" },
  { name: "Crofton", lat: 39.001, lng: -76.687, placeType: "town" },
  { name: "Annapolis", lat: 38.978, lng: -76.492, placeType: "town" },
  { name: "Linthicum", lat: 39.205, lng: -76.665, placeType: "suburb" },
  { name: "Burtonsville", lat: 39.105, lng: -76.933, placeType: "village" },
];

// Deterministic pseudo-random so output is stable across runs.
let seed = 1337;
function rand(): number {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}
function jitter(base: number, spread: number): number {
  return +(base + (rand() - 0.5) * spread).toFixed(5);
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}

const APT_PATTERNS = [
  "The Reserve at {t}",
  "{t} Crossing Apartments",
  "Parke at {t}",
  "{t} Station Apartments",
  "Avalon {t}",
  "The Residences at {t}",
  "{t} Pointe",
  "Gateway at {t}",
  "The Lofts at {t}",
  "{t} Town Center Apartments",
  "Verde at {t}",
  "{t} Overlook",
  "{t} Condominiums",
  "The Courts of {t} Condos",
];
const STREETS = ["Main St", "Washington Blvd", "Cedar Ln", "Oak Ridge Rd", "Patuxent Pkwy", "Snowden River Pkwy", "Brock Bridge Rd", "Ridge Rd", "Maple Ave", "Old Annapolis Rd"];

const FOOD: Array<[string, string]> = [
  ["restaurant", "italian"], ["restaurant", "mexican"], ["restaurant", "chinese"],
  ["restaurant", "japanese"], ["restaurant", "indian"], ["restaurant", "thai"],
  ["restaurant", "american"], ["restaurant", "seafood"], ["restaurant", "korean"],
  ["restaurant", "mediterranean"], ["fast_food", ""], ["fast_food", "burger"],
  ["cafe", ""], ["bar", ""], ["ice_cream", ""],
];
const FOOD_NAMES: Record<string, string[]> = {
  italian: ["Bertucci's", "Trattoria Bella", "Aldo's Pizza", "Nonna's Kitchen"],
  mexican: ["El Azteca", "Casa Mole", "Taco Cielo", "La Tolteca"],
  chinese: ["Hunan Manor", "Golden Wok", "Szechuan Garden", "Lucky Dragon"],
  japanese: ["Sakura Sushi", "Edo Asian", "Tomo Hibachi", "Kibo Ramen"],
  indian: ["Tandoori Nights", "Spice Route", "Mango Grove", "Curry House"],
  thai: ["Thai Aroma", "Bangkok Garden", "Lemongrass", "Basil Leaf"],
  american: ["Corner Tavern", "The Grille", "Liberty Diner", "Founders Kitchen"],
  seafood: ["Blue Crab House", "Chesapeake Catch", "Pier 7", "Tidewater Grill"],
  korean: ["Seoul Garden", "Bonchon", "Kimchi House", "Gangnam BBQ"],
  mediterranean: ["Cava Mezze", "Olive Tree", "Zaytinya Grill", "Aegean"],
  burger: ["Five Guys", "Smashtown", "BurgerFi", "The Patty Co"],
  "": ["Chipotle", "Panera", "Local Cafe", "Sip Coffee", "Tap House", "Scoops"],
};

const SHOP: Array<[string, string]> = [
  ["supermarket", "Giant Food"], ["supermarket", "Safeway"], ["supermarket", "Weis Markets"],
  ["supermarket", "Lidl"], ["supermarket", "Wegmans"], ["mall", "Town Center Mall"],
  ["department_store", "Target"], ["department_store", "Kohl's"], ["clothes", "Old Navy"],
  ["clothes", "Marshalls"], ["electronics", "Best Buy"], ["doityourself", "Home Depot"],
  ["doityourself", "Lowe's"], ["furniture", "HomeGoods"], ["convenience", "7-Eleven"],
  ["convenience", "Royal Farms"], ["hairdresser", "Great Clips"], ["pharmacy", "CVS"],
  ["pharmacy", "Walgreens"],
];

const ENT: Array<[string, string, string]> = [
  ["amenity", "cinema", "AMC Theatres"], ["amenity", "cinema", "Regal Cinemas"],
  ["amenity", "theatre", "Toby's Dinner Theatre"], ["leisure", "park", "Centennial Park"],
  ["leisure", "park", "Lake Elkhorn Park"], ["leisure", "park", "Savage Park"],
  ["leisure", "nature_reserve", "Patuxent Research Refuge"], ["leisure", "fitness_centre", "Planet Fitness"],
  ["leisure", "fitness_centre", "LA Fitness"], ["leisure", "sports_centre", "Columbia Sports Park"],
  ["leisure", "bowling_alley", "Bowlero"], ["leisure", "golf_course", "Fairway Hills Golf"],
  ["amenity", "nightclub", "The Vault"], ["tourism", "museum", "B&O Railroad Museum Annex"],
  ["amenity", "arts_centre", "Howard County Arts Council"],
];

function townOf(lat: number, lng: number): string {
  let best = TOWNS[0];
  let bestD = Infinity;
  for (const t of TOWNS) {
    const d = (t.lat - lat) ** 2 + (t.lng - lng) ** 2;
    if (d < bestD) { bestD = d; best = t; }
  }
  return best.name;
}

function feat(p: Place): PlaceFeature {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [p.lng, p.lat] },
    properties: p,
  };
}

function main() {
  const towns: Town[] = TOWNS.map((t) => ({ ...t }));

  const apartments: PlaceFeature[] = [];
  let aptId = 1;
  for (const t of TOWNS) {
    const count = 4 + Math.floor(rand() * 5); // 4–8 complexes per town
    const used = new Set<string>();
    for (let i = 0; i < count; i++) {
      let pat = pick(APT_PATTERNS);
      while (used.has(pat) && used.size < APT_PATTERNS.length) pat = pick(APT_PATTERNS);
      used.add(pat);
      const name = pat.replace("{t}", t.name);
      const lat = jitter(t.lat, 0.02);
      const lng = jitter(t.lng, 0.024);
      const street = `${100 + Math.floor(rand() * 8900)} ${pick(STREETS)}`;
      const levels = 3 + Math.floor(rand() * 6);
      const units = String(levels * (8 + Math.floor(rand() * 20)));
      const apt: Apartment = {
        id: `seed/apt/${aptId++}`,
        name,
        category: "apartments",
        subcategory: /condo/i.test(name) ? "condo" : "apartments",
        lat,
        lng,
        town: t.name,
        address: `${street}, ${t.name}, MD`,
        tags: {
          "building:levels": String(levels),
          units,
          "addr:street": street,
          seed: "true",
        },
        links: buildApartmentLinks({ name, lat, lng, town: t.name, address: street }),
      };
      apartments.push(feat(apt));
    }
  }

  const food: PlaceFeature[] = [];
  const shopping: PlaceFeature[] = [];
  const entertainment: PlaceFeature[] = [];
  let pid = 1;

  // Spread POIs across towns weighted toward the larger ones.
  const poiTowns = TOWNS.filter((t) => t.placeType === "town").concat(TOWNS);
  for (let i = 0; i < 90; i++) {
    const t = pick(poiTowns);
    const [amenity, cuisine] = pick(FOOD);
    const names = FOOD_NAMES[cuisine] ?? FOOD_NAMES[""];
    const name = pick(names);
    const lat = jitter(t.lat, 0.03);
    const lng = jitter(t.lng, 0.034);
    const tags: Record<string, string> = { amenity, seed: "true" };
    if (cuisine) tags.cuisine = cuisine;
    const c = classify(tags) ?? { category: "food" as const, subcategory: "other_food" };
    food.push(feat({ id: `seed/food/${pid++}`, name, category: c.category, subcategory: c.subcategory, lat, lng, town: townOf(lat, lng), tags }));
  }

  for (let i = 0; i < 60; i++) {
    const t = pick(poiTowns);
    const [shop, name] = pick(SHOP);
    const lat = jitter(t.lat, 0.03);
    const lng = jitter(t.lng, 0.034);
    const tags: Record<string, string> = { shop, seed: "true" };
    const c = classify(tags)!;
    shopping.push(feat({ id: `seed/shop/${pid++}`, name, category: c.category, subcategory: c.subcategory, lat, lng, town: townOf(lat, lng), tags }));
  }

  for (let i = 0; i < 40; i++) {
    const t = pick(poiTowns);
    const [key, val, name] = pick(ENT);
    const lat = jitter(t.lat, 0.03);
    const lng = jitter(t.lng, 0.034);
    const tags: Record<string, string> = { [key]: val, seed: "true" };
    const c = classify(tags) ?? { category: "entertainment" as const, subcategory: "other_fun" };
    entertainment.push(feat({ id: `seed/ent/${pid++}`, name, category: c.category, subcategory: c.subcategory, lat, lng, town: townOf(lat, lng), tags }));
  }

  // Counts for the taxonomy payload.
  const all = [...apartments, ...food, ...shopping, ...entertainment];
  const counts: Record<string, number> = {};
  for (const f of all) {
    const p = f.properties;
    counts[p.category] = (counts[p.category] ?? 0) + 1;
    counts[`${p.category}:${p.subcategory}`] = (counts[`${p.category}:${p.subcategory}`] ?? 0) + 1;
  }

  const categories: CategoriesPayload = {
    categories: CATEGORIES,
    counts,
    generatedAt: new Date().toISOString(),
    source: "sample",
  };

  const fc = (features: PlaceFeature[]): FeatureCollection => ({ type: "FeatureCollection", features });
  return { towns, apartments: fc(apartments), food: fc(food), shopping: fc(shopping), entertainment: fc(entertainment), categories };
}

const data = main();
await mkdir(OUT, { recursive: true });
await Promise.all([
  writeFile(path.join(OUT, "towns.json"), JSON.stringify(data.towns)),
  writeFile(path.join(OUT, "apartments.json"), JSON.stringify(data.apartments)),
  writeFile(path.join(OUT, "food.json"), JSON.stringify(data.food)),
  writeFile(path.join(OUT, "shopping.json"), JSON.stringify(data.shopping)),
  writeFile(path.join(OUT, "entertainment.json"), JSON.stringify(data.entertainment)),
  writeFile(path.join(OUT, "categories.json"), JSON.stringify(data.categories)),
]);

console.log("Seed data written to public/data/:");
console.log(`  towns:         ${data.towns.length}`);
console.log(`  apartments:    ${data.apartments.features.length}`);
console.log(`  food:          ${data.food.features.length}`);
console.log(`  shopping:      ${data.shopping.features.length}`);
console.log(`  entertainment: ${data.entertainment.features.length}`);
console.log("NOTE: This is demonstrative seed data. Run `bun run fetch-data` where");
console.log("Overpass egress is permitted to replace it with the full OSM dataset.");
