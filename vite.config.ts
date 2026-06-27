import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import { compression } from "vite-plugin-compression2";

// Fast static SPA: Preact + pre-compressed assets (gzip + brotli).
export default defineConfig({
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
