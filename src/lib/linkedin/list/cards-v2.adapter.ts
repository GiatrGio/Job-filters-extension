// cards-v2 — finds job cards by the id LinkedIn puts on the card element.
//
// Verified against both live results pages on 2026-09-18:
//
//   /jobs/search-results/  (new UI) — `componentkey="job-card-component-ref-<id>"`.
//       Its cards contain NO <a> at all: the clickable surface is a div with
//       role="link" and a JS handler. A link-anchored scan finds nothing here,
//       which is why the badges were missing on that page entirely.
//   /jobs/search/          (old UI) — `data-occludable-job-id` on the <li> and
//       `data-job-id` on the card inside it.
//
// This is strictly better than climbing from a link: the attribute sits ON the
// element we want to decorate, so there is no heuristic walk and no way to
// resolve to the whole pane. cards-v1 stays behind it for surfaces that carry
// neither attribute — the job-details pane, the "more jobs for you" rails.

import type { JobCardRef, JobListAdapter, JobListScan } from "./types";

// Each entry is a selector and how to read the job id out of the match.
const ID_SOURCES: { selector: string; attribute: string; label: string }[] = [
  {
    selector: '[componentkey^="job-card-component-ref-"]',
    attribute: "componentkey",
    label: "componentkey",
  },
  { selector: "[data-occludable-job-id]", attribute: "data-occludable-job-id", label: "occludable" },
  { selector: "[data-job-id]", attribute: "data-job-id", label: "data-job-id" },
];

// LinkedIn job ids are long numbers; the attribute may wrap one in a prefix
// (`job-card-component-ref-4403602807`) or hold a non-numeric sentinel
// (`data-job-id="search"` appears on the list container itself).
function jobIdFrom(value: string | null): string | null {
  const match = (value ?? "").match(/(\d{6,})/);
  return match ? match[1] : null;
}

export const jobCardsV2Adapter: JobListAdapter = {
  id: "cards-v2",

  scan(doc: Document): JobListScan {
    const candidates: { jobId: string; el: HTMLElement; label: string }[] = [];

    for (const { selector, attribute, label } of ID_SOURCES) {
      for (const el of Array.from(doc.querySelectorAll<HTMLElement>(selector))) {
        const jobId = jobIdFrom(el.getAttribute(attribute));
        if (!jobId) continue;
        // A virtualised list keeps empty placeholders for cards that have not
        // rendered yet. Badging one would put a chip row on a blank box; when
        // it fills in, the observer brings us back.
        if ((el.textContent ?? "").trim().length < 10) continue;
        candidates.push({ jobId, el, label });
      }
    }

    // The same id is marked at two nesting levels (the new UI tags an outer
    // wrapper and the column inside it). Keep the outermost per job: it is the
    // whole card, and its inner column is where the badges end up anyway.
    const cards: JobCardRef[] = [];
    for (const candidate of candidates) {
      const sameJob = candidates.filter((c) => c.jobId === candidate.jobId);
      if (sameJob.some((c) => c.el !== candidate.el && c.el.contains(candidate.el))) continue;
      if (cards.some((c) => c.card === candidate.el)) continue;
      cards.push({ jobId: candidate.jobId, card: candidate.el, source: candidate.label });
    }

    return { adapter: jobCardsV2Adapter.id, cards, outcome: cards.length > 0 ? "ok" : "empty" };
  },
};
