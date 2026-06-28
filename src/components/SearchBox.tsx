import { searchQuery } from "../store";

// Compact full-width search input bound to the shared `searchQuery` signal.
// Sticky to the top of the sidebar; includes a clear (✕) button.
export function SearchBox() {
  const q = searchQuery.value;
  return (
    <div class="searchbox">
      <input
        class="searchbox-input"
        type="text"
        id="place-search"
        name="place-search"
        aria-label="Search apartments or towns"
        value={q}
        placeholder="Search apartments or towns…"
        onInput={(e) => {
          searchQuery.value = e.currentTarget.value;
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
}
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
`;
