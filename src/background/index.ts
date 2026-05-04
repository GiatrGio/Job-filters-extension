// Background service worker.
//
// Responsibilities:
//   1. Track whether the side panel is currently open (via a long-lived port).
//   2. Route messages from the content script — but only evaluate when the
//      side panel is open, so users don't burn quota on background work they
//      can't see.
//   3. Call the backend /evaluate endpoint (with Supabase JWT). The backend
//      owns the evaluation cache, keyed on (user, job, filters_hash), so it
//      stays correct when filters change.
//   4. Forward the result to the side panel (and persist as "last" so the
//      panel can render immediately on subsequent opens).
//
// Service workers can be terminated between events. The connected-port set
// below is recreated on wake; that's fine because if the service worker died
// the side panel's port disconnected too, and the panel will reconnect on its
// next render.

import { api, ApiError } from "@/lib/api";
import { ENV } from "@/lib/env";
import { setLastEvaluation } from "@/lib/storage";
import type { ExtensionMessage, ScrapedJob, StoredEvaluation } from "@/shared/types";

const SIDEPANEL_PORT_NAME = "sidepanel";
const sidepanelPorts = new Set<chrome.runtime.Port>();

function isSidepanelOpen(): boolean {
  return sidepanelPorts.size > 0;
}

async function forwardToSidepanel(message: ExtensionMessage): Promise<void> {
  // `sendMessage` with no target delivers to all extension pages/workers,
  // which includes the side panel if it's open. Errors here mean the panel
  // isn't open — not a problem, the panel will pull from storage on open.
  chrome.runtime.sendMessage(message).catch(() => {});
}

async function evaluateJob(job: ScrapedJob): Promise<void> {
  try {
    const response = await api.evaluate(job);
    const stored: StoredEvaluation = { job, response, storedAt: Date.now() };
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
}

async function handleScrapedJob(job: ScrapedJob): Promise<void> {
  if (!isSidepanelOpen()) {
    return;
  }
  await forwardToSidepanel({ type: "JOB_SCRAPED", job });
  await evaluateJob(job);
}

// Ask any active LinkedIn tabs to re-emit their current job. Used when the
// side panel just opened, so the user sees a result for the job they're
// already viewing instead of having to navigate away and back.
async function requestRescanFromLinkedInTabs(): Promise<void> {
  const tabs = await chrome.tabs.query({ url: "https://www.linkedin.com/jobs/*" });
  for (const tab of tabs) {
    if (tab.id === undefined) continue;
    void rescanLinkedInTab(tab.id);
  }
}

function getContentScriptFiles(): string[] {
  const manifest = chrome.runtime.getManifest();
  return (
    manifest.content_scripts
      ?.filter((script) => script.matches?.some((match) => match.includes("linkedin.com/jobs")))
      .flatMap((script) => script.js ?? []) ?? []
  );
}

async function injectContentScript(tabId: number): Promise<void> {
  const files = getContentScriptFiles();
  if (files.length === 0) return;
  await chrome.scripting.executeScript({
    target: { tabId },
    files,
  });
}

async function rescanLinkedInTab(tabId: number): Promise<void> {
  const rescanMessage = { type: "RESCAN" } satisfies ExtensionMessage;
  try {
    await chrome.tabs.sendMessage(tabId, rescanMessage);
  } catch {
    // Existing LinkedIn tabs do not always receive the new content script after
    // an extension reload. Inject it on demand, then ask it to emit the current
    // job again.
    try {
      await injectContentScript(tabId);
      await chrome.tabs.sendMessage(tabId, rescanMessage);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.debug("[canvasjob] Could not rescan LinkedIn tab", tabId, err);
    }
  }
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== SIDEPANEL_PORT_NAME) return;
  sidepanelPorts.add(port);
  port.onDisconnect.addListener(() => {
    sidepanelPorts.delete(port);
  });
  void requestRescanFromLinkedInTabs();
});

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, _sendResponse) => {
  if (message.type === "JOB_SCRAPED") {
    void handleScrapedJob(message.job);
    return false;
  }
  if (message.type === "REQUEST_EVALUATION") {
    // Manual re-evaluate from the side panel.
    void evaluateJob(message.job);
    return false;
  }
  if (message.type === "REQUEST_RESCAN") {
    // Side panel asks for the current job to be re-emitted (e.g. after the
    // user switched the active profile).
    void requestRescanFromLinkedInTabs();
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

// On install, make the side-panel button work on LinkedIn tabs by default,
// and on a fresh install (not update / browser reload) open the website's
// "How it works" anchor so the user gets the 30-second mental model before
// they touch anything.
chrome.runtime.onInstalled.addListener((details) => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch(() => {});
  if (details.reason === "install") {
    chrome.tabs.create({ url: `${ENV.WEB_URL}/#how-it-works`, active: true }).catch(() => {});
  }
});
