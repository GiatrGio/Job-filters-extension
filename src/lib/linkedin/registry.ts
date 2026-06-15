// Extractor registry + orchestration.
//
// `extractJob` runs each registered extractor in order and returns the first
// usable result (outcome "ok" or "partial"). If every extractor fails, it
// returns the richest failure so the caller can still show the wall and fire a
// diagnostic. Add new variants here, newest first, so the most specific
// extractor gets the first attempt.

import { candidateDocuments } from "./dom";
import { getJobIdFromUrl } from "./identity";
import { jobsV1Extractor } from "./jobs-v1.extractor";
import type { ExtractionContext, ExtractionResult, JobExtractor } from "./types";
import type { ScrapedJob } from "@/shared/types";

// Ordered newest → oldest. Today there is only one; a future variant (jobs-v2)
// would go ahead of jobs-v1.
const EXTRACTORS: JobExtractor[] = [jobsV1Extractor];

// Returns null only when this isn't a job page at all (no job id in the URL).
// Otherwise always returns a result — possibly "failed" — so callers get the
// provenance they need for the wall and diagnostics.
export function extractJob(): ExtractionResult | null {
  const jobId = getJobIdFromUrl();
  if (!jobId) return null;

  const ctx: ExtractionContext = {
    jobId,
    documents: candidateDocuments(),
    docTitle: document.title,
  };

  let lastFailed: ExtractionResult | null = null;
  for (const extractor of EXTRACTORS) {
    const result = extractor.extract(ctx);
    if (result.outcome !== "failed") return result;
    lastFailed = result;
  }
  return lastFailed;
}

// Back-compat thin wrapper: returns just the job, or null when there's nothing
// usable. Existing call sites (and tests) that only need the ScrapedJob keep
// working; new code should use extractJob() for the outcome + provenance.
export function scrapeJob(): ScrapedJob | null {
  return extractJob()?.job ?? null;
}

// Poll until an extractor produces a usable result (ok/partial), or until the
// timeout — at which point we resolve the last (failed) result so the caller
// can show the wall. Resolves null only when the page never had a job id.
export function waitForJobContent(
  { timeoutMs = 8000, pollMs = 250 }: { timeoutMs?: number; pollMs?: number } = {},
): Promise<ExtractionResult | null> {
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      const result = extractJob();
      const timedOut = Date.now() - start > timeoutMs;

      if (result === null) {
        // No job id yet — could be mid-navigation. Keep trying until timeout.
        if (timedOut) return resolve(null);
        return void setTimeout(tick, pollMs);
      }
      if (result.outcome !== "failed") return resolve(result);
      if (timedOut) return resolve(result); // genuine failure — let the caller wall
      setTimeout(tick, pollMs);
    };
    tick();
  });
}
