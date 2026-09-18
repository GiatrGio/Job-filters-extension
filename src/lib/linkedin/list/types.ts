// The LinkedIn job-LIST adapter.
//
// Same idea as the job-page extractors next door: all knowledge of how LinkedIn
// renders a list of job cards lives behind one interface, in versioned modules,
// so a markup change is a small patch in one place. The registry runs the
// adapters in order and returns the first one that finds cards.
//
// What we need from a card is deliberately tiny — the job id and the element to
// decorate — because the less we depend on, the less there is to break.

export interface JobCardRef {
  jobId: string;
  // The element the badges are appended to. Always the smallest ancestor that
  // still represents exactly one job, so a badge can never end up attached to
  // the whole list or to the job-details pane.
  card: HTMLElement;
  // Short, stable label for the strategy that resolved this card, e.g.
  // "closest-li" or "ancestor-walk". Contains no page content, so it is safe
  // to log if we ever ship list diagnostics.
  source: string;
}

export interface JobListScan {
  adapter: string;
  cards: JobCardRef[];
  // "empty" is not necessarily breakage — most LinkedIn pages have no job list
  // at all. The caller decides what it means; only a job-search URL with zero
  // cards is suspicious.
  outcome: "ok" | "empty";
}

export interface JobListAdapter {
  readonly id: string;
  scan(doc: Document): JobListScan;
}
