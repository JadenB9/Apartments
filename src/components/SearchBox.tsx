import { useEffect, useRef, useState } from "preact/hooks";
import { searchQuery } from "../store";
import { SearchIcon } from "./icons";

// Search input, debounced into the shared `searchQuery` signal so each
// keystroke doesn't recompute the tile list and map sources.
export function SearchBox() {
  const [local, setLocal] = useState(searchQuery.value);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  // Keep the input in sync if the query is cleared elsewhere.
  useEffect(() => {
    const q = searchQuery.value;
    if (q !== local && q === "") setLocal("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery.value]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const commit = (value: string, immediate = false) => {
    setLocal(value);
    clearTimeout(timer.current);
    if (immediate) {
      searchQuery.value = value;
    } else {
      timer.current = setTimeout(() => {
        searchQuery.value = value;
      }, 150);
    }
  };

  return (
    <div class="searchbox">
      <div class="searchbox-inner">
        <SearchIcon class="searchbox-icon" />
        <input
          class="searchbox-input"
          type="text"
          value={local}
          placeholder="Search apartments, places, towns…"
          aria-label="Search apartments, places, and towns"
          onInput={(e) => commit(e.currentTarget.value)}
        />
        {local ? (
          <button
            class="searchbox-clear"
            type="button"
            aria-label="Clear search"
            title="Clear search"
            onClick={() => commit("", true)}
          >
            ✕
          </button>
        ) : null}
      </div>
    </div>
  );
}
