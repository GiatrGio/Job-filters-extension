import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createWebHandoff } = vi.hoisted(() => ({
  createWebHandoff: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: { createWebHandoff },
}));

vi.mock("@/lib/env", () => ({
  ENV: { WEB_URL: "https://www.canvasjob.com" },
}));

import { openAuthenticatedWebPath, openSettings } from "@/lib/links";

const createTab = vi.fn(async () => undefined);

beforeEach(() => {
  createWebHandoff.mockReset();
  createTab.mockClear();
  vi.stubGlobal("chrome", { tabs: { create: createTab } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("openAuthenticatedWebPath", () => {
  it("opens the one-time handoff URL", async () => {
    createWebHandoff.mockResolvedValue({
      url: "https://www.canvasjob.com/auth/extension?ticket=abc",
      expires_in: 60,
    });

    await openAuthenticatedWebPath("/app?view=board");

    expect(createWebHandoff).toHaveBeenCalledWith({ destination: "/app?view=board" });
    expect(createTab).toHaveBeenCalledWith({
      url: "https://www.canvasjob.com/auth/extension?ticket=abc",
      active: true,
    });
  });

  it("falls back to the direct destination when the API is unavailable", async () => {
    createWebHandoff.mockRejectedValue(new Error("offline"));

    await openAuthenticatedWebPath("/app?view=board");

    expect(createTab).toHaveBeenCalledWith({
      url: "https://www.canvasjob.com/app?view=board",
      active: true,
    });
  });

  it("rejects a handoff URL on an unexpected origin", async () => {
    createWebHandoff.mockResolvedValue({
      url: "https://evil.example/auth/extension?ticket=abc",
      expires_in: 60,
    });

    await openAuthenticatedWebPath("/pricing");

    expect(createTab).toHaveBeenCalledWith({
      url: "https://www.canvasjob.com/pricing",
      active: true,
    });
  });

  it("does not request encoded external destinations", async () => {
    await expect(openAuthenticatedWebPath("/%252F%252Fevil.example")).rejects.toThrow(
      "website destination must be an internal path",
    );
    expect(createWebHandoff).not.toHaveBeenCalled();
    expect(createTab).not.toHaveBeenCalled();
  });
});

// Settings live on the website; the extension only deep-links into them.
describe("openSettings", () => {
  it("hands off to the website's settings dialog on the requested tab", async () => {
    createWebHandoff.mockResolvedValue({
      url: "https://www.canvasjob.com/auth/extension?ticket=abc",
      expires_in: 60,
    });

    openSettings("cover");
    await vi.waitFor(() => expect(createTab).toHaveBeenCalled());

    expect(createWebHandoff).toHaveBeenCalledWith({ destination: "/app?settings=cover" });
  });

  it("defaults to the filters tab", async () => {
    createWebHandoff.mockRejectedValue(new Error("offline"));

    openSettings();
    await vi.waitFor(() => expect(createTab).toHaveBeenCalled());

    expect(createTab).toHaveBeenCalledWith({
      url: "https://www.canvasjob.com/app?settings=filters",
      active: true,
    });
  });
});
