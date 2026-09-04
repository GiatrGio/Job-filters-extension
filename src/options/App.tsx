import { useEffect, useState } from "react";
import { Settings } from "lucide-react";
import { getSupabase } from "@/lib/auth";
import { openSettings } from "@/lib/links";
import { getOnboardingComplete, setOnboardingComplete } from "@/lib/storage";
import { OnboardingWizard } from "./Onboarding";
import { CanvasjobLogo } from "@/shared/CanvasjobLogo";

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

// Shown when this page is opened after onboarding is done — from Chrome's
// extension menu, say. Settings themselves live on the website now; this page
// exists only to host the first-run wizard.
function SettingsMovedCard() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 text-center text-card-foreground shadow-sm">
        <div className="mb-5 flex justify-center">
          <CanvasjobLogo markClassName="h-8 w-8" textClassName="text-xl" />
        </div>
        <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Settings size={22} aria-hidden="true" />
        </div>
        <h1 className="text-lg font-semibold tracking-tight text-foreground">
          Settings moved to the web app
        </h1>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          Your filters, job fit, and cover letter settings all live in canvasjob on the web now —
          one place instead of two.
        </p>
        <button
          type="button"
          onClick={() => openSettings()}
          className="mt-5 w-full rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Open settings
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const { email, loading } = useSession();
  // null = still reading the flag; false = show the first-run wizard.
  const [onboarded, setOnboarded] = useState<boolean | null>(null);

  useEffect(() => {
    void getOnboardingComplete().then(setOnboarded);
  }, []);

  function completeOnboarding() {
    setOnboarded(true);
    void setOnboardingComplete(true);
  }

  if (loading || onboarded === null) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }

  if (!onboarded) {
    return <OnboardingWizard email={email} onComplete={completeOnboarding} />;
  }

  return <SettingsMovedCard />;
}
