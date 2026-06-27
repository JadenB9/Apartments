import { useState } from "preact/hooks";
import {
  bookmarkedApartments,
  distanceToFortMeadeMi,
  mapActions,
  selectedPlaceId,
  toggleBookmark,
} from "../store";

// Collapsible list of bookmarked apartments. Independent of the area selection
// so saved places are always reachable; clicking one flies the map there and
// opens its popup. Bookmarked apartments also render as blue dots on the map.
export function BookmarksPanel() {
  const [open, setOpen] = useState(true);
  const list = bookmarkedApartments.value; // subscribe

  if (list.length === 0) return null;

  const sorted = [...list].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <section class="bm-panel">
      <button class="bm-head" type="button" onClick={() => setOpen((o) => !o)}>
        <span class={open ? "chev open" : "chev"}>▸</span>
        <span class="bm-title">★ Bookmarked ({list.length})</span>
      </button>
      {open ? (
        <div class="bm-list">
          {sorted.map((apt) => (
            <div class="bm-row" key={apt.id}>
              <button
                class="bm-name"
                type="button"
                title="Show on map"
                onClick={() => {
                  selectedPlaceId.value = apt.id;
                  mapActions.value?.flyTo(apt.lng, apt.lat, 16);
                  mapActions.value?.openPopup(apt.id);
                }}
              >
                <span class="bm-name-text">{apt.name || "Unnamed"}</span>
                <span class="bm-meta">
                  {apt.town ? `${apt.town} · ` : ""}
                  {distanceToFortMeadeMi(apt.lat, apt.lng).toFixed(1)} mi to Ft. Meade
                </span>
              </button>
              <button
                class="bm-remove"
                type="button"
                title="Remove bookmark"
                aria-label="Remove bookmark"
                onClick={() => toggleBookmark(apt.id)}
              >
                ★
              </button>
            </div>
          ))}
        </div>
      ) : null}
      <style>{styles}</style>
    </section>
  );
}

const styles = `
.bm-panel { border-bottom: 1px solid var(--border); background: var(--bookmark-soft); }
.bm-head {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 9px 12px;
  text-align: left;
  background: transparent;
  border: none;
  color: var(--text);
}
.bm-head .chev { font-size: 11px; color: var(--bookmark); transition: transform .12s ease; }
.bm-head .chev.open { transform: rotate(90deg); }
.bm-title { font-size: 13px; font-weight: 700; color: var(--bookmark); }
.bm-list { padding: 0 0 6px; }
.bm-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
}
.bm-row:hover { background: #dcebfb; }
.bm-name {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
  text-align: left;
  padding: 0;
  background: transparent;
  border: none;
  cursor: pointer;
}
.bm-name-text {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.bm-meta {
  font-size: 10.5px;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.bm-remove {
  flex: 0 0 auto;
  padding: 0 4px;
  font-size: 14px;
  line-height: 1;
  color: var(--bookmark);
  background: transparent;
  border: none;
  cursor: pointer;
}
`;
