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
  // Server-driven ratio at which the side panel shows the soft upgrade
  // banner. Optional for backward compat with cached responses captured
  // before the field existed; callers should fall back to
  // DEFAULT_WARNING_THRESHOLD.
  warning_threshold?: number;
}

// Fallback used when an older cached response lacks `warning_threshold`.
// Must match the backend default in app/config.py.
export const DEFAULT_WARNING_THRESHOLD = 0.8;

export interface EvaluateRequest {
  linkedin_job_id: string;
  job_title?: string | null;
  job_company?: string | null;
  job_location?: string | null;
  job_url?: string | null;
  job_description: string;
}

export interface EvaluateResponse {
  // Added after launch so fresh evaluation responses can correct a stale
  // /me snapshot immediately after upgrade/downgrade. Optional for stored
  // responses and older backend builds.
  plan?: string;
  cached: boolean;
  results: EvaluationResult[];
  usage: UsageOut;
}

// --- Job fit (CV-based match) ----------------------------------------------
// Mirrors app/schemas/fit.py. Fit is evaluated in a SEPARATE backend call from
// filter evaluation (POST /evaluate-fit), cached independently (keyed by the
// CV, not the filters), so the side panel renders the match meter independently
// of the filter checklist — and a filter edit never re-runs fit, nor vice versa.
export interface FitPoint {
  point: string;
  evidence: string;
}

export interface FitDimensions {
  skills: number; // 1–5
  experience: number; // 1–5
  domain: number; // 1–5
}

export interface JobFitResult {
  score: number; // overall 1–5
  dimensions: FitDimensions;
  strengths: FitPoint[];
  gaps: FitPoint[];
  summary: string;
}

export interface EvaluateFitResponse {
  cached: boolean;
  // false when the user hasn't uploaded a CV yet → the side panel shows the
  // "upload your CV" empty state and `fit` is null.
  has_cv: boolean;
  fit: JobFitResult | null;
  usage: UsageOut;
}

// --- CV profile (job-fit setup) --------------------------------------------
// Mirrors app/schemas/cv.py. Only non-PII professional signal is stored; the
// uploaded file is parsed server-side and discarded (no name/email/phone).
export type Seniority = "junior" | "mid" | "senior" | "lead" | "principal" | "unknown";

export interface CvProfile {
  skills: string[];
  years_experience: number | null;
  seniority: Seniority;
  titles: string[];
  domains: string[];
  education: string[];
  languages: string[];
  summary: string;
}

