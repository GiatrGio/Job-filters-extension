import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { crx } from "@crxjs/vite-plugin";
import path from "node:path";
import manifest from "./manifest.json" with { type: "json" };

const DEFAULT_API_URL = "http://localhost:8000";
const LOCAL_API_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function apiHostPermission(mode: string, apiUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(apiUrl);
  } catch {
    throw new Error(`VITE_API_URL must be a valid URL; received ${JSON.stringify(apiUrl)}.`);
  }

  if (mode === "production" && LOCAL_API_HOSTS.has(parsed.hostname)) {
    throw new Error(
      "A production extension build cannot use a localhost VITE_API_URL. " +
        "Configure .env.production.local before building for the Chrome Web Store.",
    );
  }

  return `${parsed.origin}/*`;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const hostPermission = apiHostPermission(mode, env.VITE_API_URL || DEFAULT_API_URL);
  const modeManifest = {
    ...manifest,
    host_permissions: [...manifest.host_permissions, hostPermission],
  };

  return {
    plugins: [react(), crx({ manifest: modeManifest })],
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
  };
});
