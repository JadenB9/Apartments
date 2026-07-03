import { useState } from "preact/hooks";
import { CATEGORIES } from "../data/taxonomy";
import { loadCategory } from "../data/loader";
import type { CategoryId, SubcategoryDef } from "../data/types";
import {
  activeFilters,
  categoriesMeta,
  categoryStatus,
  isSubActive,
  toggleCategory,
  toggleSub,
} from "../store";
import { CATEGORY_ICONS, CheckIcon, ChevronIcon, MinusIcon } from "./icons";

// Category tree: collapsible sections with a master checkbox, count badge,
// icon, and per-subcategory rows. Toggling a non-apartments category/sub ON
// kicks off lazy data loading for the map.
export function Sidebar() {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    apartments: true,
  });

  const counts = categoriesMeta.value?.counts ?? {};
  const filters = activeFilters.value;
  const statuses = categoryStatus.value;

  return (
    <div>
      {CATEGORIES.map((cat) => {
        const isOpen = !!expanded[cat.id];
        const subKeys = cat.subcategories.map((s) => `${cat.id}:${s.id}`);
        const activeCount = subKeys.filter((k) => filters.has(k)).length;
        const allActive = activeCount === subKeys.length && subKeys.length > 0;
        const someActive = activeCount > 0 && !allActive;
        const Icon = CATEGORY_ICONS[cat.id];
        const status = statuses[cat.id];

        const flip = () => setExpanded((e) => ({ ...e, [cat.id]: !e[cat.id] }));

        const onMasterToggle = () => {
          const turningOn = !allActive;
          toggleCategory(cat.id, turningOn);
          if (turningOn && cat.id !== "apartments") {
            void loadCategory(cat.id);
          }
        };

        return (
          <section class="cat" key={cat.id}>
            <div class="cat-header">
              <button
                class="cat-chevron"
                type="button"
                aria-label={isOpen ? `Collapse ${cat.label}` : `Expand ${cat.label}`}
                aria-expanded={isOpen}
                onClick={flip}
              >
                <span class={isOpen ? "chev open" : "chev"}>
                  <ChevronIcon />
                </span>
              </button>
              <span class="cat-icon" style={{ background: cat.color }}>
                <Icon />
              </span>
              <button class="cat-label" type="button" onClick={flip}>
                {cat.label}
              </button>
              {counts[cat.id] != null ? <span class="chip">{counts[cat.id]}</span> : null}
              <Checkbox
                catColor={cat.color}
                checked={allActive}
                indeterminate={someActive}
                label={`Toggle all ${cat.label}`}
                onChange={onMasterToggle}
              />
            </div>

            {isOpen ? (
              <div class="cat-body">
                {status === "error" ? (
                  <div class="error-banner" role="alert">
                    Couldn’t load {cat.label} data.
                    <button type="button" onClick={() => void loadCategory(cat.id)}>
                      Retry
                    </button>
                  </div>
                ) : null}
                {status === "loading" ? (
                  <div class="state-note">Loading {cat.label.toLowerCase()}…</div>
                ) : null}
                {cat.subcategories.map((sub) => (
                  <SubRow key={sub.id} catId={cat.id} sub={sub} counts={counts} />
                ))}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

function SubRow({
  catId,
  sub,
  counts,
}: {
  catId: CategoryId;
  sub: SubcategoryDef;
  counts: Record<string, number>;
}) {
  const active = isSubActive(catId, sub.id);
  return (
    <label class="sub-row">
      <Checkbox
        checked={active}
        label={sub.label}
        onChange={() => {
          toggleSub(catId, sub.id);
          // If this just turned the sub ON, make sure the data is loading.
          if (!active && catId !== "apartments") void loadCategory(catId);
        }}
      />
      <span class="sub-label">{sub.label}</span>
      <span class="chip">{counts[`${catId}:${sub.id}`] ?? 0}</span>
    </label>
  );
}

// Custom checkbox: real <input> for a11y, styled box with SVG check/dash marks.
function Checkbox({
  checked,
  indeterminate = false,
  label,
  onChange,
  catColor,
}: {
  checked: boolean;
  indeterminate?: boolean;
  label: string;
  onChange: () => void;
  catColor?: string;
}) {
  return (
    <span
      class={catColor ? "check check-cat" : "check"}
      style={catColor ? { "--cat-color": catColor } : undefined}
    >
      <input
        type="checkbox"
        checked={checked}
        aria-label={label}
        ref={(el) => {
          if (el) el.indeterminate = indeterminate;
        }}
        onChange={onChange}
      />
      <span class="check-box">{indeterminate ? <MinusIcon /> : <CheckIcon />}</span>
    </span>
  );
}
