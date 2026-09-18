// Job memory — "you have opened this job before".
//
// A device-local index of every job the user has opened, plus the cheap summary
// of what we already told them about it (filter verdict, CV match, tracker
// state). Two surfaces read it:
//
//   1. The side panel, which shows a chip row under the job title.
//   2. The content script, which badges the job cards in LinkedIn's list so a
//      re-run of the same search shows what the user already decided.
//
// Everything here is local. The backend's `evaluations` table looks like it
// could serve the same purpose, but it can't: it is keyed on the filters hash
// (so any filter edit makes an old job look new) and a row is only written on a
// cache MISS, so a job viewed with the side panel closed leaves no trace there.
//
// Size: one storage key holds the whole index. With the caps below the worst
// case is roughly 250 * ~450B (entries that still carry evidence lines) plus
// 3,750 * ~90B, i.e. well under half a megabyte — comfortably inside the 10MB
// chrome.storage.local budget, and cheap enough to rewrite on every visit.

import { getJobMemoryIndex, setJobMemoryIndex } from "./storage";
import type {
  Application,
  EvaluationResult,
  JobEvidenceLine,
  JobMemoryEntry,
  JobMemoryIndex,
  JobVerdictSummary,
} from "@/shared/types";

// Repeat views of the same job inside this window count as ONE visit. Without
// it a re-scan (profile switch, panel reopen, LinkedIn re-rendering the pane)
// would inflate the count and the "3rd visit" chip would stop meaning anything.
export const VISIT_COALESCE_MS = 30 * 60 * 1000;

// Hard caps. Oldest-first eviction by last visit.
export const MAX_JOBS = 4_000;
// Only the most recently seen jobs keep their evidence lines (the hover card on
// a job card). Beyond this the entry keeps its counts and dates, which is what
// the badges themselves need.
export const EVIDENCE_TIER = 250;
export const TTL_MS = 180 * 24 * 60 * 60 * 1000;

const EVIDENCE_MAX_LINES = 6;
const EVIDENCE_FILTER_MAX = 120;
const EVIDENCE_TEXT_MAX = 160;
const TITLE_MAX = 90;

export const EMPTY_INDEX: JobMemoryIndex = { version: 1, activeFiltersSig: null, jobs: {} };

// --- reading -----------------------------------------------------------------

// Always returns a usable index: a missing key (first run) and a shape written
// by a future/older version both read as empty rather than throwing into the
// content script, where a failure would break LinkedIn's page for the user.
export async function readJobMemory(): Promise<JobMemoryIndex> {
  try {
    const stored = await getJobMemoryIndex();
    if (!stored || stored.version !== 1 || typeof stored.jobs !== "object" || stored.jobs === null) {
      return { ...EMPTY_INDEX, jobs: {} };
    }
    return stored;
  } catch {
    return { ...EMPTY_INDEX, jobs: {} };
  }
}

export function getEntry(index: JobMemoryIndex, jobId: string): JobMemoryEntry | null {
  return index.jobs[jobId] ?? null;
}

// A remembered verdict is only shown while it still describes the user's
// current filters — same rule as the backend cache, enforced client-side.
export function isVerdictCurrent(index: JobMemoryIndex, entry: JobMemoryEntry | null): boolean {
  return Boolean(entry?.verdict && index.activeFiltersSig && entry.verdict.sig === index.activeFiltersSig);
}

// --- writing -----------------------------------------------------------------

// All mutations are read-modify-write on one key, so they are serialised within
// a context. Two contexts (background + side panel) can still interleave, but
// each write merges into a freshly-read index and only touches its own fields,
// so the worst case is a lost update on one field of one job — not corruption.
let writeQueue: Promise<unknown> = Promise.resolve();

function update(mutate: (index: JobMemoryIndex) => void): Promise<void> {
  const run = writeQueue.then(async () => {
    const index = await readJobMemory();
    mutate(index);
    prune(index);
    await setJobMemoryIndex(index);
  });
  writeQueue = run.catch(() => {});
  return run;
}

