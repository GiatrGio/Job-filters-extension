// Mirror of the backend pydantic schemas. Keep in sync manually — a schema
// mismatch will surface as a TypeScript error at the API client boundary.

export type EvaluationPass = boolean | null;

export interface EvaluationResult {
  filter: string;
  pass: EvaluationPass;
  evidence: string;
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

export interface FilterOut {
  id: string;
  user_id: string;
  profile_id: string;
  text: string;
  position: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface FilterCreate {
  text: string;
  position?: number;
  enabled?: boolean;
}

export interface FilterUpdate {
  text?: string;
  position?: number;
  enabled?: boolean;
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
