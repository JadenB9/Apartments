import { Component, render, type ComponentChildren } from "preact";
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

// Last-resort guard: a runtime failure shows a readable card, not a blank page.
class ErrorBoundary extends Component<
  { children: ComponentChildren },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  componentDidCatch(error: Error) {
    console.error("[app] fatal render error:", error);
    this.setState({ error });
  }

  render() {
    if (this.state.error) {
      return (
        <div class="fatal-card" role="alert">
          <h2>Something went wrong</h2>
          <p>
            The map hit an unexpected error. Reloading usually fixes it — if it
            keeps happening, the browser console has the details.
          </p>
          <button type="button" onClick={() => location.reload()}>
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
  document.getElementById("app")!,
);
