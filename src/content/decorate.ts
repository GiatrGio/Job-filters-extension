// Job-card decoration — "you already looked at this one".
//
// Badges every job card in LinkedIn's list with what we already know about that
// job from local memory: the filter verdict we gave it, the CV match, and
// whether it is in the tracker. Everything comes from chrome.storage.local, so
// scrolling a list of 200 jobs costs zero API calls, zero LLM tokens and
// nothing off the user's monthly count.
//
// There is deliberately NO "seen before" badge: LinkedIn already marks viewed
// jobs itself, and a second one next to it is noise (2026-09-18). The visit
// record is still kept — it is what the badges are pruned by, and it is there
// if we ever want to say something LinkedIn's flag cannot.
//
// Three things make this hard, and each one is why other extensions' versions
// of this feature disappoint:
//
//   1. The list is VIRTUALISED. LinkedIn mounts and unmounts cards as you
//      scroll, so anything applied once is gone by the next screenful. We
//      re-decorate on mutation, and a stamp on each card keeps a repeat pass at
//      a handful of attribute reads.
//   2. The list is often NOT in the top document — LinkedIn renders pages into
//      a same-origin /preload/ iframe (see the 2026-06-05 note in
//      jobs-v1.extractor.ts). We decorate every readable document.
//   3. Class names ROTATE for some accounts (the hashed-class A/B variant). The
//      adapter anchors on the job link instead; see cards-v1.adapter.ts.
//
// Styling is applied as inline declarations rather than a stylesheet: it needs
// to work identically in the top document and inside the preload iframe, and it
// sidesteps LinkedIn's Content-Security-Policy entirely.

import { formatSeenDate, isVerdictCurrent, readJobMemory } from "@/lib/jobMemory";
import { candidateDocuments, scanAllJobCards } from "@/lib/linkedin";
import { JOB_MEMORY_KEY } from "@/lib/storage";
import type {
  JobEvidenceLine,
  JobMemoryEntry,
  JobMemoryIndex,
  JobTrackerSummary,
} from "@/shared/types";

// Marks every node we create, so the observer can tell our own mutations apart
// from LinkedIn's and we never react to ourselves.
const OWNED_ATTR = "data-canvasjob";
// Set on LinkedIn's own card element. Holds a signature of what we rendered, so
// an unchanged card is skipped on the next pass.
const STAMP_ATTR = "data-canvasjob-stamp";
const ROW_ATTR = "data-canvasjob-badges";

// How many cards a single pass may (re)build. Scanning is cheap and a card that
// is already up to date costs two attribute reads, so this only bounds the
// first pass over a long list — the runner immediately schedules another one,
// which keeps a burst of work off the frame the user is scrolling in.
const MAX_DECORATIONS_PER_PASS = 40;
const PASS_THROTTLE_MS = 200;
// requestAnimationFrame does not fire in a background tab; this runs the pass
// regardless so a hidden tab still ends up decorated (and never stuck).
const HIDDEN_TAB_BACKSTOP_MS = 300;
// Safety net for mutations the observer filtered out or never saw (iframes
// swapped in wholesale, cards re-rendered without touching our ancestors).
const SWEEP_MS = 3_000;
const POPOVER_OPEN_DELAY_MS = 120;
const POPOVER_CLOSE_DELAY_MS = 180;

type ChipTone = "emerald" | "red" | "teal" | "muted" | "solid";

// Light chips with dark text. They read correctly on LinkedIn's dark theme too
// — brighter against a dark card, but never low-contrast, which is the failure
// mode that matters.
const TONES: Record<ChipTone, { bg: string; border: string; fg: string }> = {
  emerald: { bg: "#ecfdf5", border: "#a7f3d0", fg: "#047857" },
  red: { bg: "#fef2f2", border: "#fecaca", fg: "#b91c1c" },
  teal: { bg: "#f0fdfa", border: "#99f6e4", fg: "#0f766e" },
  muted: { bg: "#f4f4f5", border: "#e4e4e7", fg: "#52525b" },
  solid: { bg: "#14b8a6", border: "#14b8a6", fg: "#04302c" },
};

