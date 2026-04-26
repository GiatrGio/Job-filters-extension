import { useEffect, useState } from "react";
import { Bookmark, Check, ExternalLink } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { openDashboardJob } from "@/lib/links";
import type { Application, ScrapedJob } from "@/shared/types";

/**
 * "Track this job" button — shown in the side-panel header next to the job
 * title. Three states:
 *   1. untracked → primary "Track this job" button → POST /applications
 *   2. saving    → disabled "Saving…"
 *   3. tracked   → muted "Tracked ✓" + "Open in dashboard" link
 *
 * On mount and on every job change we call /applications/by-job/<source>/<id>
 * to decide which state to render. 404 means not yet tracked.
 */
export function TrackJobButton({ job }: { job: ScrapedJob }) {
  const [tracked, setTracked] = useState<Application | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-check tracked state every time the job changes — the user may navigate
  // between jobs without closing the panel.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setTracked(null);
    void (async () => {
      try {
        const existing = await api.getApplicationByJob("linkedin", job.linkedin_job_id);
        if (!cancelled) setTracked(existing);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [job.linkedin_job_id]);

  async function track() {
    setSaving(true);
    setError(null);
    try {
      const created = await api.createApplication({
        source: "linkedin",
        external_id: job.linkedin_job_id,
        title: job.job_title,
        company: job.job_company,
        location: job.job_location,
        url: job.job_url,
        description: job.job_description,
      });
      setTracked(created);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    // Don't render anything during the initial probe — flicker is worse than
    // a tiny delay before the button appears.
    return null;
  }

  if (tracked) {
    return (
      <div className="flex items-center gap-2 text-xs">
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700">
          <Check size={12} /> Tracked
        </span>
        <button
          onClick={() => openDashboardJob(tracked.id)}
          className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline"
        >
          Open in dashboard <ExternalLink size={11} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={track}
        disabled={saving}
        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
      >
        <Bookmark size={12} />
        {saving ? "Saving…" : "Track this job"}
      </button>
      {error && <span className="text-[11px] text-destructive">{error}</span>}
    </div>
  );
}
