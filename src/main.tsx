import { render } from "preact";
import "@fontsource-variable/instrument-sans";
import "@fontsource-variable/fraunces";
import "./styles.css";
import { App } from "./App";
import { theme } from "./store";
import { CATEGORIES } from "./data/taxonomy";
import { initUrlState, startUrlSync } from "./urlState";

// Apply theme before first paint so there's no flash of the wrong scheme.
document.documentElement.dataset.theme = theme.value;

// Category colors have one source of truth (taxonomy.ts); expose them to CSS.
for (const cat of CATEGORIES) {
  document.documentElement.style.setProperty(`--cat-${cat.id}`, cat.color);
}

// Restore filters from a shared link, then keep the URL in sync.
initUrlState();
startUrlSync();

render(<App />, document.getElementById("app")!);
