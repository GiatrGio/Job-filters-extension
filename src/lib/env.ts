export const ENV = {
  SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL as string,
  SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
  API_URL: (import.meta.env.VITE_API_URL as string) ?? "http://localhost:8000",
  // Where /pricing and /app/jobs/<id> live. Used to push users from the
  // extension to the website (upgrade CTAs, "open in dashboard" links).
  WEB_URL: (import.meta.env.VITE_WEB_URL as string) ?? "http://localhost:3000",
};

if (!ENV.SUPABASE_URL || !ENV.SUPABASE_PUBLISHABLE_KEY) {
  // Surface misconfiguration loudly during dev — the extension is useless
  // without Supabase auth wired up.
  // eslint-disable-next-line no-console
  console.warn("[canvasjob] Missing Supabase env vars — check .env");
}
