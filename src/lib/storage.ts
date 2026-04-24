import type { StoredEvaluation } from "@/shared/types";

const AUTO_EVAL_KEY = "autoEvalEnabled";
const LAST_EVAL_KEY = "lastEvaluation";
const JOB_CACHE_PREFIX = "jobCache:";

export async function getAutoEvalEnabled(): Promise<boolean> {
  const r = await chrome.storage.local.get(AUTO_EVAL_KEY);
  return r[AUTO_EVAL_KEY] !== false; // default ON
}

export async function setAutoEvalEnabled(v: boolean): Promise<void> {
  await chrome.storage.local.set({ [AUTO_EVAL_KEY]: v });
}

export async function getLastEvaluation(): Promise<StoredEvaluation | null> {
  const r = await chrome.storage.local.get(LAST_EVAL_KEY);
  return (r[LAST_EVAL_KEY] as StoredEvaluation) ?? null;
}

export async function setLastEvaluation(value: StoredEvaluation): Promise<void> {
  await chrome.storage.local.set({ [LAST_EVAL_KEY]: value });
}

export async function getCachedJobResult(
  jobId: string,
): Promise<StoredEvaluation | null> {
  const key = JOB_CACHE_PREFIX + jobId;
  const r = await chrome.storage.local.get(key);
  return (r[key] as StoredEvaluation) ?? null;
}

export async function putCachedJobResult(value: StoredEvaluation): Promise<void> {
  const key = JOB_CACHE_PREFIX + value.job.linkedin_job_id;
  await chrome.storage.local.set({ [key]: value });
}
