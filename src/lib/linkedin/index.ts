// Public surface of the LinkedIn extraction adapter. Import from
// "@/lib/linkedin"; the per-variant extractors and DOM helpers are
// implementation details behind this barrel.

export { getJobIdFromUrl, jobMetaFromDocTitle } from "./identity";
export { extractJob, scrapeJob, waitForJobContent } from "./registry";
export { buildDomDiagnostics } from "./diagnostics";
export type {
  ExtractionContext,
  ExtractionFields,
  ExtractionOutcome,
  ExtractionResult,
  FieldProvenance,
  JobExtractor,
  JobField,
} from "./types";
