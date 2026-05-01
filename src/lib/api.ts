import { ENV } from "./env";
import { getAccessToken } from "./auth";
import type {
  Application,
  ApplicationCreate,
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
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
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

  if (!res.ok) {
    // Read once as text, then try to parse as JSON. Calling res.json()
    // first and falling back to res.text() throws "body stream already read"
    // because the stream is consumed on the first call even when parsing
    // fails.
    const raw = await res.text();
    let detail = raw;
    try {
      const body = JSON.parse(raw);
      detail = body?.error ?? body?.detail ?? raw;
    } catch {
      // not JSON — fall through with the raw text
    }
    throw new ApiError(res.status, detail || res.statusText);
  }

  // DELETE endpoints return 204 with no body.
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  evaluate: (body: EvaluateRequest) =>
    request<EvaluateResponse>("/evaluate", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  me: () => request<MeResponse>("/me"),

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
