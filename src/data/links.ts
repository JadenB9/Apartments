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

function q(parts: (string | undefined)[]): string {
  return encodeURIComponent(parts.filter(Boolean).join(" "));
}

function googleMapsLink({ name, lat, lng }: PlaceLinkInput): string {
  // Prefer name+coords so the pin lands on the right place.
  const query = name
    ? `${encodeURIComponent(name)}@${lat},${lng}`
    : `${lat},${lng}`;
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

function apartmentsComLink({ name, town, address }: PlaceLinkInput): string {
  return `https://www.apartments.com/search/?q=${q([name, address, town, "MD"])}`;
}

function zillowLink({ name, town, address }: PlaceLinkInput): string {
  return `https://www.zillow.com/homes/${q([name, address, town, "MD"])}_rb/`;
}

export function buildApartmentLinks(input: PlaceLinkInput) {
  return {
    googleMaps: googleMapsLink(input),
    apartmentsCom: apartmentsComLink(input),
    zillow: zillowLink(input),
  };
}
