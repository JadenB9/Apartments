import { useEffect, useRef } from "preact/hooks";
import { categoriesMeta, dismissWelcome, welcomeOpen } from "../store";

// First-visit welcome dialog. Reopenable from the header's About button.
// Carries the attribution and data-provenance info the app is obliged to show.
export function WelcomeOverlay() {
  const open = welcomeOpen.value;
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismissWelcome();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  const isSample = categoriesMeta.value?.source === "sample";

  return (
    <div class="overlay-backdrop" onClick={dismissWelcome}>
      <div
        class="overlay-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="welcome-title" class="overlay-title">
          Welcome to Corridor <span class="wordmark-amp">&amp;</span> Co.
        </h2>
        <p class="overlay-lede">
          A map of everyday life <em>between</em> Baltimore and Washington —
          every apartment building, restaurant, shop, and thing to do across
          Columbia, Laurel, Odenton, Bowie, Annapolis, and two dozen more towns.
        </p>

        <ul class="overlay-points">
          <li>
            <strong>Browse</strong> — toggle categories in the left panel; the
            map, counts, and tiles stay in sync.
          </li>
          <li>
            <strong>Dig in</strong> — click any apartment tile or marker for
            details plus Google&nbsp;Maps, Apartments.com, and Zillow links.
          </li>
          <li>
            <strong>Share</strong> — your view and filters live in the URL;
            copy it to send exactly what you're looking at.
          </li>
        </ul>

        {isSample ? (
          <p class="overlay-note">
            You're currently browsing <strong>sample data</strong>. The real
            OpenStreetMap dataset loads in once the data-refresh workflow runs
            (or via <code>bun run fetch-data</code>).
          </p>
        ) : null}

        <p class="overlay-fineprint">
          Place data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a> (ODbL).
          Basemap by <a href="https://openfreemap.org" target="_blank" rel="noopener noreferrer">OpenFreeMap</a> / © CARTO.
          Listing links open third-party sites; availability and prices live there,
          not here.
        </p>

        <button ref={closeRef} class="overlay-close" type="button" onClick={dismissWelcome}>
          Start exploring
        </button>
      </div>
    </div>
  );
}
