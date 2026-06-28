// Outbound link builders for apartment tiles.
// Used by the fetch pipeline (to bake links into apartments.json) and as a
// fallback in the UI.

export interface PlaceLinkInput {
  name?: string;
  lat: number;
  lng: number;
  town?: string;
  address?: string;
}

// A name is "generic" when it came from an unnamed OSM building (e.g.
// "Apartment Building" or "Apartment Building (Foo Street)"). Google can't
// resolve those to a place, so we fall back to coordinates instead.
function isGenericName(name?: string): boolean {
  return !name || /^apartment building/i.test(name.trim());
}

// apartments.com / Zillow address pages key off a real municipality. Our town
// field is OSM-derived and is sometimes a neighborhood or village; map the
// unambiguous ones to their parent city so the rental-site links resolve.
// Only high-confidence corrections live here — verified cities are left alone.
const TOWN_TO_CITY: Record<string, string> = {
  // Columbia, MD villages
  "Long Reach": "Columbia",
  "Owen Brown": "Columbia",
  "Wilde Lake": "Columbia",
  "Harper's Choice": "Columbia",
  "Dorsey's Search": "Columbia",
  "Kings Contrivance": "Columbia",
  "River Hill": "Columbia",
  "Columbia Town Center": "Columbia",
  "Plum Tree": "Columbia",
  // Ellicott City, MD neighborhoods (Google-verified for Gray Rock)
  "Gray Rock": "Ellicott City",
  "Dunloggin": "Ellicott City",
  // Baltimore, MD neighborhoods
  "South Baltimore": "Baltimore",
  "Highlandtown": "Baltimore",
  "Sowebo": "Baltimore",
  "Cherry Hill": "Baltimore",
  // College Park, MD neighborhoods
  "Lakeland": "College Park",
  "College Park Woods": "College Park",
  "Berwyn": "College Park",
  "Hollywood": "College Park",
  // Annapolis, MD
  "Parole": "Annapolis",
  "Annapolis Neck": "Annapolis",
  // Laurel, MD
  "North Laurel": "Laurel",
  "South Laurel": "Laurel",
  "Russett": "Laurel",
  // Odenton, MD (Google-verified for Piney Orchard)
  "Piney Orchard": "Odenton",
  "Fort Meade": "Odenton",
  // Bowie, MD
  "Old Town Bowie": "Bowie",
};

function rentalCity(town?: string): string | undefined {
  if (!town) return undefined;
  return TOWN_TO_CITY[town] ?? town;
}

// "Ellicott City" -> "ellicott-city-md"
function citySlug(city: string): string {
  return (
    city
      .toLowerCase()
      .replace(/['']/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") + "-md"
  );
}

export function googleMapsLink({ name, lat, lng }: PlaceLinkInput): string {
  // For a real complex name, "name@lat,lng" resolves to its Google place page
  // (with the pin at the right spot). For unnamed buildings, search the bare
  // coordinates so the pin still lands exactly on the building.
  const query = isGenericName(name)
    ? `${lat},${lng}`
    : `${encodeURIComponent(name as string)}@${lat},${lng}`;
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

export function apartmentsComLink({ town }: PlaceLinkInput): string {
  const city = rentalCity(town);
  // City page is apartments.com's canonical, query-respecting URL. The old
  // /search/?q= endpoint ignored the term and geolocated to the visitor's IP.
  return city
    ? `https://www.apartments.com/${citySlug(city)}/`
    : "https://www.apartments.com/md/";
}

export function zillowLink({ town }: PlaceLinkInput): string {
  const city = rentalCity(town);
  return city
    ? `https://www.zillow.com/${citySlug(city)}/rentals/`
    : "https://www.zillow.com/md/rentals/";
}

export function buildApartmentLinks(input: PlaceLinkInput) {
  return {
    googleMaps: googleMapsLink(input),
    apartmentsCom: apartmentsComLink(input),
    zillow: zillowLink(input),
  };
}
