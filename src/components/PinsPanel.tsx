import {
  customPins,
  mapActions,
  pinPlacingMode,
  removePin,
  renamePin,
} from "../store";

// User-dropped custom pins: drop one anywhere on the map (for a complex OSM is
// missing, a job site, etc.), rename it, fly to it, or remove it. Persisted to
// localStorage.
export function PinsPanel() {
  const pins = customPins.value; // subscribe
  const placing = pinPlacingMode.value; // subscribe

  return (
    <section class="pins-panel">
      <div class="pins-head">
        <span class="pins-title">📍 My Pins ({pins.length})</span>
        <button
          class={placing ? "pins-add on" : "pins-add"}
          type="button"
          aria-pressed={placing}
          onClick={() => (pinPlacingMode.value = !placing)}
        >
          {placing ? "Click the map…" : "+ Add pin"}
        </button>
      </div>

      {placing ? (
        <div class="pins-hint">Click anywhere on the map to drop a pin (Esc cancels).</div>
      ) : null}

      {pins.length > 0 ? (
        <div class="pins-list">
          {pins.map((p) => (
            <div class="pin-row" key={p.id}>
              <input
                class="pin-name"
                value={p.name}
                aria-label="Pin name"
                maxLength={60}
                onChange={(e) => renamePin(p.id, e.currentTarget.value)}
              />
              <button
                class="pin-go"
                type="button"
                title="Zoom to this pin"
                aria-label={`Zoom to ${p.name}`}
                onClick={() => mapActions.value?.flyTo(p.lng, p.lat, 16)}
              >
                ⤢
              </button>
              <button
                class="pin-del"
                type="button"
                title="Remove pin"
                aria-label={`Remove ${p.name}`}
                onClick={() => removePin(p.id)}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      ) : !placing ? (
        <div class="pins-hint">No pins yet — add one to mark any spot.</div>
      ) : null}
      <style>{styles}</style>
    </section>
  );
}

const styles = `
.pins-panel { border-bottom: 1px solid var(--border); background: var(--pin-soft); }
.pins-head {
  display: flex; align-items: center; gap: 8px;
  padding: 9px 12px 6px;
}
.pins-title { flex: 1 1 auto; font-size: 13px; font-weight: 700; color: var(--pin); }
.pins-add {
  flex: 0 0 auto; padding: 3px 10px; font-size: 11px; font-weight: 600;
  color: var(--pin); background: var(--pin-chip); border: 1px solid var(--pin-line); border-radius: 999px;
}
.pins-add.on { color: #fff; background: var(--pin-strong); border-color: var(--pin-strong); }
.pins-hint { padding: 0 12px 8px; font-size: 11.5px; color: var(--muted); line-height: 1.4; }
.pins-list { padding: 0 0 6px; }
.pin-row {
  display: flex; align-items: center; gap: 6px;
  padding: 3px 12px;
}
.pin-name {
  flex: 1 1 auto; min-width: 0;
  font-size: 12.5px; color: var(--text);
  background: var(--panel); border: 1px solid var(--border); border-radius: 5px;
  padding: 4px 6px;
}
.pin-name:focus { outline: none; border-color: var(--pin-strong); }
.pin-go, .pin-del {
  flex: 0 0 auto; width: 24px; height: 24px; padding: 0;
  font-size: 12px; line-height: 1;
  background: var(--panel); border: 1px solid var(--border); border-radius: 5px;
  color: var(--muted); cursor: pointer;
}
.pin-go:hover { color: var(--pin); border-color: var(--pin-line); }
.pin-del:hover { color: var(--pin); border-color: var(--pin-line); }
`;
