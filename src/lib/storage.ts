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

// First-run onboarding wizard. This is a completion flag, distinct from the
// dismissal flags below: it gates whether the options page shows the guided
// setup wizard instead of the normal settings UI.
//
// Semantics are deliberately fail-safe for existing users: absent → treated as
// COMPLETE (skip the wizard). Only a fresh install writes an explicit `false`
// (see background onInstalled) to open the wizard, so an extension update never
// drops a set-up user back into onboarding even if the update handler is slow.
const ONBOARDING_COMPLETE_KEY = "onboardingComplete";

export async function getOnboardingComplete(): Promise<boolean> {
  const r = await chrome.storage.local.get(ONBOARDING_COMPLETE_KEY);
  return r[ONBOARDING_COMPLETE_KEY] !== false;
}

export async function setOnboardingComplete(value: boolean): Promise<void> {
  await chrome.storage.local.set({ [ONBOARDING_COMPLETE_KEY]: value });
}

// Side panel coach-mark tour. We persist the ids the user has clicked through
// rather than one "dismissed" boolean, so the tour resumes at the right step
// when the panel is closed part-way and a mark added for a new feature only
// shows that mark. Supersedes the old `coachMarksDismissed` flag, whose value
// is deliberately ignored — the tour was re-sequenced, so everyone sees it once.
const COACH_MARKS_SEEN_KEY = "coachMarksSeen";

export async function getSeenCoachMarks(): Promise<string[]> {
  const r = await chrome.storage.local.get(COACH_MARKS_SEEN_KEY);
  const stored = r[COACH_MARKS_SEEN_KEY];
  return Array.isArray(stored) ? stored.filter((id): id is string => typeof id === "string") : [];
}

export async function setSeenCoachMarks(ids: string[]): Promise<void> {
  await chrome.storage.local.set({ [COACH_MARKS_SEEN_KEY]: ids });
}
