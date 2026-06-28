import { useMemo, useState } from "preact/hooks";
import type { Apartment } from "../data/types";
import {
  bookmarks,
  distanceToFortMeadeMi,
  mapActions,
  selectedPlaceId,
  selectedTowns,
  toggleBookmark,
  visibleApartments,
} from "../store";

const MAX_TILES = 300;

type SortKey = "area" | "name";

// Responsive grid of apartment tiles for the selected areas (∩ search ∩
// viewport), with sort + bookmarked-only controls. Clicking a tile selects +
// flies the map.
export function ApartmentTiles() {
  const [sort, setSort] = useState<SortKey>("area");
  const [bookmarkedOnly, setBookmarkedOnly] = useState(false);

  const base = visibleApartments.value; // subscribe
  const bm = bookmarks.value; // subscribe
  const selected = selectedPlaceId.value; // subscribe
  const anyArea = selectedTowns.value.size > 0; // subscribe

  const list = useMemo(() => {
    let arr = bookmarkedOnly ? base.filter((a) => bm.has(a.id)) : base.slice();
    arr.sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : (a.town ?? "").localeCompare(b.town ?? "") || a.name.localeCompare(b.name),
    );
    return arr;
  }, [base, bm, sort, bookmarkedOnly]);

  const total = list.length;
  const shown = total > MAX_TILES ? list.slice(0, MAX_TILES) : list;
  const overflow = total - shown.length;

  return (
    <section class="apt-panel">
      <div class="apt-panel-header">
        <span>Apartments{anyArea ? ` (${total})` : ""}</span>
        {anyArea ? (
          <div class="apt-controls">
            <label class="apt-bm-only">
              <input
                type="checkbox"
                checked={bookmarkedOnly}
                onChange={() => setBookmarkedOnly((v) => !v)}
              />
              ★ only
            </label>
            <select
              class="apt-sort"
              value={sort}
              onChange={(e) => setSort(e.currentTarget.value as SortKey)}
              aria-label="Sort apartments"
            >
              <option value="area">Sort: Area</option>
              <option value="name">Sort: Name</option>
            </select>
          </div>
        ) : null}
      </div>

      {!anyArea ? (
        <div class="apt-empty">Select an area above to list its apartments.</div>
      ) : total === 0 ? (
        <div class="apt-empty">
          {bookmarkedOnly
            ? "No bookmarked apartments in view."
            : "No apartments in view. Zoom out or widen the area."}
        </div>
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
  const marked = bookmarks.value.has(apt.id);

  const cls =
    "apt-tile" + (selected ? " selected" : "") + (marked ? " bookmarked" : "");

  return (
    <div
      class={cls}
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
      <div class="apt-row">
        <div class="apt-name" title={apt.name}>{apt.name || "Unnamed"}</div>
        <button
          class={marked ? "apt-star on" : "apt-star"}
          type="button"
          title={marked ? "Remove bookmark" : "Bookmark this apartment"}
          aria-label={marked ? "Remove bookmark" : "Bookmark this apartment"}
          aria-pressed={marked}
          onClick={(e) => {
            e.stopPropagation();
            toggleBookmark(apt.id);
          }}
        >
          {marked ? "★" : "☆"}
        </button>
      </div>
      {apt.town ? <div class="apt-town">{apt.town}</div> : null}
      <div class="apt-dist">🪖 {distanceToFortMeadeMi(apt.lat, apt.lng).toFixed(1)} mi to Fort Meade</div>
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
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 9px 10px;
  font-size: 13px;
  font-weight: 700;
  color: var(--text);
  background: var(--panel);
}
.apt-controls { display: flex; align-items: center; gap: 8px; font-weight: 400; }
.apt-bm-only {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  color: var(--muted);
  cursor: pointer;
}
.apt-bm-only input { accent-color: var(--bookmark); cursor: pointer; }
.apt-sort {
  font-size: 11px;
  color: var(--text);
  background: var(--panel-2);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 3px 4px;
  cursor: pointer;
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
.apt-tile.bookmarked {
  border-left-color: var(--bookmark);
  background: var(--bookmark-soft);
}
.apt-row {
  display: flex;
  align-items: flex-start;
  gap: 6px;
}
.apt-name {
  flex: 1 1 auto;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.apt-star {
  flex: 0 0 auto;
  padding: 0 2px;
  font-size: 14px;
  line-height: 1;
  color: var(--muted);
  background: transparent;
  border: none;
}
.apt-star:hover { color: var(--bookmark); }
.apt-star.on { color: var(--bookmark); }
.apt-town {
  font-size: 11px;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.apt-dist {
  font-size: 10.5px;
  color: var(--accent);
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
