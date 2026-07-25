import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  Lightbulb,
  ListChecks,
  Loader2,
  MousePointer2,
  PanelRight,
  PartyPopper,
  Pin,
  Plus,
  Puzzle,
  ShieldCheck,
  Target,
  Trash2,
  Upload,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { signInWithOAuth } from "@/lib/auth";
import { CanvasjobLogo } from "@/shared/CanvasjobLogo";
import {
  FILTER_TEXT_MAX,
  MAX_FILTERS_PER_PROFILE,
  type FilterKind,
  type FilterOut,
  type FilterProfileWithFilters,
} from "@/shared/types";
import { NewFilterDraft } from "./NewFilterDraft";

// Where the "Start job hunting" button drops the user — LinkedIn's job search,
// the surface the extension is built for.
const LINKEDIN_JOBS_URL = "https://www.linkedin.com/jobs/search/";

// Ready-made questions users can tap to prefill the add box. They go through
// the exact same validation as anything typed by hand — tapping only seeds the
// text, it doesn't skip the quality check.
const EXAMPLE_QUESTIONS = [
  "Do they sponsor a work visa in Switzerland?",
  "Is the salary above €4,000 per month?",
  "Is the role fully remote within Europe?",
  "Is this a permanent position rather than a contract?",
  "Do they require German language skills?",
];

type Step = "welcome" | "filters" | "cv" | "done";
const STEPS: Step[] = ["welcome", "filters", "cv", "done"];

// ---------------------------------------------------------------------------
// Wizard shell
// ---------------------------------------------------------------------------

