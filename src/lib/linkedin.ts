// LinkedIn DOM scraping.
//
// LinkedIn ships UI changes frequently. Each field tries several selectors in
// order; if ALL of them miss, the field returns null rather than a misleading
// partial. When selectors break, update the arrays below and add a dated note.
//
// Last verified: 2026-04-20.
//
// 2026-06-05: LinkedIn's "instant" navigation renders the job page into a
// same-origin <iframe src="/preload/?_bprMode=vanilla"> and swaps it in, while
// the top document keeps the previous page (e.g. the feed). A content script in
// the top frame therefore can't find the job via document.querySelector — the
// description lives in that iframe. So scraping now searches the top document
// AND every readable same-origin iframe. We also read text via textContent (not
// just innerText) because the preload iframe can be unrendered/hidden, in which
// case innerText returns "". See `candidateDocuments()` / `getText()` below.

import type { ScrapedJob } from "@/shared/types";

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

// Read an element's text. Prefer innerText (respects layout/visibility and
// collapses hidden nodes) but fall back to a cleaned textContent — required for
// content inside the hidden/unrendered preload iframe, where innerText is "".
function getText(el: HTMLElement | null): string {
  if (!el) return "";
  const inner = el.innerText?.trim();
  if (inner) return inner;
  const clone = el.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("script, style, noscript").forEach((n) => n.remove());
  return (clone.textContent ?? "").replace(/[ \t ]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function firstText(selectors: string[], root: ParentNode = document): string | null {
  for (const sel of selectors) {
    const t = getText(root.querySelector<HTMLElement>(sel));
    if (t) return t;
  }
  return null;
}

// All documents we can scrape from: the top document plus every same-origin
// iframe (LinkedIn renders the job into a /preload/ iframe — see header note).
// Cross-origin iframes throw on contentDocument access and are skipped.
function candidateDocuments(): Document[] {
  const docs: Document[] = [document];
  for (const frame of Array.from(document.querySelectorAll("iframe"))) {
    try {
      const doc = (frame as HTMLIFrameElement).contentDocument;
      if (doc?.body) docs.push(doc);
    } catch {
      // cross-origin frame — not readable, skip
    }
  }
  return docs;
}

// Locale-tolerant-ish fallback for the description when our selectors miss:
// find the smallest element that still contains the whole "About the job"
// block. Used only when the structured selectors fail (e.g. the vanilla preload
// render uses different markup).
function descriptionByAnchor(root: Document): string | null {
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
  return best ? getText(best) : null;
}

export function getJobIdFromUrl(url: string = location.href): string | null {
  // Current URL shapes:
  //   https://www.linkedin.com/jobs/view/3891234567/
  //   https://www.linkedin.com/jobs/collections/.../?currentJobId=3891234567
  const viewMatch = url.match(/\/jobs\/view\/(\d+)/);
  if (viewMatch) return viewMatch[1];
  try {
    const u = new URL(url);
    const q = u.searchParams.get("currentJobId");
    if (q) return q;
  } catch {
    // malformed URL — fall through
  }
  return null;
}

export function scrapeJob(): ScrapedJob | null {
  // The job id always comes from the TOP url (the iframe's own URL is
  // /preload/?... and carries no id).
  const id = getJobIdFromUrl();
  if (!id) return null;

  // Try the top document first (standalone /jobs/view/ pages and the classic
  // two-pane view keep the job there), then any same-origin iframe.
  for (const doc of candidateDocuments()) {
    const description = firstText(DESCRIPTION_SELECTORS, doc) ?? descriptionByAnchor(doc);
    if (!description) continue; // no job text in this document — try the next

    return {
      linkedin_job_id: id,
      job_title: firstText(TITLE_SELECTORS, doc) ?? firstText(["h1"], doc),
      job_company: firstText(COMPANY_SELECTORS, doc),
      job_location: firstText(LOCATION_SELECTORS, doc),
      job_url: `https://www.linkedin.com/jobs/view/${id}/`,
      job_description: description,
    };
  }
  return null; // without a description there's nothing to evaluate
}

export function waitForJobContent(
  { timeoutMs = 8000, pollMs = 250 }: { timeoutMs?: number; pollMs?: number } = {},
): Promise<ScrapedJob | null> {
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      const scraped = scrapeJob();
      if (scraped) return resolve(scraped);
      if (Date.now() - start > timeoutMs) return resolve(null);
      setTimeout(tick, pollMs);
    };
    tick();
  });
}
