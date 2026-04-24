// LinkedIn DOM scraping.
//
// LinkedIn ships UI changes frequently. Each field tries several selectors in
// order; if ALL of them miss, the field returns null rather than a misleading
// partial. When selectors break, update the arrays below and add a dated note.
//
// Last verified: 2026-04-20.

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

function firstText(selectors: string[]): string | null {
  for (const sel of selectors) {
    const el = document.querySelector<HTMLElement>(sel);
    const t = el?.innerText?.trim();
    if (t) return t;
  }
  return null;
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
  const id = getJobIdFromUrl();
  if (!id) return null;
  const description = firstText(DESCRIPTION_SELECTORS);
  if (!description) return null; // without description there's nothing to evaluate
  return {
    linkedin_job_id: id,
    job_title: firstText(TITLE_SELECTORS),
    job_company: firstText(COMPANY_SELECTORS),
    job_location: firstText(LOCATION_SELECTORS),
    job_url: `https://www.linkedin.com/jobs/view/${id}/`,
    job_description: description,
  };
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
