# Corridor & Co. 🗺️

A fast, lightweight web app mapping **the Baltimore–Washington corridor** — the
area *between* Baltimore City and Washington, DC (Columbia, Laurel, Jessup,
Odenton, Hanover, Glen Burnie, Bowie, Annapolis, and ~20 more towns).

It plots **every apartment building** as a clickable tile (each links out to
Google Maps, Apartments.com, and Zillow), plus **food, shopping, and
entertainment**, broken into subcategories you can toggle on the map.

## Features

- **Clustered map layers** per category; cluster counts always reflect the
  active filters and search (sources are re-filtered, not just hidden)
- **Category tree** — Apartments (incl. condos), Food → cuisines, Shopping →
  store types, Entertainment → venue types — with live counts
- **Search** narrows the map, the tile grid, and the towns list together
- **Light & dark themes** — follows your system, toggle in the header, persisted
- **Shareable deep links** — the viewport and active filters live in the URL
- **Keyless vector basemap** (OpenFreeMap) with an automatic raster fallback
- **Welcome/About dialog** with data attribution (reopen via the ? button)
- Geolocate ("near me") control, per-town apartment counts, tile sorting
- Loading skeletons, error states with retry, keyboard-accessible controls,
  error boundary

## Quick start

```bash
bun install
bun run dev        # http://localhost:5173
```

Other commands:

```bash
bun run check      # typecheck (app + scripts) and run all tests
bun test           # tests only
bun run build      # production build -> dist/ (static, deploy anywhere)
bun run preview    # serve the production build locally
```

## Data

All places come from **OpenStreetMap** via the **Overpass API**, pre-baked into
`public/data/*.json` — the running app makes **zero external data API calls**:

- `apartments.json` — every apartment/condo building, each with outbound
  `links` (Google Maps / Apartments.com / Zillow)
- `food.json` / `shopping.json` / `entertainment.json` — categorized POIs
- `towns.json` — every town, village, and suburb in the corridor
- `categories.json` — the taxonomy, live counts, generation time, and source

### Automatic refresh (CI)

`.github/workflows/refresh-data.yml` re-fetches the full dataset from Overpass
**every Monday** and commits it if anything changed. GitHub-hosted runners can
reach Overpass even when your dev environment can't.

> Scheduled workflows run from the default branch — the schedule activates once
> this code is merged to `main`. You can also trigger it manually from the
> Actions tab.

### Manual refresh

```bash
bun run fetch-data   # queries Overpass, regenerates public/data/*.json
```

Needs outbound access to `overpass-api.de`. Some sandboxed environments
(including Claude Code on the web with a restrictive network policy) block it
with a `403 host not permitted` — the script fails loudly and writes nothing.
It also refuses to overwrite good data if Overpass returns a suspiciously
small result.

### Sample data

So the app works offline out of the box, a clearly-labeled sample dataset ships
in `public/data/` (`"source": "sample"` — the header shows a notice). Regenerate
it with `bun run seed-data`; any successful `fetch-data` run replaces it with
the real OpenStreetMap dataset.

## Deployment (GitHub Pages)

`.github/workflows/deploy.yml` builds and publishes to GitHub Pages on every
push to `main`.

One-time setup after merging: **Settings → Pages → Source → "GitHub Actions"**.
The site then lives at `https://<user>.github.io/Apartments/`.

## Architecture

| Piece | Role |
| --- | --- |
| `src/data/taxonomy.ts` | Single source of truth: OSM tags → (category, subcategory), labels, colors |
| `src/data/loader.ts` | Loads core data eagerly, other categories lazily; status signals + retry |
| `src/store.ts` | Shared signals: filters, search, selection, viewport, theme, load status |
| `src/urlState.ts` | Hash ↔ store sync for shareable links |
| `src/map/MapView.tsx` | MapLibre map: clustered sources, `setData` filtering, popups, theme-aware basemap |
| `src/components/` | Sidebar tree, apartment tiles, towns, search, icons |
| `src/styles.css` | The whole design system: tokens + light/dark themes |
| `scripts/fetch-data.ts` | Overpass pipeline (Bun) |
| `scripts/seed-data.ts` | Offline sample dataset generator |

Stack: **Bun · Vite · TypeScript · Preact · @preact/signals · MapLibre GL** —
~15 kB gzipped app bundle, code-split MapLibre, brotli/gzip pre-compression,
bundled fonts (Fraunces + Instrument Sans, no external font requests).

## Security

- OSM tag values (websites etc.) are untrusted input: HTML-escaped **and**
  scheme-checked (`safeUrl` — http/https only) before rendering.
- A **Content-Security-Policy** meta tag is injected at build time
  (`vite.config.ts`): scripts/styles/fonts self-only, network limited to the
  two tile hosts, `object-src 'none'`. GitHub Pages can't send response
  headers, so `frame-ancestors` can't be enforced (meta limitation).
- **Dependabot** watches npm + GitHub Actions weekly; **CI** typechecks,
  tests, and builds every push/PR.

## Sharing / SEO

`index.html` ships canonical + Open Graph + Twitter-card meta and JSON-LD.
The share image `public/og.png` is generated from `scripts/og-template.html`
(regeneration instructions in the file header).

## Notes & limits

- "Every apartment" = every building OpenStreetMap has tagged as housing in the
  corridor. Coverage is strong but not literally 100%; the weekly refresh keeps
  it current.
- **No live rent prices** — listing sites prohibit scraping. Tiles link out to
  Google Maps / Apartments.com / Zillow where current listings live.
