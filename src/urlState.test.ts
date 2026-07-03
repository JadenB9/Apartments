import { describe, expect, test } from "bun:test";
import { buildHash, encodeFilters, parseHash } from "./urlState";
import { CATEGORIES } from "./data/taxonomy";

const allSubs = (cat: string) =>
  CATEGORIES.find((c) => c.id === cat)!.subcategories.map((s) => `${cat}:${s.id}`);

describe("hash round-trip", () => {
  test("view parses back", () => {
    const hash = buildHash({ zoom: 11.25, lat: 39.10501, lng: -76.71002 }, new Set());
    const parsed = parseHash(hash);
    expect(parsed.view).toEqual({ zoom: 11.25, lat: 39.10501, lng: -76.71002 });
  });

  test("full category encodes compactly and expands on parse", () => {
    const filters = new Set(allSubs("apartments"));
    expect(encodeFilters(filters)).toBe("apartments");
    const parsed = parseHash(buildHash(null, filters));
    expect(parsed.filters).toEqual(filters);
  });

  test("partial category round-trips", () => {
    const filters = new Set(["food:italian", "food:cafe"]);
    expect(encodeFilters(filters)).toBe("food:italian.cafe");
    const parsed = parseHash(buildHash(null, filters));
    expect(parsed.filters).toEqual(filters);
  });

  test("mixed categories round-trip", () => {
    const filters = new Set([...allSubs("shopping"), "food:thai"]);
    const parsed = parseHash(buildHash(null, filters));
    expect(parsed.filters).toEqual(filters);
  });
});

describe("hash robustness", () => {
  test("garbage is ignored", () => {
    expect(parseHash("#v=a/b/c&f=bogus,fake:sub").view).toBeUndefined();
    expect(parseHash("#v=a/b/c&f=bogus,fake:sub").filters).toEqual(new Set());
    expect(parseHash("").view).toBeUndefined();
    expect(parseHash("").filters).toBeUndefined();
  });

  test("unknown subcategories are dropped, valid ones kept", () => {
    const parsed = parseHash("#f=food:italian.notreal");
    expect(parsed.filters).toEqual(new Set(["food:italian"]));
  });

  test("empty f param yields empty set (all off)", () => {
    const parsed = parseHash("#f=");
    expect(parsed.filters).toEqual(new Set());
  });
});
