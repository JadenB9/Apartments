# BW Corridor Map 🗺️

A fast, lightweight web app mapping **the Baltimore–Washington corridor** — the
area *between* Baltimore City and Washington, DC (Columbia, Laurel, Jessup,
Odenton, Hanover, Glen Burnie, Bowie, Annapolis, and ~20 more towns).

It plots **every apartment building** as a clickable tile (each links out to
Google Maps, Apartments.com, and Zillow), plus **food, shopping, and
entertainment**, broken down into categories and subcategories you can toggle on
the map. Search finds any town or complex, the list sorts by area, name or
distance to Fort Meade, and bookmarks/custom pins are saved in the browser.
Light and dark themes follow j4den.com's saved choice.

Live at **https://j4den.com/apartments/**.

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

### Publishing to j4den.com

The site serves the app from `/apartments/`, so build with that base path and
copy the output (minus the pre-compressed `.br`/`.gz` copies — Cloudflare
compresses on its own) into the j4den repo:

```bash
bun run build:j4den
rsync -a --delete --exclude '*.br' --exclude '*.gz' dist/ ../j4den/frontend/public/apartments/
```

## Where the data comes from

All places are sourced from **OpenStreetMap** via the **Overpass API** and baked
into `public/data/*.json` at build time:

- `apartments.json` — every `building=apartments` (+ residential/condo) building,
  merged into one point per complex. The Google Maps / Apartments.com / Zillow
  links are built in the browser from `src/data/links.ts`.
- `food.json`, `shopping.json`, `entertainment.json` — named POIs classified
  into subcategories (cuisine types, grocery/mall/clothing, cinema/parks/fitness,
  …). Unnamed ones (mostly sports pitches) are skipped.
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

### Seed data (offline demo only)

`public/data/` holds the real OpenStreetMap dataset. `bun run seed-data`
overwrites it with a **made-up demo set** (real town names, invented
complexes/POIs tagged `seed:"true"`) for working without network — don't
commit or publish that output; run `bun run fetch-data` to restore the real
data.

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

Uses keyless Esri World Imagery (satellite) with Esri road/label overlays. For
maximum speed/offline use,
swap in a self-hosted **Protomaps `.pmtiles`** regional extract (see the comment
at the top of `src/map/MapView.tsx`).

## Notes & limits

- "Every apartment" = every building OpenStreetMap has tagged as apartments in
  the corridor. OSM coverage is good but not 100%; `fetch-data` keeps it current.
- **No live rent prices** — those sources block scraping (ToS). Tiles link out to
  Google Maps / Apartments.com / Zillow where current listings & prices live.
