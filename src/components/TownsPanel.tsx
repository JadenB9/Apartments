import { useState } from "preact/hooks";
import {
  apartmentsPerTown,
  coreStatus,
  mapActions,
  matchesSearch,
  searchQuery,
  towns,
} from "../store";
import { ChevronIcon } from "./icons";

// Collapsible, alphabetically-sorted list of towns, narrowed by the shared
// search query. Clicking a row flies the map to that town.
export function TownsPanel() {
  const [open, setOpen] = useState(true);
  const q = searchQuery.value.trim();
  const loading = coreStatus.value === "loading" || coreStatus.value === "idle";

  const list = towns.value
    .filter((t) => matchesSearch(t.name, undefined, q))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <section>
      <button
        class="section-head"
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span class={open ? "chev open" : "chev"}>
          <ChevronIcon />
        </span>
        <span style={{ flex: 1 }}>Towns</span>
        <span class="chip">{loading ? "…" : list.length}</span>
      </button>
      {open ? (
        <div class="towns-list">
          {loading ? (
            <div class="state-note">Loading towns…</div>
          ) : list.length === 0 ? (
            <div class="state-note">No towns match “{q}”.</div>
          ) : (
            list.map((t) => {
              const aptCount = apartmentsPerTown.value.get(t.name) ?? 0;
              return (
                <button
                  class="town-row"
                  type="button"
                  key={`${t.name}:${t.lat}:${t.lng}`}
                  title={`${t.name} — ${aptCount} apartment${aptCount === 1 ? "" : "s"}`}
                  onClick={() => mapActions.value?.flyTo(t.lng, t.lat, 13)}
                >
                  <span class="town-name">{t.name}</span>
                  <span class="town-type">{t.placeType}</span>
                  {aptCount > 0 ? <span class="chip">{aptCount}</span> : null}
                </button>
              );
            })
          )}
        </div>
      ) : null}
    </section>
  );
}
