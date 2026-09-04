import { useState } from "react";
import { CircleUser } from "lucide-react";
import { signInWithOAuth } from "@/lib/auth";

/**
 * Sign-in for the extension. This used to live on the options page; settings
 * moved to the website, but the extension still needs its own Supabase session
 * (the website's cookie session isn't readable from here), so it lives in the
 * side panel now.
 *
 * Google is the only provider. Anyone running a Chrome extension already has a
 * Google account, so email/password bought nothing and cost a password to
 * store, a confirmation email to deliver, and a reset flow to maintain.
 */
export function SignInPanel() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startOAuth() {
    setBusy(true);
    setError(null);
    try {
      await signInWithOAuth("google");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border bg-card p-4 text-card-foreground">
      <button
        type="button"
        disabled={busy}
        onClick={startOAuth}
        className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-60"
      >
        <CircleUser className="h-4 w-4" />
        {busy ? "Opening Google..." : "Continue with Google"}
      </button>
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
    </div>
  );
}
