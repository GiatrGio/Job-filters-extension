import { Check, HelpCircle, X } from "lucide-react";
import type { EvaluationResult } from "@/shared/types";

function Icon({ pass }: { pass: boolean | null }) {
  const base = "flex h-6 w-6 items-center justify-center rounded-full";
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
  return (
    <li className="flex items-start gap-3 border-b py-3 last:border-0">
      <div className="mt-0.5 leading-none">
        <Icon pass={result.pass} />
      </div>
      <div className="flex-1">
        <div className="text-sm font-medium text-foreground">{result.filter}</div>
        <div className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {result.evidence}
        </div>
      </div>
    </li>
  );
}
