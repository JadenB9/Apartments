import { useState } from "preact/hooks";
import {
  apartmentCountByTown,
  clearSelectedTowns,
  isTownSelected,
  mapActions,
  selectedTowns,
  setCountySelected,
  toggleTown,
  townsByCounty,
} from "../store";

// Apartment area drill-down: County → Town. Starts with nothing selected; the
// map only shows apartments for the selected towns. Selecting a county toggles
// all of its towns; clicking a town name flies the map there.
export function AreaPanel() {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const byCounty = townsByCounty.value; // subscribe
  const counts = apartmentCountByTown.value; // subscribe
  const selected = selectedTowns.value; // subscribe

  // Only surface counties/towns that actually have apartments.
  const counties = [...byCounty.entries()]
    .map(([county, allTowns]) => {
      const towns = allTowns.filter((t) => (counts.get(t.name) ?? 0) > 0);
      const total = towns.reduce((s, t) => s + (counts.get(t.name) ?? 0), 0);
      const selCount = towns.filter((t) => selected.has(t.name)).length;
      return { county, towns, total, selCount };
    })
    .filter((c) => c.towns.length > 0)
    .sort((a, b) => b.total - a.total);

  const toggle = (k: string) =>
    setExpanded((e) => ({ ...e, [k]: !e[k] }));

  return (
    <section class="area">
      <div class="area-head">
        <span class="area-title">Apartments by area</span>
        {selected.size > 0 ? (
          <button class="area-clear" type="button" onClick={clearSelectedTowns}>
            Clear ({selected.size})
          </button>
        ) : null}
      </div>
      {selected.size === 0 ? (
        <div class="area-hint">
          Pick a county or individual towns to place their apartments on the map.
        </div>
      ) : null}

      {counties.map(({ county, towns, total, selCount }) => {
        const open = !!expanded[county];
        const all = selCount === towns.length && towns.length > 0;
        const some = selCount > 0 && !all;
        return (
          <div class="area-county" key={county}>
            <div class="area-county-head">
              <button
                class="area-chev"
                type="button"
                aria-label={open ? "Collapse" : "Expand"}
                onClick={() => toggle(county)}
              >
                <span class={open ? "chev open" : "chev"}>▸</span>
              </button>
              <button class="area-county-label" type="button" onClick={() => toggle(county)}>
                {county}
              </button>
              <span class="chip">{total}</span>
              <input
                type="checkbox"
                class={some ? "area-check partial" : "area-check"}
                checked={all}
                ref={(el) => {
                  if (el) (el as HTMLInputElement).indeterminate = some;
                }}
                onChange={() => setCountySelected(county, !all)}
                aria-label={`Select all apartments in ${county}`}
              />
            </div>

            {open ? (
              <div class="area-towns">
                {towns.map((t) => (
                  <div class="area-town" key={t.name}>
                    <input
                      type="checkbox"
                      checked={isTownSelected(t.name)}
                      onChange={() => toggleTown(t.name)}
                      aria-label={`Show ${t.name} apartments`}
                    />
                    <button
                      class="area-town-name"
                      type="button"
                      title="Zoom to this town"
                      onClick={() => mapActions.value?.flyTo(t.lng, t.lat, 13)}
                    >
                      {t.name}
                    </button>
                    <span class="chip chip-sm">{counts.get(t.name) ?? 0}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
      <style>{styles}</style>
    </section>
  );
}

const styles = `
.area { border-bottom: 1px solid var(--border); }
.area-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px 6px;
}
.area-title { flex: 1 1 auto; font-size: 13px; font-weight: 700; color: var(--text); }
.area-clear {
  flex: 0 0 auto;
  padding: 2px 8px;
  font-size: 11px;
  color: var(--accent);
  background: var(--accent-soft);
  border: 1px solid var(--border);
  border-radius: 999px;
}
.area-hint {
  padding: 0 12px 10px;
  font-size: 11.5px;
  color: var(--muted);
  line-height: 1.4;
}
.area-county { border-top: 1px solid var(--border); }
.area-county-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 12px;
}
.area-county-head:hover { background: var(--panel-2); }
.area-chev {
  flex: 0 0 auto;
  display: flex; align-items: center; justify-content: center;
  width: 16px; height: 16px; padding: 0;
  background: transparent; border: none; color: var(--muted);
}
.area-county-head .chev { display: inline-block; font-size: 11px; transition: transform .12s ease; }
.area-county-head .chev.open { transform: rotate(90deg); }
.area-county-label {
  flex: 1 1 auto;
  text-align: left;
  padding: 0;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text);
  background: transparent;
  border: none;
}
.area-check { flex: 0 0 auto; accent-color: var(--accent); cursor: pointer; }
.chip {
  flex: 0 0 auto;
  min-width: 22px; padding: 1px 6px;
  font-size: 11px; text-align: center;
  color: var(--muted); background: var(--panel-2);
  border: 1px solid var(--border); border-radius: 999px;
}
.chip-sm { min-width: 18px; font-size: 10px; padding: 0 5px; }
.area-towns { padding: 2px 0 6px 0; }
.area-town {
  display: flex; align-items: center; gap: 8px;
  padding: 4px 12px 4px 34px;
}
.area-town:hover { background: var(--panel-2); }
.area-town input { accent-color: var(--accent); cursor: pointer; }
.area-town-name {
  flex: 1 1 auto;
  text-align: left;
  padding: 0;
  font-size: 12px;
  color: var(--text);
  background: transparent;
  border: none;
  cursor: pointer;
}
.area-town-name:hover { color: var(--accent); text-decoration: underline; }
`;