export function OnboardingWizard({
  email,
  onComplete,
}: {
  // Reflects the live Supabase session from the parent. Drives the auto-advance
  // out of the welcome screen the moment Google sign-in lands.
  email: string | null;
  // Marks onboarding complete (persist + swap the options page to normal UI).
  onComplete: () => void;
}) {
  const [step, setStep] = useState<Step>(email ? "filters" : "welcome");

  useEffect(() => {
    if (email && step === "welcome") setStep("filters");
  }, [email, step]);

  function goTo(next: Step) {
    setStep(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function finish() {
    try {
      const tab = await chrome.tabs.create({ url: LINKEDIN_JOBS_URL, active: true });
      // Best-effort: pop the side panel open for the new tab so the extension is
      // visible immediately. Some Chrome versions reject sidePanel.open outside a
      // direct toolbar gesture — that's fine, the side helper tells the user how
      // to open it manually.
      try {
        if (tab.id != null) await chrome.sidePanel.open({ tabId: tab.id });
      } catch {
        // ignore
      }
    } catch {
      // ignore — completing onboarding matters more than the redirect
    }
    onComplete();
  }

  const progress = ((STEPS.indexOf(step) + 1) / STEPS.length) * 100;

  return (
    <div className="min-h-screen bg-muted/30 px-4 py-10">
      <div className="mx-auto grid max-w-4xl gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
        <div className="rounded-2xl border bg-card p-6 text-card-foreground shadow-sm sm:p-8">
          <div className="mb-6 flex items-center justify-between">
            <CanvasjobLogo markClassName="h-7 w-7" textClassName="text-lg" />
            {step !== "done" && (
              <button
                type="button"
                onClick={onComplete}
                className="text-xs font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
              >
                Skip setup
              </button>
            )}
          </div>

          <div className="mb-8 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>

          {step === "welcome" && <WelcomeStep />}
          {step === "filters" && <FiltersStep onNext={() => goTo("cv")} />}
          {step === "cv" && (
            <CvStep onNext={() => goTo("done")} onBack={() => goTo("filters")} />
          )}
          {step === "done" && <DoneStep onFinish={finish} onBack={() => goTo("cv")} />}
        </div>

        <SideHelper step={step} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

function StepHeading({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: React.ElementType;
  title: string;
  subtitle: string;
}) {
  return (
    <div>
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon size={22} aria-hidden="true" />
      </div>
      <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{subtitle}</p>
    </div>
  );
}

function ContinueButton({
  onClick,
  label = "Continue",
  disabled = false,
}: {
  onClick: () => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
    >
      {label} <ArrowRight size={16} aria-hidden="true" />
    </button>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft size={16} aria-hidden="true" /> Back
    </button>
  );
}

function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-4 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {children}
    </p>
  );
}

function GoogleG() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18A10.98 10.98 0 0 0 1 12c0 1.78.43 3.46 1.18 4.93l3.66-2.83z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.83C6.71 7.3 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — welcome + Google sign-in
// ---------------------------------------------------------------------------

function WelcomeStep() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setBusy(true);
    setError(null);
    try {
      await signInWithOAuth("google");
      // On success the parent's session listener flips `email`, which advances
      // the wizard — no navigation needed here.
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="text-center">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        Welcome to canvasjob
      </h1>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
        Sign in to check every LinkedIn job against your own criteria — and skip the ones that
        don&apos;t fit.
      </p>

      <div className="mx-auto mt-6 max-w-md rounded-xl bg-primary/5 px-4 py-3 text-sm font-medium leading-relaxed text-foreground">
        Instant ✅ / ❌ verdicts on any job, a 1–5 fit score against your CV, and one-click cover
        letters.
      </div>

      <button
        type="button"
        onClick={signIn}
        disabled={busy}
        className="mx-auto mt-6 flex w-full max-w-xs items-center justify-center gap-3 rounded-full border border-input bg-background px-5 py-3 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-accent disabled:opacity-60"
      >
        {busy ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <GoogleG />}
        {busy ? "Opening Google…" : "Sign in with Google"}
      </button>

      {error && <ErrorNote>{error}</ErrorNote>}

      <p className="mx-auto mt-5 max-w-xs text-xs leading-relaxed text-muted-foreground">
        By signing in, you agree to our Privacy Policy and Terms of Service.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — define filters ("questions")
// ---------------------------------------------------------------------------

function FiltersStep({ onNext }: { onNext: () => void }) {
  const [profileId, setProfileId] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Add-draft control. `adding` toggles the validated NewFilterDraft; `seed`
  // + `draftKey` let an example chip prefill it (bumping the key remounts the
  // draft so its internal text resets to the chosen example).
  const [adding, setAdding] = useState(false);
  const [seed, setSeed] = useState("");
  const [draftKey, setDraftKey] = useState(0);
  // `draftDirty` mirrors whether the open draft has unsaved text; `nudge`
  // escalates the reminder (and pulses the ✓) after a blocked Continue.
  const [draftDirty, setDraftDirty] = useState(false);
  const [nudge, setNudge] = useState(false);
  const draftRef = useRef<HTMLDivElement>(null);

  // Once the draft is added or cleared, there's nothing left to nag about.
  useEffect(() => {
    if (!draftDirty) setNudge(false);
  }, [draftDirty]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const list = await api.listProfiles();
        let profile: FilterProfileWithFilters | undefined =
          list.find((p) => p.is_active) ?? list[0];
        // Fresh sign-in normally seeds a starter profile server-side; create one
        // defensively if that hasn't happened so the step always has a target.
        if (!profile) {
          const created = await api.createProfile({ name: "My filters" });
          profile = { ...created, filters: [] };
        }
        setProfileId(profile.id);
        setFilters([...profile.filters].sort((a, b) => a.position - b.position));
        setError(null);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const atLimit = filters.length >= MAX_FILTERS_PER_PROFILE;

  // Runs after the shared NewFilterDraft has validated the text (good verdict
  // or an explicit "save anyway"). Rethrows on failure so the draft can reset
  // its busy state and let the user retry.
  async function createDraftFilter(text: string, kind: FilterKind | undefined) {
    if (!profileId) return;
    try {
      const created = await api.createFilter(profileId, {
        text,
        ...(kind ? { kind } : {}),
      });
      setFilters((prev) => [...prev, created]);
      setAdding(false);
      setSeed("");
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
      throw err;
    }
  }

  function openDraft(seedText: string) {
    if (atLimit) return;
    setSeed(seedText);
    setDraftKey((k) => k + 1);
    setAdding(true);
  }

  function handleContinue() {
    // Don't leave a typed-but-unadded question behind — send the user back to
    // the ✓ button instead of silently dropping their input.
    if (draftDirty) {
      setNudge(true);
      draftRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    onNext();
  }

  async function commitText(f: FilterOut, text: string) {
    const t = text.trim();
    if (!t || t === f.text) return;
    try {
      const updated = await api.updateFilter(f.id, { text: t });
      setFilters((prev) => prev.map((x) => (x.id === f.id ? updated : x)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    }
  }

  async function remove(f: FilterOut) {
    try {
      await api.deleteFilter(f.id);
      setFilters((prev) => prev.filter((x) => x.id !== f.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    }
  }

  const availableExamples = EXAMPLE_QUESTIONS.filter(
    (ex) => !filters.some((f) => f.text.trim().toLowerCase() === ex.toLowerCase()),
  );

  return (
    <div>
      <StepHeading
        icon={ListChecks}
        title="Define your questions"
        subtitle="canvasjob checks every LinkedIn job against these. Write them as plain-English must-haves or questions — edit the examples and add your own."
      />

      {loading ? (
        <p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 size={15} className="animate-spin" aria-hidden="true" /> Loading your filters…
        </p>
      ) : (
        <>
          {filters.length > 0 && (
            <div className="mt-6 space-y-2">
              {filters.map((f) => (
                <FilterRow key={f.id} filter={f} onCommit={commitText} onRemove={remove} />
              ))}
            </div>
          )}

          <div className="mt-3" ref={draftRef}>
            {adding ? (
              <>
                <NewFilterDraft
                  key={draftKey}
                  initialText={seed}
                  onConfirm={createDraftFilter}
                  onCancel={() => {
                    setAdding(false);
                    setSeed("");
                  }}
                  onDirtyChange={setDraftDirty}
                  highlightSave={nudge}
                />
                {draftDirty && (
                  <p
                    className={`mt-2 flex items-center gap-1.5 text-xs ${
                      nudge ? "font-medium text-destructive" : "text-amber-600"
                    }`}
                  >
                    <ArrowUp size={13} aria-hidden="true" />
                    {nudge
                      ? "Add this question first — press the ✓ button above to save it."
                      : "Not added yet — press the ✓ button to add this question."}
                  </p>
                )}
              </>
            ) : atLimit ? (
              <p className="text-xs text-muted-foreground">
                You&apos;ve reached the {MAX_FILTERS_PER_PROFILE}-question limit for this profile.
              </p>
            ) : (
              <button
                type="button"
                onClick={() => openDraft("")}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed py-2.5 text-sm font-medium text-primary transition-colors hover:bg-accent/40"
              >
                <Plus size={16} aria-hidden="true" /> Add a question
              </button>
            )}
          </div>

          {!atLimit && availableExamples.length > 0 && (
            <div className="mt-4">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Lightbulb size={13} aria-hidden="true" /> Need ideas? Tap one to add:
              </div>
              <div className="flex flex-wrap gap-2">
                {availableExamples.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => openDraft(ex)}
                    className="rounded-full border bg-background px-3 py-1 text-xs text-foreground transition-colors hover:bg-accent"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && <ErrorNote>{error}</ErrorNote>}
        </>
      )}

      <div className="mt-8 flex justify-end">
        <ContinueButton onClick={handleContinue} />
      </div>
    </div>
  );
}

function FilterRow({
  filter,
  onCommit,
  onRemove,
}: {
  filter: FilterOut;
  onCommit: (f: FilterOut, text: string) => void;
  onRemove: (f: FilterOut) => void;
}) {
  const [text, setText] = useState(filter.text);
  useEffect(() => setText(filter.text), [filter.text]);

  return (
    <div className="flex items-center gap-2 rounded-lg border bg-background px-2 py-1.5">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-primary/10 text-primary">
        <Check size={13} aria-hidden="true" />
      </span>
      <input
        value={text}
        maxLength={FILTER_TEXT_MAX}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => onCommit(filter, text)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          }
        }}
        className="min-w-0 flex-1 rounded-md bg-transparent px-1 py-1 text-sm text-foreground outline-none focus:bg-muted/50"
      />
      <button
        type="button"
        onClick={() => onRemove(filter)}
        aria-label="Remove question"
        title="Remove"
        className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-destructive"
      >
        <Trash2 size={15} aria-hidden="true" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — CV upload (optional)
// ---------------------------------------------------------------------------

function CvStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reflect an already-uploaded CV (user re-running onboarding).
  useEffect(() => {
    void api
      .getCv()
      .then((cv) => setUploaded(cv !== null))
      .catch(() => {});
  }, []);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      await api.uploadCv(file);
      setUploaded(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <StepHeading
        icon={Target}
        title="Add your CV"
        subtitle="Optional. Your CV powers a 1–5 job-match score on every posting, and provides the details we use to draft tailored cover letters."
      />

      <div className="mt-4 flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
        <ShieldCheck size={15} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
        <span>
          We never store your CV file — only a non-identifying professional summary (skills,
          experience, domains). You can edit or remove it anytime in Settings.
        </span>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".pdf,.docx,.txt"
        onChange={onFile}
        className="hidden"
      />

      {error && <ErrorNote>{error}</ErrorNote>}

      {uploading ? (
        <p className="mt-5 flex items-center justify-center gap-2 rounded-lg border border-dashed px-6 py-8 text-sm text-muted-foreground">
          <Loader2 size={15} className="animate-spin" aria-hidden="true" /> Parsing your CV…
        </p>
      ) : uploaded ? (
        <div className="mt-5 flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm">
          <span className="flex items-center gap-2 font-medium text-emerald-800">
            <Check size={16} aria-hidden="true" /> CV added — job-match scoring is on.
          </span>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="text-xs font-medium text-emerald-800 underline-offset-4 hover:underline"
          >
            Replace
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="mt-5 flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-6 py-8 text-center transition-colors hover:bg-accent/40"
        >
          <Upload size={20} className="text-muted-foreground" aria-hidden="true" />
          <span className="text-sm font-medium text-foreground">Upload your CV</span>
          <span className="text-xs text-muted-foreground">PDF, DOCX, or TXT</span>
        </button>
      )}

      <div className="mt-8 flex items-center justify-between gap-4">
        <BackButton onClick={onBack} />
        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-muted-foreground sm:inline">
            {uploaded ? "You're good to go." : "You can add this later in Settings."}
          </span>
          <ContinueButton onClick={onNext} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 4 — done
// ---------------------------------------------------------------------------

function DoneStep({ onFinish, onBack }: { onFinish: () => void; onBack: () => void }) {
  return (
    <div className="text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
        <PartyPopper size={28} aria-hidden="true" />
      </div>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-foreground">
        You&apos;re all set!
      </h1>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
        Open any LinkedIn job and canvasjob evaluates it against your questions right in the side
        panel — no extra clicks.
      </p>

      <button
        type="button"
        onClick={onFinish}
        className="mx-auto mt-7 flex w-full max-w-xs items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Start job hunting on LinkedIn <ArrowRight size={16} aria-hidden="true" />
      </button>

      <button
        type="button"
        onClick={onBack}
        className="mx-auto mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft size={15} aria-hidden="true" /> Back
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Right-hand helper card
// ---------------------------------------------------------------------------

function SideHelper({ step }: { step: Step }) {
  const keepOpen = step === "done";

  return (
    <aside className="rounded-2xl border bg-card p-5 text-card-foreground shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {keepOpen ? (
            <PanelRight size={16} aria-hidden="true" />
          ) : (
            <Puzzle size={16} aria-hidden="true" />
          )}
        </span>
        <h3 className="text-sm font-semibold text-foreground">
          {keepOpen ? "Keep canvasjob on the right" : "Pin canvasjob"}
        </h3>
      </div>

      {keepOpen ? (
        <>
          <p className="text-xs leading-relaxed text-muted-foreground">
            canvasjob lives in your browser&apos;s side panel, on the right. Open a LinkedIn job and
            it appears automatically with your results.
          </p>
          <ul className="mt-3 space-y-2 text-xs text-muted-foreground">
            <HelperItem icon={PanelRight}>
              Leave the panel open while you browse jobs.
            </HelperItem>
            <HelperItem icon={MousePointer2}>
              Closed it? Click the canvasjob icon in your toolbar to bring it back.
            </HelperItem>
          </ul>
        </>
      ) : (
        <>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Keep canvasjob one click away while you finish setup.
          </p>
          <ol className="mt-3 space-y-2 text-xs text-muted-foreground">
            <HelperItem step={1} icon={Puzzle}>
              Click the puzzle-piece icon in Chrome&apos;s toolbar.
            </HelperItem>
            <HelperItem step={2} icon={Pin}>
              Pin canvasjob so it stays visible.
            </HelperItem>
          </ol>
        </>
      )}
    </aside>
  );
}

function HelperItem({
  children,
  icon: Icon,
  step,
}: {
  children: React.ReactNode;
  icon: React.ElementType;
  step?: number;
}) {
  return (
    <li className="flex items-start gap-2">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-foreground">
        {step ?? <Icon size={12} aria-hidden="true" />}
      </span>
      <span className="leading-relaxed">{children}</span>
    </li>
  );
}
