import { useMemo, useState } from "preact/hooks";
import {
  clearNearby,
  mapActions,
  nearbyFocus,
  nearbyPlaces,
  selectedPlaceId,
} from "../store";
import { CATEGORY_BY_ID, subcategoryLabel } from "../data/taxonomy";
import type { CategoryId } from "../data/types";

const CAT_OPTIONS: CategoryId[] = ["food", "shopping", "entertainment"];
const CAT_SHORT: Record<string, string> = {
  food: "Food",
  shopping: "Shopping",
  entertainment: "Fun",
};

// Shown only while a nearby focus is active. Lets you narrow the amenities by
// category then subcategory, and click any result to fly to + open it — instead
// of scrolling a map full of dots.
export function NearbyPanel() {
  const focus = nearbyFocus.value; // subscribe
  const all = nearbyPlaces.value; // subscribe
  const [cat, setCat] = useState<CategoryId | "all">("all");
  const [sub, setSub] = useState<string>("all");

  // Subcategories present in the current radius for the chosen category.
  const subOptions = useMemo(() => {
    if (cat === "all") return [];
    const present = new Set(all.filter((p) => p.category === cat).map((p) => p.subcategory));
    return CATEGORY_BY_ID[cat].subcategories.filter((s) => present.has(s.id));
  }, [cat, all]);

  const list = useMemo(() => {
    return all.filter(
      (p) => (cat === "all" || p.category === cat) && (sub === "all" || p.subcategory === sub),
    );
  }, [all, cat, sub]);

  if (!focus) return null;

  const catCount = (c: CategoryId) => all.filter((p) => p.category === c).length;

  return (
    <section class="nb-panel">
      <div class="nb-head">
        <span class="nb-title">Near {focus.name}</span>
        <button class="nb-clear" type="button" onClick={clearNearby}>
          ✕ clear
        </button>
      </div>

      <div class="nb-cats">
        <button
          class={cat === "all" ? "nb-cat on" : "nb-cat"}
          type="button"
          aria-pressed={cat === "all"}
          onClick={() => {
            setCat("all");
            setSub("all");
          }}
        >
          All ({all.length})
        </button>
        {CAT_OPTIONS.map((c) => (
          <button
            key={c}
            class={cat === c ? "nb-cat on" : "nb-cat"}
            type="button"
            aria-pressed={cat === c}
            style={cat === c ? { borderColor: CATEGORY_BY_ID[c].color } : undefined}
            onClick={() => {
              setCat(c);
              setSub("all");
            }}
          >
            <span class="nb-swatch" style={{ background: CATEGORY_BY_ID[c].color }} />
            {CAT_SHORT[c]} ({catCount(c)})
          </button>
        ))}
      </div>

      {cat !== "all" && subOptions.length > 0 ? (
        <div class="nb-sub-row">
          <select
            class="nb-sub"
            value={sub}
            aria-label={`Filter ${CAT_SHORT[cat]} by type`}
            onChange={(e) => setSub(e.currentTarget.value)}
          >
            <option value="all">All {CAT_SHORT[cat]} types</option>
            {subOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {list.length === 0 ? (
        <div class="nb-empty">Nothing of that type in range. Widen the radius.</div>
      ) : (
        <div class="nb-list">
          {list.slice(0, 200).map((p) => (
            <button
              key={p.id}
              class={selectedPlaceId.value === p.id ? "nb-row sel" : "nb-row"}
              type="button"
              onClick={() => {
                selectedPlaceId.value = p.id;
                mapActions.value?.flyTo(p.lng, p.lat, 16);
                mapActions.value?.openPopup(p.id);
              }}
            >
              <span
                class="nb-dot"
                style={{ background: CATEGORY_BY_ID[p.category].color }}
              />
              <span class="nb-name">{p.name || "Unnamed"}</span>
              <span class="nb-meta">
                {subcategoryLabel(p.category, p.subcategory)} · {p.distanceMi.toFixed(1)} mi
              </span>
            </button>
          ))}
          {list.length > 200 ? (
            <div class="nb-more">+{list.length - 200} more — narrow by type</div>
          ) : null}
        </div>
      )}
      <style>{styles}</style>
    </section>
  );
}

const styles = `
.nb-panel { border-bottom: 1px solid var(--border); background: var(--nearby-soft); }
.nb-head {
  display: flex; align-items: center; gap: 8px;
  padding: 9px 12px 4px;
}
.nb-title { flex: 1 1 auto; font-size: 13px; font-weight: 700; color: var(--nearby); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.nb-clear {
  flex: 0 0 auto; padding: 2px 8px; font-size: 11px;
  color: var(--muted); background: var(--panel); border: 1px solid var(--border); border-radius: 999px;
}
.nb-cats { display: flex; flex-wrap: wrap; gap: 4px; padding: 4px 12px 6px; }
.nb-cat {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 3px 8px; font-size: 11px;
  color: var(--text); background: var(--panel); border: 1px solid var(--border); border-radius: 999px;
}
.nb-cat.on { font-weight: 700; background: var(--panel-2); }
.nb-swatch { width: 8px; height: 8px; border-radius: 50%; }
.nb-sub-row { padding: 0 12px 6px; }
.nb-sub {
  width: 100%; font-size: 12px; padding: 4px 6px;
  color: var(--text); background: var(--panel); border: 1px solid var(--border); border-radius: 6px;
}
.nb-empty { padding: 4px 12px 10px; font-size: 11.5px; color: var(--muted); }
.nb-list { max-height: 260px; overflow-y: auto; padding: 0 0 6px; }
.nb-row {
  display: flex; align-items: center; gap: 7px; width: 100%;
  padding: 5px 12px; text-align: left; background: transparent; border: none; cursor: pointer;
}
.nb-row:hover { background: var(--nearby-hover); }
.nb-row.sel { background: var(--nearby-sel); }
.nb-dot { flex: 0 0 auto; width: 9px; height: 9px; border-radius: 50%; border: 1px solid rgba(0,0,0,0.25); }
.nb-name {
  flex: 1 1 auto; min-width: 0; font-size: 12.5px; color: var(--text);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.nb-meta { flex: 0 0 auto; font-size: 10.5px; color: var(--muted); white-space: nowrap; }
.nb-more { padding: 6px 12px; font-size: 11px; color: var(--muted); }
`;
