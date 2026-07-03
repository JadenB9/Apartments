import { describe, expect, test } from "bun:test";
import { buildApartmentLinks } from "./links";

describe("buildApartmentLinks", () => {
  const input = {
    name: "The Reserve at Laurel",
    lat: 39.099,
    lng: -76.848,
    town: "Laurel",
    address: "123 Main St",
  };

  test("produces all three links", () => {
    const links = buildApartmentLinks(input);
    expect(links.googleMaps).toStartWith("https://www.google.com/maps/search/");
    expect(links.apartmentsCom).toStartWith("https://www.apartments.com/search/");
    expect(links.zillow).toStartWith("https://www.zillow.com/homes/");
  });

  test("encodes names with special characters", () => {
    const links = buildApartmentLinks({ ...input, name: "Fox & Hound #2" });
    expect(links.googleMaps).not.toContain("#2");
    expect(links.googleMaps).toContain("%26"); // &
    expect(links.apartmentsCom).toContain("%232"); // #2
  });

  test("google maps link includes coordinates", () => {
    const links = buildApartmentLinks(input);
    expect(links.googleMaps).toContain("39.099");
    expect(links.googleMaps).toContain("-76.848");
  });

  test("nameless input still yields a coordinate link", () => {
    const links = buildApartmentLinks({ lat: 39.1, lng: -76.8 });
    expect(links.googleMaps).toContain("query=39.1,-76.8");
  });

  test("search links carry town and state", () => {
    const links = buildApartmentLinks(input);
    expect(decodeURIComponent(links.apartmentsCom)).toContain("Laurel MD");
    expect(decodeURIComponent(links.zillow)).toContain("Laurel MD");
  });
});
