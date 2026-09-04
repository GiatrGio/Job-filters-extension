import { useState } from "react";
import { CircleUser } from "lucide-react";
import type { Provider } from "@supabase/supabase-js";
import { getSupabase, signInWithOAuth } from "@/lib/auth";

type AuthView = "signin" | "signup";

/**
 * Sign-in for the extension. This used to live on the options page; settings
 * moved to the website, but the extension still needs its own Supabase session
 * (the website's cookie session isn't readable from here), so the form lives in
 * the side panel now.
 */
export function SignInPanel() {
  const [view, setView] = useState<AuthView>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [oauthProvider, setOauthProvider] = useState<Provider | null>(null);
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
        if (password !== confirmPassword) {
          throw new Error("Passwords do not match.");
        }
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

  async function startOAuth(provider: Provider) {
    setOauthProvider(provider);
    setError(null);
    setInfo(null);
    try {
      await signInWithOAuth(provider);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setOauthProvider(null);
    }
  }

  return (
    <div className="rounded-lg border bg-card p-4 text-card-foreground">
      <h2 className="mb-3 text-sm font-semibold tracking-tight text-foreground">
        {view === "signin" ? "Sign in" : "Create account"}
      </h2>
      <button
        type="button"
        disabled={busy || oauthProvider !== null}
        onClick={() => startOAuth("google")}
        className="flex w-full items-center justify-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-60"
      >
        <CircleUser className="h-4 w-4" />
        {oauthProvider === "google" ? "Opening Google..." : "Continue with Google"}
      </button>
      <div className="my-3 flex items-center gap-3 text-xs text-muted-foreground">
        <div className="h-px flex-1 bg-border" />
        <span>or</span>
        <div className="h-px flex-1 bg-border" />
      </div>
      <form onSubmit={submit} className="space-y-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20"
          autoComplete="email"
        />
        <input
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20"
          autoComplete={view === "signin" ? "current-password" : "new-password"}
        />
        {view === "signup" && (
          <input
            type="password"
            required
            minLength={8}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirm password"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20"
            autoComplete="new-password"
          />
        )}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-primary py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
        >
          {busy ? "…" : view === "signin" ? "Sign in" : "Sign up"}
        </button>
      </form>
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      {info && <p className="mt-3 text-sm text-emerald-700">{info}</p>}
      <div className="mt-3 text-xs text-muted-foreground">
        {view === "signin" ? "No account?" : "Already have an account?"}{" "}
        <button
          className="font-medium text-primary underline-offset-4 hover:underline"
          onClick={() => setView(view === "signin" ? "signup" : "signin")}
        >
          {view === "signin" ? "Create one" : "Sign in"}
        </button>
      </div>
    </div>
  );
}
