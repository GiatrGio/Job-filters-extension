import { useEffect, useState } from "react";
import { CheckCircle2, HelpCircle, ListChecks, RefreshCw, Search } from "lucide-react";
import type {
  ExtensionMessage,
  FilterProfileWithFilters,
  MeResponse,
  StoredEvaluation,
  UsageOut,
} from "@/shared/types";
import { DEFAULT_WARNING_THRESHOLD } from "@/shared/types";
import { api, ApiError } from "@/lib/api";
import { getLastEvaluation, getOnboardingFlag, setOnboardingFlag } from "@/lib/storage";
import { getAccessToken } from "@/lib/auth";
import { openHowItWorks, openPricing } from "@/lib/links";
import { ResultRow } from "./components/ResultRow";
import { TrackJobButton } from "./components/TrackJobButton";

const SIDEPANEL_PORT_NAME = "sidepanel";
const SIDEPANEL_HEARTBEAT_MS = 20_000;
const SIDEPANEL_RECONNECT_MS = 1_000;

type Status =
  | { kind: "idle" }
  | { kind: "loading"; jobId: string }
  | { kind: "ready"; evaluation: StoredEvaluation; cached: boolean }
  | { kind: "error"; message: string; status?: number };

export default function App() {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [profiles, setProfiles] = useState<FilterProfileWithFilters[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [switchingProfile, setSwitchingProfile] = useState(false);
  const [refreshingFilters, setRefreshingFilters] = useState(false);
  // /me drives the upgrade CTAs (hidden for pro users) and the footer's
  // initial usage line — without it we'd have to wait for the first
  // evaluation response to know how much quota is left.
  const [me, setMe] = useState<MeResponse | null>(null);
  // Tracked separately so the footer keeps showing the most recent value
  // during the next evaluation's loading state, instead of snapping back
  // to /me's session-start snapshot.
  const [usage, setUsage] = useState<UsageOut | null>(null);
  // Coach-marks lifecycle: null = unknown (still loading the persisted
  // dismissal flag), false = already dismissed (never show again), true =
  // eligible — shown whenever there's a ready evaluation.
  const [coachMarksEligible, setCoachMarksEligible] = useState<boolean | null>(null);

  async function loadProfiles() {
    try {
      const list = await api.listProfiles();
      list.sort((a, b) => a.position - b.position);
      setProfiles(list);
      setActiveProfileId(list.find((p) => p.is_active)?.id ?? null);
    } catch {
      // Ignore — likely not signed in. The signed-in branch below covers UX.
    }
  }

  useEffect(() => {
    // Long-lived port so the background worker knows the panel is open. MV3
    // workers can still be suspended while the side panel stays visible, so the
    // panel reconnects and sends a small heartbeat instead of assuming the
    // first port will live for the whole browser session.
    let stopped = false;
    let port: chrome.runtime.Port | null = null;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function clearHeartbeat() {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }

    function scheduleReconnect() {
      if (stopped || reconnectTimer) return;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connectPort();
      }, SIDEPANEL_RECONNECT_MS);
    }

    function sendHeartbeat() {
      try {
        port?.postMessage({ type: "SIDEPANEL_HEARTBEAT" } satisfies ExtensionMessage);
      } catch {
        clearHeartbeat();
        scheduleReconnect();
      }
    }

    function connectPort() {
      if (stopped) return;
      try {
        port = chrome.runtime.connect({ name: SIDEPANEL_PORT_NAME });
        port.onDisconnect.addListener(() => {
          port = null;
          clearHeartbeat();
          scheduleReconnect();
        });
        sendHeartbeat();
        heartbeatTimer = setInterval(sendHeartbeat, SIDEPANEL_HEARTBEAT_MS);
      } catch {
        scheduleReconnect();
      }
    }

    connectPort();

    void (async () => {
      const [last, token, coachDismissed] = await Promise.all([
        getLastEvaluation(),
        getAccessToken(),
        getOnboardingFlag("coachMarksDismissed"),
      ]);
      setSignedIn(!!token);
      setCoachMarksEligible(!coachDismissed);
      if (last) {
        setStatus({ kind: "ready", evaluation: last, cached: last.response.cached });
        setUsage(last.response.usage);
      }
      if (token) {
        await loadProfiles();
        api.me().then((m) => {
          setMe(m);
          setUsage(m.usage);
        }).catch(() => {
          // /me failures are non-fatal — the panel still works without plan info,
          // we just hide the upgrade CTAs.
        });
      }
    })();

    const onMessage = (msg: ExtensionMessage) => {
      if (msg.type === "JOB_SCRAPED") {
        setStatus({ kind: "loading", jobId: msg.job.linkedin_job_id });
      } else if (msg.type === "EVALUATION_READY") {
        setStatus({
          kind: "ready",
          evaluation: { job: msg.job, response: msg.response, storedAt: Date.now() },
          cached: msg.response.cached,
        });
        setUsage(msg.response.usage);
      } else if (msg.type === "EVALUATION_ERROR") {
        setStatus({ kind: "error", message: msg.error, status: msg.status });
      }
    };
    chrome.runtime.onMessage.addListener(onMessage);
    return () => {
      stopped = true;
      clearHeartbeat();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      chrome.runtime.onMessage.removeListener(onMessage);
      try {
        port?.disconnect();
      } catch {
        // The worker may already be gone.
      }
    };
  }, []);

  async function onChangeProfile(id: string) {
    if (id === activeProfileId || switchingProfile) return;
    const previous = activeProfileId;
    setActiveProfileId(id); // optimistic
    setSwitchingProfile(true);
    try {
      await api.activateProfile(id);
      // Ask the background to re-emit the currently viewed job so the user
      // sees the new profile's evaluation without navigating away and back.
      chrome.runtime.sendMessage({ type: "REQUEST_RESCAN" } satisfies ExtensionMessage).catch(() => {});
      await loadProfiles();
    } catch (err) {
      setActiveProfileId(previous);
      setStatus({
        kind: "error",
        message: err instanceof ApiError ? err.message : String(err),
      });
    } finally {
      setSwitchingProfile(false);
    }
  }

  function openOptions() {
    chrome.runtime.openOptionsPage?.();
  }

  async function dismissCoachMarks() {
    setCoachMarksEligible(false);
    await setOnboardingFlag("coachMarksDismissed", true);
  }

  // Show coach marks whenever the user is eligible (not yet dismissed) and
  // there's something to point at (a ready evaluation). Covers both the
  // "fresh evaluation just arrived" and "panel opened with a stored eval"
  // paths.
  const coachMarksVisible = coachMarksEligible === true && status.kind === "ready";

  async function refreshFilters() {
    if (refreshingFilters) return;
    setRefreshingFilters(true);
    try {
      await loadProfiles();
      api.me().then((m) => {
        setMe(m);
        setUsage(m.usage);
      }).catch(() => {});
      chrome.runtime.sendMessage({ type: "REQUEST_RESCAN" } satisfies ExtensionMessage).catch(() => {});
    } catch (err) {
      setStatus({
        kind: "error",
        message: err instanceof ApiError ? err.message : String(err),
      });
    } finally {
      setRefreshingFilters(false);
    }
  }

  const evalView = (() => {
    if (signedIn === false) {
      return <SignedOutExplainer onOpenOptions={openOptions} />;
    }

    if (status.kind === "idle") {
      return (
        <div className="p-4 text-sm text-muted-foreground">
          Open a LinkedIn job posting to see an evaluation.
        </div>
      );
    }

    if (status.kind === "loading") {
      return (
        <div className="p-4 text-sm text-muted-foreground">Evaluating job {status.jobId}…</div>
      );
    }

    if (status.kind === "error") {
      const quota = status.status === 402;
      const title = quota
        ? "You've used your free evaluations for this month."
        : "Evaluation failed.";
      return (
        <div className="p-4 text-sm">
          <p className="font-medium text-destructive">
            {title}
          </p>
          {!quota && <p className="mt-1 text-muted-foreground">{status.message}</p>}
          {quota && me?.plan === "free" && (
            <button
              onClick={openPricing}
              className="mt-3 w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Upgrade to Pro for unlimited evaluations
            </button>
          )}
        </div>
      );
    }

    const { evaluation, cached } = status;
    const { job, response } = evaluation;
    return (
      <div className="p-4">
        <div className="mb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              {cached ? "Cached" : "Fresh"} evaluation
            </div>
            <div className="relative">
              <TrackJobButton job={job} />
              {coachMarksVisible && (
                <CoachBubble
                  title="Save jobs you like"
                  body="Click here to add this job to your tracker — change status, add notes on the website."
                  onDismiss={dismissCoachMarks}
                />
              )}
            </div>
          </div>
          <div className="mt-1 text-base font-medium text-foreground">{job.job_title ?? "Job"}</div>
          <div className="text-sm text-muted-foreground">
            {[job.job_company, job.job_location].filter(Boolean).join(" · ")}
          </div>
        </div>
        {response.results.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            You haven't configured any filters yet.{" "}
            <button className="font-medium text-primary underline-offset-4 hover:underline" onClick={openOptions}>
              Add some
            </button>
            .
          </div>
        ) : (
          <ul>
            {response.results.map((r, i) => (
              <ResultRow key={i} result={r} />
            ))}
          </ul>
        )}
      </div>
    );
  })();

  const isFreePlan = me?.plan === "free";
  const usageRatio = usage && usage.limit > 0 ? usage.used / usage.limit : 0;
  const warningThreshold = usage?.warning_threshold ?? DEFAULT_WARNING_THRESHOLD;
  const showSoftUpgrade =
    isFreePlan && usage !== null && usageRatio >= warningThreshold && usageRatio < 1;

  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      <header className="flex min-h-12 items-center gap-2 border-b px-3 py-2">
        <h1 className="shrink-0 text-sm font-semibold tracking-tight">canvasjob</h1>
        <button
          onClick={openHowItWorks}
          className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title="How it works"
          aria-label="How it works"
        >
          <HelpCircle size={14} />
        </button>
        {signedIn && (
          <button
            onClick={refreshFilters}
            disabled={refreshingFilters}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
            title="Refresh filters"
            aria-label="Refresh filters"
          >
            <RefreshCw size={14} className={refreshingFilters ? "animate-spin" : ""} />
          </button>
        )}
        {signedIn && profiles.length > 0 && (
          <div className="relative">
            <select
              value={activeProfileId ?? ""}
              onChange={(e) => onChangeProfile(e.target.value)}
              disabled={switchingProfile}
              className="min-w-0 max-w-[9rem] truncate rounded-md border border-input bg-background px-1.5 py-0.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-ring/20 disabled:opacity-60"
              title="Active profile"
            >
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {coachMarksVisible && (
              <CoachBubble
                title="Multiple job searches?"
                body="Switch your active filter profile here — each profile has its own set of filters."
                onDismiss={dismissCoachMarks}
              />
            )}
          </div>
        )}
      </header>

      <main className="flex-1 overflow-y-auto">{evalView}</main>

      <footer className="border-t px-4 py-2 text-xs text-muted-foreground">
        {showSoftUpgrade && (
          <button
            onClick={openPricing}
            className="mb-1 w-full text-center font-medium text-primary underline-offset-4 hover:underline"
          >
            Approaching your monthly limit — upgrade for unlimited
          </button>
        )}
        <div className="flex items-center justify-between">
          {usage ? (
            isFreePlan ? (
              <button
                onClick={openPricing}
                className="underline-offset-4 hover:text-foreground hover:underline"
                title="See Pro plan"
              >
                {usage.used} / {usage.limit} this month
              </button>
            ) : (
              <span>{usage.used} / {usage.limit} this month</span>
            )
          ) : (
            <span>Usage will appear after your first evaluation</span>
          )}
          <button onClick={openOptions} className="font-medium text-primary underline-offset-4 hover:underline">
            Settings
          </button>
        </div>
      </footer>
    </div>
  );
}

