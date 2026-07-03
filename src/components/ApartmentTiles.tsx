import type { Apartment } from "../data/types";
import { retryCore } from "../data/loader";
import {
  coreStatus,
  mapActions,
  selectedPlaceId,
  visibleApartments,
} from "../store";

const MAX_TILES = 300;

// Grid of apartment tiles, narrowed by search + subcategory filters + the map
// viewport (via the `visibleApartments` computed). Clicking a tile selects it
// and flies the map there. Distinct loading / error / empty states.
export function ApartmentTiles() {
  const status = coreStatus.value;
  const all = visibleApartments.value;
  const selected = selectedPlaceId.value;
  const shown = all.length > MAX_TILES ? all.slice(0, MAX_TILES) : all;
  const overflow = all.length - shown.length;

  return (
    <section>
      <div class="section-head">
        <span style={{ flex: 1 }}>Apartments in view</span>
        <span class="chip">{status === "ready" ? all.length : "…"}</span>
      </div>

      {status === "error" ? (
        <div class="error-banner" role="alert">
          Couldn’t load the apartment data.
          <button type="button" onClick={retryCore}>
            Retry
          </button>
        </div>
      ) : status !== "ready" ? (
        <div class="skeleton-grid" aria-hidden="true">
          {Array.from({ length: 8 }, (_, i) => (
            <div class="skeleton" key={i} />
          ))}
        </div>
      ) : all.length === 0 ? (
        <div class="state-note">
          No apartments match here — zoom out, clear the search, or re-enable
          apartment types in the list above.
        </div>
      ) : (
        <>
          <div class="apt-grid">
            {shown.map((apt) => (
              <Tile key={apt.id} apt={apt} selected={selected === apt.id} />
            ))}
          </div>
          {overflow > 0 ? (
            <div class="apt-more">
              +{overflow} more — zoom in or search to narrow the list.
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

function Tile({ apt, selected }: { apt: Apartment; selected: boolean }) {
  const onOpen = () => {
    selectedPlaceId.value = apt.id;
    mapActions.value?.flyTo(apt.lng, apt.lat, 16);
    mapActions.value?.openPopup(apt.id);
  };

  return (
    <div
      class={selected ? "apt-tile selected" : "apt-tile"}
      role="button"
      tabIndex={0}
      aria-label={`Show ${apt.name || "apartment"} on the map`}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <div class="apt-name" title={apt.name}>
        {apt.name || "Unnamed"}
      </div>
      {apt.town ? <div class="apt-town">{apt.town}</div> : null}
      <div class="apt-links">
        <LinkBtn href={apt.links?.googleMaps} label="Maps" />
        <LinkBtn href={apt.links?.apartmentsCom} label="Apts" />
        <LinkBtn href={apt.links?.zillow} label="Zillow" />
      </div>
    </div>
  );
}

function LinkBtn({ href, label }: { href?: string; label: string }) {
  if (!href) return null;
  return (
    <a
      class="apt-link"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
    >
      {label}
    </a>
  );
}
