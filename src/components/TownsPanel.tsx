import { useMemo, useState } from "preact/hooks";
import { mapActions, towns } from "../store";

// Collapsible, alphabetically-sorted list of towns. Clicking a row flies the
// map to that town.
export function TownsPanel() {
  const [open, setOpen] = useState(true);
  const list = towns.value;

  const sorted = useMemo(
    () => [...list].sort((a, b) => a.name.localeCompare(b.name)),
    [list],
  );

  return (
    <section class="towns">
      <button
        class="towns-header"
        type="button"
        onClick={() => setOpen((o) => !o)}
      >
        <span class={open ? "chev open" : "chev"}>▸</span>
        <span class="towns-title">Towns ({sorted.length})</span>
      </button>
      {open ? (
        <div class="towns-list">
          {sorted.map((t) => (
            <button
              class="town-row"
              type="button"
              key={`${t.name}:${t.lat}:${t.lng}`}
              onClick={() => mapActions.value?.flyTo(t.lng, t.lat, 13)}
            >
              <span class="town-name">{t.name}</span>
              <span class="town-type">{t.placeType}</span>
            </button>
          ))}
        </div>
      ) : null}
      <style>{styles}</style>
    </section>
  );
}

const styles = `
.towns { border-top: 1px solid var(--border); }
.towns-header {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 9px 10px;
  text-align: left;
  background: var(--panel);
  border: none;
  color: var(--text);
}
.towns-header:hover { background: var(--panel-2); }
.towns-header .chev {
  display: inline-block;
  font-size: 11px;
  color: var(--muted);
  transition: transform 0.12s ease;
}
.towns-header .chev.open { transform: rotate(90deg); }
.towns-title { font-size: 13px; font-weight: 600; }
.towns-list {
  max-height: 240px;
  overflow-y: auto;
  padding: 2px 0 6px 0;
}
.town-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  width: 100%;
  padding: 6px 12px;
  text-align: left;
  background: transparent;
  border: none;
  color: var(--text);
}
.town-row:hover { background: var(--panel-2); }
.town-name { flex: 1 1 auto; font-size: 12.5px; }
.town-type {
  flex: 0 0 auto;
  font-size: 11px;
  color: var(--muted);
  text-transform: capitalize;
}
`;
