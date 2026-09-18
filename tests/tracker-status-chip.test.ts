/**
 * The one chip the side panel adds under the job title. What matters is what it
 * does NOT say: nothing about having seen the job before (LinkedIn's own
 * "Viewed" label already covers that), and no "Tracked" when the button beside
 * it says exactly that.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Application } from "@/shared/types";
import { TrackerStatusChip } from "@/sidepanel/components/TrackerStatusChip";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function render(tracker: Application | null | undefined): Promise<string> {
  container = document.createElement("div");
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container);
    root.render(createElement(TrackerStatusChip, { tracker }));
  });
  return container.textContent ?? "";
}

describe("TrackerStatusChip", () => {
  it("renders nothing while the tracker probe is still out", async () => {
    expect(await render(undefined)).toBe("");
  });

  it("renders nothing for an untracked job", async () => {
    expect(await render(null)).toBe("");
  });

  it("does not repeat the Track button's own state", async () => {
    expect(await render(application("saved"))).toBe("");
  });

  it("surfaces a status the user has moved on to, with its date", async () => {
    expect(await render(application("applied", "2026-09-12T09:00:00Z"))).toContain("Applied");
  });

  it("names the later stages", async () => {
    expect(await render(application("interviewing"))).toContain("Interviewing");
  });
});

function application(status: Application["status"], appliedAt: string | null = null): Application {
  return {
    id: "app-1",
    user_id: "u1",
    source: "linkedin",
    external_id: "111",
    title: "Backend Engineer",
    company: "Acme",
    location: "Remote",
    url: "https://www.linkedin.com/jobs/view/111/",
    description: null,
    status,
    applied_at: appliedAt,
    notes: null,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
  };
}
