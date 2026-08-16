import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  getAccessToken: vi.fn(async () => "test-token"),
}));

vi.mock("@/lib/env", () => ({
  ENV: { API_URL: "https://api.example.test" },
}));

import { api, ApiError } from "@/lib/api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createCoverLetterPdf", () => {
  it("returns PDF bytes and the server-provided filename", async () => {
    const fetchMock = vi.fn(async () =>
      new Response("%PDF-1.4 test", {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": 'attachment; filename="Cover-Letter-Acme.pdf"',
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await api.createCoverLetterPdf({ text: "Dear Acme", company: "Acme" });

    expect(result.filename).toBe("Cover-Letter-Acme.pdf");
    expect(await result.blob.text()).toBe("%PDF-1.4 test");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.test/cover-letter/pdf",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ text: "Dear Acme", company: "Acme" }),
        headers: expect.objectContaining({
          Authorization: "Bearer test-token",
          "Content-Type": "application/json",
        }),
      }),
    );
  });

  it("preserves structured API errors instead of treating them as PDF data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ detail: "letter text must not be blank" }), {
          status: 422,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(api.createCoverLetterPdf({ text: "" })).rejects.toEqual(
      expect.objectContaining<ApiError>({
        status: 422,
        message: "letter text must not be blank",
      }),
    );
  });
});

describe("createWebHandoff", () => {
  it("creates an authenticated one-time website link", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          url: "https://www.canvasjob.com/auth/extension?ticket=one-time-ticket",
          expires_in: 60,
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await api.createWebHandoff({ destination: "/app?view=board" });

    expect(result.expires_in).toBe(60);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.test/auth/web-handoffs",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ destination: "/app?view=board" }),
        headers: expect.objectContaining({ Authorization: "Bearer test-token" }),
      }),
    );
  });
});
