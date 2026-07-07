import { MapView } from "./map/MapView";
import { SearchBox } from "./components/SearchBox";
import { Sidebar } from "./components/Sidebar";
import { TownsPanel } from "./components/TownsPanel";
import { ApartmentTiles } from "./components/ApartmentTiles";
import { WelcomeOverlay } from "./components/WelcomeOverlay";
import { InfoIcon, MoonIcon, SunIcon } from "./components/icons";
import { categoriesMeta, setTheme, theme, welcomeOpen } from "./store";

export function App() {
  return (
    <>
      <aside class="panel-col">
        <Header />
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
      <WelcomeOverlay />
    </>
  );
}

function Header() {
  const mode = theme.value;
  const meta = categoriesMeta.value;
  const isSample = meta?.source === "sample";

  let stamp: string | null = null;
  if (meta) {
    const when = new Date(meta.generatedAt);
    const date = isNaN(when.getTime())
      ? null
      : when.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    stamp = isSample
      ? "Sample data — run the fetch script for the full OpenStreetMap set"
      : `OpenStreetMap data${date ? ` · updated ${date}` : ""}`;
  }

  return (
    <header class="app-head">
      <div class="app-head-text">
        <h1 class="wordmark">
          Corridor <span class="wordmark-amp">&amp;</span> Co.
        </h1>
        <p class="tagline">
          Apartments, food, shopping &amp; entertainment between Baltimore and
          Washington.
        </p>
        {stamp ? (
          <p class={isSample ? "data-stamp sample" : "data-stamp"}>
            <span class="stamp-dot" />
            {stamp}
          </p>
        ) : null}
      </div>
      <div class="head-actions">
        <button
          class="theme-toggle"
          type="button"
          title="About this map"
          aria-label="About this map"
          onClick={() => {
            welcomeOpen.value = true;
          }}
        >
          <InfoIcon />
        </button>
        <button
          class="theme-toggle"
          type="button"
          title={mode === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          aria-label={mode === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          onClick={() => setTheme(mode === "dark" ? "light" : "dark")}
        >
          {mode === "dark" ? <SunIcon /> : <MoonIcon />}
        </button>
      </div>
    </header>
  );
}
