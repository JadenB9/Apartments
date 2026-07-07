import { defineConfig, type Plugin } from "vite";
import preact from "@preact/preset-vite";
import { compression } from "vite-plugin-compression2";

// Content-Security-Policy, injected into the built index.html only (dev needs
// Vite's inline HMR preamble, which a strict CSP would block). GitHub Pages
// can't set response headers, so a <meta> tag is the delivery mechanism —
// frame-ancestors/X-Frame-Options can't be expressed this way (meta limitation).
// MapLibre requires worker-src blob: and data:/blob: images; the two tile hosts
// are the only permitted remote origins.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://tiles.openfreemap.org https://*.basemaps.cartocdn.com",
  "connect-src 'self' https://tiles.openfreemap.org https://*.basemaps.cartocdn.com",
  "worker-src blob:",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join("; ");

function cspPlugin(): Plugin {
  return {
    name: "inject-csp",
    apply: "build",
    transformIndexHtml(html) {
      return html.replace(
        "<meta charset=",
        `<meta http-equiv="Content-Security-Policy" content="${CSP}" />\n    <meta charset=`,
      );
    },
  };
}

// Fast static SPA: Preact + pre-compressed assets (gzip + brotli).
// GITHUB_PAGES is set by the deploy workflow so assets resolve under the
// repository subpath (jadenb9.github.io/Apartments/).
export default defineConfig({
  base: process.env.GITHUB_PAGES ? "/Apartments/" : "/",
  plugins: [
    preact(),
    cspPlugin(),
    compression({ algorithm: "gzip", exclude: [/\.(br)$/, /\.(gz)$/] }),
    compression({ algorithm: "brotliCompress", exclude: [/\.(br)$/, /\.(gz)$/] }),
  ],
  build: {
    target: "es2022",
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          maplibre: ["maplibre-gl"],
        },
      },
    },
  },
  server: {
    host: true,
    port: 5173,
  },
});
