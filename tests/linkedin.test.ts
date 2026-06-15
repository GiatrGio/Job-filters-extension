import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { getJobIdFromUrl, jobMetaFromDocTitle, scrapeJob } from "@/lib/linkedin";
import { jobsV1Extractor } from "@/lib/linkedin/jobs-v1.extractor";
import { snapshotFromDocuments } from "@/lib/linkedin/snapshot";
import type { ExtractionContext } from "@/lib/linkedin";

// Resolve from the project root (vitest's cwd). We avoid import.meta.url here:
// under the jsdom environment it resolves to the page URL (https://linkedin.com),
// not a file path, which breaks fileURLToPath.
const fixturesDir = path.resolve(process.cwd(), "tests/fixtures") + path.sep;
const fixtures = existsSync(fixturesDir)
  ? readdirSync(fixturesDir).filter((f) => f.endsWith(".html"))
  : [];

// --- Pure-function sanity check ----------------------------------------------
// Proves the jsdom harness runs even before any fixture exists.
describe("getJobIdFromUrl", () => {
  it("extracts the id from a /jobs/view/ url", () => {
    expect(getJobIdFromUrl("https://www.linkedin.com/jobs/view/4267892341/")).toBe("4267892341");
  });

  it("extracts the id from a currentJobId query param", () => {
    expect(
      getJobIdFromUrl("https://www.linkedin.com/jobs/collections/recommended/?currentJobId=4267892341"),
    ).toBe("4267892341");
  });
});

// --- Document <title> fallback parser ----------------------------------------
describe("jobMetaFromDocTitle", () => {
  it("parses the '<Title> | <Company> | LinkedIn' shape (new hashed-class UI)", () => {
    expect(jobMetaFromDocTitle("Backend (Mid-Level) Software Engineer | Granular Energy | LinkedIn")).toEqual({
      title: "Backend (Mid-Level) Software Engineer",
      company: "Granular Energy",
      location: null,
    });
  });

  it("parses the '<Company> hiring <Title> in <Location>' shape (standalone view)", () => {
    expect(jobMetaFromDocTitle("Acme Corp hiring Senior Backend Engineer in Remote, EU | LinkedIn")).toEqual({
      title: "Senior Backend Engineer",
      company: "Acme Corp",
      location: "Remote, EU",
    });
  });

  it("strips a leading unread-count badge", () => {
    expect(jobMetaFromDocTitle("(14) Backend Engineer | Granular Energy | LinkedIn")).toMatchObject({
      title: "Backend Engineer",
      company: "Granular Energy",
    });
  });

  it("returns nulls for a non-job title (e.g. the feed)", () => {
    expect(jobMetaFromDocTitle("(14) LinkedIn")).toEqual({ title: null, company: null, location: null });
  });

  it("is null-safe", () => {
    expect(jobMetaFromDocTitle(null)).toEqual({ title: null, company: null, location: null });
  });
});

// --- Extractor outcome logic -------------------------------------------------
// The extractor is pure given an ExtractionContext, so we drive it with isolated
// DOMParser documents instead of the global jsdom document. This is the contract
// Measure 2 (wall vs. evaluate) and Measure 3 (diagnostics) depend on.
function docFrom(bodyHtml: string): Document {
  return new DOMParser().parseFromString(
    `<!DOCTYPE html><html><body>${bodyHtml}</body></html>`,
    "text/html",
  );
}

function ctxFrom(bodyHtml: string, docTitle: string): ExtractionContext {
  return { jobId: "999", documents: [docFrom(bodyHtml)], docTitle };
}

const LONG_DESC =
  "We are hiring a backend engineer to build and operate our APIs, data " +
  "pipelines, and services. You will work across the stack and own delivery.";

describe("jobsV1Extractor.extract", () => {
  it("outcome 'ok' when description + identity selectors all match", () => {
    const result = jobsV1Extractor.extract(
      ctxFrom(
        `<div class="job-details-jobs-unified-top-card__job-title">Senior Backend Engineer</div>
         <div class="job-details-jobs-unified-top-card__company-name"><a>Acme Corp</a></div>
         <div id="job-details">${LONG_DESC}</div>`,
        "Senior Backend Engineer | Acme Corp | LinkedIn",
      ),
    );
    expect(result.outcome).toBe("ok");
    expect(result.job?.job_title).toBe("Senior Backend Engineer");
    expect(result.job?.job_company).toBe("Acme Corp");
    expect(result.fields.title.source).toBe(".job-details-jobs-unified-top-card__job-title");
    // location is optional, so its absence does not break "ok".
    expect(result.missing).not.toContain("title");
    expect(result.missing).not.toContain("company");
  });

  it("falls back to the document <title> for identity (and records the source)", () => {
    const result = jobsV1Extractor.extract(
      ctxFrom(`<div id="job-details">${LONG_DESC}</div>`, "Data Scientist | Globex | LinkedIn"),
    );
    expect(result.outcome).toBe("ok");
    expect(result.fields.title).toEqual({ value: "Data Scientist", source: "doc-title" });
    expect(result.fields.company).toEqual({ value: "Globex", source: "doc-title" });
  });

  it("outcome 'partial' when description is present but identity is unrecoverable", () => {
    const result = jobsV1Extractor.extract(
      ctxFrom(`<div id="job-details">${LONG_DESC}</div>`, "(14) LinkedIn"),
    );
    expect(result.outcome).toBe("partial");
    expect(result.job).not.toBeNull();
    expect(result.job?.job_description).toContain("backend engineer");
    expect(result.missing).toEqual(expect.arrayContaining(["title", "company"]));
    expect(result.fields.description.source).toBe("#job-details");
  });

  it("outcome 'failed' (no job) when no description can be found", () => {
    const result = jobsV1Extractor.extract(
      ctxFrom(`<div>nothing useful here</div>`, "(14) LinkedIn"),
    );
    expect(result.outcome).toBe("failed");
    expect(result.job).toBeNull();
    expect(result.missing).toContain("description");
  });
});

