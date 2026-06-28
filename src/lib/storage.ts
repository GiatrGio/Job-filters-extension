import type { StoredCoverLetter, StoredEvaluation, StoredFit } from "@/shared/types";

const LAST_EVAL_KEY = "lastEvaluation";
const LAST_FIT_KEY = "lastFit";
const LAST_COVER_LETTER_KEY = "lastCoverLetter";

export async function getLastEvaluation(): Promise<StoredEvaluation | null> {
  const r = await chrome.storage.local.get(LAST_EVAL_KEY);
  return (r[LAST_EVAL_KEY] as StoredEvaluation) ?? null;
}

export async function setLastEvaluation(value: StoredEvaluation): Promise<void> {
  await chrome.storage.local.set({ [LAST_EVAL_KEY]: value });
}

export async function getLastFit(): Promise<StoredFit | null> {
  const r = await chrome.storage.local.get(LAST_FIT_KEY);
  return (r[LAST_FIT_KEY] as StoredFit) ?? null;
}

export async function setLastFit(value: StoredFit): Promise<void> {
  await chrome.storage.local.set({ [LAST_FIT_KEY]: value });
}

// Last generated cover letter (the prose, possibly edited). Cached so re-opening
// a job re-displays it without spending another generation; the letter is never
// stored server-side. Keyed by job — a stale letter for another job is ignored.
export async function getLastCoverLetter(): Promise<StoredCoverLetter | null> {
  const r = await chrome.storage.local.get(LAST_COVER_LETTER_KEY);
  return (r[LAST_COVER_LETTER_KEY] as StoredCoverLetter) ?? null;
}

export async function setLastCoverLetter(value: StoredCoverLetter): Promise<void> {
  await chrome.storage.local.set({ [LAST_COVER_LETTER_KEY]: value });
}

// Onboarding flags. Each is a boolean we flip to true once dismissed; absent
// or false means the affected UI is still in its first-time state.
const ONBOARDING_FLAGS = [
  "starterBannerDismissed",
  "howItWorksDismissed",
  "coachMarksDismissed",
] as const;
export type OnboardingFlag = (typeof ONBOARDING_FLAGS)[number];

export async function getOnboardingFlag(key: OnboardingFlag): Promise<boolean> {
  const r = await chrome.storage.local.get(key);
  return r[key] === true;
}

export async function setOnboardingFlag(key: OnboardingFlag, value: boolean): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}
