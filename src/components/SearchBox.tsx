import { useMemo, useState } from "preact/hooks";
import type { Apartment, Town } from "../data/types";
import {
  apartments,
  mapActions,
  searchQuery,
  selectedPlaceId,
  setTownsSelected,
  towns,
} from "../store";

const MAX_TOWNS = 4;
const MAX_APARTMENTS = 8;

type Result =
  | { kind: "town"; key: string; town: Town }
  | { kind: "apt"; key: string; apt: Apartment };

// Matches that start with the query rank ahead of ones that only contain it.
function rank(name: string, q: string): number {
  const n = name.toLowerCase();
  return n.startsWith(q) ? 0 : n.includes(q) ? 1 : -1;
}

// "Apartment Building (Foo Street)" placeholders match by street, but real
// complex names should come first.
const isGeneric = (name: string) => /^apartment building/i.test(name);

// Full-width search bound to the shared `searchQuery` signal. Typing filters
// the apartment list below and opens a dropdown of matching towns and
// complexes across the whole corridor (not just the selected areas); picking
// one turns its area on and flies the map there.
export function SearchBox() {
  const q = searchQuery.value;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const allTowns = towns.value; // subscribe
  const allApts = apartments.value; // subscribe

  const results = useMemo<Result[]>(() => {
    const needle = q.trim().toLowerCase();
    if (needle.length < 2) return [];
    const townHits = allTowns
      .map((t) => ({ t, r: rank(t.name, needle) }))
      .filter((x) => x.r >= 0)
      .sort((a, b) => a.r - b.r || a.t.name.localeCompare(b.t.name))
      .slice(0, MAX_TOWNS)
      .map((x): Result => ({ kind: "town", key: `town:${x.t.name}`, town: x.t }));
    const aptHits = allApts
      .map((a) => {
        const byName = rank(a.name, needle);
        const byAddr = a.address ? rank(a.address, needle) : -1;
        const r = byName >= 0 ? byName : byAddr >= 0 ? 2 : -1;
        return { a, r: r >= 0 && isGeneric(a.name) ? r + 3 : r };
      })
      .filter((x) => x.r >= 0)
      .sort((a, b) => a.r - b.r || a.a.name.localeCompare(b.a.name))
      .slice(0, MAX_APARTMENTS)
      .map((x): Result => ({ kind: "apt", key: x.a.id, apt: x.a }));
    return [...townHits, ...aptHits];
  }, [q, allTowns, allApts]);

  const showList = open && results.length > 0;
  const noMatches = open && q.trim().length >= 2 && results.length === 0;

  const pick = (r: Result) => {
    setOpen(false);
    if (r.kind === "town") {
      setTownsSelected([r.town.name], true);
      mapActions.value?.flyTo(r.town.lng, r.town.lat, 13);
    } else {
      // Its town has to be on for the dot to show on the map.
      if (r.apt.town) setTownsSelected([r.apt.town], true);
      selectedPlaceId.value = r.apt.id;
      mapActions.value?.openPopup(r.apt.id);
    }
  };

  return (
    <div class="searchbox">
      <input
        class="searchbox-input"
        type="search"
        id="place-search"
        name="place-search"
        autocomplete="off"
        role="combobox"
        aria-label="Search apartments or towns"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls="search-results"
        aria-activedescendant={showList ? `search-opt-${active}` : undefined}
        value={q}
        placeholder="Search apartments or towns…"
        onInput={(e) => {
          searchQuery.value = e.currentTarget.value;
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && results.length) {
            e.preventDefault();
            setOpen(true);
            setActive((i) => (i + 1) % results.length);
          } else if (e.key === "ArrowUp" && results.length) {
            e.preventDefault();
            setActive((i) => (i - 1 + results.length) % results.length);
          } else if (e.key === "Enter" && showList) {
            e.preventDefault();
            pick(results[Math.min(active, results.length - 1)]);
          } else if (e.key === "Escape") {
            if (showList) setOpen(false);
            else searchQuery.value = "";
          }
        }}
      />
      {q ? (
        <button
          class="searchbox-clear"
          type="button"
          aria-label="Clear search"
          title="Clear search"
          onClick={() => {
            searchQuery.value = "";
          }}
        >
          ✕
        </button>
      ) : null}
      {showList ? (
        <ul class="search-results" id="search-results" role="listbox" aria-label="Search results">
          {results.map((r, i) => (
            <li
              key={r.key}
              id={`search-opt-${i}`}
              role="option"
              aria-selected={i === active}
              class={i === active ? "search-opt active" : "search-opt"}
              // mousedown, not click: the input's blur would close the list first.
              onMouseDown={(e) => {
                e.preventDefault();
                pick(r);
              }}
              onMouseEnter={() => setActive(i)}
            >
              {r.kind === "town" ? (
                <>
                  <span class="search-kind">Town</span>
                  <span class="search-name">{r.town.name}</span>
                  <span class="search-meta">{r.town.county ?? ""}</span>
                </>
              ) : (
                <>
                  <span class="search-kind apt">Apt</span>
                  <span class="search-name">{r.apt.name}</span>
                  <span class="search-meta">{r.apt.town ?? ""}</span>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : noMatches ? (
        <div class="search-results search-none" role="status">
          No towns or apartments match.
        </div>
      ) : null}
      <style>{styles}</style>
    </div>
  );
}

const styles = `
.searchbox {
  position: sticky;
  top: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px;
  background: var(--panel);
  border-bottom: 1px solid var(--border);
}
.searchbox-input {
  flex: 1 1 auto;
  width: 100%;
  min-width: 0;
  padding: 8px 10px;
  font-size: 13px;
  color: var(--text);
  background: var(--panel-2);
  border: 1px solid var(--border);
  border-radius: 6px;
  outline: none;
  -webkit-appearance: none;
  appearance: none;
}
.searchbox-input::-webkit-search-cancel-button { display: none; }
.searchbox-input::placeholder { color: var(--muted); }
.searchbox-input:focus { border-color: var(--accent); }
.searchbox-clear {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  font-size: 12px;
  line-height: 1;
  color: var(--muted);
  background: var(--panel-2);
  border: 1px solid var(--border);
  border-radius: 6px;
}
.searchbox-clear:hover { color: var(--text); border-color: var(--accent); }
.search-results {
  position: absolute;
  top: calc(100% - 4px);
  left: 10px;
  right: 10px;
  margin: 0;
  padding: 4px 0;
  list-style: none;
  max-height: 320px;
  overflow-y: auto;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 8px 24px var(--shadow);
}
.search-none { padding: 10px 12px; font-size: 12px; color: var(--muted); }
.search-opt {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  font-size: 12.5px;
  cursor: pointer;
}
.search-opt.active { background: var(--panel-2); }
.search-kind {
  flex: 0 0 auto;
  min-width: 34px;
  padding: 1px 5px;
  font-size: 10px;
  text-align: center;
  color: var(--accent);
  background: var(--accent-soft);
  border-radius: 4px;
}
.search-kind.apt { color: var(--apartments); background: var(--panel-2); }
.search-name {
  flex: 1 1 auto;
  min-width: 0;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.search-meta {
  flex: 0 0 auto;
  max-width: 40%;
  font-size: 11px;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
`;
