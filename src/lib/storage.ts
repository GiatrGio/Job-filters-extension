import type { StoredEvaluation } from "@/shared/types";

const LAST_EVAL_KEY = "lastEvaluation";

export async function getLastEvaluation(): Promise<StoredEvaluation | null> {
  const r = await chrome.storage.local.get(LAST_EVAL_KEY);
  return (r[LAST_EVAL_KEY] as StoredEvaluation) ?? null;
}

export async function setLastEvaluation(value: StoredEvaluation): Promise<void> {
  await chrome.storage.local.set({ [LAST_EVAL_KEY]: value });
}