const ICON_CHECK = "M20 6 9 17l-5-5";
const ICON_CROSS = "M18 6 6 18M6 6l12 12";

function applyStyles(el: HTMLElement, styles: Record<string, string>): void {
  for (const [property, value] of Object.entries(styles)) {
    el.style.setProperty(property, value);
  }
}

function createIcon(doc: Document, path: string): SVGElement {
  const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "10");
  svg.setAttribute("height", "10");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "3");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  const d = doc.createElementNS("http://www.w3.org/2000/svg", "path");
  d.setAttribute("d", path);
  svg.appendChild(d);
  return svg;
}

function createChip(
  doc: Document,
  { label, tone, icon, interactive }: { label: string; tone: ChipTone; icon?: string; interactive?: boolean },
): HTMLElement {
  const chip = doc.createElement(interactive ? "button" : "span");
  chip.setAttribute(OWNED_ATTR, "chip");
  if (chip instanceof HTMLButtonElement) chip.type = "button";
  const palette = TONES[tone];
  applyStyles(chip, {
    display: "inline-flex",
    "align-items": "center",
    gap: "4px",
    height: "19px",
    padding: "0 7px",
    "border-radius": "4px",
    background: palette.bg,
    border: `1px solid ${palette.border}`,
    color: palette.fg,
    "font-family": "inherit",
    "font-size": "10px",
    "font-weight": "700",
    "line-height": "1",
    "white-space": "nowrap",
    cursor: interactive ? "pointer" : "default",
  });
  if (icon) chip.appendChild(createIcon(doc, icon));
  chip.appendChild(doc.createTextNode(label));
  return chip;
}

// --- what each chip says -----------------------------------------------------

function trackerChip(doc: Document, tracker: JobTrackerSummary): HTMLElement | null {
  switch (tracker.status) {
    case "saved":
      return createChip(doc, { label: "Tracked", tone: "teal" });
    case "applied": {
      const when = tracker.appliedAt ? ` ${formatSeenDate(Date.parse(tracker.appliedAt))}` : "";
      return createChip(doc, { label: `Applied${when}`, tone: "solid" });
    }
    case "interviewing":
      return createChip(doc, { label: "Interviewing", tone: "solid" });
    case "offer":
      return createChip(doc, { label: "Offer", tone: "solid" });
    case "rejected":
      return createChip(doc, { label: "Rejected", tone: "muted" });
    case "withdrawn":
      return createChip(doc, { label: "Withdrawn", tone: "muted" });
    default:
      return null;
  }
}

function verdictChip(doc: Document, entry: JobMemoryEntry): HTMLElement | null {
  const verdict = entry.verdict;
  if (!verdict || verdict.total === 0) return null;
  // A job only "fails" when something was actually contradicted. A filter the
  // posting is silent about stays unknown and must not turn the card red.
  const tone: ChipTone = verdict.failed > 0 ? "red" : "emerald";
  const chip = createChip(doc, {
    label: `${verdict.passed} of ${verdict.total} filters`,
    tone,
    icon: verdict.failed > 0 ? ICON_CROSS : ICON_CHECK,
    interactive: Boolean(verdict.lines?.length),
  });
  if (verdict.lines?.length) {
    chip.setAttribute("aria-expanded", "false");
    chip.setAttribute(
      "aria-label",
      `${verdict.passed} of ${verdict.total} filters passed — show what we found`,
    );
  }
  if (verdict.lines?.length) attachPopover(doc, chip, entry, verdict.lines);
  return chip;
}

function fitChip(doc: Document, entry: JobMemoryEntry): HTMLElement | null {
  if (typeof entry.fit !== "number") return null;
  return createChip(doc, { label: `Match ${entry.fit}/5`, tone: entry.fit >= 3 ? "teal" : "muted" });
}

