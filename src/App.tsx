import { useEffect } from "preact/hooks";
import { MapView } from "./map/MapView";
import { SearchBox } from "./components/SearchBox";
import { AreaPanel } from "./components/AreaPanel";
import { BookmarksPanel } from "./components/BookmarksPanel";
import { PinsPanel } from "./components/PinsPanel";
import { NearbyPanel } from "./components/NearbyPanel";
import { Sidebar } from "./components/Sidebar";
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
    linear-gradient(180deg, rgba(255,255,255,0.5), rgba(255,255,255,0) 60%),
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
.panel-scroll { flex: 1; overflow-y: auto; min-height: 0; }
.map-col { position: relative; height: 100%; min-width: 0; }
.map-col > * { position: absolute; inset: 0; }

@media (max-width: 760px) {
  #app { grid-template-rows: 45vh 55vh; grid-template-columns: 1fr; }
  .panel-col { order: 2; border-right: none; border-top: 1px solid var(--border); }
  .map-col { order: 1; }
}
`;
