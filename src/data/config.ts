// Geographic + map configuration for the Baltimore–Washington corridor.
// Excludes Baltimore City and DC proper; covers the wider corridor region.

// Bounding box: [south, west, north, east]
export const BBOX = {
  south: 38.93,
  west: -76.97,
  north: 39.29,
  east: -76.45,
} as const;

// MapLibre uses [west, south, east, north]
export const MAP_BOUNDS: [number, number, number, number] = [
  BBOX.west,
  BBOX.south,
  BBOX.east,
  BBOX.north,
];

export const MAP_CENTER: [number, number] = [
  (BBOX.west + BBOX.east) / 2,
  (BBOX.south + BBOX.north) / 2,
];

export const INITIAL_ZOOM = 10.5;
