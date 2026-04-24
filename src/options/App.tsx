import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { getSupabase, signOut } from "@/lib/auth";
import type { FilterOut, MeResponse } from "@/shared/types";

type AuthView = "signin" | "signup";

function useSession() {
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = getSupabase();
    supabase.auth.getSession().then(({ data }) => {
      setEmail(data.session?.user.email ?? null);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_, session) => {
      setEmail(session?.user.email ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return { email, loading };
}

function AuthPanel() {
  const [view, setView] = useState<AuthView>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const supabase = getSupabase();
      if (view === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setInfo("Check your inbox to confirm your email, then sign in.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-sm mx-auto mt-10">
      <h2 className="text-lg font-semibold mb-4">
        {view === "signin" ? "Sign in" : "Create account"}
      </h2>
      <form onSubmit={submit} className="space-y-3">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          autoComplete="email"
        />
        <input
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          autoComplete={view === "signin" ? "current-password" : "new-password"}
        />
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded bg-brand-accent text-white py-2 text-sm disabled:opacity-60"
        >
          {busy ? "…" : view === "signin" ? "Sign in" : "Sign up"}
        </button>
      </form>
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      {info && <p className="mt-3 text-sm text-green-700">{info}</p>}
      <div className="mt-4 text-xs text-gray-500">
        {view === "signin" ? "No account?" : "Already have an account?"}{" "}
        <button
          className="underline"
          onClick={() => setView(view === "signin" ? "signup" : "signin")}
        >
          {view === "signin" ? "Create one" : "Sign in"}
        </button>
      </div>
    </div>
  );
}

function FilterList() {
  const [filters, setFilters] = useState<FilterOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [newText, setNewText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setFilters(await api.listFilters());
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function add() {
    const text = newText.trim();
    if (!text) return;
    try {
      const position = filters.length
        ? Math.max(...filters.map((f) => f.position)) + 1
        : 0;
      await api.createFilter({ text, position });
      setNewText("");
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    }
  }

  async function update(f: FilterOut, patch: Partial<FilterOut>) {
    await api.updateFilter(f.id, patch);
    await refresh();
  }

  async function remove(f: FilterOut) {
    await api.deleteFilter(f.id);
    await refresh();
  }

  async function move(f: FilterOut, dir: -1 | 1) {
    const sorted = [...filters].sort((a, b) => a.position - b.position);
    const idx = sorted.findIndex((x) => x.id === f.id);
    const swap = sorted[idx + dir];
    if (!swap) return;
    await Promise.all([
      api.updateFilter(f.id, { position: swap.position }),
      api.updateFilter(swap.id, { position: f.position }),
    ]);
    await refresh();
  }

  return (
    <section>
      <h3 className="text-base font-semibold mb-2">Your filters</h3>
      <p className="text-sm text-gray-600 mb-3">
        Write each filter in plain English, one per line. Examples: <em>Must be fully
        remote</em>, <em>Must mention a salary of at least €6,000/month</em>.
      </p>

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <ul className="space-y-2 mb-4">
          {filters
            .slice()
            .sort((a, b) => a.position - b.position)
            .map((f, i, arr) => (
              <li
                key={f.id}
                className="flex items-start gap-2 rounded border border-gray-200 p-2"
              >
                <div className="flex flex-col gap-1">
                  <button
                    aria-label="Move up"
                    disabled={i === 0}
                    onClick={() => move(f, -1)}
                    className="text-xs px-1 disabled:opacity-30"
                  >
                    ▲
                  </button>
                  <button
                    aria-label="Move down"
                    disabled={i === arr.length - 1}
                    onClick={() => move(f, 1)}
                    className="text-xs px-1 disabled:opacity-30"
                  >
                    ▼
                  </button>
                </div>
                <input
                  type="checkbox"
                  checked={f.enabled}
                  onChange={(e) => update(f, { enabled: e.target.checked })}
                  className="mt-1"
                  title="Enabled"
                />
                <input
                  className="flex-1 rounded border border-gray-200 px-2 py-1 text-sm"
                  defaultValue={f.text}
                  onBlur={(e) => {
                    const t = e.target.value.trim();
                    if (t && t !== f.text) update(f, { text: t });
                  }}
                />
                <button
                  onClick={() => remove(f)}
                  className="text-xs text-red-600 underline"
                >
                  Delete
                </button>
              </li>
            ))}
        </ul>
      )}

      <div className="flex gap-2">
        <input
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Add a filter…"
          className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
        />
        <button
          onClick={add}
          className="rounded bg-brand-accent text-white px-3 py-2 text-sm"
        >
          Add
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
    </section>
  );
}

function AccountBar({ email }: { email: string }) {
  const [me, setMe] = useState<MeResponse | null>(null);

  useEffect(() => {
    api.me().then(setMe).catch(() => setMe(null));
  }, []);

  return (
    <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-200">
      <div className="text-sm">
        <div className="font-medium text-gray-900">{email}</div>
        <div className="text-gray-500">
          Plan: {me?.plan ?? "…"}
          {me ? ` · ${me.usage.used} / ${me.usage.limit} this month` : ""}
        </div>
      </div>
      <button onClick={signOut} className="text-sm underline">
        Sign out
      </button>
    </div>
  );
}

export default function App() {
  const { email, loading } = useSession();

  if (loading) {
    return <div className="p-6 text-sm text-gray-500">Loading…</div>;
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="text-xl font-semibold mb-4">LinkedIn Job Filter</h1>
      {email ? (
        <>
          <AccountBar email={email} />
          <FilterList />
        </>
      ) : (
        <AuthPanel />
      )}
    </div>
  );
}
