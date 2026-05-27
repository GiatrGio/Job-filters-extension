import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { crx } from "@crxjs/vite-plugin";
import path from "node:path";
import manifest from "./manifest.json" with { type: "json" };

const DEFAULT_API_URL = "http://localhost:8000";
const LOCAL_API_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function hostPermission(envName: string, value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${envName} must be a valid URL; received ${JSON.stringify(value)}.`);
  }

  return `${parsed.origin}/*`;
}

function apiHostPermission(mode: string, apiUrl: string): string {
  const permission = hostPermission("VITE_API_URL", apiUrl);
  const parsed = new URL(apiUrl);
  if (mode === "production" && LOCAL_API_HOSTS.has(parsed.hostname)) {
    throw new Error(
      "A production extension build cannot use a localhost VITE_API_URL. " +
        "Configure .env.production.local before building for the Chrome Web Store.",
    );
  }

  return permission;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  if (!env.VITE_SUPABASE_URL) {
    throw new Error("VITE_SUPABASE_URL must be configured before building the extension.");
  }

  const apiPermission = apiHostPermission(mode, env.VITE_API_URL || DEFAULT_API_URL);
  const supabasePermission = hostPermission("VITE_SUPABASE_URL", env.VITE_SUPABASE_URL);
  const modeManifest = {
    ...manifest,
    host_permissions: [...new Set([...manifest.host_permissions, supabasePermission, apiPermission])],
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
