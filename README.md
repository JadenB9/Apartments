# BW Corridor Map 🗺️

A fast, lightweight web app mapping **the Baltimore–Washington corridor** — the
area *between* Baltimore City and Washington, DC (Columbia, Laurel, Jessup,
Odenton, Hanover, Glen Burnie, Bowie, Annapolis, and ~20 more towns).

It plots **every apartment building** as a clickable tile (each links out to
Google Maps, Apartments.com, and Zillow), plus **food, shopping, and
entertainment**, broken down into categories and subcategories you can toggle on
the map.

## Stack (built for speed)

- **Bun** + **Vite** + **TypeScript** + **Preact** (~15 kB gzipped app bundle)
- **MapLibre GL JS** with native marker **clustering** (handles thousands of points)
- **@preact/signals** for zero-boilerplate shared state
- **Pre-baked static JSON** — the running app makes **zero external data API
  calls**, so it loads instantly. Assets are pre-compressed (gzip + brotli).

## Quick start

```bash
bun install
bun run dev        # http://localhost:5173
```

Production build:

```bash
bun run build      # -> dist/ (static, deploy anywhere)
bun run preview
```

## Where the data comes from

All places are sourced from **OpenStreetMap** via the **Overpass API** and baked
into `public/data/*.json` at build time:

- `apartments.json` — every `building=apartments` (+ residential/condo) building,
  each with `links` to Google Maps / Apartments.com / Zillow.
- `food.json`, `shopping.json`, `entertainment.json` — POIs classified into
  subcategories (cuisine types, grocery/mall/clothing, cinema/parks/fitness, …).
- `towns.json` — every town/village/suburb in the corridor.
- `categories.json` — the taxonomy + live counts.

### Refresh the full dataset

```bash
bun run fetch-data   # queries Overpass, regenerates public/data/*.json
```

> ⚠️ **`fetch-data` needs outbound access to `overpass-api.de`.** Some sandboxed
> environments (including Claude Code on the web with a restrictive network
> policy) **block Overpass by egress policy**, so the fetch fails there with a
> `403 host not permitted`. Run it on a machine/network where Overpass is
> reachable, or relax the environment's network policy. See
> https://code.claude.com/docs/en/claude-code-on-the-web for network policies.

### Seed data (works offline)

So the app is usable without network, a **demonstrative seed dataset** ships in
`public/data/` (real corridor towns + plausibly-named complexes/POIs at
approximate coordinates, tagged `seed:"true"`). Regenerate it with:

```bash
bun run seed-data
```

Running `bun run fetch-data` **replaces** the seed with the full, authoritative
OpenStreetMap dataset.

## How it works

- `src/data/taxonomy.ts` — single source of truth mapping OSM tags →
  (category, subcategory). Used by both the data pipeline and the UI.
- `src/data/loader.ts` — loads apartments/towns/counts eagerly; lazy-loads
  food/shopping/entertainment GeoJSON the first time their layer is enabled.
- `src/store.ts` — signals shared by the map and the panels (filters, search,
  selection, viewport, map actions).
- `src/map/MapView.tsx` — MapLibre map, clustered layers, apartment popups.
- `src/components/` — `SearchBox`, `Sidebar` (category tree), `TownsPanel`,
  `ApartmentTiles`.

### Basemap

Uses keyless CARTO dark raster tiles by default. For maximum speed/offline use,
swap in a self-hosted **Protomaps `.pmtiles`** regional extract (see the comment
at the top of `src/map/MapView.tsx`).

## Notes & limits

- "Every apartment" = every building OpenStreetMap has tagged as apartments in
  the corridor. OSM coverage is good but not 100%; `fetch-data` keeps it current.
- **No live rent prices** — those sources block scraping (ToS). Tiles link out to
  Google Maps / Apartments.com / Zillow where current listings & prices live.