// --- the badge row -----------------------------------------------------------

function buildRow(doc: Document, entry: JobMemoryEntry, verdictIsCurrent: boolean): HTMLElement | null {
  const chips = [
    verdictIsCurrent ? verdictChip(doc, entry) : null,
    verdictIsCurrent ? fitChip(doc, entry) : null,
    entry.tracker ? trackerChip(doc, entry.tracker) : null,
  ].filter((c): c is HTMLElement => c !== null);
  if (chips.length === 0) return null;

  const row = doc.createElement("div");
  row.setAttribute(OWNED_ATTR, "row");
  row.setAttribute(ROW_ATTR, "");
  applyStyles(row, {
    display: "flex",
    "flex-wrap": "wrap",
    "align-items": "center",
    gap: "5px",
    "margin-top": "6px",
    // NEVER set the `flex` shorthand here. LinkedIn's card container is a flex
    // ROW, and a `flex: 1 0 100%` item inside it refuses to shrink: the card's
    // text column collapsed to one character per line (seen 2026-09-18). A
    // block child of a block host fills the line on its own, and `grid-column`
    // is inert unless the host really is a grid. The flex case is handled in
    // placeRow() instead, where the host's own layout is known.
    "grid-column": "1 / -1",
    "min-width": "0",
    "max-width": "100%",
    "box-sizing": "border-box",
    // LinkedIn covers most cards with a full-bleed link overlay. Without a
    // stacking context of our own, every click on a chip would be swallowed by
    // it and navigate away instead.
    position: "relative",
    "z-index": "2",
  });
  for (const chip of chips) row.appendChild(chip);
  return row;
}

// Signature of everything the row renders. An unchanged card is skipped, which
// is what keeps a pass cheap while the user scrolls.
function stampFor(jobId: string, entry: JobMemoryEntry, verdictIsCurrent: boolean): string {
  const verdict = verdictIsCurrent && entry.verdict ? `${entry.verdict.sig}:${entry.verdict.passed}/${entry.verdict.total}` : "-";
  const fit = verdictIsCurrent && typeof entry.fit === "number" ? entry.fit : "-";
  const tracker = entry.tracker ? `${entry.tracker.status}:${entry.tracker.appliedAt ?? ""}` : "-";
  return [jobId, verdict, fit, tracker].join("|");
}

// Only a HORIZONTAL flex container is dangerous to append to: a new item lands
// beside the existing content and competes for width. A column flex, a grid
// (the row spans every track) and normal flow all stack it underneath, which is
// what we want.
function isRowFlex(el: HTMLElement): boolean {
  try {
    const style = el.ownerDocument.defaultView?.getComputedStyle(el);
    if (!style || !style.display.includes("flex")) return false;
    return !style.flexDirection.startsWith("column");
  } catch {
    return false;
  }
}

// The child of a row-flex container that holds the card's text — the column
// with the title and company in it, as opposed to the logo. Chosen by text
// length, so it needs no class names, and skipped if it is itself a row flex.
function textColumnOf(host: HTMLElement): HTMLElement | null {
  let best: HTMLElement | null = null;
  let bestLength = 0;
  for (const child of Array.from(host.children)) {
    if (!(child instanceof HTMLElement)) continue;
    if (isRowFlex(child)) continue;
    const length = (child.textContent ?? "").trim().length;
    // A logo or icon column has little or no text of its own.
    if (length < 10 || length <= bestLength) continue;
    best = child;
    bestLength = length;
  }
  return best;
}

