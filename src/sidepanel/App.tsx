import { useEffect, useState } from "react";
import { CheckCircle2, CircleArrowUp, HelpCircle, ListChecks, RefreshCw, Search, Wrench } from "lucide-react";
import type {
  EvaluateFitResponse,
  ExtensionMessage,
  FilterProfileWithFilters,
  MeResponse,
  StoredEvaluation,
  UsageOut,
} from "@/shared/types";
import { DEFAULT_WARNING_THRESHOLD } from "@/shared/types";
import { api, ApiError } from "@/lib/api";
import {
  getLastEvaluation,
  getLastFit,
  getSeenCoachMarks,
  setSeenCoachMarks,
} from "@/lib/storage";
import { getAccessToken, SUPABASE_AUTH_STORAGE_KEY } from "@/lib/auth";
import { openHowItWorks, openSettings } from "@/lib/links";
import { ResultRow } from "./components/ResultRow";
import { JobFitWidget } from "./components/JobFitWidget";
import { TrackJobButton, type TrackedJobLimitInfo } from "./components/TrackJobButton";
import { CoverLetterButton } from "./components/CoverLetterButton";
import { CompanyResearchLinks } from "./components/CompanyResearchLinks";
import { AccountButton } from "./components/AccountButton";
import { SignInPanel } from "./components/SignInPanel";

const SIDEPANEL_PORT_NAME = "sidepanel";
const SIDEPANEL_HEARTBEAT_MS = 20_000;
const SIDEPANEL_RECONNECT_MS = 1_000;

type Status =
  | { kind: "idle" }
  | { kind: "loading"; jobId: string }
  | { kind: "ready"; evaluation: StoredEvaluation; cached: boolean }
  | { kind: "scrape_failed"; jobId: string }
  | { kind: "error"; message: string; status?: number; plan?: string; usage?: UsageOut };

// Fit is tracked separately from the evaluation Status because it arrives on
// its own message (progressive rendering). Each variant carries the jobId so a
// fit for a stale job is never shown against the current one.
type FitState =
  | { kind: "idle" }
  | { kind: "loading"; jobId: string }
  | { kind: "ready"; jobId: string; response: EvaluateFitResponse }
  | { kind: "error"; jobId: string };

// The first-run tour, shown one bubble at a time on the first evaluation.
// Ordered the way the panel reads top-to-bottom, so clicking "Got it" walks the
// eye down the page. A step is skipped when the control it points at isn't on
// screen (see `coachSteps` below).
type CoachMarkId = "coverLetter" | "trackJob" | "fit" | "profiles";

export const COACH_MARKS: { id: CoachMarkId; title: string; body: string }[] = [
  {
    id: "coverLetter",
    title: "Cover letter in one click",
    body: "Write a letter tailored to this job from your CV — edit it here, then download the PDF.",
  },
  {
    id: "trackJob",
    title: "Save jobs you like",
    body: "Click here to add this job to your tracker — change status, add notes on the website.",
  },
  {
    id: "fit",
    title: "Your match",
    body: "A 1–5 score showing how your CV lines up with this job, plus the strengths and gaps behind it.",
  },
  {
    id: "profiles",
    title: "Multiple job searches?",
    body: "Switch your active filter profile here — each profile has its own set of filters.",
  },
];

function usageOutgrewKnownFreeSnapshot(
  nextUsage: UsageOut | null | undefined,
  account: MeResponse | null,
): boolean {
  return account?.plan === "free" && nextUsage !== null && nextUsage !== undefined
    ? nextUsage.limit > account.usage.limit
    : false;
}

function isProEvaluationPlan(
  nextPlan: string | null | undefined,
  nextUsage: UsageOut | null | undefined,
  account: MeResponse | null,
): boolean {
  return nextPlan === "pro" || usageOutgrewKnownFreeSnapshot(nextUsage, account);
}