// --- Diagnostics snapshot sanitizer (PII guarantees) -------------------------
// This is the privacy-critical path: the snapshot must capture the JOB subtree
// (structure + job text) while EXCLUDING the member's identity and the global
// chrome. These tests pin those guarantees.
describe("snapshotFromDocuments", () => {
  it("scopes to <main> and excludes the global nav (member identity)", () => {
    const doc = docFrom(
      `<div id="global-nav"><span>Jane Doe</span><a href="/in/jane">Me</a></div>
       <main>
         <h1 class="_hashed1">Senior Backend Engineer</h1>
         <div class="_hashed2">Acme Corp</div>
         <section id="job-details">${LONG_DESC}</section>
       </main>`,
    );
    const html = snapshotFromDocuments([doc], []) ?? "";
    expect(html).toContain("Senior Backend Engineer");
    expect(html).toContain("_hashed1"); // structure preserved for selector fixes
    expect(html).not.toContain("Jane Doe"); // nav is outside <main> — never captured
    expect(html).not.toContain("global-nav");
  });

  it("strips scripts and all media (no avatars/image URLs)", () => {
    const doc = docFrom(
      `<main>
         <script>alert('x')</script>
         <img class="avatar" src="https://cdn/pic.jpg" alt="Jane Doe">
         <section id="job-details">${LONG_DESC}</section>
       </main>`,
    );
    const html = snapshotFromDocuments([doc], []) ?? "";
    expect(html).not.toContain("<script");
    expect(html).not.toContain("alert");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("pic.jpg");
    expect(html).toContain("job-details");
  });

  it("keeps structural attributes but drops href/src/aria-label", () => {
    const doc = docFrom(
      `<main><a class="keep-me" id="x" role="link" href="https://www.linkedin.com/in/jane"
         aria-label="Message Jane Doe" data-test="job-title">${LONG_DESC}</a></main>`,
    );
    const html = snapshotFromDocuments([doc], []) ?? "";
    expect(html).toContain('class="keep-me"');
    expect(html).toContain('data-test="job-title"');
    expect(html).not.toContain("href");
    expect(html).not.toContain("aria-label");
    expect(html).not.toContain("/in/jane");
  });

  it("redacts the member name, emails and phone numbers from text", () => {
    const doc = docFrom(
      `<main><section id="job-details">${LONG_DESC} Contact Jane Doe at
       jane@example.com or call +30 210 1234567 today.</section></main>`,
    );
    const html = snapshotFromDocuments([doc], ["Jane Doe"]) ?? "";
    expect(html).not.toContain("Jane Doe");
    expect(html).toContain("[redacted-name]");
    expect(html).not.toContain("jane@example.com");
    expect(html).toContain("[redacted-email]");
    expect(html).not.toContain("1234567");
    expect(html).toContain("[redacted-phone]");
  });

  it("drops the global nav even in the body fallback (no <main>)", () => {
    const doc = docFrom(
      `<div id="global-nav"><span>Jane Doe</span></div>
       <div class="job-card"><h1>Title Here</h1><p>${LONG_DESC}</p></div>`,
    );
    const html = snapshotFromDocuments([doc], []) ?? "";
    expect(html).not.toContain("Jane Doe");
    expect(html).not.toContain("global-nav");
    expect(html).toContain("job-card");
    expect(html).toContain("Title Here");
  });
});

// --- Captured-DOM replay -----------------------------------------------------
// Drop a real LinkedIn job page's outer HTML into tests/fixtures/*.html
// (see tests/fixtures/README.md). Each fixture is replayed through the actual
// scraper. With a fixture from a "broken" client bucket this goes RED today
// (null title/company) and must go GREEN once the scraper is fixed.
function loadFixture(name: string): void {
  const html = readFileSync(fixturesDir + name, "utf8");
  document.open();
  document.write(html);
  document.close();
}

describe.skipIf(fixtures.length === 0)("scrapeJob against captured LinkedIn DOM", () => {
  for (const name of fixtures) {
    it(`${name}: extracts title, company and description`, () => {
      loadFixture(name);
      const job = scrapeJob();

      // Surfaces what the scraper actually saw when an assertion fails.
      // eslint-disable-next-line no-console
      console.log(`[${name}]`, {
        title: job?.job_title,
        company: job?.job_company,
        location: job?.job_location,
        descLen: job?.job_description?.length ?? 0,
      });

      expect(job, "scrapeJob returned null — no description found in the fixture").not.toBeNull();
      expect(
        job?.job_description?.length ?? 0,
        "job_description looks empty",
      ).toBeGreaterThan(100);
      expect(job?.job_title, "job_title is null — scraper could not read the title").toBeTruthy();
      expect(job?.job_company, "job_company is null — scraper could not read the company").toBeTruthy();
    });
  }
});
