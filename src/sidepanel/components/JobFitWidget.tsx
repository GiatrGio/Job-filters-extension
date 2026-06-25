import { useState } from "react";
import { AlertTriangle, Check, ChevronDown, ChevronUp, Target, Upload } from "lucide-react";
import type { EvaluateFitResponse, FitDimensions, JobFitResult } from "@/shared/types";

// Maps a 1–5 score to a Tailwind colour family. 4–5 reads as a strong match
// (green), 3 as mixed (amber), 1–2 as a stretch (rose — deliberately not the
// harsher "destructive" red, so a low score informs rather than discourages).
function scoreColors(score: number): { fill: string; text: string; chip: string } {
  if (score >= 4) return { fill: "bg-emerald-500", text: "text-emerald-700", chip: "bg-emerald-50" };
  if (score === 3) return { fill: "bg-amber-500", text: "text-amber-700", chip: "bg-amber-50" };
  return { fill: "bg-rose-500", text: "text-rose-700", chip: "bg-rose-50" };
}

const SCORE_LABELS: Record<number, string> = {
  1: "Poor fit",
  2: "Weak match",
  3: "Partial match",
  4: "Strong match",
  5: "Excellent match",
};

function SegmentBar({ score, fill, size = "md" }: { score: number; fill: string; size?: "sm" | "md" }) {
  const height = size === "sm" ? "h-1" : "h-1.5";
  return (
    <div className="flex gap-1" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((n) => (
        <div
          key={n}
          className={`${height} flex-1 rounded-full ${n <= score ? fill : "bg-muted"}`}
        />
      ))}
    </div>
  );
}

function DimensionRow({ label, value }: { label: string; value: number }) {
  const { fill } = scoreColors(value);
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 shrink-0 text-xs text-muted-foreground">{label}</span>
      <div className="flex-1">
        <SegmentBar score={value} fill={fill} size="sm" />
      </div>
    </div>
  );
}

const DIMENSION_LABELS: { key: keyof FitDimensions; label: string }[] = [
  { key: "skills", label: "Skills" },
  { key: "experience", label: "Experience" },
  { key: "domain", label: "Domain" },
];

function FitDetails({ fit }: { fit: JobFitResult }) {
  return (
    <div className="mt-3 space-y-3">
      <div className="space-y-2">
        {DIMENSION_LABELS.map(({ key, label }) => (
          <DimensionRow key={key} label={label} value={fit.dimensions[key]} />
        ))}
      </div>

      {fit.strengths.length > 0 && (
        <div>
          <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-emerald-700">
            <Check size={13} aria-hidden="true" /> Strengths
          </div>
          <ul className="space-y-1">
            {fit.strengths.map((s, i) => (
              <li key={i} className="text-xs leading-relaxed text-foreground">
                {s.point}
                {s.evidence && <span className="text-muted-foreground"> — {s.evidence}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {fit.gaps.length > 0 && (
        <div>
          <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-amber-700">
            <AlertTriangle size={13} aria-hidden="true" /> Gaps to address
          </div>
          <ul className="space-y-1">
            {fit.gaps.map((g, i) => (
              <li key={i} className="text-xs leading-relaxed text-foreground">
                {g.point}
                {g.evidence && <span className="text-muted-foreground"> — {g.evidence}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function FitCard({ fit, onOpenOptions }: { fit: JobFitResult; onOpenOptions: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const colors = scoreColors(fit.score);

  return (
    <div className="rounded-lg border bg-card p-3 text-card-foreground">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <Target size={14} aria-hidden="true" /> Your match
        </span>
        <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${colors.chip} ${colors.text}`}>
          {fit.score} / 5 · {SCORE_LABELS[fit.score]}
        </span>
      </div>

      <div className="mt-2">
        <SegmentBar score={fit.score} fill={colors.fill} />
      </div>

      {fit.summary && (
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{fit.summary}</p>
      )}

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-4 hover:underline"
        aria-expanded={expanded}
      >
        {expanded ? (
          <>
            Hide details <ChevronUp size={13} aria-hidden="true" />
          </>
        ) : (
          <>
            See what fits and what's missing <ChevronDown size={13} aria-hidden="true" />
          </>
        )}
      </button>

      {expanded && (
        <>
          <FitDetails fit={fit} />
          <div className="mt-3 flex items-center justify-between border-t pt-2 text-[11px] text-muted-foreground">
            <span>Based on your CV</span>
            <button
              type="button"
              onClick={onOpenOptions}
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Edit
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function NoCvCard({ onOpenOptions }: { onOpenOptions: () => void }) {
  return (
    <div className="rounded-lg border border-dashed bg-card p-3 text-card-foreground">
      <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
        <Target size={14} aria-hidden="true" /> See how you match
      </div>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        Upload your CV once to get a 1–5 fit score — with your strengths and gaps — on every job
        you open. We only keep a non-identifying summary, never your name or contact details.
      </p>
      <button
        type="button"
        onClick={onOpenOptions}
        className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        <Upload size={13} aria-hidden="true" /> Upload your CV
      </button>
    </div>
  );
}

function LoadingCard() {
  return (
    <div className="rounded-lg border bg-card p-3 text-card-foreground">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <Target size={14} aria-hidden="true" /> Your match
        </span>
        <span className="text-xs text-muted-foreground">Checking…</span>
      </div>
      <div className="mt-2 flex gap-1" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((n) => (
          <div key={n} className="h-1.5 flex-1 animate-pulse rounded-full bg-muted" />
        ))}
      </div>
    </div>
  );
}

// Renders the match widget for the current job. `response` is the resolved fit
// for THIS job (null while still loading); `errored` is set when the fit call
// failed for this job (we degrade quietly — filters are the primary feature).
export function JobFitWidget({
  loading,
  response,
  errored,
  onOpenOptions,
}: {
  loading: boolean;
  response: EvaluateFitResponse | null;
  errored: boolean;
  onOpenOptions: () => void;
}) {
  if (response) {
    if (!response.has_cv) return <NoCvCard onOpenOptions={onOpenOptions} />;
    if (response.fit) return <FitCard fit={response.fit} onOpenOptions={onOpenOptions} />;
  }
  if (loading) return <LoadingCard />;
  if (errored) {
    return (
      <div className="rounded-lg border bg-card p-3 text-xs text-muted-foreground">
        Couldn&apos;t load your match for this job.
      </div>
    );
  }
  return null;
}
