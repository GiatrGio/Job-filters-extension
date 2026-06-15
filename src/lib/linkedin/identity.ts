// Job identity helpers that depend only on the URL and the document <title> —
// not on LinkedIn's (frequently-changing) DOM structure. These are the most
// stable hooks we have, so they live apart from the per-variant extractors and
// are shared by all of them.

export function getJobIdFromUrl(url: string = location.href): string | null {
  // Current URL shapes:
  //   https://www.linkedin.com/jobs/view/3891234567/
  //   https://www.linkedin.com/jobs/collections/.../?currentJobId=3891234567
  const viewMatch = url.match(/\/jobs\/view\/(\d+)/);
  if (viewMatch) return viewMatch[1];
  try {
    const u = new URL(url);
    const q = u.searchParams.get("currentJobId");
    if (q) return q;
  } catch {
    // malformed URL — fall through
  }
  return null;
}

// Locale- and layout-independent fallback for the job's identity when the
// structured selectors miss (see the 2026-06-09 note in jobs-v1). The only
// stable hook in the newer hashed-class variant is the document <title>. Two
// known shapes, in observed order of frequency:
//   "<Title> | <Company> | LinkedIn"                     (two-pane / new UI)
//   "<Company> hiring <Title> in <Location> | LinkedIn"  (standalone job view)
// A leading unread-count badge ("(14) ") and the trailing " | LinkedIn" brand
// suffix are stripped first. "LinkedIn" is the brand string in every locale, so
// this stays language-independent. Location is only recoverable from the second
// shape; otherwise it stays null (the side panel omits a missing location).
export function jobMetaFromDocTitle(
  rawTitle: string | null | undefined,
): { title: string | null; company: string | null; location: string | null } {
  const empty = { title: null, company: null, location: null };
  let t = (rawTitle ?? "").trim();
  if (!t) return empty;

  t = t
    .replace(/^\(\d+\)\s*/, "") // strip "(14) " unread badge
    .replace(/\s*[|\-–]\s*LinkedIn\s*$/i, "") // strip trailing brand suffix
    .trim();
  // Bare brand left over (e.g. "(14) LinkedIn" → "LinkedIn") means this is not a
  // job page (feed/notifications). Don't manufacture a "LinkedIn" job title.
  if (!t || /^linkedin$/i.test(t)) return empty;

  const hiring = t.match(/^(.+?)\s+hiring\s+(.+?)\s+in\s+(.+)$/i);
  if (hiring) {
    return { company: hiring[1].trim(), title: hiring[2].trim(), location: hiring[3].trim() };
  }

  const parts = t.split("|").map((s) => s.trim()).filter(Boolean);
  return { title: parts[0] ?? null, company: parts[1] ?? null, location: null };
}