// Where the badge row goes. LinkedIn's list items are usually
// `<li><div class="card">…</div></li>` and the padding that keeps content off
// the card's edge lives on the inner div, so the badges belong in there. That
// inner div is frequently a flex ROW (logo beside a text column): stepping
// straight into it rearranges the card, so we go one level further and land in
// the text column, under the title where the eye already is.
function hostFor(card: HTMLElement): HTMLElement {
  const onlyChild = card.children.length === 1 ? card.firstElementChild : null;
  if (!(onlyChild instanceof HTMLElement)) return card;
  if (!isRowFlex(onlyChild)) return onlyChild;
  return textColumnOf(onlyChild) ?? card;
}

// Append the row so it lands on its own line whatever the host's layout is.
// Normal flow, a column flex and a grid (`grid-column: 1 / -1`) all do that by
// themselves. A row flex is the one case that needs help — and the only case
// where we touch LinkedIn's own style, by letting it wrap, which changes
// nothing until something (our row) actually asks for a new line.
function placeRow(host: HTMLElement, row: HTMLElement): void {
  if (isRowFlex(host)) {
    host.style.setProperty("flex-wrap", "wrap");
    row.style.setProperty("flex-basis", "100%");
  }
  host.appendChild(row);
}

function removeRows(card: HTMLElement): void {
  for (const row of Array.from(card.querySelectorAll(`[${ROW_ATTR}]`))) row.remove();
}

// --- the evidence popover ----------------------------------------------------
//
// One per document, positioned from the chip's box and pinned to the viewport
// so a card with overflow:hidden can never clip it.

const popovers = new WeakMap<Document, HTMLElement>();
const popoverTimers = new WeakMap<Document, ReturnType<typeof setTimeout>>();

function hidePopover(doc: Document): void {
  const timer = popoverTimers.get(doc);
  if (timer) clearTimeout(timer);
  popovers.get(doc)?.remove();
  popovers.delete(doc);
}

function buildPopover(doc: Document, entry: JobMemoryEntry, lines: JobEvidenceLine[]): HTMLElement {
  const panel = doc.createElement("div");
  panel.setAttribute(OWNED_ATTR, "popover");
  panel.setAttribute("role", "tooltip");
  applyStyles(panel, {
    position: "fixed",
    "max-width": "340px",
    "box-sizing": "border-box",
    background: "#ffffff",
    border: "1px solid #d4d4d8",
    "border-radius": "9px",
    "box-shadow": "0 10px 24px rgba(15,23,42,0.18)",
    padding: "11px 12px",
    "z-index": "2147483000",
    font: "400 11px/1.45 inherit",
    color: "#18181b",
  });

  if (entry.title) {
    const header = doc.createElement("div");
    applyStyles(header, { "font-weight": "700", "margin-bottom": "8px", color: "#0f172a" });
    header.textContent = entry.title;
    panel.appendChild(header);
  }

  for (const line of lines) {
    const item = doc.createElement("div");
    applyStyles(item, { display: "flex", gap: "7px", "margin-bottom": "6px" });

    const mark = doc.createElement("span");
    applyStyles(mark, {
      "flex-shrink": "0",
      "margin-top": "2px",
      color: line.pass === true ? "#047857" : line.pass === false ? "#b91c1c" : "#a1a1aa",
    });
    mark.appendChild(createIcon(doc, line.pass === false ? ICON_CROSS : ICON_CHECK));

    const text = doc.createElement("span");
    const name = doc.createElement("span");
    applyStyles(name, { display: "block", "font-weight": "600" });
    name.textContent = line.filter;
    const evidence = doc.createElement("span");
    applyStyles(evidence, { display: "block", color: "#71717a" });
    evidence.textContent = line.evidence;
    text.appendChild(name);
    text.appendChild(evidence);

    item.appendChild(mark);
    item.appendChild(text);
    panel.appendChild(item);
  }

  const footer = doc.createElement("div");
  applyStyles(footer, {
    "border-top": "1px solid #f1f1f3",
    "padding-top": "7px",
    "margin-top": "2px",
    color: "#a1a1aa",
    "font-size": "10px",
  });
  footer.textContent = `From your saved result${
    entry.verdict ? ` · checked ${formatSeenDate(entry.verdict.at)}` : ""
  } — nothing off your monthly count.`;
  panel.appendChild(footer);

  return panel;
}

