import { beforeEach, describe, expect, test } from "bun:test";
import {
  activeFilters,
  apartments,
  enabledCategories,
  isSubActive,
  matchesSearch,
  searchQuery,
  toggleCategory,
  toggleSub,
  viewportBounds,
  visibleApartments,
} from "./store";
import { CATEGORIES } from "./data/taxonomy";
import type { Apartment } from "./data/types";

function apt(partial: Partial<Apartment> & { id: string; name: string }): Apartment {
  return {
    category: "apartments",
    subcategory: "apartments",
    lat: 39.1,
    lng: -76.8,
    town: "Laurel",
    links: { googleMaps: "g", apartmentsCom: "a", zillow: "z" },
    ...partial,
  };
}

const allAptKeys = () =>
  CATEGORIES.find((c) => c.id === "apartments")!.subcategories.map(
    (s) => `apartments:${s.id}`,
  );

beforeEach(() => {
  activeFilters.value = new Set(allAptKeys());
  searchQuery.value = "";
  viewportBounds.value = null;
  apartments.value = [];
});

describe("filter toggles", () => {
  test("toggleSub flips one key", () => {
    expect(isSubActive("apartments", "condo")).toBe(true);
    toggleSub("apartments", "condo");
    expect(isSubActive("apartments", "condo")).toBe(false);
    toggleSub("apartments", "condo");
    expect(isSubActive("apartments", "condo")).toBe(true);
  });

  test("toggleCategory adds/removes every subcategory", () => {
    toggleCategory("food", true);
    const foodSubs = CATEGORIES.find((c) => c.id === "food")!.subcategories;
    for (const sub of foodSubs) expect(isSubActive("food", sub.id)).toBe(true);
    toggleCategory("food", false);
    for (const sub of foodSubs) expect(isSubActive("food", sub.id)).toBe(false);
  });

  test("enabledCategories reflects active keys", () => {
    expect(enabledCategories.value.has("apartments")).toBe(true);
    expect(enabledCategories.value.has("shopping")).toBe(false);
    toggleSub("shopping", "grocery");
    expect(enabledCategories.value.has("shopping")).toBe(true);
  });
});

describe("matchesSearch", () => {
  test("case-insensitive on name and town", () => {
    expect(matchesSearch("The Reserve", "Laurel", "reserve")).toBe(true);
    expect(matchesSearch("The Reserve", "Laurel", "LAUREL")).toBe(true);
    expect(matchesSearch("The Reserve", "Laurel", "bowie")).toBe(false);
    expect(matchesSearch(undefined, undefined, "x")).toBe(false);
    expect(matchesSearch(undefined, undefined, "")).toBe(true);
  });
});

describe("visibleApartments", () => {
  test("filters by search, subcategory, viewport; sorts by name", () => {
    apartments.value = [
      apt({ id: "1", name: "Zebra Flats" }),
      apt({ id: "2", name: "Acme Apartments" }),
      apt({ id: "3", name: "Condo Court", subcategory: "condo" }),
      apt({ id: "4", name: "Far Away Flats", lat: 45, lng: -100 }),
    ];

    // Sorted alphabetically, all in (no viewport set).
    expect(visibleApartments.value.map((a) => a.id)).toEqual(["2", "3", "4", "1"]);

    // Viewport filter.
    viewportBounds.value = [-77, 39, -76.5, 39.3];
    expect(visibleApartments.value.map((a) => a.id)).toEqual(["2", "3", "1"]);

    // Subcategory filter.
    toggleSub("apartments", "condo");
    expect(visibleApartments.value.map((a) => a.id)).toEqual(["2", "1"]);

    // Search.
    searchQuery.value = "acme";
    expect(visibleApartments.value.map((a) => a.id)).toEqual(["2"]);
  });
});
