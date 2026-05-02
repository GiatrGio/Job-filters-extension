import { Check, HelpCircle, Info, X } from "lucide-react";
import type { EvaluationResult } from "@/shared/types";

// Result kind drives the icon: "question" means open-ended info extraction
// (the answer lives in `evidence`); "criterion" (or unset, for cached
// pre-migration results) keeps the original ✓/✗/❓ axis. The kind is
// classified server-side at filter-validation time and echoed back in
// every evaluation result.
function Icon({
  pass,
  isQuestion,
}: {
  pass: boolean | null;
  isQuestion: boolean;
}) {
  const base = "flex h-6 w-6 items-center justify-center rounded-full";
  if (isQuestion) {
    return (
      <span className={`${base} bg-sky-50 text-sky-700`}>
        <Info size={14} />
      </span>
    );
  }
  if (pass === true) {
    return (
      <span className={`${base} bg-emerald-50 text-emerald-700`}>
        <Check size={14} />
      </span>
    );
  }
  if (pass === false) {
    return (
      <span className={`${base} bg-destructive/10 text-destructive`}>
        <X size={14} />
      </span>
    );
  }
  return (
    <span className={`${base} bg-muted text-muted-foreground`}>
      <HelpCircle size={14} />
    </span>
  );
}

export function ResultRow({ result }: { result: EvaluationResult }) {
  const isQuestion = result.kind === "question";
  return (
    <li className="flex items-start gap-3 border-b py-3 last:border-0">
      <div className="mt-0.5 leading-none">
        <Icon pass={result.pass} isQuestion={isQuestion} />
      </div>
      <div className="flex-1">
        <div className="text-sm font-medium text-foreground">{result.filter}</div>
        <div className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {isQuestion && <span className="font-medium text-foreground">Answer: </span>}
          {result.evidence}
        </div>
      </div>
    </li>
  );
}
