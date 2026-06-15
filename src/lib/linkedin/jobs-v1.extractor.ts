// jobs-v1 — the LinkedIn job extractor.
//
// LinkedIn ships UI changes frequently. Each field tries several selectors in
// order; if ALL of them miss, the field falls back to the document <title>
// (identity fields) or an anchor heuristic (description) rather than returning a
// misleading partial. When selectors break, update the arrays below and add a
// dated note — or, if the markup has changed enough to need a different
// strategy, add a jobs-v2 extractor alongside this one and register it ahead of
// v1 in registry.ts.
//
// Last verified: 2026-04-20.
//
// 2026-06-05: LinkedIn's "instant" navigation renders the job page into a
// same-origin <iframe src="/preload/?_bprMode=vanilla"> and swaps it in, while
// the top document keeps the previous page (e.g. the feed). A content script in
// the top frame therefore can't find the job via document.querySelector — the
// description lives in that iframe. So scraping searches the top document AND
// every readable same-origin iframe (see candidateDocuments in dom.ts). We also
// read text via textContent (not just innerText) because the preload iframe can
// be unrendered/hidden, in which case innerText returns "".
//
// 2026-06-09: Some accounts (sticky A/B bucket — varies per LinkedIn member, so
// it reproduces for one user and not another) get a new design-system variant
// with hashed, rotating class names (e.g. `_2c990f13`), NO <h1>, NO `top-card`
// classes, and NO JSON-LD. Every TITLE/COMPANY/LOCATION selector — and the <h1>
// fallback — miss, so the job's identity falls back to the document <title>
// ("<Title> | <Company> | LinkedIn"), the one hook stable across every variant.
// The description still scrapes via the anchor fallback. Reproduced by
// tests/fixtures/granular-energy-broken.html.

import { firstTextWithSource, getText } from "./dom";
import { jobMetaFromDocTitle } from "./identity";
import type {
  ExtractionContext,
  ExtractionFields,
  ExtractionResult,
  FieldProvenance,
  JobExtractor,
  JobField,
} from "./types";

const TITLE_SELECTORS = [
  ".job-details-jobs-unified-top-card__job-title",
  ".jobs-unified-top-card__job-title",
  "h1.t-24",
  "h1.topcard__title",
];

const COMPANY_SELECTORS = [
  ".job-details-jobs-unified-top-card__company-name a",
  ".job-details-jobs-unified-top-card__company-name",
  ".jobs-unified-top-card__company-name a",
  ".jobs-unified-top-card__company-name",
];

const LOCATION_SELECTORS = [
  ".job-details-jobs-unified-top-card__primary-description-container span.tvm__text:first-of-type",
  ".job-details-jobs-unified-top-card__bullet",
  ".jobs-unified-top-card__bullet",
];

const DESCRIPTION_SELECTORS = [
  "#job-details",
  ".jobs-description__content .jobs-box__html-content",
  ".jobs-description-content__text",
  ".description__text",
];

// Identity fields we require for an "ok" outcome. Location is intentionally
// excluded — it is legitimately absent for many jobs (e.g. the
// "<Title> | <Company> | LinkedIn" doc-title shape has no location), so
// treating it as required would make almost every job "partial".
const REQUIRED_FOR_OK: JobField[] = ["title", "company", "description"];

// Locale-tolerant-ish fallback for the description when our selectors miss:
// find the smallest element that still contains the whole "About the job"
// block. Used only when the structured selectors fail (e.g. the vanilla preload
// render uses different markup).
function descriptionByAnchor(root: Document): FieldProvenance {
  let best: HTMLElement | null = null;
  let bestLen = Number.POSITIVE_INFINITY;
  for (const el of Array.from(root.querySelectorAll<HTMLElement>("section, div, article"))) {
    const raw = el.textContent ?? "";
    if (raw.length <= 200) continue;
    if (!/about the job/i.test(raw)) continue;
    if (raw.length < bestLen) {
      best = el;
      bestLen = raw.length;
    }
  }
  const value = best ? getText(best) : "";
  return value ? { value, source: "anchor" } : { value: null, source: null };
}

function readDescription(doc: Document): FieldProvenance {
  const structured = firstTextWithSource(DESCRIPTION_SELECTORS, doc);
  if (structured.value) return structured;
  return descriptionByAnchor(doc);
}

// Prefer a structured selector; fall back to the document <title>-derived value
// (tagged "doc-title") so we can see in diagnostics whether the page gave us the
// real markup or whether we limped along on the title.
function withTitleFallback(
  selectorHit: FieldProvenance,
  fallbackValue: string | null,
): FieldProvenance {
  if (selectorHit.value) return selectorHit;
  if (fallbackValue) return { value: fallbackValue, source: "doc-title" };
  return { value: null, source: null };
}

function assemble(
  jobId: string,
  fields: ExtractionFields,
): ExtractionResult {
  const missing = (Object.keys(fields) as JobField[]).filter((f) => fields[f].value === null);
  const description = fields.description.value;
  const identityMissing = REQUIRED_FOR_OK.some((f) => fields[f].value === null);

  if (description === null) {
    return { extractor: jobsV1Extractor.id, jobId, outcome: "failed", job: null, fields, missing };
  }

  const job = {
    linkedin_job_id: jobId,
    job_title: fields.title.value,
    job_company: fields.company.value,
    job_location: fields.location.value,
    job_url: `https://www.linkedin.com/jobs/view/${jobId}/`,
    job_description: description,
  };
  return {
    extractor: jobsV1Extractor.id,
    jobId,
    outcome: identityMissing ? "partial" : "ok",
    job,
    fields,
    missing,
  };
}

export const jobsV1Extractor: JobExtractor = {
  id: "jobs-v1",

  extract(ctx: ExtractionContext): ExtractionResult {
    // The document <title> is the most stable cross-variant source for the
    // job's identity (see jobMetaFromDocTitle). Read it once from the TOP
    // document — an iframe's title is often the feed ("(14) LinkedIn").
    const fromTitle = jobMetaFromDocTitle(ctx.docTitle);

    // Try the top document first (standalone /jobs/view/ pages and the classic
    // two-pane view keep the job there), then any same-origin iframe.
    for (const doc of ctx.documents) {
      const description = readDescription(doc);
      if (!description.value) continue; // no job text in this document — try the next

      const titleHit = firstTextWithSource(TITLE_SELECTORS, doc);
      const title = withTitleFallback(
        titleHit.value ? titleHit : firstTextWithSource(["h1"], doc),
        fromTitle.title,
      );
      const company = withTitleFallback(firstTextWithSource(COMPANY_SELECTORS, doc), fromTitle.company);
      const location = withTitleFallback(firstTextWithSource(LOCATION_SELECTORS, doc), fromTitle.location);

      return assemble(ctx.jobId, { title, company, location, description });
    }

    // No document carried a description. Report the richest failure we can:
    // identity may still be recoverable from the <title>, which helps the
    // diagnostic name the job even though there was nothing to evaluate.
    const fields: ExtractionFields = {
      title: fromTitle.title ? { value: fromTitle.title, source: "doc-title" } : { value: null, source: null },
      company: fromTitle.company ? { value: fromTitle.company, source: "doc-title" } : { value: null, source: null },
      location: fromTitle.location ? { value: fromTitle.location, source: "doc-title" } : { value: null, source: null },
      description: { value: null, source: null },
    };
    return assemble(ctx.jobId, fields);
  },
};
