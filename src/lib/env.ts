export const ENV = {
  SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL as string,
  SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
  API_URL: (import.meta.env.VITE_API_URL as string) ?? "http://localhost:8000",
};

if (!ENV.SUPABASE_URL || !ENV.SUPABASE_PUBLISHABLE_KEY) {
  // Surface misconfiguration loudly during dev — the extension is useless
  // without Supabase auth wired up.
  // eslint-disable-next-line no-console
  console.warn("[LinkedIn Job Filter] Missing Supabase env vars — check .env");
}
