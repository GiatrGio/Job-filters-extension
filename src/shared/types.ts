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

export interface FilterOut {
  id: string;
  user_id: string;
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

export interface MeResponse {
  email: string;
  plan: string;
  usage: UsageOut;
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
  | { type: "SIDEPANEL_READY" }
  | { type: "GET_LAST_RESULT" };

export interface StoredEvaluation {
  job: ScrapedJob;
  response: EvaluateResponse;
  storedAt: number;
}
