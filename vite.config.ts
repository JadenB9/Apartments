import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import { compression } from "vite-plugin-compression2";

// Fast static SPA: Preact + pre-compressed assets (gzip + brotli).
// GITHUB_PAGES is set by the deploy workflow so assets resolve under the
// repository subpath (jadenb9.github.io/Apartments/).
export default defineConfig({
  base: process.env.GITHUB_PAGES ? "/Apartments/" : "/",
  plugins: [
    preact(),
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