export interface CvProfileResponse {
  profile: CvProfile;
  updated_at: string | null;
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
  // Monthly cover-letter generation meter (separate from job evaluations).
  cover_letters: UsageOut;
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

// --- Cover letter ----------------------------------------------------------
// Mirrors app/schemas/cover_letter.py. The generated letter is NEVER stored
// server-side — it's returned here and cached client-side (StoredCoverLetter).
// The identity block IS stored server-side (the user's choice); only
// `instructions` reaches the LLM. The header/signature are composed
// client-side from the identity fields, which can be pre-filled from the CV.
export const COVER_LETTER_INSTRUCTIONS_MAX = 2000;
export const COVER_LETTER_FULL_NAME_MAX = 120;
export const COVER_LETTER_EMAIL_MAX = 160;
export const COVER_LETTER_PHONE_MAX = 40;
export const COVER_LETTER_LOCATION_MAX = 160;
export const COVER_LETTER_PDF_TEXT_MAX = 20_000;

export interface CoverLetterSettings {
  // Single block: how the letter should read + any achievements to emphasize.
  instructions: string;
  full_name: string;
  email: string;
  phone: string;
  location: string;
}

export interface CoverLetterSettingsResponse {
  settings: CoverLetterSettings;
  updated_at: string | null;
}

export interface CoverLetterContent {
  greeting: string;
  body_paragraphs: string[];
  closing: string;
}

export interface GenerateCoverLetterResponse {
  // false when the user has no CV / no name yet → the side panel nudges to
  // settings instead of spending a generation. `letter` is null in that case.
  has_cv: boolean;
  has_identity: boolean;
  letter: CoverLetterContent | null;
  usage: UsageOut;
}

export interface CoverLetterPdfRequest {
  text: string;
  company?: string | null;
}

export interface CoverLetterInstructionsValidationRequest {
  text: string;
}

export interface CoverLetterInstructionsValidationResponse {
  verdict: FilterValidationVerdict;
  reason: string;
  suggestion: string | null;
  usage: UsageOut;
}

// Persisted last cover letter so re-opening a job shows it (and the user's
// edits) without spending another generation. Keyed by job, like StoredFit.
export interface StoredCoverLetter {
  jobId: string;
  text: string;
  storedAt: number;
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

export interface WebHandoffCreate {
  destination: string;
}

export interface WebHandoffCreateResponse {
  url: string;
  expires_in: number;
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

// Diagnostics sent to the backend when DOM extraction fails or comes back
// partial (Measure 3). Mirrors app/schemas/diagnostics.py on the backend.
// "Capture the job, exclude the user": telemetry + a sanitized snapshot of the
// JOB POSTING subtree only — the member's identity and the global chrome are
// excluded/redacted (see lib/linkedin/snapshot for the privacy rationale). One
// per browser session, gated in the background.
export interface DomFieldReport {
  name: string; // "title" | "company" | "location" | "description"
  found: boolean;
  // The strategy that produced the value (a selector string, "doc-title",
  // "anchor", …) or null when nothing matched. Never the value itself.
  source: string | null;
}

export interface DomDiagnosticsPayload {
  extractor: string; // e.g. "jobs-v1"
  outcome: "ok" | "partial" | "failed";
  job_id: string;
  url: string;
  doc_title: string; // the job's <title>, never the member's identity
  missing: string[];
  fields: DomFieldReport[];
  // Sanitized job-container HTML (structure + job text; member identity, global
  // chrome and media excluded/redacted; capped ~50KB). null when no usable job
  // subtree was found. This is what lets us see where moved fields now live.
  job_html: string | null;
  user_agent: string;
  captured_at: string; // ISO
}

// Messages exchanged between content script, background worker, and side panel.
export type ExtensionMessage =
  // diagnostics is attached on a "partial" scrape (description present, identity
  // missing) so the background can fire a telemetry report while still
  // evaluating. Absent on a clean ("ok") scrape.
  | { type: "JOB_SCRAPED"; job: ScrapedJob; diagnostics?: DomDiagnosticsPayload }
  | { type: "REQUEST_EVALUATION"; job: ScrapedJob }
  | { type: "EVALUATION_READY"; job: ScrapedJob; response: EvaluateResponse }
  // Fit arrives on its own message so it can paint after (or independently of)
  // the filter checklist — progressive rendering. Fired alongside evaluation.
  | { type: "FIT_READY"; job: ScrapedJob; response: EvaluateFitResponse }
  | { type: "FIT_ERROR"; jobId: string; error: string; status?: number }
  | {
      type: "EVALUATION_ERROR";
      jobId: string;
      error: string;
      status?: number;
      plan?: string;
      usage?: UsageOut;
    }
  // Sent when extraction failed outright (no description anywhere). The side
  // panel shows the "LinkedIn changed" wall; the background fires a diagnostic.
  | { type: "SCRAPE_FAILED"; jobId: string; diagnostics: DomDiagnosticsPayload }
  | { type: "RESCAN" }
  | { type: "REQUEST_RESCAN" }
  | { type: "SIDEPANEL_HEARTBEAT" }
  | { type: "SIDEPANEL_READY" }
  | { type: "GET_LAST_RESULT" };

export interface StoredEvaluation {
  job: ScrapedJob;
  response: EvaluateResponse;
  storedAt: number;
}

// Persisted "last fit" so the panel can paint the match meter instantly on
// reopen, keyed by job so a stale fit for a different job is ignored.
export interface StoredFit {
  jobId: string;
  response: EvaluateFitResponse;
  storedAt: number;
}
