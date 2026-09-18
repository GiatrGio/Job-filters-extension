/**
 * The local record of "jobs I have already opened".
 *
 * The rules that matter here are the ones that decide whether the feature feels
 * truthful: a first visit is not "seen before", repeat views inside one sitting
 * are one visit, and a verdict stops being shown the moment the filters behind
 * it change.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Application, EvaluationResult, JobMemoryIndex } from "@/shared/types";
import {
  EVIDENCE_TIER,
  MAX_JOBS,
  TTL_MS,
  VISIT_COALESCE_MS,
  filtersSignature,
  formatSeenDate,
  isVerdictCurrent,
  prune,
  readJobMemory,
  recordJobFit,
  recordJobTracker,
  recordJobVerdict,
  recordJobVisit,
  recordTrackedJobs,
} from "@/lib/jobMemory";

let store: Record<string, unknown>;

beforeEach(() => {
  store = {};
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: async (key: string) => ({ [key]: store[key] }),
        set: async (items: Record<string, unknown>) => {
          Object.assign(store, items);
        },
      },
    },
  });
});

const T0 = Date.parse("2026-09-01T10:00:00Z");

function results(...specs: Array<[string, boolean | null, string?]>): EvaluationResult[] {
  return specs.map(([filter, pass, kind]) => ({
    filter,
    pass,
    evidence: `because of ${filter}`,
    ...(kind ? { kind: kind as "question" | "criterion" } : {}),
  }));
}

describe("visits", () => {
  it("records a first visit", async () => {
    expect((await readJobMemory()).jobs["111"]).toBeUndefined();

    await recordJobVisit("111", { title: "Backend Engineer", at: T0 });

    const after = await readJobMemory();
    expect(after.jobs["111"]).toMatchObject({ visits: 1, firstSeenAt: T0, title: "Backend Engineer" });
  });

  it("counts repeat views inside one sitting as a single visit", async () => {
    await recordJobVisit("111", { at: T0 });
    await recordJobVisit("111", { at: T0 + VISIT_COALESCE_MS - 1 });

    const index = await readJobMemory();
    expect(index.jobs["111"].visits).toBe(1);
    expect(index.jobs["111"].lastSeenAt).toBe(T0 + VISIT_COALESCE_MS - 1);
  });

  it("counts a later return as a new visit and keeps the first date", async () => {
    await recordJobVisit("111", { at: T0 });
    await recordJobVisit("111", { at: T0 + VISIT_COALESCE_MS + 1 });
    await recordJobVisit("111", { at: T0 + 5 * VISIT_COALESCE_MS });

    const index = await readJobMemory();
    expect(index.jobs["111"]).toMatchObject({ visits: 3, firstSeenAt: T0 });
  });

  // Nothing displays the count today (LinkedIn marks viewed jobs itself), but
  // `lastSeenAt` is what the index is pruned by, so the record has to stay
  // honest about which jobs the user actually keeps coming back to.
});

describe("verdicts", () => {
  it("counts criteria only, leaving open questions out of the score", async () => {
    await recordJobVerdict(
      "111",
      results(
        ["Fully remote", true],
        ["Based in Greece", false],
        ["Salary over 6k", null],
        ["What is the tech stack?", null, "question"],
      ),
      { at: T0 },
    );

    const index = await readJobMemory();
    expect(index.jobs["111"].verdict).toMatchObject({ passed: 1, failed: 1, unknown: 1, total: 3 });
  });

  it("shows a verdict only while it describes the active filters", async () => {
    const original = results(["Fully remote", true], ["Based in Greece", false]);
    await recordJobVerdict("111", original, { at: T0 });

    let index = await readJobMemory();
    expect(isVerdictCurrent(index, index.jobs["111"])).toBe(true);

    // The user edits their filters; the next job evaluated carries the new set,
    // which becomes the active signature and strands the older verdict.
    await recordJobVerdict("222", results(["Fully remote", true], ["Pays in EUR", true]), { at: T0 });

    index = await readJobMemory();
    expect(isVerdictCurrent(index, index.jobs["111"])).toBe(false);
    expect(isVerdictCurrent(index, index.jobs["222"])).toBe(true);
    // The entry itself survives — the user still visited it.
    expect(index.jobs["111"].visits).toBe(0);
  });

  it("keeps a signature stable across re-evaluation but sensitive to order", () => {
    expect(filtersSignature(["a", "b"])).toBe(filtersSignature(["a", "b"]));
    expect(filtersSignature(["a", "b"])).not.toBe(filtersSignature(["b", "a"]));
    // Boundary-sensitive: two filters must not hash like one concatenated one.
    expect(filtersSignature(["ab", "c"])).not.toBe(filtersSignature(["a", "bc"]));
  });

  it("stores the evidence lines the hover card replays", async () => {
    await recordJobVerdict("111", results(["Fully remote", true]), { at: T0 });
    const index = await readJobMemory();
    expect(index.jobs["111"].verdict?.lines).toEqual([
      { filter: "Fully remote", pass: true, evidence: "because of Fully remote" },
    ]);
  });
});

describe("fit and tracker state", () => {
  it("records a match score and ignores a missing one", async () => {
    await recordJobFit("111", 4);
    await recordJobFit("222", undefined);

    const index = await readJobMemory();
    expect(index.jobs["111"].fit).toBe(4);
    expect(index.jobs["222"]).toBeUndefined();
  });

  it("remembers a tracked job without claiming the user opened it here", async () => {
    await recordJobTracker("111", application("111", "applied", "2026-09-12T09:00:00Z"));

    const index = await readJobMemory();
    expect(index.jobs["111"]).toMatchObject({
      visits: 0,
      tracker: { status: "applied", appliedAt: "2026-09-12T09:00:00Z" },
    });
  });

  it("drops the badge once the job is untracked", async () => {
    await recordJobTracker("111", application("111", "saved"));
    await recordJobTracker("111", null);

    const index = await readJobMemory();
    expect(index.jobs["111"].tracker).toBeUndefined();
  });

  it("syncs the whole tracker, including deletions made elsewhere", async () => {
    await recordTrackedJobs([application("111", "saved"), application("222", "applied")]);
    await recordTrackedJobs([application("222", "interviewing")]);

    const index = await readJobMemory();
    expect(index.jobs["111"].tracker).toBeUndefined();
    expect(index.jobs["222"].tracker).toMatchObject({ status: "interviewing" });
  });

  it("ignores applications from other job boards", async () => {
    const indeed = { ...application("999", "applied"), source: "indeed" };
    await recordTrackedJobs([indeed]);

    const index = await readJobMemory();
    expect(index.jobs["999"]).toBeUndefined();
  });
});

describe("pruning", () => {
  it("forgets stale jobs but never a tracked one", () => {
    const now = T0 + 10 * TTL_MS;
    const index: JobMemoryIndex = {
      version: 1,
      activeFiltersSig: null,
      jobs: {
        old: { firstSeenAt: T0, lastSeenAt: T0, visits: 1 },
        applied: {
          firstSeenAt: T0,
          lastSeenAt: T0,
          visits: 1,
          tracker: { status: "applied", appliedAt: null },
        },
        recent: { firstSeenAt: now, lastSeenAt: now, visits: 1 },
      },
    };

    prune(index, now);

    expect(Object.keys(index.jobs).sort()).toEqual(["applied", "recent"]);
  });

  it("caps the index and keeps the most recently seen jobs", () => {
    const now = T0;
    const jobs: JobMemoryIndex["jobs"] = {};
    for (let i = 0; i < MAX_JOBS + 10; i++) {
      jobs[`job-${i}`] = { firstSeenAt: now - i, lastSeenAt: now - i, visits: 1 };
    }
    const index: JobMemoryIndex = { version: 1, activeFiltersSig: null, jobs };

    prune(index, now);

    expect(Object.keys(index.jobs)).toHaveLength(MAX_JOBS);
    expect(index.jobs["job-0"]).toBeDefined();
    expect(index.jobs[`job-${MAX_JOBS + 9}`]).toBeUndefined();
  });

  it("keeps evidence for recent jobs only, and the counts for the rest", () => {
    const now = T0;
    const jobs: JobMemoryIndex["jobs"] = {};
    for (let i = 0; i < EVIDENCE_TIER + 5; i++) {
      jobs[`job-${i}`] = {
        firstSeenAt: now - i,
        lastSeenAt: now - i,
        visits: 1,
        verdict: {
          sig: "sig",
          passed: 1,
          failed: 0,
          unknown: 0,
          total: 1,
          at: now,
          lines: [{ filter: "Fully remote", pass: true, evidence: "yes" }],
        },
      };
    }
    const index: JobMemoryIndex = { version: 1, activeFiltersSig: "sig", jobs };

    prune(index, now);

    expect(index.jobs["job-0"].verdict?.lines).toHaveLength(1);
    const evicted = index.jobs[`job-${EVIDENCE_TIER + 4}`];
    expect(evicted.verdict?.lines).toBeUndefined();
    expect(evicted.verdict?.passed).toBe(1);
  });
});

describe("dates", () => {
  it("says Today and Yesterday before falling back to a date", () => {
    const now = Date.parse("2026-09-18T12:00:00");
    expect(formatSeenDate(Date.parse("2026-09-18T08:00:00"), now)).toBe("Today");
    expect(formatSeenDate(Date.parse("2026-09-17T23:00:00"), now)).toBe("Yesterday");
    expect(formatSeenDate(Date.parse("2026-09-06T10:00:00"), now)).toMatch(/6/);
  });
});

function application(externalId: string, status: Application["status"], appliedAt: string | null = null): Application {
  return {
    id: `app-${externalId}`,
    user_id: "u1",
    source: "linkedin",
    external_id: externalId,
    title: "Backend Engineer",
    company: "Acme",
    location: "Remote",
    url: `https://www.linkedin.com/jobs/view/${externalId}/`,
    description: null,
    status,
    applied_at: appliedAt,
    notes: null,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
  };
}