export default function App() {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [fitState, setFitState] = useState<FitState>({ kind: "idle" });
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [profiles, setProfiles] = useState<FilterProfileWithFilters[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [switchingProfile, setSwitchingProfile] = useState(false);
  const [refreshingFilters, setRefreshingFilters] = useState(false);
  // /me drives the upgrade CTAs (hidden for pro users) and the footer's
  // initial usage line — without it we'd have to wait for the first
  // evaluation response to know how much quota is left.
  const [me, setMe] = useState<MeResponse | null>(null);
  const [plan, setPlan] = useState<string | null>(null);
  // Tracked separately so the footer keeps showing the most recent value
  // during the next evaluation's loading state, instead of snapping back
  // to /me's session-start snapshot.
  const [usage, setUsage] = useState<UsageOut | null>(null);
  const [trackedJobLimit, setTrackedJobLimit] = useState<TrackedJobLimitInfo | null>(null);
  // Coach-marks progress: null = unknown (still loading it from storage),
  // otherwise the ids already clicked through. The tour shows the first unseen
  // step and ends when every id is in here.
  const [seenMarks, setSeenMarks] = useState<CoachMarkId[] | null>(null);

  function applyMeSnapshot(snapshot: MeResponse) {
    setMe(snapshot);
    setPlan(snapshot.plan);
    setUsage(snapshot.usage);
  }

  function applyEvaluationAccountSnapshot(nextPlan: string | undefined, nextUsage?: UsageOut) {
    if (nextPlan) {
      setPlan(nextPlan);
      setMe((current) =>
        current
          ? {
              ...current,
              plan: nextPlan,
              usage: nextUsage ?? current.usage,
            }
          : current,
      );
    }
    if (nextUsage) setUsage(nextUsage);
  }

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

    async function syncAuthState(options: { requestRescan?: boolean } = {}) {
      const token = await getAccessToken();
      if (!token) {
        setSignedIn(false);
        setProfiles([]);
        setActiveProfileId(null);
        setMe(null);
        setPlan(null);
        setUsage(null);
        setTrackedJobLimit(null);
        return;
      }

      setSignedIn(true);
      setTrackedJobLimit(null);
      await loadProfiles();
      api.me().then((m) => {
        applyMeSnapshot(m);
      }).catch(() => {
        // /me failures are non-fatal — the panel still works without plan info,
        // we just hide the upgrade CTAs.
      });

      if (options.requestRescan) {
        chrome.runtime.sendMessage({ type: "REQUEST_RESCAN" } satisfies ExtensionMessage).catch(() => {});
      }
    }

    connectPort();

    void (async () => {
      const [last, lastFit, seen] = await Promise.all([
        getLastEvaluation(),
        getLastFit(),
        getSeenCoachMarks(),
      ]);
      // Normalise against the current step list so a removed/renamed id in
      // storage can't stall the tour on a step that no longer exists.
      setSeenMarks(COACH_MARKS.filter((m) => seen.includes(m.id)).map((m) => m.id));
      if (last) {
        setStatus({ kind: "ready", evaluation: last, cached: last.response.cached });
        setUsage(last.response.usage);
        // Only restore the stored fit if it belongs to the same job.
        if (lastFit && lastFit.jobId === last.job.linkedin_job_id) {
          setFitState({ kind: "ready", jobId: lastFit.jobId, response: lastFit.response });
        }
      }
      await syncAuthState();
    })();

    const onMessage = (msg: ExtensionMessage) => {
      if (msg.type === "JOB_SCRAPED") {
        setTrackedJobLimit(null);
        setStatus({ kind: "loading", jobId: msg.job.linkedin_job_id });
        setFitState({ kind: "loading", jobId: msg.job.linkedin_job_id });
      } else if (msg.type === "FIT_READY") {
        setFitState({
          kind: "ready",
          jobId: msg.job.linkedin_job_id,
          response: msg.response,
        });
      } else if (msg.type === "FIT_ERROR") {
        setFitState({ kind: "error", jobId: msg.jobId });
      } else if (msg.type === "EVALUATION_READY") {
        setTrackedJobLimit(null);
        setStatus({
          kind: "ready",
          evaluation: { job: msg.job, response: msg.response, storedAt: Date.now() },
          cached: msg.response.cached,
        });
        applyEvaluationAccountSnapshot(msg.response.plan, msg.response.usage);
      } else if (msg.type === "SCRAPE_FAILED") {
        setTrackedJobLimit(null);
        setStatus({ kind: "scrape_failed", jobId: msg.jobId });
      } else if (msg.type === "EVALUATION_ERROR") {
        applyEvaluationAccountSnapshot(msg.plan, msg.usage);
        setStatus({
          kind: "error",
          message: msg.error,
          status: msg.status,
          plan: msg.plan,
          usage: msg.usage,
        });
      }
    };
    chrome.runtime.onMessage.addListener(onMessage);

    const onStorageChanged = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string,
    ) => {
      if (areaName !== "local" || !(SUPABASE_AUTH_STORAGE_KEY in changes)) return;
      void syncAuthState({ requestRescan: true });
    };
    chrome.storage.onChanged.addListener(onStorageChanged);

    return () => {
      stopped = true;
      clearHeartbeat();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      chrome.runtime.onMessage.removeListener(onMessage);
      chrome.storage.onChanged.removeListener(onStorageChanged);
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

  function openFilterSettings() {
    openSettings("filters");
  }

  async function markSeen(ids: CoachMarkId[]) {
    setSeenMarks(ids);
    await setSeenCoachMarks(ids);
  }

  // The tour runs whenever there's something to point at (a ready evaluation)
  // and we know how far the user already got — covering both the "fresh
  // evaluation just arrived" and "panel opened with a stored eval" paths. Steps
  // are dropped when their control isn't rendered: the profile selector only
  // exists once profiles have loaded, and counting it would promise a bubble
  // that never comes.
  const coachSteps =
    status.kind === "ready" && seenMarks !== null
      ? COACH_MARKS.filter(
          (m) => m.id !== "profiles" || (signedIn === true && profiles.length > 0),
        )
      : [];
  const activeCoachIndex = coachSteps.findIndex((m) => !seenMarks?.includes(m.id));
  const activeCoachMark = activeCoachIndex === -1 ? null : coachSteps[activeCoachIndex];

  // Renders the bubble only when `id` is the step the user is currently on, so
  // each anchor can ask for its own without knowing about the others.
  function coachBubble(id: CoachMarkId, placement: "above" | "below" = "below") {
    if (!activeCoachMark || activeCoachMark.id !== id) return null;
    return (
      <CoachBubble
        title={activeCoachMark.title}
        body={activeCoachMark.body}
        step={activeCoachIndex + 1}
        total={coachSteps.length}
        onNext={() => void markSeen([...(seenMarks ?? []), activeCoachMark.id])}
        onSkip={() => void markSeen(COACH_MARKS.map((m) => m.id))}
        placement={placement}
      />
    );
  }

  async function refreshFilters() {
    if (refreshingFilters) return;
    setRefreshingFilters(true);
    try {
      await loadProfiles();
      api.me().then((m) => {
        applyMeSnapshot(m);
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
    if (trackedJobLimit?.plan === "free") {
      return (
        <TrackedJobLimitPage
          limit={trackedJobLimit.limit}
          onBack={() => setTrackedJobLimit(null)}
        />
      );
    }

    if (signedIn === false) {
      return <SignedOutExplainer />;
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

    if (status.kind === "scrape_failed") {
      return <LinkedInChangedWall />;
    }

    if (status.kind === "error") {
      const quota = status.status === 402;
      const quotaUsage = status.usage ?? usage;
      const quotaPlan = status.plan ?? plan;
      const proQuota = quota && isProEvaluationPlan(quotaPlan, quotaUsage, me);
      const freeQuota = quota && quotaPlan === "free" && !proQuota;
      const title = quota
        ? proQuota
          ? "You've reached this month's Pro evaluation limit."
          : freeQuota
            ? "You've used your free evaluations for this month."
            : "You've reached this month's evaluation limit."
        : "Evaluation failed.";
      return (
        <div className="p-4 text-sm">
          <p className="font-medium text-destructive">
            {title}
          </p>
          {!quota && <p className="mt-1 text-muted-foreground">{status.message}</p>}
          {proQuota && (
            <p className="mt-1 leading-relaxed text-muted-foreground">
              You've hit the monthly safety limit for Pro evaluations. Email{" "}
              <a
                href="mailto:canvasjob@gmail.com"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                canvasjob@gmail.com
              </a>{" "}
              and we'll refresh your limit.
            </p>
          )}
          {freeQuota && (
            <button
              type="button"
              disabled
              className="mt-3 w-full cursor-not-allowed rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground opacity-60"
            >
              Pro coming soon...
            </button>
          )}
          {quota && !freeQuota && !proQuota && (
            <p className="mt-1 leading-relaxed text-muted-foreground">
              Refresh your account status and try again. If this keeps happening, email{" "}
              <a
                href="mailto:canvasjob@gmail.com"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                canvasjob@gmail.com
              </a>
              .
            </p>
          )}
        </div>
      );
    }

    const { evaluation } = status;
    const { job, response } = evaluation;
    // Resolve the fit widget's state against THIS job. Anything other than a
    // matching ready/error result reads as "still loading" → shimmer.
    const fitForJob =
      fitState.kind === "ready" && fitState.jobId === job.linkedin_job_id
        ? fitState.response
        : null;
    const fitErrored =
      fitState.kind === "error" && fitState.jobId === job.linkedin_job_id;
    const fitLoading = !fitForJob && !fitErrored;
    return (
      <div className="p-4">
        <div className="mb-3">
          <div className="flex items-center justify-between gap-3">
            <AccountButton />
            <div className="flex flex-wrap items-center justify-end gap-2">
              <div className="relative">
                <CoverLetterButton job={job} />
                {coachBubble("coverLetter")}
              </div>
              <div className="relative">
                <TrackJobButton job={job} onLimitExceeded={setTrackedJobLimit} />
                {coachBubble("trackJob")}
              </div>
            </div>
          </div>
          <div className="mt-1 text-base font-medium text-foreground">{job.job_title ?? "Job"}</div>
          <div className="text-sm text-muted-foreground">
            {[job.job_company, job.job_location].filter(Boolean).join(" · ")}
          </div>
          <CompanyResearchLinks company={job.job_company} />
        </div>

        {response.results.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            You haven't configured any filters yet.{" "}
            <button className="font-medium text-primary underline-offset-4 hover:underline" onClick={openFilterSettings}>
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
        <div className="relative mt-4">
          <JobFitWidget
            loading={fitLoading}
            response={fitForJob}
            errored={fitErrored}
            onOpenOptions={() => openSettings("fit")}
          />
          {/* "above": the match meter is now the last thing in the scroll
              area, so a bubble hanging below it would sit off-screen. */}
          {coachBubble("fit", "above")}
        </div>
      </div>
    );
  })();

  // The account icon sits at the top left of the job card, alongside the Cover
  // letter and Track this job buttons. Screens without a job card have no such
  // row, so it gets its own — otherwise Settings and Log out would be out of
  // reach until the user happened to open a LinkedIn job.
  const evalHeaderHasAccountButton =
    signedIn === true && status.kind === "ready" && trackedJobLimit?.plan !== "free";

  const inferredProFromUsage = usageOutgrewKnownFreeSnapshot(usage, me);
  const isProPlan = plan === "pro" || inferredProFromUsage;
  const isFreePlan = plan === "free" && !inferredProFromUsage;
  const usageRatio = usage && usage.limit > 0 ? usage.used / usage.limit : 0;
  const warningThreshold = usage?.warning_threshold ?? DEFAULT_WARNING_THRESHOLD;
  const showFreeUsageWarning =
    isFreePlan && usage !== null && usageRatio >= warningThreshold && usageRatio < 1;

  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      <main className="flex-1 overflow-y-auto">
        {signedIn === true && !evalHeaderHasAccountButton && (
          <div className="px-4 pt-4">
            <AccountButton />
          </div>
        )}
        {evalView}
      </main>

      <footer className="border-t px-3 py-2 text-xs text-muted-foreground">
        {showFreeUsageWarning && (
          <p className="mb-1 w-full text-center font-medium text-muted-foreground">
            Approaching your monthly evaluation limit
          </p>
        )}
        <div className="flex items-center justify-between">
          {usage ? (
            isFreePlan ? (
              <span>
                {usage.used} / {usage.limit} this month
              </span>
            ) : isProPlan ? (
              <span>Pro plan · Unlimited evaluations</span>
            ) : (
              <span>{signedIn ? "Checking plan..." : "Usage will appear after your first evaluation"}</span>
            )
          ) : (
            <span>Usage will appear after your first evaluation</span>
          )}
          {/* Also reachable from the account sheet, but that's two clicks and
              users didn't find it there. */}
          <button
            onClick={openFilterSettings}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Settings
          </button>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <button
            onClick={openHowItWorks}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title="How it works"
            aria-label="How it works"
          >
            <HelpCircle size={14} />
          </button>
          {signedIn && (
            <button
              onClick={refreshFilters}
              disabled={refreshingFilters}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
              title="Refresh filters"
              aria-label="Refresh filters"
            >
              <RefreshCw size={14} className={refreshingFilters ? "animate-spin" : ""} />
            </button>
          )}
          {signedIn && profiles.length > 0 && (
            <div className="relative min-w-0 flex-1">
              <select
                value={activeProfileId ?? ""}
                onChange={(e) => onChangeProfile(e.target.value)}
                disabled={switchingProfile}
                className="h-7 w-full truncate rounded-md border border-input bg-background px-1.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-ring/20 disabled:opacity-60"
                title="Active profile"
              >
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              {coachBubble("profiles", "above")}
            </div>
          )}
        </div>
      </footer>
    </div>
  );
}

// Shown when extraction failed outright (no description anywhere). LinkedIn
// ships DOM changes that break our selectors for some accounts; rather than a
// half-broken result, we tell the user plainly and reassure them a fix is
// coming. A diagnostic has already been sent in the background (Measure 3), so
// "we're already on it" is literally true.
function LinkedInChangedWall() {
  function retry() {
    chrome.runtime.sendMessage({ type: "REQUEST_RESCAN" } satisfies ExtensionMessage).catch(() => {});
  }

  return (
    <div className="flex min-h-full flex-col justify-center p-4 text-sm">
      <div className="mx-auto w-full max-w-sm rounded-lg border bg-card p-4 text-card-foreground shadow-sm">
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Wrench size={20} aria-hidden="true" />
        </div>
        <h2 className="text-base font-semibold text-foreground">
          We couldn&apos;t read this job
        </h2>
        <p className="mt-2 leading-relaxed text-muted-foreground">
          LinkedIn recently changed how this page is built, so we couldn&apos;t pull the
          job details to evaluate. We&apos;ve been notified automatically and are already
          working on a fix — please try again shortly.
        </p>
        <button
          onClick={retry}
          className="mt-4 w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

function TrackedJobLimitPage({
  limit,
  onBack,
}: {
  limit?: number;
  onBack: () => void;
}) {
  // The API sends the limit with its 402, so we normally name the number. If it
  // ever arrives without one, say it without a figure rather than quoting a
  // hardcoded limit that may no longer be what the server enforces.
  const allowance =
    limit === undefined
      ? "You've filled every tracked-job slot the Free plan includes."
      : `Free includes ${limit} tracked jobs at once.`;
  return (
    <div className="flex min-h-full flex-col justify-center p-4 text-sm">
      <div className="mx-auto w-full max-w-sm rounded-lg border bg-card p-4 text-card-foreground shadow-sm">
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
          <CircleArrowUp size={20} aria-hidden="true" />
        </div>
        <h2 className="text-base font-semibold text-foreground">
          You&apos;ve reached the Free plan tracking limit
        </h2>
        <p className="mt-2 leading-relaxed text-muted-foreground">
          {allowance} Remove a job from your tracker to save another one during
          beta.
        </p>
        <div className="mt-4 space-y-2">
          <button
            type="button"
            disabled
            className="w-full cursor-not-allowed rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground opacity-60"
          >
            Pro coming soon...
          </button>
          <button
            onClick={onBack}
            className="w-full rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Back to job
          </button>
        </div>
      </div>
    </div>
  );
}

// One step of the first-run tour, rendered next to the control it describes
// (the caller supplies a `relative` wrapper). Only one is on screen at a time:
// "Got it" advances to the next, "Skip tutorial" ends the rest — and the
// counter tells the user how much is left before they commit to either.
function CoachBubble({
  title,
  body,
  step,
  total,
  onNext,
  onSkip,
  placement = "below",
}: {
  title: string;
  body: string;
  step: number;
  total: number;
  onNext: () => void;
  onSkip: () => void;
  placement?: "above" | "below";
}) {
  const positionClass = placement === "above" ? "bottom-full mb-2" : "top-full mt-2";
  const arrowClass =
    placement === "above"
      ? "-bottom-1.5 right-3 border-b border-r"
      : "-top-1.5 right-3 border-l border-t";

  return (
    <div
      className={`absolute right-0 z-20 w-64 rounded-lg border border-primary/30 bg-card p-3 text-card-foreground shadow-lg ${positionClass}`}
    >
      <div className={`absolute h-3 w-3 rotate-45 border-primary/30 bg-card ${arrowClass}`} />
      <div className="text-sm font-medium text-foreground">{title}</div>
      <div className="mt-1 text-xs leading-relaxed text-muted-foreground">{body}</div>
      <div className="mt-2.5 flex items-center gap-2">
        {step < total && (
          <button
            onClick={onSkip}
            className="text-[11px] font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
          >
            Skip tutorial
          </button>
        )}
        <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
          {step}/{total}
        </span>
        <button
          onClick={onNext}
          className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Got it
        </button>
      </div>
    </div>
  );
}

function SignedOutExplainer() {
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
      body: "Each filter gets a verdict with evidence in your language.",
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
      <SignInPanel />
    </div>
  );
}
