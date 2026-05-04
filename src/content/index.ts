// Content script — runs on linkedin.com/jobs/*.
//
// Responsibilities:
//   1. Detect when the user is looking at a job posting (URL change or SPA nav).
//   2. Wait for the DOM to be populated, then scrape the job.
//   3. Send the scraped job to the background worker, which handles caching
//      and backend calls.
//
// We debounce aggressively because LinkedIn's SPA re-renders a lot and we
// want at most one JOB_SCRAPED message per job view.

import { getJobIdFromUrl, waitForJobContent } from "@/lib/linkedin";
import type { ExtensionMessage, ScrapedJob } from "@/shared/types";

const DEBOUNCE_MS = 1500;

type CanvasjobContentState = {
  rescan: () => void;
};

type CanvasjobWindow = typeof window & {
  __canvasjobContentScript?: CanvasjobContentState;
};

// --- URL change detection ----------------------------------------------------
// LinkedIn is an SPA, so we can't rely on page loads. Listen for:
//   1. popstate (back/forward)
//   2. pushState/replaceState (programmatic navigation — monkey-patched below)
//   3. MutationObserver fallback, for the rare case the SPA updates the DOM
//      without changing the URL.
// -----------------------------------------------------------------------------

const canvasWindow = window as CanvasjobWindow;
if (canvasWindow.__canvasjobContentScript) {
  canvasWindow.__canvasjobContentScript.rescan();
} else {
  canvasWindow.__canvasjobContentScript = install();
}

function install(): CanvasjobContentState {
  let lastHandledJobId: string | null = null;
  let pendingTimer: ReturnType<typeof setTimeout> | null = null;

  function send(message: ExtensionMessage): void {
    try {
      chrome.runtime.sendMessage(message).catch((err) => {
        // This commonly happens after reloading the extension while LinkedIn tabs
        // stay open. The background worker will inject a fresh content script on
        // the next side-panel rescan.
        // eslint-disable-next-line no-console
        console.debug("[canvasjob] Could not send message from content script", err);
      });
    } catch (err) {
      // This commonly happens after reloading the extension while LinkedIn tabs
      // stay open. The background worker will inject a fresh content script on
      // the next side-panel rescan.
      // eslint-disable-next-line no-console
      console.debug("[canvasjob] Could not send message from content script", err);
    }
  }

  async function handlePossibleJobView(): Promise<void> {
    const jobId = getJobIdFromUrl();
    if (!jobId) return;
    if (jobId === lastHandledJobId) return;

    const job: ScrapedJob | null = await waitForJobContent();
    if (!job) return;

    lastHandledJobId = job.linkedin_job_id;
    send({ type: "JOB_SCRAPED", job });
  }

  function scheduleHandle(): void {
    if (pendingTimer) clearTimeout(pendingTimer);
    pendingTimer = setTimeout(() => {
      pendingTimer = null;
      void handlePossibleJobView();
    }, DEBOUNCE_MS);
  }

  function rescan(): void {
    lastHandledJobId = null;
    scheduleHandle();
  }

  (function hookHistory() {
    const fire = () => window.dispatchEvent(new Event("locationchange"));
    const origPush = history.pushState;
    const origReplace = history.replaceState;
    history.pushState = function (...args) {
      const r = origPush.apply(this, args);
      fire();
      return r;
    };
    history.replaceState = function (...args) {
      const r = origReplace.apply(this, args);
      fire();
      return r;
    };
    window.addEventListener("popstate", fire);
  })();

  window.addEventListener("locationchange", scheduleHandle);

  const observer = new MutationObserver(() => {
    const currentId = getJobIdFromUrl();
    if (currentId && currentId !== lastHandledJobId) scheduleHandle();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // The background worker asks for a re-scan when the side panel opens, so the
  // user sees a result for the job they're already viewing.
  chrome.runtime.onMessage.addListener((message: ExtensionMessage) => {
    if (message.type === "RESCAN") {
      rescan();
    }
    return false;
  });

  // Handle the initial load.
  scheduleHandle();

  return { rescan };
}
