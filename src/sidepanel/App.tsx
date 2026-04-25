import { useEffect, useState } from "react";
import type {
  ExtensionMessage,
  FilterProfileWithFilters,
  StoredEvaluation,
} from "@/shared/types";
import { api, ApiError } from "@/lib/api";
import { getLastEvaluation } from "@/lib/storage";
import { getAccessToken } from "@/lib/auth";
import { ResultRow } from "./components/ResultRow";

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
      if (last) setStatus({ kind: "ready", evaluation: last, cached: last.response.cached });
      if (token) await loadProfiles();
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

  const evalView = (() => {
    if (signedIn === false) {
      return (
        <div className="p-4 text-sm text-gray-700">
          <p className="mb-2">Sign in to start evaluating jobs against your filters.</p>
          <button
            onClick={openOptions}
            className="px-3 py-1.5 rounded bg-brand-accent text-white text-sm"
          >
            Open settings
          </button>
        </div>
      );
    }

    if (status.kind === "idle") {
      return (
        <div className="p-4 text-sm text-gray-600">
          Open a LinkedIn job posting to see an evaluation.
        </div>
      );
    }

    if (status.kind === "loading") {
      return (
        <div className="p-4 text-sm text-gray-600">Evaluating job {status.jobId}…</div>
      );
    }

    if (status.kind === "error") {
      const quota = status.status === 402;
      return (
        <div className="p-4 text-sm text-red-700">
          <p className="font-medium">
            {quota ? "Monthly quota reached." : "Evaluation failed."}
          </p>
          <p className="mt-1 text-gray-600">{status.message}</p>
        </div>
      );
    }

    const { evaluation, cached } = status;
    const { job, response } = evaluation;
    return (
      <div className="p-4">
        <div className="mb-3">
          <div className="text-xs text-gray-500 uppercase tracking-wide">
            {cached ? "Cached" : "Fresh"} evaluation
          </div>
          <div className="text-base font-medium text-gray-900">{job.job_title ?? "Job"}</div>
          <div className="text-sm text-gray-600">
            {[job.job_company, job.job_location].filter(Boolean).join(" · ")}
          </div>
        </div>
        {response.results.length === 0 ? (
          <div className="text-sm text-gray-600">
            You haven't configured any filters yet.{" "}
            <button className="underline" onClick={openOptions}>
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

  const usage = status.kind === "ready" ? status.evaluation.response.usage : null;

  return (
    <div className="flex h-full flex-col bg-white text-gray-900">
      <header className="flex items-center gap-2 border-b border-gray-200 px-3 py-2">
        <h1 className="text-sm font-semibold tracking-tight shrink-0">LinkedIn Job Filter</h1>
        {signedIn && profiles.length > 0 && (
          <select
            value={activeProfileId ?? ""}
            onChange={(e) => onChangeProfile(e.target.value)}
            disabled={switchingProfile}
            className="ml-auto min-w-0 max-w-[10rem] truncate rounded border border-gray-200 bg-white px-1.5 py-0.5 text-xs text-gray-700 disabled:opacity-60"
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

      <footer className="border-t border-gray-200 px-4 py-2 text-xs text-gray-500 flex items-center justify-between">
        <span>
          {usage
            ? `${usage.used} / ${usage.limit} this month`
            : "Usage will appear after your first evaluation"}
        </span>
        <button onClick={openOptions} className="underline">
          Settings
        </button>
      </footer>
    </div>
  );
}