// One-time spotlight tooltip rendered next to a UI control (profile selector,
// Track button) on the user's first successful evaluation. The bubble below
// the control plus a small arrow on top is enough to draw the eye without
// needing a portal/overlay layer.
function CoachBubble({
  title,
  body,
  onDismiss,
}: {
  title: string;
  body: string;
  onDismiss: () => void;
}) {
  return (
    <div className="absolute right-0 top-full z-20 mt-2 w-64 rounded-lg border border-primary/30 bg-card p-3 text-card-foreground shadow-lg">
      <div className="absolute -top-1.5 right-3 h-3 w-3 rotate-45 border-l border-t border-primary/30 bg-card" />
      <div className="text-sm font-medium text-foreground">{title}</div>
      <div className="mt-1 text-xs leading-relaxed text-muted-foreground">{body}</div>
      <div className="mt-2 flex justify-end">
        <button
          onClick={onDismiss}
          className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Got it
        </button>
      </div>
    </div>
  );
}

function SignedOutExplainer({ onOpenOptions }: { onOpenOptions: () => void }) {
  const steps: Array<{ icon: React.ElementType; title: string; body: string }> = [
    {
      icon: ListChecks,
      title: "Define your filters",
      body: "Plain English — \"Must be fully remote\", \"Salary ≥ €6k/month\".",
    },
    {
      icon: Search,
      title: "Open any LinkedIn job",
      body: "We read the description while you browse — no extra clicks.",
    },
    {
      icon: CheckCircle2,
      title: "See ✅ / ❌ instantly",
      body: "Each filter gets a verdict and a quote from the description.",
    },
  ];
  return (
    <div className="p-4 text-sm">
      <p className="mb-4 text-muted-foreground">
        canvasjob checks every LinkedIn job against your own criteria so you don't read postings that
        don't fit. Sign in to start.
      </p>
      <ol className="mb-5 space-y-3">
        {steps.map(({ icon: Icon, title, body }, i) => (
          <li key={i} className="flex items-start gap-3">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Icon size={14} />
            </span>
            <div>
              <div className="font-medium text-foreground">{title}</div>
              <div className="text-xs text-muted-foreground">{body}</div>
            </div>
          </li>
        ))}
      </ol>
      <button
        onClick={onOpenOptions}
        className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Sign in to get started
      </button>
    </div>
  );
}
