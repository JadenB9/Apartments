import { useState } from "preact/hooks";
import { CATEGORIES } from "../data/taxonomy";
import { loadCategory } from "../data/loader";
import type { CategoryId } from "../data/types";
import {
  activeFilters,
  categoriesMeta,
  isSubActive,
  toggleCategory,
  toggleSub,
} from "../store";

// Category tree for the amenity layers (food / shopping / entertainment).
// Apartments are handled separately by the area picker, so they're excluded
// here. Each category is a collapsible section with a master checkbox, a count
// badge, a color swatch, and per-subcategory rows. Toggling ON lazy-loads data.
const AMENITY_CATEGORIES = CATEGORIES.filter((c) => c.id !== "apartments");

export function Sidebar() {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Read these signals so the component re-renders on filter/meta changes.
  const counts = categoriesMeta.value?.counts ?? {};
  const filters = activeFilters.value; // subscribe to filter changes

  return (
    <div class="sidebar-tree">
      <div class="sidebar-heading">Amenities near apartments</div>
      {AMENITY_CATEGORIES.map((cat) => {
        const isOpen = !!expanded[cat.id];
        const subKeys = cat.subcategories.map((s) => `${cat.id}:${s.id}`);
        const activeCount = subKeys.filter((k) => filters.has(k)).length;
        const allActive = activeCount === subKeys.length && subKeys.length > 0;
        const someActive = activeCount > 0 && !allActive;
        const catCount = counts[cat.id];

        const onMasterToggle = () => {
          const turningOn = !allActive;
          toggleCategory(cat.id, turningOn);
          if (turningOn && cat.id !== "apartments") {
            void loadCategory(cat.id as CategoryId);
          }
        };

        return (
          <section class="cat" key={cat.id}>
            <div class="cat-header">
              <button
                class="cat-chevron"
                type="button"
                aria-label={isOpen ? "Collapse" : "Expand"}
                onClick={() =>
                  setExpanded((e) => ({ ...e, [cat.id]: !e[cat.id] }))
                }
              >
                <span class={isOpen ? "chev open" : "chev"}>▸</span>
              </button>
              <span class="swatch" style={{ background: cat.color }} />
              <button
                class="cat-label"
                type="button"
                onClick={() =>
                  setExpanded((e) => ({ ...e, [cat.id]: !e[cat.id] }))
                }
              >
                {cat.label}
              </button>
              {catCount != null ? (
                <span class="chip">{catCount}</span>
              ) : null}
              <input
                class={someActive ? "cat-check partial" : "cat-check"}
                type="checkbox"
                checked={allActive}
                ref={(el) => {
                  if (el) (el as HTMLInputElement).indeterminate = someActive;
                }}
                onChange={onMasterToggle}
                aria-label={`Toggle all ${cat.label}`}
              />
            </div>

            {isOpen ? (
              <div class="cat-body">
                {cat.subcategories.map((sub) => {
                  const active = isSubActive(cat.id, sub.id);
                  const subCount = counts[`${cat.id}:${sub.id}`];
                  return (
                    <label class="sub-row" key={sub.id}>
                      <input
                        type="checkbox"
                        checked={active}
                        onChange={() => {
                          toggleSub(cat.id, sub.id);
                          // toggleSub flips state; if it just turned ON, load data.
                          if (
                            !active &&
                            cat.id !== "apartments"
                          ) {
                            void loadCategory(cat.id as CategoryId);
                          }
                        }}
                      />
                      <span class="sub-label">{sub.label}</span>
                      <span class="chip chip-sm">{subCount ?? 0}</span>
                    </label>
                  );
                })}
              </div>
            ) : null}
          </section>
        );
      })}
      <style>{styles}</style>
    </div>
  );
}

const styles = `
.sidebar-tree {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 0 0 6px;
}
.sidebar-heading {
  padding: 10px 12px 6px;
  font-size: 13px;
  font-weight: 700;
  color: var(--text);
}
.cat { border-bottom: 1px solid var(--border); }
.cat-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
}
.cat-header:hover { background: var(--panel-2); }
.cat-chevron {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  background: transparent;
  border: none;
  color: var(--muted);
}
.chev {
  display: inline-block;
  font-size: 11px;
  transition: transform 0.12s ease;
}
.chev.open { transform: rotate(90deg); }
.swatch {
  flex: 0 0 auto;
  width: 12px;
  height: 12px;
  border-radius: 3px;
}
.cat-label {
  flex: 1 1 auto;
  text-align: left;
  padding: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  background: transparent;
  border: none;
}
.chip {
  flex: 0 0 auto;
  min-width: 22px;
  padding: 1px 6px;
  font-size: 11px;
  text-align: center;
  color: var(--muted);
  background: var(--panel-2);
  border: 1px solid var(--border);
  border-radius: 999px;
}
.chip-sm { min-width: 18px; font-size: 10px; padding: 0 5px; }
.cat-check { flex: 0 0 auto; accent-color: var(--accent); cursor: pointer; }
.cat-body { padding: 2px 0 6px 0; }
.sub-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 10px 5px 34px;
  cursor: pointer;
}
.sub-row:hover { background: var(--panel-2); }
.sub-row input { accent-color: var(--accent); cursor: pointer; }
.sub-label {
  flex: 1 1 auto;
  font-size: 12.5px;
  color: var(--text);
}
`;
