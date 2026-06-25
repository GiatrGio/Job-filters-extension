import { ENV } from "./env";
import { getAccessToken } from "./auth";
import type {
  Application,
  ApplicationCreate,
  CvProfile,
  CvProfileResponse,
  DomDiagnosticsPayload,
  EvaluateFitResponse,
  EvaluateRequest,
  EvaluateResponse,
  FilterCreate,
  FilterOut,
  FilterProfileCreate,
  FilterProfileOut,
  FilterProfileUpdate,
  FilterProfileWithFilters,
  FilterUpdate,
  FilterValidationRequest,
  FilterValidationResponse,
  MeResponse,
  ReorderRequest,
} from "@/shared/types";

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function parseResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    // Read once as text, then try to parse as JSON. Calling res.json()
    // first and falling back to res.text() throws "body stream already read"
    // because the stream is consumed on the first call even when parsing
    // fails.
    const raw = await res.text();
    let body: unknown = raw;
    try {
      body = JSON.parse(raw);
    } catch {
      // not JSON — fall through with the raw text
    }
    throw new ApiError(res.status, errorMessageFromBody(body, res.statusText), body);
  }

  // DELETE endpoints return 204 with no body.
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getAccessToken();
  if (!token) throw new ApiError(401, "not signed in");

  const res = await fetch(`${ENV.API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });
  return parseResponse<T>(res);
}

// Multipart upload (CV file). Deliberately does NOT set Content-Type — the
// browser adds the multipart boundary itself.
async function requestForm<T>(path: string, form: FormData): Promise<T> {
  const token = await getAccessToken();
  if (!token) throw new ApiError(401, "not signed in");

  const res = await fetch(`${ENV.API_URL}${path}`, {
    method: "POST",
    body: form,
    headers: { Authorization: `Bearer ${token}` },
  });
  return parseResponse<T>(res);
}

function errorMessageFromBody(body: unknown, fallback: string): string {
  if (typeof body === "string") return body || fallback;
  const parsed = body as { detail?: unknown; error?: unknown } | null | undefined;
  const detail = parsed?.detail;
  if (typeof detail === "string") return detail;
  if (
    detail &&
    typeof detail === "object" &&
    "error" in detail &&
    typeof detail.error === "string"
  ) {
    return detail.error;
  }
  if (typeof parsed?.error === "string") return parsed.error;
  return fallback;
}

export const api = {
  evaluate: (body: EvaluateRequest) =>
    request<EvaluateResponse>("/evaluate", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  // Fit evaluation — separate endpoint from /evaluate so the side panel can
  // render the filter checklist and the match meter independently.
  evaluateFit: (body: EvaluateRequest) =>
    request<EvaluateFitResponse>("/evaluate-fit", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  // --- CV / job fit ---------------------------------------------------------
  // 200 + null when the user has not uploaded a CV yet.
  getCv: () => request<CvProfileResponse | null>("/cv"),

  uploadCv: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return requestForm<CvProfileResponse>("/cv", form);
  },

  // Save a user-edited profile (e.g. added skills). Re-hashes server-side, so
  // the next job view re-evaluates fit against the edited profile.
  updateCv: (profile: CvProfile) =>
    request<CvProfileResponse>("/cv", {
      method: "PUT",
      body: JSON.stringify(profile),
    }),

  deleteCv: () => request<void>("/cv", { method: "DELETE" }),

  me: () => request<MeResponse>("/me"),

  // Best-effort DOM telemetry sent on extraction failure/partial (Measure 3).
  // The backend logs it, runs a diagnostic LLM analysis, and surfaces it in
  // /admin. Returns 204 — the client doesn't need the analysis.
  sendDomDiagnostics: (body: DomDiagnosticsPayload) =>
    request<void>("/diagnostics/dom", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  // --- profiles --------------------------------------------------------------
  listProfiles: () => request<FilterProfileWithFilters[]>("/profiles"),

  createProfile: (body: FilterProfileCreate) =>
    request<FilterProfileOut>("/profiles", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  updateProfile: (id: string, body: FilterProfileUpdate) =>
    request<FilterProfileOut>(`/profiles/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  deleteProfile: (id: string) =>
    request<void>(`/profiles/${id}`, { method: "DELETE" }),

  activateProfile: (id: string) =>
    request<FilterProfileOut>(`/profiles/${id}/activate`, { method: "POST" }),

  reorderProfiles: (body: ReorderRequest) =>
    request<FilterProfileOut[]>("/profiles/reorder", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  // --- filters within a profile ---------------------------------------------
  createFilter: (profileId: string, body: FilterCreate) =>
    request<FilterOut>(`/profiles/${profileId}/filters`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  reorderFilters: (profileId: string, body: ReorderRequest) =>
    request<FilterOut[]>(`/profiles/${profileId}/filters/reorder`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  updateFilter: (id: string, body: FilterUpdate) =>
    request<FilterOut>(`/filters/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  deleteFilter: (id: string) =>
    request<void>(`/filters/${id}`, { method: "DELETE" }),

  validateFilter: (body: FilterValidationRequest) =>
    request<FilterValidationResponse>("/filters/validate", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  // --- tracker (/applications) ---------------------------------------------
  // 404 (not yet tracked) is a normal answer, not a failure. The "Track this
  // job" button calls this on mount to decide whether to render Track or
  // "Tracked ✓".
  getApplicationByJob: async (
    source: string,
    externalId: string,
  ): Promise<Application | null> => {
    try {
      return await request<Application>(
        `/applications/by-job/${encodeURIComponent(source)}/${encodeURIComponent(externalId)}`,
      );
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return null;
      throw err;
    }
  },

  createApplication: (body: ApplicationCreate) =>
    request<Application>("/applications", {
      method: "POST",
      body: JSON.stringify(body),
    }),
};