function showPopover(doc: Document, anchor: HTMLElement, entry: JobMemoryEntry, lines: JobEvidenceLine[]): void {
  hidePopover(doc);
  const panel = buildPopover(doc, entry, lines);
  doc.body.appendChild(panel);
  popovers.set(doc, panel);

  const view = doc.defaultView;
  const rect = anchor.getBoundingClientRect();
  const width = panel.offsetWidth || 340;
  const height = panel.offsetHeight || 200;
  const viewportWidth = view?.innerWidth ?? 1024;
  const viewportHeight = view?.innerHeight ?? 768;
  const left = Math.max(8, Math.min(rect.left, viewportWidth - width - 8));
  // Below the chip when there is room, above it otherwise.
  const top = rect.bottom + height + 8 < viewportHeight ? rect.bottom + 6 : Math.max(8, rect.top - height - 6);
  applyStyles(panel, { left: `${left}px`, top: `${top}px` });

  panel.addEventListener("mouseenter", () => {
    const timer = popoverTimers.get(doc);
    if (timer) clearTimeout(timer);
  });
  panel.addEventListener("mouseleave", () => scheduleHide(doc));
}

function scheduleHide(doc: Document): void {
  const existing = popoverTimers.get(doc);
  if (existing) clearTimeout(existing);
  popoverTimers.set(
    doc,
    setTimeout(() => hidePopover(doc), POPOVER_CLOSE_DELAY_MS),
  );
}

function attachPopover(
  doc: Document,
  chip: HTMLElement,
  entry: JobMemoryEntry,
  lines: JobEvidenceLine[],
): void {
  let openTimer: ReturnType<typeof setTimeout> | null = null;

  chip.addEventListener("mouseenter", () => {
    const pending = popoverTimers.get(doc);
    if (pending) clearTimeout(pending);
    openTimer = setTimeout(() => showPopover(doc, chip, entry, lines), POPOVER_OPEN_DELAY_MS);
  });
  chip.addEventListener("mouseleave", () => {
    if (openTimer) clearTimeout(openTimer);
    scheduleHide(doc);
  });
  // Click works for touch and keyboard, and must never reach LinkedIn's card
  // link underneath — a chip is a disclosure, not a way into the job.
  chip.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const open = popovers.has(doc);
    if (open) hidePopover(doc);
    else showPopover(doc, chip, entry, lines);
    chip.setAttribute("aria-expanded", open ? "false" : "true");
  });
}

// --- the decoration pass -----------------------------------------------------

export interface DecorationStats {
  scanned: number;
  decorated: number;
  cleared: number;
  // True when the pass hit its budget and cards are still waiting.
  truncated: boolean;
}

/**
 * Bring every job card in `docs` in line with what memory says. Pure with
 * respect to storage — the caller supplies the index — so tests can drive it
 * directly.
 */
export function decorateDocuments(docs: Document[], index: JobMemoryIndex): DecorationStats {
  const stats: DecorationStats = { scanned: 0, decorated: 0, cleared: 0, truncated: false };
  const cards = scanAllJobCards(docs);

  for (const { jobId, card } of cards) {
    if (stats.decorated >= MAX_DECORATIONS_PER_PASS) {
      stats.truncated = true;
      break;
    }
    stats.scanned += 1;
    const doc = card.ownerDocument;
    const entry = index.jobs[jobId] ?? null;

    if (!entry) {
      // Nothing remembered (or memory was pruned/cleared since). Leave the card
      // exactly as LinkedIn rendered it.
      if (card.hasAttribute(STAMP_ATTR)) {
        removeRows(card);
        card.removeAttribute(STAMP_ATTR);
        stats.cleared += 1;
      }
      continue;
    }

    const verdictIsCurrent = isVerdictCurrent(index, entry);
    const stamp = stampFor(jobId, entry, verdictIsCurrent);
    const rendered = card.querySelector(`[${ROW_ATTR}]`);
    if (card.getAttribute(STAMP_ATTR) === stamp && rendered) continue;

    removeRows(card);
    const row = buildRow(doc, entry, verdictIsCurrent);
    if (!row) {
      card.removeAttribute(STAMP_ATTR);
      continue;
    }
    placeRow(hostFor(card), row);
    // The stamp stays on the card itself — that is the element the scanner
    // hands back on the next pass.
    card.setAttribute(STAMP_ATTR, stamp);
    stats.decorated += 1;
  }

  return stats;
}

