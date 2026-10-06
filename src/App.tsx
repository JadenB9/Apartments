import { MapView } from "./map/MapView";
import { SearchBox } from "./components/SearchBox";
import { AreaPanel } from "./components/AreaPanel";
import { BookmarksPanel } from "./components/BookmarksPanel";
import { PinsPanel } from "./components/PinsPanel";
import { NearbyPanel } from "./components/NearbyPanel";
import { Sidebar } from "./components/Sidebar";
import { ApartmentTiles } from "./components/ApartmentTiles";
import { theme, toggleTheme } from "./store";

export function App() {
  const dark = theme.value === "dark"; // subscribe

  return (
    <>
      <aside class="panel-col">
        <header class="app-head">
          <div class="app-head-row">
            <h1>BW&nbsp;Corridor</h1>
            <button
              class="theme-btn"
              type="button"
              onClick={toggleTheme}
              aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
              title={dark ? "Light theme" : "Dark theme"}
            >
              {dark ? "☀" : "☾"}
            </button>
          </div>
          <p>Apartments, food, shopping &amp; entertainment between Baltimore and DC.</p>
        </header>
        <SearchBox />
        <div class="panel-scroll">
          <NearbyPanel />
          <PinsPanel />
          <BookmarksPanel />
          <AreaPanel />
          <Sidebar />
          <ApartmentTiles />
        </div>
      </aside>
      <main class="map-col">
        <MapView />
      </main>
      <style>{css}</style>
    </>
  );
}

const css = `
.panel-col {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--panel);
  border-right: 1px solid var(--border);
  min-height: 0;
}
.app-head {
  padding: 18px 18px 14px;
  border-bottom: 1px solid var(--border);
  background:
    linear-gradient(180deg, var(--head-sheen), transparent 60%),
    var(--panel);
}
.app-head h1 {
  margin: 0;
  font-family: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
  font-size: 23px;
  font-weight: 600;
  letter-spacing: .2px;
  color: var(--text);
  display: inline-block;
  border-bottom: 2px solid var(--accent);
  padding-bottom: 3px;
}
.app-head p {
  margin: 9px 0 0;
  font-size: 12px;
  color: var(--muted);
  line-height: 1.45;
  max-width: 30ch;
}
.app-head-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
.theme-btn {
  flex: 0 0 auto;
  width: 30px; height: 30px; padding: 0;
  font-size: 15px; line-height: 1;
  color: var(--muted); background: var(--panel-2);
  border: 1px solid var(--border); border-radius: 999px;
}
.theme-btn:hover { color: var(--text); border-color: var(--accent); }
/* Bottom padding keeps the last tile clear of j4den's back chip. */
.panel-scroll { flex: 1; overflow-y: auto; min-height: 0; padding-bottom: 52px; }
.map-col { position: relative; height: 100%; min-width: 0; }
.map-col > * { position: absolute; inset: 0; }

@media (max-width: 760px) {
  #app { grid-template-rows: 45vh 55vh; grid-template-rows: 45dvh 55dvh; grid-template-columns: 1fr; }
  .app-head { padding: 10px 14px 8px; }
  .app-head h1 { font-size: 19px; }
  .app-head p { display: none; }
  .panel-col { order: 2; border-right: none; border-top: 1px solid var(--border); }
  .map-col { order: 1; }
}
`;
