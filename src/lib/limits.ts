/**
 * Free-tier allowances shown in the side panel's account sheet.
 *
 * These MIRROR the backend — they don't drive it. The enforced numbers live in
 * the API (and, for evaluations and cover letters, on each profile row, which
 * is why those two come back on /me rather than being read from here). Keep in
 * sync with canvasjob-web/lib/limits.ts or the two apps will quote different
 * numbers for the same account.
 *
 * VITE_* is inlined at BUILD time, so a new value needs a rebuild.
 */
function envInt(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

export const FREE_TRACKED_JOB_LIMIT = envInt(
  import.meta.env.VITE_FREE_TRACKED_JOB_LIMIT as string | undefined,
  20,
);
