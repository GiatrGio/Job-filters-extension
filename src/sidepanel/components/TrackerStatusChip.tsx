import { Check } from "lucide-react";
import { formatSeenDate } from "@/lib/jobMemory";
import type { Application } from "@/shared/types";

/**
 * A single chip under the job title saying where this job stands in the
 * tracker — but only once it has moved past "saved", because the button in the
 * header already says "Tracked" and repeating that is noise.
 *
 * There is deliberately no "you have seen this before" chip here: LinkedIn
 * marks viewed jobs itself, so ours only added a second label saying the same
 * thing (2026-09-18).
 */
export function TrackerStatusChip({
  tracker,
}: {
  // undefined = the tracker probe hasn't answered yet, null = confirmed not tracked.
  tracker: Application | null | undefined;
}) {
  const label = tracker && tracker.status !== "saved" ? trackerLabel(tracker) : null;
  if (!label) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
      <span className="inline-flex items-center gap-1 rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-[11px] font-semibold text-teal-700">
        <Check size={11} aria-hidden="true" />
        {label}
      </span>
    </div>
  );
}

function trackerLabel(application: Application): string {
  switch (application.status) {
    case "applied":
      return application.applied_at
        ? `Applied ${formatSeenDate(Date.parse(application.applied_at))}`
        : "Applied";
    case "interviewing":
      return "Interviewing";
    case "offer":
      return "Offer";
    case "rejected":
      return "Rejected";
    case "withdrawn":
      return "Withdrawn";
    default:
      return "Tracked";
  }
}
