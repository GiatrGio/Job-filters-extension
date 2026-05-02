// Mirror of the backend pydantic schemas. Keep in sync manually — a schema
// mismatch will surface as a TypeScript error at the API client boundary.

export type EvaluationPass = boolean | null;

// Two filter shapes the backend distinguishes (see migration 0006). The
// extension uses this on the way out (passing kind into createFilter)
// and on the way in (icon + copy in the side panel result row).
export type FilterKind = "criterion" | "question";

export interface EvaluationResult {
  filter: string;
  pass: EvaluationPass;
  evidence: string;
  // Optional for backward compatibility with cached results created
  // before the backend started populating it. Treat missing as
  // "criterion" — that's the historical default.
  kind?: FilterKind;
}

export interface UsageOut {
  used: number;
  limit: number;
  period: string; // 'YYYY-MM'
}

export interface EvaluateRequest {
  linkedin_job_id: string;
  job_title?: string | null;
  job_company?: string | null;
  job_location?: string | null;
  job_url?: string | null;
  job_description: string;
}

export interface EvaluateResponse {
  cached: boolean;
  results: EvaluationResult[];
  usage: UsageOut;
}

// Caps must match app/schemas/profile.py and app/schemas/filter.py.
export const FILTER_TEXT_MAX = 200;
export const PROFILE_NAME_MAX = 50;
export const MAX_PROFILES_PER_USER = 5;
export const MAX_FILTERS_PER_PROFILE = 10;

// Marker for the auto-seeded starter profile. Must match the backend's
// STARTER_PROFILE_NAME in app/routers/profiles.py — the options page
// uses this to decide whether to show the "edit or delete me" banner.
export const STARTER_PROFILE_NAME = "Starter pack";

export interface FilterOut {
  id: string;
  user_id: string;
  profile_id: string;
  text: string;
  position: number;
  enabled: boolean;
  kind: FilterKind;
  created_at: string;
  updated_at: string;
}

export interface FilterCreate {
  text: string;
  position?: number;
  enabled?: boolean;
  kind?: FilterKind;
}

export interface FilterUpdate {
  text?: string;
  position?: number;
  enabled?: boolean;
  kind?: FilterKind;
}

export interface FilterProfileOut {
  id: string;
  user_id: string;
  name: string;
  position: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface FilterProfileWithFilters extends FilterProfileOut {
  filters: FilterOut[];
}

export interface FilterProfileCreate {
  name: string;
}

export interface FilterProfileUpdate {
  name?: string;
}

export interface ReorderRequest {
  ids: string[];
}

export interface MeResponse {
  email: string;
  plan: string;
  usage: UsageOut;
}

// Filter quality validation. The backend classifies a single user-supplied
// filter into one of three buckets so the UI can either accept silently
// (good), warn but allow (vague), or block (rejected).
export type FilterValidationVerdict = "good" | "vague" | "rejected";

export interface FilterValidationRequest {
  text: string;
}

export interface FilterValidationResponse {
  verdict: FilterValidationVerdict;
  reason: string;
  suggestion: string | null;
  // Always populated, even on vague/rejected verdicts, so a save-anyway
  // flow can persist the right kind without a second classification.
  kind: FilterKind;
  usage: UsageOut;
}

// Tracker — mirrors app/schemas/application.py on the backend. Kept in sync
// manually with canvasjob-web/lib/types.ts; both must agree with pydantic.
export type ApplicationStatus =
  | "saved"
  | "applied"
  | "interviewing"
  | "offer"
  | "rejected"
  | "withdrawn";

export interface ApplicationCreate {
  source: string;
  external_id: string;
  title?: string | null;
  company?: string | null;
  location?: string | null;
  url?: string | null;
  description?: string | null;
  status?: ApplicationStatus;
}

export interface Application {
  id: string;
  user_id: string;
  source: string;
  external_id: string;
  title: string | null;
  company: string | null;
  location: string | null;
  url: string | null;
  description: string | null;
  status: ApplicationStatus;
  applied_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// Scraped from the LinkedIn DOM by the content script.
export interface ScrapedJob {
  linkedin_job_id: string;
  job_title: string | null;
  job_company: string | null;
  job_location: string | null;
  job_url: string;
  job_description: string;
}

// Messages exchanged between content script, background worker, and side panel.
export type ExtensionMessage =
  | { type: "JOB_SCRAPED"; job: ScrapedJob }
  | { type: "REQUEST_EVALUATION"; job: ScrapedJob }
  | { type: "EVALUATION_READY"; job: ScrapedJob; response: EvaluateResponse }
  | { type: "EVALUATION_ERROR"; jobId: string; error: string; status?: number }
  | { type: "RESCAN" }
  | { type: "REQUEST_RESCAN" }
  | { type: "SIDEPANEL_READY" }
  | { type: "GET_LAST_RESULT" };

export interface StoredEvaluation {
  job: ScrapedJob;
  response: EvaluateResponse;
  storedAt: number;
}
