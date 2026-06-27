// Shared data types used by the fetch pipeline and the UI.

export type CategoryId = "apartments" | "food" | "shopping" | "entertainment";

// A normalized place derived from an OSM element.
export interface Place {
  id: string; // e.g. "node/123" or "way/456"
  name: string;
  category: CategoryId;
  subcategory: string; // taxonomy subcategory key, e.g. "italian", "grocery"
  lat: number;
  lng: number;
  town?: string;
  address?: string;
  // Free-form OSM attributes worth surfacing (cuisine, units, levels, website, etc.)
  tags?: Record<string, string>;
}

export interface Apartment extends Place {
  category: "apartments";
  links: {
    googleMaps: string;
    apartmentsCom: string;
    zillow: string;
  };
}

export interface Town {
  name: string;
  lat: number;
  lng: number;
  placeType: string; // town | village | suburb | neighbourhood
}

// Taxonomy shape: top categories -> ordered subcategories.
export interface SubcategoryDef {
  id: string;
  label: string;
}

export interface CategoryDef {
  id: CategoryId;
  label: string;
  color: string; // marker color
  subcategories: SubcategoryDef[];
}

// categories.json payload (taxonomy + live counts).
export interface CategoriesPayload {
  categories: CategoryDef[];
  counts: Record<string, number>; // keyed by `${categoryId}:${subcategoryId}` and `${categoryId}`
  generatedAt: string;
}

// GeoJSON helpers (what we actually feed MapLibre sources).
// Properties is a Place that MAY also carry apartment links (present only for
// apartment features). Avoids the literal-`category` clash of Partial<Apartment>.
export type PlaceProperties = Place & { links?: Apartment["links"] };

export interface PlaceFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: PlaceProperties;
}

export interface FeatureCollection {
  type: "FeatureCollection";
  features: PlaceFeature[];
}
