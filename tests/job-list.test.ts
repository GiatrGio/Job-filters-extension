/**
 * Finding and badging the job cards in LinkedIn's list.
 *
 * Two things are pinned here, because both are what makes this feature either
 * useful or embarrassing:
 *   1. Cards are found through the job LINK, never a class name, so the markup
 *      can be renamed or hashed without breaking us — and the job-details pane,
 *      which also links to /jobs/view/, is never mistaken for a card.
 *   2. Badges survive LinkedIn re-rendering the list. The list is virtualised,
 *      so a card that scrolls out and back is a brand new element.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { scanJobCards } from "@/lib/linkedin/list/registry";
import { decorateDocuments } from "@/content/decorate";
import type { JobMemoryEntry, JobMemoryIndex } from "@/shared/types";

const SIG = "active-sig";

function card(jobId: string, title: string, { hashedClass = "_2c990f13" } = {}): string {
  // Two links to the same job (logo + title) is how LinkedIn builds a card.
  return `
    <li class="${hashedClass}">
      <div class="${hashedClass}-inner">
        <a href="/jobs/view/${jobId}/?eBP=CwEAAA" aria-label="logo"><img alt=""></a>
        <a href="/jobs/view/${jobId}/?eBP=CwEAAA"><strong>${title}</strong></a>
        <span>Acme Corp</span><span>Remote, EU</span>
        <span>Promoted · Easy Apply</span>
      </div>
    </li>`;
}

function renderList(...ids: string[]): void {
  document.body.innerHTML = `
    <main>
      <ul>${ids.map((id, i) => card(id, `Job ${i}`)).join("")}</ul>
    </main>`;
}

function memory(entries: Record<string, JobMemoryEntry>, activeFiltersSig: string | null = SIG): JobMemoryIndex {
  return { version: 1, activeFiltersSig, jobs: entries };
}

function seenEntry(overrides: Partial<JobMemoryEntry> = {}): JobMemoryEntry {
  return {
    firstSeenAt: Date.parse("2026-09-06T10:00:00Z"),
    lastSeenAt: Date.parse("2026-09-12T10:00:00Z"),
    visits: 3,
    title: "Senior Backend Engineer",
    verdict: {
      sig: SIG,
      passed: 2,
      failed: 0,
      unknown: 1,
      total: 3,
      at: Date.parse("2026-09-12T10:00:00Z"),
      lines: [{ filter: "Must be fully remote", pass: true, evidence: "100% remote within the EU." }],
    },
    fit: 4,
    ...overrides,
  };
}

function verdictChipStyle(jobId: string): string {
  const li = document.querySelector(`a[href*="/jobs/view/${jobId}/"]`)?.closest("li");
  const chip = li?.querySelector("[data-canvasjob-badges] [data-canvasjob='chip']");
  return chip?.getAttribute("style") ?? "";
}

function badgeText(jobId: string): string {
  const li = document.querySelector(`a[href*="/jobs/view/${jobId}/"]`)?.closest("li");
  return li?.querySelector("[data-canvasjob-badges]")?.textContent ?? "";
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("finding cards by the id on the card itself", () => {
  // Both shapes verified against the live pages on 2026-09-18.

  it("finds the new UI's cards, which contain no links at all", () => {
    // /jobs/search-results/: the clickable surface is a role="link" div, so
    // there is nothing for a link-anchored scan to find. The job id is on the
    // card element, tagged twice — an outer wrapper and the column inside it.
    document.body.innerHTML = `
      <div class="list">
        <div componentkey="job-card-component-ref-4403602807" class="_5a567015">
          <div componentkey="job-card-component-ref-4403602807" class="_1b5efb68">
            <div role="link">Engineering Manager - UK</div>
            <span>Ashby</span><span>United Kingdom (Remote)</span>
          </div>
        </div>
        <div componentkey="job-card-component-ref-4435012264" class="_5a567015">
          <div role="link">Staff Engineer</div><span>Volt</span><span>Berlin</span>
        </div>
      </div>`;

    const scan = scanJobCards(document);

    expect(scan.cards.map((c) => c.jobId)).toEqual(["4403602807", "4435012264"]);
    // The OUTERMOST of the two tagged elements — the whole card.
    expect(scan.cards[0].card.className).toBe("_5a567015");
    expect(scan.cards[0].source).toBe("cards-v2:componentkey");
  });

  it("finds the old UI's cards by their occludable id", () => {
    document.body.innerHTML = `
      <ul>
        <li data-occludable-job-id="4458955722">
          <div data-job-id="4458955722">
            <a href="/jobs/view/4458955722/">Engineering Manager</a>
            <span>Spotify</span><span>London</span>
          </div>
        </li>
      </ul>`;

    const scan = scanJobCards(document);

    // One row for the card, however many ways it can be identified.
    expect(scan.cards).toHaveLength(1);
    expect(scan.cards[0].card.tagName).toBe("LI");
    expect(scan.cards[0].source).toBe("cards-v2:occludable");
  });

  it("skips the placeholders a virtualised list leaves for unrendered cards", () => {
    document.body.innerHTML = `
      <ul>
        <li data-occludable-job-id="4458955722"></li>
        <li data-occludable-job-id="4403602807">
          <div>Engineering Manager</div><span>Spotify</span><span>London</span>
        </li>
      </ul>`;

    expect(scanJobCards(document).cards.map((c) => c.jobId)).toEqual(["4403602807"]);
  });

  it("ignores a container tagged with a non-numeric job id", () => {
    document.body.innerHTML = `<div data-job-id="search"><span>Results for engineering</span></div>`;

    expect(scanJobCards(document).cards).toEqual([]);
  });
});

describe("finding cards", () => {
  it("returns one card per job, whatever the class names are", () => {
    renderList("111", "222");

    const scan = scanJobCards(document);

    expect(scan.cards.map((c) => c.jobId)).toEqual(["111", "222"]);
    expect(scan.cards[0].card.tagName).toBe("LI");
    expect(scan.cards[0].source).toBe("cards-v1:closest-li");
  });

  it("reads the id from absolute and slash-less hrefs alike", () => {
    document.body.innerHTML = `
      <ul>
        <li><a href="https://www.linkedin.com/jobs/view/333/?trk=x">Job</a></li>
        <li><a href="/jobs/view/444">Job</a></li>
      </ul>`;

    expect(scanJobCards(document).cards.map((c) => c.jobId)).toEqual(["333", "444"]);
  });

  it("resolves a card with no <li> by climbing to the widest single-job block", () => {
    document.body.innerHTML = `
      <div class="grid">
        <div class="cell" data-testid="cell">
          <div><a href="/jobs/view/444/">Job</a><span>Acme</span></div>
        </div>
        <div class="cell"><div><a href="/jobs/view/555/">Other</a></div></div>
      </div>`;

    const scan = scanJobCards(document);

    expect(scan.cards.map((c) => c.jobId)).toEqual(["444", "555"]);
    expect(scan.cards[0].card.getAttribute("data-testid")).toBe("cell");
    expect(scan.cards[0].source).toBe("cards-v1:ancestor-walk");
  });

  it("finds cards on the search-results page, which links by currentJobId", () => {
    // Regression, 2026-09-18: /jobs/search-results/ keeps you in the SPA and
    // its cards never link to /jobs/view/, so no badge appeared at all there.
    document.body.innerHTML = `
      <ul>
        <li>
          <a href="/jobs/search-results/?currentJobId=111&amp;eBP=NOT_ELIGIBLE&amp;refId=x">
            <strong>Engineering Manager - UK</strong>
          </a>
          <span>Ashby</span><span>United Kingdom (Remote)</span>
          <span>110K GBP/yr - 200K GBP/yr</span><span>Viewed · 2 weeks ago</span>
        </li>
      </ul>`;

    expect(scanJobCards(document).cards.map((c) => c.jobId)).toEqual(["111"]);
  });

  it("ignores a filter pill that carries the same currentJobId", () => {
    // LinkedIn puts currentJobId on its facet and paging links too. They point
    // at the open job and would otherwise get badged in the toolbar.
    document.body.innerHTML = `
      <ul class="filters">
        <li><a href="/jobs/search-results/?currentJobId=111&amp;f_AL=true">Easy Apply</a></li>
        <li><a href="/jobs/search-results/?currentJobId=111&amp;f_WT=2">Remote</a></li>
      </ul>`;

    expect(scanJobCards(document).cards).toEqual([]);
  });

  it("badges the same job in the list and in the details pane, but once each", () => {
    document.body.innerHTML = `
      <div class="two-pane">
        <ul>
          <li>
            <a href="/jobs/view/111/"><img alt=""></a>
            <a href="/jobs/view/111/"><strong>Engineering Manager - UK</strong></a>
            <span>Ashby</span><span>United Kingdom (Remote)</span>
          </li>
          <li>
            <a href="/jobs/view/222/"><strong>Senior Engineering Manager</strong></a>
            <span>Apple</span><span>London</span>
          </li>
        </ul>
        <section class="details">
          <div class="details-head">
            <a href="/jobs/view/111/"><strong>Engineering Manager - UK</strong></a>
            <span>Ashby · Cambridge, England</span>
          </div>
          <p>${"About the job. ".repeat(80)}</p>
        </section>
      </div>`;

    const cards = scanJobCards(document).cards;

    expect(cards.map((c) => c.jobId)).toEqual(["111", "222", "111"]);
    expect(cards[0].card.tagName).toBe("LI");
    expect(cards[0].source).toContain("cards-v1");
    // The details pane's own header — the description below it is far too long
    // to be a card, which is what stops the walk there.
    expect(cards[2].card.className).toBe("details-head");
  });

  it("ignores links in the page furniture that merely carry the job id", () => {
    // Live, 2026-09-18: LinkedIn appends ?currentJobId= to its footer links, so
    // "More" in the site footer resolved to the footer itself and took the slot
    // the job-details pane needed.
    document.body.innerHTML = `
      <main>
        <ul>
          <li><a href="/jobs/view/222/">Senior Engineering Manager</a><span>Apple</span><span>London</span></li>
        </ul>
        <div class="details-head">
          <a href="/jobs/view/111/">Engineering Manager - UK</a>
          <span>Ashby · Cambridge, England</span><span>110K GBP/yr - 200K GBP/yr</span>
        </div>
        <footer>
          <a href="/jobs/search-results/?currentJobId=111">More</a>
          <span>About Accessibility Help Center Privacy &amp; Terms Ad Choices Advertising</span>
        </footer>
      </main>`;

    const cards = scanJobCards(document).cards;

    expect(cards.map((c) => c.card.className)).toEqual(["", "details-head"]);
    expect(cards.every((c) => !/About Accessibility/.test(c.card.textContent ?? ""))).toBe(true);
  });

  it("climbs past a boxless wrapper to the block that can hold the badges", () => {
    // The details pane's title link sits inside a `display: contents` div;
    // settling there put the row outside the card, and rejecting it outright
    // lost the pane its badges entirely. The header one level up is the target.
    document.body.innerHTML = `
      <main>
        <ul>
          <li><a href="/jobs/view/222/">Senior Engineering Manager</a><span>Apple</span><span>London</span></li>
        </ul>
        <div class="job-header">
          <div style="display: contents">
            <a href="/jobs/view/111/">Engineering Manager - UK</a>
          </div>
          <span>Ashby · Cambridge, England</span>
        </div>
      </main>`;

    const cards = scanJobCards(document).cards;

    expect(cards.map((c) => c.card.className)).toEqual(["", "job-header"]);
  });

  it("prefers a real job link over one that merely carries the id", () => {
    // Live, 2026-09-18: the "Are these results helpful?" widget sits ABOVE the
    // details pane in the DOM and carries a currentJobId link, so in document
    // order it claimed the last slot for that job. Proof beats a hint.
    document.body.innerHTML = `
      <main>
        <div class="widget">
          <span>Are these results helpful? Your feedback helps us improve these results.</span>
          <a href="/jobs/search-results/?currentJobId=111" aria-label="Give feedback">Feedback</a>
        </div>
        <div class="details-head">
          <a href="/jobs/view/111/">Engineering Manager - UK</a>
          <span>Ashby · Cambridge, England</span>
        </div>
        <ul><li><a href="/jobs/view/222/">Senior Engineering Manager</a><span>Apple</span></li></ul>
      </main>`;

    const cards = scanJobCards(document).cards.filter((c) => c.jobId === "111");

    expect(cards[0].card.className).toBe("details-head");
  });

  it("ignores a link with no accessible name", () => {
    document.body.innerHTML = `
      <main>
        <div class="widget">
          <span>Are these results helpful? Your feedback helps us improve these results.</span>
          <a href="/jobs/search-results/?currentJobId=111"></a>
        </div>
        <ul><li><a href="/jobs/view/222/">Senior Engineering Manager</a><span>Apple</span></li></ul>
      </main>`;

    expect(scanJobCards(document).cards.map((c) => c.jobId)).toEqual(["222"]);
  });

  it("ignores a boxless wrapper, so the real card keeps the slot", () => {
    // Live, 2026-09-18: LinkedIn's "Are these results helpful?" widget carries a
    // currentJobId link and sits inside a `display: contents` div. That div has
    // no box of its own, so a badge row appended to it escaped the card — and
    // it took one of the two slots the details pane needed.
    document.body.innerHTML = `
      <div class="column">
        <div style="display: contents">
          <span>Are these results helpful? Your feedback helps us improve these results for everyone.</span>
          <a href="/jobs/search-results/?currentJobId=111&amp;feedback=1">Give feedback</a>
        </div>
        <div class="card">
          <a href="/jobs/view/222/">Engineering Manager</a><span>Acme</span><span>London</span>
        </div>
      </div>`;

    // The widget is dropped; the real card beside it is still found.
    expect(scanJobCards(document).cards.map((c) => c.jobId)).toEqual(["222"]);
  });

  it("never mistakes the job-details pane for a card", () => {
    document.body.innerHTML = `
      <div id="job-details-pane">
        <a href="/jobs/view/666/">Senior Backend Engineer</a>
        <p>${"About the job. ".repeat(100)}</p>
      </div>`;

    expect(scanJobCards(document).cards).toEqual([]);
  });

  it("reports an empty list rather than throwing on a page with no jobs", () => {
    document.body.innerHTML = `<div><a href="/feed/">Feed</a></div>`;

    expect(scanJobCards(document)).toMatchObject({ outcome: "empty", cards: [] });
  });
});

describe("badging cards", () => {
  it("shows the remembered verdict, match and visit count", () => {
    renderList("111", "222");

    const stats = decorateDocuments([document], memory({ "111": seenEntry() }));

    expect(stats).toMatchObject({ scanned: 2, decorated: 1 });
    expect(badgeText("111")).toContain("2 of 3 filters");
    expect(badgeText("111")).toContain("Match 4/5");
    // LinkedIn already labels viewed jobs; we do not add a second one.
    expect(badgeText("111")).not.toContain("Seen");
    // A job the user has never opened is left exactly as LinkedIn rendered it.
    expect(badgeText("222")).toBe("");
  });

  it("only turns a card red when a filter was actually contradicted", () => {
    // 2 of 3 with the third unknown is not a failure — the posting was simply
    // silent. Colouring that red is the quickest way to lose the user's trust.
    renderList("111", "222");
    const unknownRest = seenEntry();
    const failed = seenEntry({
      verdict: { sig: SIG, passed: 1, failed: 2, unknown: 0, total: 3, at: Date.now() },
    });

    decorateDocuments([document], memory({ "111": unknownRest, "222": failed }));

    expect(verdictChipStyle("111")).toContain("rgb(236, 253, 245)"); // emerald
    expect(verdictChipStyle("222")).toContain("rgb(254, 242, 242)"); // red
    expect(badgeText("222")).toContain("1 of 3 filters");
  });

  it("is idempotent: a second pass over an unchanged card changes nothing", () => {
    renderList("111");
    const index = memory({ "111": seenEntry() });

    decorateDocuments([document], index);
    const first = document.querySelector("[data-canvasjob-badges]");
    const stats = decorateDocuments([document], index);

    expect(stats.decorated).toBe(0);
    expect(document.querySelectorAll("[data-canvasjob-badges]")).toHaveLength(1);
    // Same node, not a rebuilt one — no flicker while the user scrolls.
    expect(document.querySelector("[data-canvasjob-badges]")).toBe(first);
  });

  it("re-badges a card that LinkedIn re-rendered while scrolling", () => {
    renderList("111");
    const index = memory({ "111": seenEntry() });
    decorateDocuments([document], index);

    // Virtualisation: the card scrolls out and comes back as a fresh element.
    const list = document.querySelector("ul") as HTMLElement;
    list.innerHTML = card("111", "Job 0");
    expect(document.querySelector("[data-canvasjob-badges]")).toBeNull();

    const stats = decorateDocuments([document], index);

    expect(stats.decorated).toBe(1);
    expect(badgeText("111")).toContain("2 of 3 filters");
  });

  it("re-renders when what we know about the job changes", () => {
    renderList("111");
    decorateDocuments([document], memory({ "111": seenEntry() }));

    const stats = decorateDocuments(
      [document],
      memory({ "111": seenEntry({ tracker: { status: "applied", appliedAt: "2026-09-12T09:00:00Z" } }) }),
    );

    expect(stats.decorated).toBe(1);
    expect(badgeText("111")).toContain("Applied");
  });

  it("hides a verdict from filters the user has since changed", () => {
    renderList("111");
    const stale = seenEntry({
      verdict: { sig: "old-sig", passed: 3, failed: 0, unknown: 0, total: 3, at: Date.now() },
    });

    decorateDocuments([document], memory({ "111": stale }));

    // Nothing left worth saying about this card, so nothing is drawn.
    expect(badgeText("111")).toBe("");
    expect(document.querySelector("[data-canvasjob-badges]")).toBeNull();
  });

  it("badges a job tracked on another device even though it was never opened here", () => {
    renderList("111");
    const trackedOnly: JobMemoryEntry = {
      firstSeenAt: Date.now(),
      lastSeenAt: Date.now(),
      visits: 0,
      tracker: { status: "applied", appliedAt: "2026-09-12T09:00:00Z" },
    };

    decorateDocuments([document], memory({ "111": trackedOnly }));

    expect(badgeText("111")).toContain("Applied");
  });

  it("cleans up after itself when the memory of a job is gone", () => {
    renderList("111");
    decorateDocuments([document], memory({ "111": seenEntry() }));

    const stats = decorateDocuments([document], memory({}));

    expect(stats.cleared).toBe(1);
    expect(document.querySelector("[data-canvasjob-badges]")).toBeNull();
    expect(document.querySelector("li")?.hasAttribute("data-canvasjob-stamp")).toBe(false);
  });

  it("never squeezes a flex card by becoming a greedy flex item", () => {
    // Regression, 2026-09-18: LinkedIn's card container is a flex ROW. A row
    // styled `flex: 1 0 100%` inside it refused to shrink and collapsed the
    // title column to one character per line.
    document.body.innerHTML = `
      <ul>
        <li>
          <div class="card" style="display: flex; flex-direction: row;">
            <a href="/jobs/view/111/"><img alt=""></a>
            <div class="text-column">
              <a href="/jobs/view/111/">Senior Backend Engineer</a><span>Acme Corp</span>
            </div>
          </div>
        </li>
      </ul>`;

    decorateDocuments([document], memory({ "111": seenEntry() }));

    const row = document.querySelector("[data-canvasjob-badges]") as HTMLElement;
    // It lands in the card's text column, under the title — never as a third
    // item competing with the logo and the text for the row's width.
    expect(row.parentElement?.className).toBe("text-column");
    expect(row.style.flex).toBe("");
    expect(row.style.flexGrow).toBe("");
    expect(row.style.flexBasis).toBe("");
  });

  it("wraps onto its own line when the card itself is the flex container", () => {
    document.body.innerHTML = `
      <ul>
        <li style="display: flex; flex-direction: row;">
          <a href="/jobs/view/111/">Senior Backend Engineer</a><span>Acme Corp</span>
        </li>
      </ul>`;

    decorateDocuments([document], memory({ "111": seenEntry() }));

    const li = document.querySelector("li") as HTMLElement;
    const row = li.querySelector("[data-canvasjob-badges]") as HTMLElement;
    // The one case where we touch LinkedIn's own style: let the row break.
    expect(li.style.flexWrap).toBe("wrap");
    expect(row.style.flexBasis).toBe("100%");
  });

  it("falls back to the card when a flex row has no text column to speak of", () => {
    document.body.innerHTML = `
      <ul>
        <li>
          <div class="card" style="display: flex;">
            <a href="/jobs/view/111/">Job</a>
          </div>
        </li>
      </ul>`;

    decorateDocuments([document], memory({ "111": seenEntry() }));

    expect(document.querySelector("[data-canvasjob-badges]")?.parentElement?.tagName).toBe("LI");
  });

  it("puts the badges inside the card's padded box, not flush against the <li>", () => {
    renderList("111");

    decorateDocuments([document], memory({ "111": seenEntry() }));

    const row = document.querySelector("[data-canvasjob-badges]");
    expect(row?.parentElement?.className).toContain("-inner");
    // The stamp stays on the element the scanner returns.
    expect(document.querySelector("li")?.hasAttribute("data-canvasjob-stamp")).toBe(true);
  });

  it("finishes a long list across passes instead of blocking one frame", () => {
    const ids = Array.from({ length: 60 }, (_, i) => String(9000 + i));
    renderList(...ids);
    const jobs = Object.fromEntries(ids.map((id) => [id, seenEntry()]));

    const first = decorateDocuments([document], memory(jobs));
    expect(first.truncated).toBe(true);

    const second = decorateDocuments([document], memory(jobs));
    expect(second.truncated).toBe(false);
    expect(document.querySelectorAll("[data-canvasjob-badges]")).toHaveLength(60);
  });

  it("does not disturb the card's own links", () => {
    renderList("111");
    const before = document.querySelectorAll('a[href*="/jobs/view/"]').length;

    decorateDocuments([document], memory({ "111": seenEntry() }));

    expect(document.querySelectorAll('a[href*="/jobs/view/"]')).toHaveLength(before);
    // And the card is still found on the next scan, badges and all.
    expect(scanJobCards(document).cards.map((c) => c.jobId)).toEqual(["111"]);
  });
});
