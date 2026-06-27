// Shared taxonomy: OSM tags -> (category, subcategory).
// Used by BOTH scripts/fetch-data.ts (classification at build time) and the UI
// (category tree labels/colors). Keep this the single source of truth.

import type { CategoryDef, CategoryId } from "./types";

export const CATEGORIES: CategoryDef[] = [
  {
    id: "apartments",
    label: "Apartments",
    color: "#e8590c",
    subcategories: [
      { id: "apartments", label: "Apartment Buildings" },
      { id: "residential", label: "Residential Complexes" },
      { id: "condo", label: "Condos" },
    ],
  },
  {
    id: "food",
    label: "Food & Drink",
    color: "#c92a2a",
    subcategories: [
      { id: "american", label: "American" },
      { id: "italian", label: "Italian / Pizza" },
      { id: "mexican", label: "Mexican" },
      { id: "chinese", label: "Chinese" },
      { id: "japanese", label: "Japanese / Sushi" },
      { id: "indian", label: "Indian" },
      { id: "thai", label: "Thai" },
      { id: "korean", label: "Korean" },
      { id: "mediterranean", label: "Mediterranean" },
      { id: "seafood", label: "Seafood" },
      { id: "burger", label: "Burgers" },
      { id: "fast_food", label: "Fast Food" },
      { id: "cafe", label: "Cafe / Coffee" },
      { id: "bakery", label: "Bakery / Dessert" },
      { id: "bar", label: "Bar / Pub" },
      { id: "other_food", label: "Other Restaurants" },
    ],
  },
  {
    id: "shopping",
    label: "Shopping",
    color: "#5f3dc4",
    subcategories: [
      { id: "grocery", label: "Grocery / Supermarket" },
      { id: "mall", label: "Malls / Dept Stores" },
      { id: "clothing", label: "Clothing / Apparel" },
      { id: "electronics", label: "Electronics" },
      { id: "home", label: "Home / Furniture / Hardware" },
      { id: "convenience", label: "Convenience" },
      { id: "health_beauty", label: "Health & Beauty" },
      { id: "other_shopping", label: "Other Shops" },
    ],
  },
  {
    id: "entertainment",
    label: "Entertainment",
    color: "#2b8a3e",
    subcategories: [
      { id: "cinema", label: "Cinema / Theatre" },
      { id: "parks", label: "Parks / Nature" },
      { id: "fitness", label: "Fitness / Gyms" },
      { id: "sports", label: "Sports / Recreation" },
      { id: "nightlife", label: "Nightlife" },
      { id: "arts", label: "Arts / Museums" },
      { id: "other_fun", label: "Other Attractions" },
    ],
  },
];

export const CATEGORY_BY_ID: Record<CategoryId, CategoryDef> = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c]),
) as Record<CategoryId, CategoryDef>;

export function subcategoryLabel(category: CategoryId, sub: string): string {
  return (
    CATEGORY_BY_ID[category]?.subcategories.find((s) => s.id === sub)?.label ?? sub
  );
}

// ----- Classification of an OSM tag bag -----

export interface Classified {
  category: CategoryId;
  subcategory: string;
}

const CUISINE_MAP: Record<string, string> = {
  italian: "italian",
  pizza: "italian",
  mexican: "mexican",
  "tex-mex": "mexican",
  chinese: "chinese",
  japanese: "japanese",
  sushi: "japanese",
  indian: "indian",
  thai: "thai",
  korean: "korean",
  mediterranean: "mediterranean",
  greek: "mediterranean",
  lebanese: "mediterranean",
  turkish: "mediterranean",
  seafood: "seafood",
  burger: "burger",
  american: "american",
  steak_house: "american",
  bakery: "bakery",
  dessert: "bakery",
  ice_cream: "bakery",
  coffee_shop: "cafe",
};

function classifyFood(tags: Record<string, string>): Classified {
  const amenity = tags.amenity;
  if (amenity === "cafe" || amenity === "ice_cream") {
    return { category: "food", subcategory: amenity === "ice_cream" ? "bakery" : "cafe" };
  }
  if (amenity === "bar" || amenity === "pub" || amenity === "nightclub") {
    return { category: "food", subcategory: "bar" };
  }
  if (amenity === "fast_food") {
    const cuisine = (tags.cuisine ?? "").split(";")[0];
    if (cuisine === "burger") return { category: "food", subcategory: "burger" };
    return { category: "food", subcategory: "fast_food" };
  }
  // restaurant / food_court — classify by cuisine
  const cuisine = (tags.cuisine ?? "").split(";")[0];
  const sub = CUISINE_MAP[cuisine];
  return { category: "food", subcategory: sub ?? "other_food" };
}

