// Diagnostics collected when extraction fails or comes back partial, so we can
// see *what* LinkedIn changed — and *where data moved* — without asking the user
// to run console scripts.
//
// PRIVACY (Measure 3): the payload is "capture the job, exclude the user". It
// carries:
//   - telemetry: which extractor ran, the outcome, which fields were missing,
//     the strategy that produced each field (a selector string or a label like
//     "doc-title" — never the value), the page <title> (the JOB's title line,
//     never the member's identity), the URL, and the user-agent;
//   - job_html: a sanitized snapshot of the JOB POSTING subtree (see snapshot.ts)
//     — structure + job text, with the global chrome (nav/feed/messaging) and
//     the member's own identity excluded/redacted, scripts/media stripped,
//     capped at ~50KB.
// Job-posting content is public listing data already sent to the LLM during
// normal evaluation; the member's personal identity is excluded. That's what
// keeps diagnostics silent + privacy-policy-disclosed rather than opt-in. Do not
// widen the snapshot to include the global chrome or media without revisiting
// the consent model.

import type { DomDiagnosticsPayload } from "@/shared/types";
import { buildJobSnapshot } from "./snapshot";
import type { ExtractionResult, JobField } from "./types";

export function buildDomDiagnostics(result: ExtractionResult): DomDiagnosticsPayload {
  const fields = (Object.keys(result.fields) as JobField[]).map((name) => ({
    name,
    found: result.fields[name].value !== null,
    source: result.fields[name].source,
  }));

  return {
    extractor: result.extractor,
    outcome: result.outcome,
    job_id: result.jobId,
    url: location.href,
    doc_title: document.title,
    missing: result.missing,
    fields,
    job_html: buildJobSnapshot(),
    user_agent: navigator.userAgent,
    captured_at: new Date().toISOString(),
  };
}
