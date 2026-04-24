// Background service worker.
//
// Responsibilities:
//   1. Route messages from the content script.
//   2. Check local chrome.storage cache before calling the backend.
//   3. Call the backend /evaluate endpoint (with Supabase JWT).
//   4. Forward the result to the side panel (and persist as "last" so the
//      panel can render immediately on open).
//   5. Open the side panel the first time a job is scraped in a tab, so the
//      UX matches Krib Inzicht.
//
// Service workers can be terminated between events, so we never hold state
// in module scope beyond what survives a restart — anything stateful lives
// in chrome.storage.

import { api, ApiError } from "@/lib/api";
import {
  getAutoEvalEnabled,
  getCachedJobResult,
  putCachedJobResult,
  setLastEvaluation,
} from "@/lib/storage";
import type { ExtensionMessage, ScrapedJob, StoredEvaluation } from "@/shared/types";

async function forwardToSidepanel(message: ExtensionMessage): Promise<void> {
  // `sendMessage` with no target delivers to all extension pages/workers,
  // which includes the side panel if it's open. Errors here mean the panel
  // isn't open — not a problem, the panel will pull from storage on open.
  chrome.runtime.sendMessage(message).catch(() => {});
}

async function evaluateJob(job: ScrapedJob, tabId?: number): Promise<void> {
  const cached = await getCachedJobResult(job.linkedin_job_id);
  if (cached) {
    await setLastEvaluation(cached);
    await forwardToSidepanel({
      type: "EVALUATION_READY",
      job: cached.job,
      response: cached.response,
    });
    return;
  }

  try {
    const response = await api.evaluate(job);
    const stored: StoredEvaluation = { job, response, storedAt: Date.now() };
    await putCachedJobResult(stored);
    await setLastEvaluation(stored);
    await forwardToSidepanel({ type: "EVALUATION_READY", job, response });
  } catch (err) {
    const status = err instanceof ApiError ? err.status : undefined;
    const message = err instanceof Error ? err.message : String(err);
    await forwardToSidepanel({
      type: "EVALUATION_ERROR",
      jobId: job.linkedin_job_id,
      error: message,
      status,
    });
  }

  // Side-effect: surface the side panel on first evaluation per tab.
  if (tabId !== undefined) {
    try {
      await chrome.sidePanel.open({ tabId });
    } catch {
      // Requires a user gesture in some Chrome versions; safe to ignore.
    }
  }
}

chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, _sendResponse) => {
  if (message.type === "JOB_SCRAPED") {
    void (async () => {
      if (!(await getAutoEvalEnabled())) return;
      await evaluateJob(message.job, sender.tab?.id);
    })();
    return false;
  }
  if (message.type === "REQUEST_EVALUATION") {
    // Manual re-evaluate from the side panel (e.g. after toggling auto off/on).
    void evaluateJob(message.job, sender.tab?.id);
    return false;
  }
  return false;
});

// Clicking the toolbar icon opens the side panel for the current tab.
chrome.action.onClicked.addListener((tab) => {
  if (tab.id !== undefined) {
    chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
  }
});

// On install, make the side-panel button work on LinkedIn tabs by default.
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch(() => {});
});
