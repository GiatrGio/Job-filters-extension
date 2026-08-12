/**
 * Drives the side panel's first-run tour end-to-end: the bubbles must appear
 * one at a time, in order, with an honest "step/total" counter, and the
 * progress must survive the panel being closed part-way through.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { FilterProfileWithFilters, MeResponse, StoredEvaluation } from "@/shared/types";

const mocks = vi.hoisted(() => ({
  api: {
    listProfiles: vi.fn(),
    me: vi.fn(),
    getApplicationByJob: vi.fn(),
    activateProfile: vi.fn(),
  },
}));

vi.mock("@/lib/api", () => ({
  api: mocks.api,
  ApiError: class ApiError extends Error {},
}));

vi.mock("@/lib/auth", () => ({
  getAccessToken: vi.fn(async () => "test-token"),
  SUPABASE_AUTH_STORAGE_KEY: "sb-test-auth-token",
}));

import App, { COACH_MARKS } from "@/sidepanel/App";

const USAGE = { used: 3, limit: 20, period: "2026-08", warning_threshold: 0.8 };

const EVALUATION: StoredEvaluation = {
  job: {
    linkedin_job_id: "4267892341",
    job_title: "Backend Engineer",
    job_company: "Acme",
    job_location: "Remote",
    job_url: "https://www.linkedin.com/jobs/view/4267892341/",
    job_description: "We are hiring.",
  },
  response: { cached: false, plan: "free", results: [], usage: USAGE },
  storedAt: Date.now(),
};

const ME: MeResponse = {
  email: "user@example.test",
  plan: "free",
  usage: USAGE,
  cover_letters: { used: 0, limit: 5, period: "2026-08" },
};

function profile(name: string, position: number): FilterProfileWithFilters {
  return {
    id: `p${position}`,
    user_id: "u1",
    name,
    position,
    is_active: position === 0,
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
    filters: [],
  };
}

let store: Record<string, unknown>;
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  store = { lastEvaluation: EVALUATION };
  mocks.api.listProfiles.mockResolvedValue([profile("Backend roles", 0), profile("Data roles", 1)]);
  mocks.api.me.mockResolvedValue(ME);
  // 404 on the tracked-job lookup is the "not tracked yet" path.
  mocks.api.getApplicationByJob.mockResolvedValue(null);

  const noopListener = { addListener: () => {}, removeListener: () => {} };
  vi.stubGlobal("chrome", {
    runtime: {
      connect: () => ({
        postMessage: () => {},
        disconnect: () => {},
        onDisconnect: { addListener: () => {} },
      }),
      onMessage: noopListener,
      sendMessage: async () => {},
      openOptionsPage: () => {},
    },
    storage: {
      local: {
        get: async (key: string) => ({ [key]: store[key] }),
        set: async (items: Record<string, unknown>) => {
          Object.assign(store, items);
        },
      },
      onChanged: noopListener,
    },
    tabs: { create: async () => {} },
  });
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

async function renderPanel(): Promise<void> {
  container = document.createElement("div");
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container);
    root.render(createElement(App));
  });
  // The init effect chains storage → auth → profiles → /me; each await needs
  // its own flush before the panel has painted its final state.
  for (let i = 0; i < 3; i++) await act(async () => {});
}

function buttonsLabelled(label: string): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll("button")).filter(
    (b) => b.textContent?.trim() === label,
  );
}

// Bubbles are matched on their body copy, not their title: titles deliberately
// echo a heading already on the page ("Your match"), so matching those would
// also hit the very widget the bubble points at.
function visibleMarkIds(): string[] {
  const text = container.textContent ?? "";
  return COACH_MARKS.filter((m) => text.includes(m.body)).map((m) => m.id);
}

async function click(el: HTMLElement): Promise<void> {
  await act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("side panel coach marks", () => {
  it("shows one bubble at a time, in order, and records the finished tour", async () => {
    await renderPanel();

    for (const [index, mark] of COACH_MARKS.entries()) {
      const step = index + 1;
      expect(visibleMarkIds()).toEqual([mark.id]);
      expect(container.textContent).toContain(`${step}/${COACH_MARKS.length}`);

      const gotIt = buttonsLabelled("Got it");
      expect(gotIt).toHaveLength(1);
      // Skipping "the rest" is meaningless on the final step — "Got it" ends it.
      expect(buttonsLabelled("Skip tutorial")).toHaveLength(
        step === COACH_MARKS.length ? 0 : 1,
      );

      await click(gotIt[0]);
    }

    expect(visibleMarkIds()).toEqual([]);
    expect(store.coachMarksSeen).toEqual(COACH_MARKS.map((m) => m.id));
  });

  it("dismisses every remaining bubble when the tour is skipped", async () => {
    await renderPanel();

    await click(buttonsLabelled("Skip tutorial")[0]);

    expect(visibleMarkIds()).toEqual([]);
    expect(buttonsLabelled("Got it")).toHaveLength(0);
    expect(store.coachMarksSeen).toEqual(COACH_MARKS.map((m) => m.id));
  });

  it("resumes at the next unseen step after the panel is reopened", async () => {
    store.coachMarksSeen = [COACH_MARKS[0].id, COACH_MARKS[1].id];

    await renderPanel();

    expect(visibleMarkIds()).toEqual([COACH_MARKS[2].id]);
    expect(container.textContent).toContain(`3/${COACH_MARKS.length}`);
  });

  it("drops steps whose control isn't on screen", async () => {
    // No profiles → no profile selector in the footer, so the tour is 3 steps
    // and never promises a bubble that has nothing to point at.
    mocks.api.listProfiles.mockResolvedValue([]);

    await renderPanel();

    expect(container.textContent).toContain("1/3");

    for (let i = 0; i < 3; i++) await click(buttonsLabelled("Got it")[0]);

    expect(visibleMarkIds()).toEqual([]);
    expect(store.coachMarksSeen).toEqual(["coverLetter", "trackJob", "fit"]);
  });
});
