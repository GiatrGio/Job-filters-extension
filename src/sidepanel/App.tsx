import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import type {
  ExtensionMessage,
  FilterProfileWithFilters,
  MeResponse,
  StoredEvaluation,
  UsageOut,
} from "@/shared/types";
import { api, ApiError } from "@/lib/api";
import { getLastEvaluation } from "@/lib/storage";
import { getAccessToken } from "@/lib/auth";
import { openPricing } from "@/lib/links";
import { ResultRow } from "./components/ResultRow";
import { TrackJobButton } from "./components/TrackJobButton";

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
    // Long-lived port so the background worker knows the panel is open.
    // When this port disconnects (panel closed), the background stops
    // evaluating jobs — which is the whole point: no work the user can't see.
    const port = chrome.runtime.connect({ name: "sidepanel" });

    void (async () => {
      const [last, token] = await Promise.all([getLastEvaluation(), getAccessToken()]);
      setSignedIn(!!token);
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
      chrome.runtime.onMessage.removeListener(onMessage);
      port.disconnect();
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
      return (
        <div className="p-4 text-sm text-foreground">
          <p className="mb-2">Sign in to start evaluating jobs against your filters.</p>
          <button
            onClick={openOptions}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Open settings
          </button>
        </div>
      );
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
      return (
        <div className="p-4 text-sm">
          <p className="font-medium text-destructive">
            {quota ? "Monthly quota reached." : "Evaluation failed."}
          </p>
          <p className="mt-1 text-muted-foreground">{status.message}</p>
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
            <TrackJobButton job={job} />
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
  const showSoftUpgrade = isFreePlan && usage !== null && usageRatio >= 0.8 && usageRatio < 1;

  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      <header className="flex min-h-12 items-center gap-2 border-b px-3 py-2">
        <h1 className="shrink-0 text-sm font-semibold tracking-tight">canvasjob</h1>
        {signedIn && (
          <button
            onClick={refreshFilters}
            disabled={refreshingFilters}
            className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
            title="Refresh filters"
            aria-label="Refresh filters"
          >
            <RefreshCw size={14} className={refreshingFilters ? "animate-spin" : ""} />
          </button>
        )}
        {signedIn && profiles.length > 0 && (
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
