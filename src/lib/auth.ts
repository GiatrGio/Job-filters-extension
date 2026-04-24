import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ENV } from "./env";

// Custom storage adapter so Supabase persists its session in chrome.storage
// instead of localStorage — crucial for the service worker, which has no
// localStorage at all.
const chromeStorageAdapter = {
  async getItem(key: string): Promise<string | null> {
    const result = await chrome.storage.local.get(key);
    const v = result[key];
    return typeof v === "string" ? v : null;
  },
  async setItem(key: string, value: string): Promise<void> {
    await chrome.storage.local.set({ [key]: value });
  },
  async removeItem(key: string): Promise<void> {
    await chrome.storage.local.remove(key);
  },
};

let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (_client) return _client;
  _client = createClient(ENV.SUPABASE_URL, ENV.SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      storage: chromeStorageAdapter,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
  return _client;
}

export async function getAccessToken(): Promise<string | null> {
  const { data } = await getSupabase().auth.getSession();
  return data.session?.access_token ?? null;
}

export async function signOut(): Promise<void> {
  await getSupabase().auth.signOut();
}
