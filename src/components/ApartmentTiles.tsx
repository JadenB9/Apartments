import type { Apartment } from "../data/types";
import { mapActions, selectedPlaceId, visibleApartments } from "../store";

const MAX_TILES = 300;

// Responsive grid of apartment tiles, filtered to the visible viewport + search
// via the `visibleApartments` computed. Clicking a tile selects + flies the map.
export function ApartmentTiles() {
  const all = visibleApartments.value;
  const selected = selectedPlaceId.value;
  const total = all.length;
  const shown = total > MAX_TILES ? all.slice(0, MAX_TILES) : all;
  const overflow = total - shown.length;

  return (
    <section class="apt-panel">
      <div class="apt-panel-header">
        Apartments ({total} visible)
      </div>
      {total === 0 ? (
        <div class="apt-empty">No apartments in view. Zoom out or clear the search.</div>
      ) : (
        <div class="apt-grid">
          {shown.map((apt) => (
            <Tile key={apt.id} apt={apt} selected={selected === apt.id} />
          ))}
        </div>
      )}
      {overflow > 0 ? (
        <div class="apt-more">+{overflow} more — zoom/search to narrow</div>
      ) : null}
      <style>{styles}</style>
    </section>
  );
}

function Tile({ apt, selected }: { apt: Apartment; selected: boolean }) {
  const onOpen = () => {
    selectedPlaceId.value = apt.id;
    mapActions.value?.flyTo(apt.lng, apt.lat, 16);
    mapActions.value?.openPopup(apt.id);
  };

  const links = apt.links;

  return (
    <div
      class={selected ? "apt-tile selected" : "apt-tile"}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <div class="apt-name" title={apt.name}>{apt.name || "Unnamed"}</div>
      {apt.town ? <div class="apt-town">{apt.town}</div> : null}
      <div class="apt-links">
        <LinkBtn href={links?.googleMaps} label="Maps" />
        <LinkBtn href={links?.apartmentsCom} label="Apts" />
        <LinkBtn href={links?.zillow} label="Zillow" />
      </div>
    </div>
  );
}

function LinkBtn({ href, label }: { href?: string; label: string }) {
  if (!href) return <span class="apt-link disabled">{label}</span>;
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

const styles = `
.apt-panel { border-top: 1px solid var(--border); }
.apt-panel-header {
  padding: 9px 10px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  background: var(--panel);
}
.apt-empty {
  padding: 12px 10px;
  font-size: 12px;
  color: var(--muted);
}
.apt-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 8px;
  padding: 4px 10px 10px 10px;
}
.apt-tile {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  background: var(--panel-2);
  border: 1px solid var(--border);
  border-left: 3px solid var(--apartments);
  border-radius: 6px;
  cursor: pointer;
  outline: none;
}
.apt-tile:hover { border-color: var(--accent); }
.apt-tile.selected {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
}
.apt-name {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.apt-town {
  font-size: 11px;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.apt-links {
  display: flex;
  gap: 4px;
  margin-top: 2px;
}
.apt-link {
  flex: 1 1 auto;
  padding: 3px 4px;
  font-size: 10px;
  text-align: center;
  text-decoration: none;
  color: var(--accent);
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 4px;
}
.apt-link:hover { border-color: var(--accent); }
.apt-link.disabled {
  color: var(--muted);
  opacity: 0.5;
  pointer-events: none;
}
.apt-more {
  padding: 8px 10px 12px 10px;
  font-size: 11px;
  color: var(--muted);
}
`;