function classifyShop(tags: Record<string, string>): Classified {
  const shop = tags.shop ?? "";
  const grocery = ["supermarket", "grocery", "greengrocer", "butcher", "deli"];
  const mall = ["mall", "department_store", "wholesale"];
  const clothing = ["clothes", "shoes", "boutique", "fashion", "jewelry", "bag"];
  const electronics = ["electronics", "computer", "mobile_phone", "hifi"];
  const home = ["furniture", "doityourself", "hardware", "garden_centre", "houseware", "appliance", "kitchen"];
  const convenience = ["convenience", "kiosk", "variety_store"];
  const beauty = ["hairdresser", "beauty", "cosmetics", "chemist", "pharmacy", "optician"];
  if (grocery.includes(shop)) return { category: "shopping", subcategory: "grocery" };
  if (mall.includes(shop)) return { category: "shopping", subcategory: "mall" };
  if (clothing.includes(shop)) return { category: "shopping", subcategory: "clothing" };
  if (electronics.includes(shop)) return { category: "shopping", subcategory: "electronics" };
  if (home.includes(shop)) return { category: "shopping", subcategory: "home" };
  if (convenience.includes(shop)) return { category: "shopping", subcategory: "convenience" };
  if (beauty.includes(shop)) return { category: "shopping", subcategory: "health_beauty" };
  return { category: "shopping", subcategory: "other_shopping" };
}

function classifyEntertainment(tags: Record<string, string>): Classified | null {
  const amenity = tags.amenity;
  const leisure = tags.leisure;
  const tourism = tags.tourism;
  if (amenity === "cinema" || amenity === "theatre") {
    return { category: "entertainment", subcategory: "cinema" };
  }
  if (amenity === "nightclub") {
    return { category: "entertainment", subcategory: "nightlife" };
  }
  if (amenity === "arts_centre") {
    return { category: "entertainment", subcategory: "arts" };
  }
  if (leisure) {
    if (leisure === "park" || leisure === "nature_reserve" || leisure === "garden") {
      return { category: "entertainment", subcategory: "parks" };
    }
    if (leisure === "fitness_centre" || leisure === "sports_centre" || leisure === "fitness_station") {
      return { category: "entertainment", subcategory: "fitness" };
    }
    if (
      leisure === "bowling_alley" ||
      leisure === "stadium" ||
      leisure === "pitch" ||
      leisure === "golf_course" ||
      leisure === "ice_rink" ||
      leisure === "swimming_pool" ||
      leisure === "water_park"
    ) {
      return { category: "entertainment", subcategory: "sports" };
    }
    return { category: "entertainment", subcategory: "other_fun" };
  }
  if (tourism) {
    if (tourism === "museum" || tourism === "gallery" || tourism === "artwork") {
      return { category: "entertainment", subcategory: "arts" };
    }
    if (tourism === "attraction" || tourism === "theme_park" || tourism === "zoo" || tourism === "aquarium") {
      return { category: "entertainment", subcategory: "other_fun" };
    }
  }
  return null;
}

function classifyApartment(tags: Record<string, string>): Classified | null {
  const building = tags.building;
  if (building === "apartments") {
    return { category: "apartments", subcategory: "apartments" };
  }
  if (building === "residential" && tags.residential === "apartments") {
    return { category: "apartments", subcategory: "apartments" };
  }
  if (tags["building:use"] === "apartments") {
    return { category: "apartments", subcategory: "apartments" };
  }
  if (building === "residential") {
    return { category: "apartments", subcategory: "residential" };
  }
  if (building === "dormitory" || tags.residential === "university") {
    return { category: "apartments", subcategory: "residential" };
  }
  if (tags.building === "yes" && /apartment|condo|residence|towers?|lofts?/i.test(tags.name ?? "")) {
    return { category: "apartments", subcategory: /condo/i.test(tags.name ?? "") ? "condo" : "apartments" };
  }
  return null;
}

// Top-level classifier. Returns null if the element isn't one of our categories.
export function classify(tags: Record<string, string>): Classified | null {
  const apt = classifyApartment(tags);
  if (apt) return apt;

  const amenity = tags.amenity;
  const FOOD_AMENITIES = new Set([
    "restaurant",
    "fast_food",
    "cafe",
    "bar",
    "pub",
    "food_court",
    "ice_cream",
  ]);
  if (amenity && FOOD_AMENITIES.has(amenity)) return classifyFood(tags);

  if (tags.shop) return classifyShop(tags);

  const ent = classifyEntertainment(tags);
  if (ent) return ent;

  return null;
}
