// Job-list adapter registry.
//
// Unlike the job-PAGE extractors, this registry does not stop at the first
// adapter that returns something. One page genuinely shows jobs in more than
// one shape at once: on /jobs/search-results/ the list cards are found by
// attribute (cards-v2) while the details pane alongside them is only reachable
// through its link (cards-v1). First-usable-wins would badge one and drop the
// other, so every adapter runs and the results are merged here.
//
// Ordered most specific → most general: an attribute that names the job beats a
// heuristic climb from a link, so cards-v2 goes first and wins the de-duplication.

import { candidateDocuments } from "../dom";
import { jobCardsV1Adapter } from "./cards-v1.adapter";
import { jobCardsV2Adapter } from "./cards-v2.adapter";
import type { JobCardRef, JobListAdapter, JobListScan } from "./types";

const ADAPTERS: JobListAdapter[] = [jobCardsV2Adapter, jobCardsV1Adapter];

// One job can legitimately appear twice on screen: its card in the list and the
// details pane showing it. Both are worth badging. More than that means a
// heuristic went wide, so we stop there.
const MAX_ROOTS_PER_JOB = 2;

// Keeps one badge row per place a job is shown. Two adapters (or two links
// inside one card) that resolve to the same element — or to elements nested in
// one another — describe the same place, so only the first survives.
function merge(scans: JobListScan[]): JobCardRef[] {
  const accepted = new Map<string, HTMLElement[]>();
  const cards: JobCardRef[] = [];

  for (const scan of scans) {
    for (const ref of scan.cards) {
      const taken = accepted.get(ref.jobId) ?? [];
      if (taken.length >= MAX_ROOTS_PER_JOB) continue;
      if (taken.some((el) => el === ref.card || el.contains(ref.card) || ref.card.contains(el))) {
        continue;
      }
      accepted.set(ref.jobId, [...taken, ref.card]);
      // Provenance carries the adapter too, so a diagnostic can say which
      // strategy found a card without any page content in it.
      cards.push({ ...ref, source: `${scan.adapter}:${ref.source}` });
    }
  }

  return cards;
}

export function scanJobCards(doc: Document): JobListScan {
  const scans = ADAPTERS.map((adapter) => {
    try {
      return adapter.scan(doc);
    } catch {
      // One broken adapter must not cost us the others.
      return { adapter: adapter.id, cards: [], outcome: "empty" } satisfies JobListScan;
    }
  });

  const cards = merge(scans);
  const contributing = scans.filter((s) => s.cards.length > 0).map((s) => s.adapter);

  return {
    adapter: contributing.join("+") || "none",
    cards,
    outcome: cards.length > 0 ? "ok" : "empty",
  };
}

// Every document that could hold a list: the top one plus each same-origin
// iframe. LinkedIn renders whole pages into a /preload/ iframe (see the
// 2026-06-05 note in jobs-v1.extractor.ts), so the list is often not in the top
// document at all.
export function scanAllJobCards(docs: Document[] = candidateDocuments()): JobCardRef[] {
  const cards: JobCardRef[] = [];
  for (const doc of docs) {
    try {
      cards.push(...scanJobCards(doc).cards);
    } catch {
      // A torn-down iframe can throw mid-scan; the other documents still count.
    }
  }
  return cards;
}
