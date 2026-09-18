// cards-v1 — finds the job cards in any LinkedIn list.
//
// Strategy: anchor on the LINK, never on class names. Every job card, in every
// surface (search results, collections, saved jobs, the "more jobs for you"
// rail under a posting), is ultimately a link to /jobs/view/<id>. That link is
// structurally load-bearing — the card is useless without it — whereas classes
// are not: the hashed-class A/B variant documented in jobs-v1.extractor.ts
// (2026-06-09) rotates them, and `job-card-container` has been renamed before.
//
// From the link we walk UP to the smallest element that still represents one
// job, which is where the badges go. The walk is bounded and validated so a
// stray link (the job-details pane, a "see all jobs" footer link) can never
// resolve to a huge container.
//
// Last verified: 2026-09-18.

import { getJobIdFromUrl } from "../identity";
import type { JobCardRef, JobListAdapter, JobListScan } from "./types";

// Two link shapes, because LinkedIn ships two results pages:
//   /jobs/search/         → cards link to /jobs/view/<id>
//   /jobs/search-results/ → cards keep you in the SPA and link to
//                           ?currentJobId=<id> (observed 2026-09-18; the second
//                           page showed no badges at all until this was added)
const JOB_VIEW_SELECTOR = 'a[href*="/jobs/view/"]';
const CURRENT_JOB_SELECTOR = 'a[href*="currentJobId="]';
const JOB_LINK_SELECTOR = `${JOB_VIEW_SELECTOR}, ${CURRENT_JOB_SELECTOR}`;

// A card is a summary: title, company, location, a line of metadata. Anything
// whose text runs longer than this is a pane, not a card — most importantly the
// job-details pane, which also links to /jobs/view/<id>.
const MAX_CARD_TEXT = 800;

// A `currentJobId` link is not proof of a job card: LinkedIn keeps that
// parameter on its filter pills and pagination links too, all pointing at the
// job currently open. A real card carries a title, a company and a line of
// metadata; a filter pill says "Easy Apply". This floor separates them, and is
// applied ONLY to cards found through a query link — a /jobs/view/ link is
// unambiguous on its own.
const MIN_QUERY_CARD_TEXT = 60;

// Regions that are page furniture rather than a job: a job id appearing in a
// link here means LinkedIn propagated the current URL's parameters, not that
// this place shows the job.
const CHROME_LANDMARKS = "footer, nav, header";

// How far above the link we are willing to climb. Cards nest a few levels
// (link → title wrapper → content → card → li); beyond that we are leaving the
// card even if the checks still pass.
const MAX_CLIMB = 6;

// Distinct jobs linked from inside `el`. Counting LINKS would be wrong: a card
// links the same job several times (logo, title, and the invisible overlay
// anchor that makes the whole card clickable).
function distinctJobIds(el: Element): number {
  const ids = new Set<string>();
  for (const anchor of Array.from(el.querySelectorAll<HTMLAnchorElement>(JOB_LINK_SELECTOR))) {
    const id = getJobIdFromUrl(anchor.getAttribute("href") ?? "");
    if (id) ids.add(id);
  }
  return ids.size;
}

// An element is a plausible card when it describes exactly one job and reads
// like a summary rather than a full posting. Since the anchor we started from
// is a descendant, "exactly one" is always that anchor's own job.
function isPlausibleCard(el: Element): boolean {
  if (distinctJobIds(el) !== 1) return false;
  return (el.textContent ?? "").length <= MAX_CARD_TEXT;
}

// An element with `display: contents` has no box of its own — its children are
// laid out by ITS parent. A badge row appended to one escapes the card and is
// sized by whatever is further up. LinkedIn wraps nearly everything in such a
// div (`data-display-contents="true"`), including the "Are these results
// helpful?" widget, which carries a currentJobId link and was resolving to a
// zero-width host (seen live 2026-09-18).
function hasOwnBox(el: HTMLElement): boolean {
  try {
    return el.ownerDocument.defaultView?.getComputedStyle(el).display !== "contents";
  } catch {
    return true;
  }
}

function cardRootFor(anchor: HTMLAnchorElement): { el: HTMLElement; source: string } | null {
  const li = anchor.closest("li");
  if (li instanceof HTMLElement && isPlausibleCard(li) && hasOwnBox(li)) {
    return { el: li, source: "closest-li" };
  }

  // No usable <li> (grid/div layouts, and the carousels on the jobs home page).
  // Climb while each ancestor still describes this one job, and keep the last
  // one that did — the widest element that is still a single card.
  let node = anchor.parentElement;
  let best: HTMLElement | null = null;
  for (let depth = 0; node && depth < MAX_CLIMB; depth++) {
    if (!isPlausibleCard(node)) break;
    // Climb PAST a boxless wrapper rather than settling on it: on the details
    // pane the job header sits one level above exactly such a wrapper (live,
    // 2026-09-18). If no ancestor has both a box and a single job, there is
    // nothing here worth decorating and we return null.
    if (hasOwnBox(node)) best = node;
    node = node.parentElement;
  }
  return best ? { el: best, source: "ancestor-walk" } : null;
}

export const jobCardsV1Adapter: JobListAdapter = {
  id: "cards-v1",

  scan(doc: Document): JobListScan {
    // Several links point at the same job from inside one card (logo, title,
    // overlay). They converge on the same root, and the registry collapses
    // those duplicates — along with any a second adapter also found.
    //
    // A /jobs/view/ link is proof that its surroundings show that job. A
    // ?currentJobId= link is only a hint, because LinkedIn propagates the
    // current job's id into unrelated links. When both resolve and only one
    // slot is left, the proof must win — so the strong matches are returned
    // first (live, 2026-09-18: the "Are these results helpful?" widget was
    // taking the slot the job-details pane needed).
    const strong: JobCardRef[] = [];
    const weak: JobCardRef[] = [];

    for (const anchor of Array.from(doc.querySelectorAll<HTMLAnchorElement>(JOB_LINK_SELECTOR))) {
      // Site chrome, not job content. LinkedIn carries the current job's id
      // into its footer links ("More" carries ?currentJobId=…), which resolved
      // to the site footer and stole a slot from the details pane (live,
      // 2026-09-18). Landmarks survive class-name churn and are language-
      // independent, unlike the link text.
      if (anchor.closest(CHROME_LANDMARKS)) continue;

      // Read the attribute rather than `.href`: the property resolves against
      // the document's base URL, which is not linkedin.com inside the preload
      // iframe (or in tests).
      const href = anchor.getAttribute("href") ?? "";
      const jobId = getJobIdFromUrl(href);
      if (!jobId) continue;

      // A link with no accessible name is not how anyone opens a job — it is
      // tracking or a widget's action. The card's real link (the title) names
      // the job and resolves to the same element anyway.
      const label = (anchor.textContent ?? "").trim() || anchor.getAttribute("aria-label") || "";
      if (!label) continue;

      const root = cardRootFor(anchor);
      if (!root) continue;

      const isViewLink = anchor.matches(JOB_VIEW_SELECTOR);
      const text = (root.el.textContent ?? "").trim();
      if (!isViewLink && text.length < MIN_QUERY_CARD_TEXT) continue;

      (isViewLink ? strong : weak).push({ jobId, card: root.el, source: root.source });
    }

    const cards = [...strong, ...weak];
    return { adapter: jobCardsV1Adapter.id, cards, outcome: cards.length > 0 ? "ok" : "empty" };
  },
};