function ensureEntry(index: JobMemoryIndex, jobId: string, now: number): JobMemoryEntry {
  const existing = index.jobs[jobId];
  if (existing) return existing;
  // A job we only know from the tracker (never opened in this browser) still
  // gets an entry so its "Applied" badge can show, but with zero visits: it
  // must not claim the user opened it here.
  const created: JobMemoryEntry = { firstSeenAt: now, lastSeenAt: now, visits: 0 };
  index.jobs[jobId] = created;
  return created;
}

function trimTitle(title: string | null | undefined): string | undefined {
  const t = title?.trim();
  if (!t) return undefined;
  return t.length > TITLE_MAX ? `${t.slice(0, TITLE_MAX - 1)}…` : t;
}

/**
 * Record that the user opened a job. Call this only once the visit is real —
 * the content script applies a dwell gate first, because LinkedIn auto-selects
 * the first card of every search result and nobody would call that "opening" it.
 */
export function recordJobVisit(
  jobId: string,
  { title, at = Date.now() }: { title?: string | null; at?: number } = {},
): Promise<void> {
  return update((index) => {
    const entry = ensureEntry(index, jobId, at);
    const coalesced = entry.visits > 0 && at - entry.lastSeenAt < VISIT_COALESCE_MS;
    if (!coalesced) entry.visits += 1;
    entry.lastSeenAt = at;
    entry.firstSeenAt = Math.min(entry.firstSeenAt, at);
    const trimmed = trimTitle(title);
    if (trimmed) entry.title = trimmed;
  });
}

/**
 * Remember what the filter checklist said. Also records the signature of the
 * filter set as the *active* one — the most recent evaluation is by definition
 * the user's current filters, which is how stale verdicts get hidden without
 * the content script needing to call the API.
 */
export function recordJobVerdict(
  jobId: string,
  results: EvaluationResult[],
  { title, at = Date.now() }: { title?: string | null; at?: number } = {},
): Promise<void> {
  const summary = summarizeResults(results, at);
  return update((index) => {
    index.activeFiltersSig = summary.sig;
    const entry = ensureEntry(index, jobId, at);
    entry.verdict = summary;
    const trimmed = trimTitle(title);
    if (trimmed) entry.title = trimmed;
  });
}

export function recordJobFit(jobId: string, score: number | null | undefined): Promise<void> {
  if (typeof score !== "number" || Number.isNaN(score)) return Promise.resolve();
  return update((index) => {
    ensureEntry(index, jobId, Date.now()).fit = score;
  });
}

// `null` means "confirmed not tracked" — the panel probes this on every job, so
// it is also how an entry recovers after the user deletes a tracked job.
export function recordJobTracker(jobId: string, application: Application | null): Promise<void> {
  return update((index) => {
    const entry = ensureEntry(index, jobId, Date.now());
    if (application === null) {
      delete entry.tracker;
      return;
    }
    entry.tracker = { status: application.status, appliedAt: application.applied_at };
    const trimmed = trimTitle(application.title);
    if (trimmed && !entry.title) entry.title = trimmed;
  });
}

/**
 * Merge the whole tracker in one go. The account sheet already lists
 * applications for its meter, so this is free — and it is what makes a job
 * applied to on another device (or from the website) still show its badge in
 * the list here.
 */
export function recordTrackedJobs(applications: Application[]): Promise<void> {
  const linkedin = applications.filter((a) => a.source === "linkedin");
  return update((index) => {
    const now = Date.now();
    const seen = new Set<string>();
    for (const app of linkedin) {
      seen.add(app.external_id);
      const entry = ensureEntry(index, app.external_id, now);
      entry.tracker = { status: app.status, appliedAt: app.applied_at };
      const trimmed = trimTitle(app.title);
      if (trimmed && !entry.title) entry.title = trimmed;
    }
    // Anything we thought was tracked but the server no longer lists was
    // deleted elsewhere; drop the badge rather than showing a ghost.
    for (const [jobId, entry] of Object.entries(index.jobs)) {
      if (entry.tracker && !seen.has(jobId)) delete entry.tracker;
    }
  });
}

