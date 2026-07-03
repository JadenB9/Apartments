import { describe, expect, test } from "bun:test";
import { classify, subcategoryLabel, CATEGORIES, CATEGORY_BY_ID } from "./taxonomy";

describe("classify — apartments", () => {
  test("building=apartments", () => {
    expect(classify({ building: "apartments" })).toEqual({
      category: "apartments",
      subcategory: "apartments",
    });
  });

  test("named condos are the condo subcategory", () => {
    expect(classify({ building: "apartments", name: "Harbor View Condominiums" }))
      .toEqual({ category: "apartments", subcategory: "condo" });
    expect(classify({ building: "residential", name: "The Elm Condos" }))
      .toEqual({ category: "apartments", subcategory: "condo" });
  });

  test("residential=apartments on building=residential", () => {
    expect(classify({ building: "residential", residential: "apartments" }))
      .toEqual({ category: "apartments", subcategory: "apartments" });
  });

  test("named building=yes complexes", () => {
    expect(classify({ building: "yes", name: "Summit Towers" }))
      .toEqual({ category: "apartments", subcategory: "apartments" });
    expect(classify({ building: "yes", name: "Joe's Garage" })).toBeNull();
  });
});

describe("classify — food", () => {
  test("cuisine routing", () => {
    expect(classify({ amenity: "restaurant", cuisine: "pizza" })!.subcategory).toBe("italian");
    expect(classify({ amenity: "restaurant", cuisine: "sushi" })!.subcategory).toBe("japanese");
    expect(classify({ amenity: "restaurant", cuisine: "tex-mex" })!.subcategory).toBe("mexican");
    expect(classify({ amenity: "restaurant" })!.subcategory).toBe("other_food");
  });

  test("multi-value cuisine uses the first entry", () => {
    expect(classify({ amenity: "restaurant", cuisine: "thai;chinese" })!.subcategory).toBe("thai");
  });

  test("fast food burger split", () => {
    expect(classify({ amenity: "fast_food", cuisine: "burger" })!.subcategory).toBe("burger");
    expect(classify({ amenity: "fast_food" })!.subcategory).toBe("fast_food");
  });

  test("bars/cafes", () => {
    expect(classify({ amenity: "pub" })!.subcategory).toBe("bar");
    expect(classify({ amenity: "cafe" })!.subcategory).toBe("cafe");
  });
});

describe("classify — shopping", () => {
  test("grocery vs mall vs other", () => {
    expect(classify({ shop: "supermarket" })!.subcategory).toBe("grocery");
    expect(classify({ shop: "department_store" })!.subcategory).toBe("mall");
    expect(classify({ shop: "taxidermist" })!.subcategory).toBe("other_shopping");
  });
});

describe("classify — entertainment is bounded", () => {
  test("destinations classify", () => {
    expect(classify({ amenity: "cinema" })!.subcategory).toBe("cinema");
    expect(classify({ leisure: "park" })!.subcategory).toBe("parks");
    expect(classify({ leisure: "fitness_centre" })!.subcategory).toBe("fitness");
    expect(classify({ leisure: "bowling_alley" })!.subcategory).toBe("sports");
    expect(classify({ tourism: "museum" })!.subcategory).toBe("arts");
  });

  test("map noise is rejected", () => {
    expect(classify({ leisure: "playground" })).toBeNull();
    expect(classify({ leisure: "picnic_table" })).toBeNull();
    expect(classify({ leisure: "pitch" })).toBeNull();
    expect(classify({})).toBeNull();
  });
});

describe("taxonomy shape", () => {
  test("subcategoryLabel resolves and falls back", () => {
    expect(subcategoryLabel("food", "italian")).toBe("Italian / Pizza");
    expect(subcategoryLabel("food", "nonexistent")).toBe("nonexistent");
  });

  test("every category has a color and at least one subcategory", () => {
    for (const cat of CATEGORIES) {
      expect(cat.color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(cat.subcategories.length).toBeGreaterThan(0);
      expect(CATEGORY_BY_ID[cat.id]).toBe(cat);
    }
  });
});
