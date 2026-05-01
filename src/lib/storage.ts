import type { StoredEvaluation } from "@/shared/types";

const LAST_EVAL_KEY = "lastEvaluation";

export async function getLastEvaluation(): Promise<StoredEvaluation | null> {
  const r = await chrome.storage.local.get(LAST_EVAL_KEY);
  return (r[LAST_EVAL_KEY] as StoredEvaluation) ?? null;
}

export async function setLastEvaluation(value: StoredEvaluation): Promise<void> {
  await chrome.storage.local.set({ [LAST_EVAL_KEY]: value });
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