// --- summarising -------------------------------------------------------------

export function summarizeResults(results: EvaluationResult[], at = Date.now()): JobVerdictSummary {
  // Open-ended "question" filters have no pass/fail axis, so they are not part
  // of the "N of M" count — counting them would make a job look like it failed
  // a criterion it was never asked about.
  const criteria = results.filter((r) => r.kind !== "question");
  const passed = criteria.filter((r) => r.pass === true).length;
  const failed = criteria.filter((r) => r.pass === false).length;
  return {
    sig: filtersSignature(results.map((r) => r.filter)),
    passed,
    failed,
    unknown: criteria.length - passed - failed,
    total: criteria.length,
    at,
    lines: results.slice(0, EVIDENCE_MAX_LINES).map(toEvidenceLine),
  };
}

function toEvidenceLine(result: EvaluationResult): JobEvidenceLine {
  return {
    filter: clip(result.filter, EVIDENCE_FILTER_MAX),
    pass: result.pass,
    evidence: clip(result.evidence, EVIDENCE_TEXT_MAX),
  };
}

function clip(value: string, max: number): string {
  const v = (value ?? "").trim();
  return v.length > max ? `${v.slice(0, max - 1)}…` : v;
}

/**
 * Cheap, stable signature of an ordered filter set (djb2). Not a security
 * hash — it only has to change when the filters change, which is what tells us
 * a remembered verdict no longer describes the user's current criteria.
 */
export function filtersSignature(filterTexts: string[]): string {
  let h = 5381;
  for (const text of filterTexts) {
    for (let i = 0; i < text.length; i++) {
      h = ((h << 5) + h) ^ text.charCodeAt(i);
    }
    h = ((h << 5) + h) ^ 0x1f; // separator, so ["ab","c"] ≠ ["a","bc"]
  }
  return (h >>> 0).toString(36);
}

// --- pruning -----------------------------------------------------------------

export function prune(index: JobMemoryIndex, now = Date.now()): void {
  const entries = Object.entries(index.jobs);

  for (const [jobId, entry] of entries) {
    // Tracked jobs never expire: "did I already apply to this?" is the one
    // question that still matters months later.
    if (!entry.tracker && now - entry.lastSeenAt > TTL_MS) delete index.jobs[jobId];
  }

  const live = Object.entries(index.jobs).sort((a, b) => b[1].lastSeenAt - a[1].lastSeenAt);
  live.forEach(([jobId, entry], position) => {
    if (position >= MAX_JOBS) {
      delete index.jobs[jobId];
      return;
    }
    // Past the evidence tier an entry keeps its counts but loses the quoted
    // lines — the badges still render, only the hover detail is gone.
    if (position >= EVIDENCE_TIER && entry.verdict?.lines) delete entry.verdict.lines;
  });
}

// --- presentation ------------------------------------------------------------

// Nothing renders the visit count today: LinkedIn already marks viewed jobs,
// so a badge of ours beside it was redundant (2026-09-18). The record is still
// kept — `lastSeenAt` is what the index is pruned by, and it is the substrate
// for anything we might one day say that LinkedIn's own flag cannot.

// Short, human date for a past visit: "Today", "Yesterday", "6 Sep", and a year
// once it is far enough back to be ambiguous.
export function formatSeenDate(timestamp: number, now = Date.now()): string {
  const then = new Date(timestamp);
  const today = startOfDay(new Date(now));
  const days = Math.round((today.getTime() - startOfDay(then).getTime()) / (24 * 60 * 60 * 1000));
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  const options: Intl.DateTimeFormatOptions =
    days > 300 ? { day: "numeric", month: "short", year: "numeric" } : { day: "numeric", month: "short" };
  return new Intl.DateTimeFormat(undefined, options).format(then);
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
