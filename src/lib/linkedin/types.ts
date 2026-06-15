// The LinkedIn extraction adapter.
//
// All LinkedIn-specific scraping lives behind the `JobExtractor` interface so a
// DOM change can be patched in one small, versioned module (jobs-v1, jobs-v2, …)
// without touching the content script, background worker, or side panel. The
// registry runs each extractor in order and returns the first usable result.
//
// `ExtractionResult` is deliberately richer than the final `ScrapedJob`: it
// records *which* strategy produced each field (a CSS selector, the document
// <title>, an anchor heuristic, …) and which fields were missing. That
// provenance drives two things downstream:
//   1. Measure 2 — deciding whether to evaluate, evaluate-with-warning, or show
//      the "LinkedIn changed" wall.
//   2. Measure 3 — the telemetry the diagnostics request sends so we can see
//      *what* broke without asking the user to run console scripts.

import type { ScrapedJob } from "@/shared/types";

// ok      — every field we require for a clean evaluation was found
//           (title, company, description; location is optional).
// partial — the description was found, but title and/or company were not. We
//           still evaluate (the description is what the LLM reads) but fire a
//           diagnostic so we learn which identity selector broke.
// failed  — no description anywhere. There's nothing to evaluate; the side
//           panel shows the wall and we fire a diagnostic.
export type ExtractionOutcome = "ok" | "partial" | "failed";

export type JobField = "title" | "company" | "location" | "description";

// How a single field was (or wasn't) read. `source` is a short, stable label
// for the strategy that produced the value — e.g. a selector string,
// "doc-title", or "anchor" — or null when nothing matched. It never contains
// page content, only the name of the strategy, so it is safe to log.
export interface FieldProvenance {
  value: string | null;
  source: string | null;
}

export type ExtractionFields = Record<JobField, FieldProvenance>;

export interface ExtractionResult {
  // Which extractor produced this result, e.g. "jobs-v1". Lets diagnostics and
  // logs say exactly which module handled (or failed on) the page.
  extractor: string;
  jobId: string;
  outcome: ExtractionOutcome;
  // The assembled job when outcome is "ok" or "partial"; null when "failed"
  // (no description means nothing to evaluate).
  job: ScrapedJob | null;
  fields: ExtractionFields;
  // Field names that came back null, in a stable order. Drives the wall-vs-
  // evaluate decision and the diagnostic summary, e.g. ["title", "company"].
  missing: JobField[];
}

// Everything an extractor needs to read a job, gathered once by the registry so
// each extractor doesn't re-walk the iframe tree.
export interface ExtractionContext {
  jobId: string;
  // The top document plus every same-origin iframe (LinkedIn renders the job
  // into a /preload/ iframe — see jobs-v1).
  documents: Document[];
  // The TOP document's <title>. The single most stable cross-variant hook for
  // the job's identity; always read from the top frame (an iframe's title is
  // often the feed, e.g. "(14) LinkedIn").
  docTitle: string;
}

export interface JobExtractor {
  // Stable identifier, e.g. "jobs-v1". Also the label used in diagnostics/logs.
  readonly id: string;
  // Returns this extractor's best attempt. A "failed" result is still returned
  // (not thrown) so the registry can fall through to the next extractor and,
  // failing all of them, hand the richest failure back for diagnostics.
  extract(ctx: ExtractionContext): ExtractionResult;
}
