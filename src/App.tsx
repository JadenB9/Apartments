import { useEffect } from "preact/hooks";
import { MapView } from "./map/MapView";
import { SearchBox } from "./components/SearchBox";
import { Sidebar } from "./components/Sidebar";
import { TownsPanel } from "./components/TownsPanel";
import { ApartmentTiles } from "./components/ApartmentTiles";

export function App() {
  // Lock mobile address-bar resize jank; nothing else needed — data loads
  // lazily from inside MapView (loadCore) and the panels react via signals.
  useEffect(() => {
    document.title = "BW Corridor Map — Apartments & Places";
  }, []);

  return (
    <>
      <aside class="panel-col">
        <header class="app-head">
          <h1>BW&nbsp;Corridor</h1>
          <p>Apartments, food, shopping &amp; entertainment between Baltimore and DC.</p>
        </header>
        <SearchBox />
        <div class="panel-scroll">
          <Sidebar />
          <TownsPanel />
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
.app-head { padding: 14px 16px 10px; border-bottom: 1px solid var(--border); }
.app-head h1 { margin: 0; font-size: 18px; letter-spacing: .2px; }
.app-head p { margin: 4px 0 0; font-size: 12px; color: var(--muted); line-height: 1.35; }
.panel-scroll { flex: 1; overflow-y: auto; min-height: 0; }
.map-col { position: relative; height: 100%; min-width: 0; }
.map-col > * { position: absolute; inset: 0; }

@media (max-width: 760px) {
  #app { grid-template-rows: 45vh 55vh; grid-template-columns: 1fr; }
  .panel-col { order: 2; border-right: none; border-top: 1px solid var(--border); }
  .map-col { order: 1; }
}
`;
