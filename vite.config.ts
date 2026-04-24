import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { crx } from "@crxjs/vite-plugin";
import path from "node:path";
import manifest from "./manifest.json" with { type: "json" };

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: true,
    // CRXJS dev: the extension fetches module graph pieces (/@vite/client,
    // /@vite/env, @react-refresh, …) from the Vite dev server. Recent Vite
    // versions reject those unless the extension origin is explicitly allowed.
    cors: {
      origin: /^chrome-extension:\/\//,
    },
    // Pin HMR to the same port so the websocket upgrade succeeds from the
    // extension origin.
    hmr: {
      port: 5173,
    },
  },
});