// --- the runner --------------------------------------------------------------

// Only job surfaces carry job lists, and this keeps the observer callback to a
// single string comparison everywhere else on LinkedIn.
function onJobSurface(): boolean {
  return location.pathname.startsWith("/jobs");
}

function isOwned(node: Node): boolean {
  const el = node instanceof Element ? node : node.parentElement;
  return Boolean(el?.closest(`[${OWNED_ATTR}]`));
}

export function startJobListDecoration(): void {
  let index: JobMemoryIndex | null = null;
  let scheduled = false;
  let lastPassAt = 0;
  const observed = new WeakSet<Document>();

  function pass(): void {
    scheduled = false;
    lastPassAt = Date.now();
    if (!index || !onJobSurface()) return;
    try {
      const docs = candidateDocuments();
      observeDocuments(docs);
      if (decorateDocuments(docs, index).truncated) schedulePass();
    } catch (err) {
      // Never let a decoration bug break the page the user is actually trying
      // to use.
      // eslint-disable-next-line no-console
      console.debug("[canvasjob] Could not decorate job cards", err);
    }
  }

  function schedulePass(): void {
    if (scheduled || !onJobSurface()) return;
    scheduled = true;
    const wait = Math.max(0, PASS_THROTTLE_MS - (Date.now() - lastPassAt));
    setTimeout(() => {
      // Ride the frame so a burst of LinkedIn re-renders collapses into one
      // read/write cycle rather than one per mutation. A BACKGROUND tab never
      // runs rAF, though, so a backstop timer runs the pass anyway: without it
      // `scheduled` would stay true forever and every later pass — including
      // the one after the user finally switches to the tab — would be dropped.
      // Opening a job list with cmd-click is enough to hit this.
      let ran = false;
      const run = () => {
        if (ran) return;
        ran = true;
        pass();
      };
      if (typeof requestAnimationFrame === "function") requestAnimationFrame(run);
      setTimeout(run, HIDDEN_TAB_BACKSTOP_MS);
    }, wait);
  }

  function observeDocuments(docs: Document[]): void {
    for (const doc of docs) {
      if (observed.has(doc) || !doc.body) continue;
      observed.add(doc);
      const observer = new MutationObserver((mutations) => {
        if (!onJobSurface()) return;
        // Our own row insertions mutate the card, which would otherwise queue
        // another pass forever. The next pass is a no-op anyway (the stamp
        // matches), but skipping self-inflicted mutations keeps it to zero.
        if (mutations.every((m) => isOwned(m.target))) return;
        schedulePass();
      });
      observer.observe(doc.body, { childList: true, subtree: true });
    }
  }

  void (async () => {
    index = await readJobMemory();
    schedulePass();
  })();

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !(JOB_MEMORY_KEY in changes)) return;
    const next = changes[JOB_MEMORY_KEY].newValue as JobMemoryIndex | undefined;
    index = next ?? { version: 1, activeFiltersSig: null, jobs: {} };
    schedulePass();
  });

  // The content script dispatches this on every SPA navigation (see the history
  // hook in content/index.ts), which is how we catch a move from the feed into
  // the jobs section.
  window.addEventListener("locationchange", schedulePass);
  setInterval(schedulePass, SWEEP_MS);
}
