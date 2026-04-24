import type { EvaluationResult } from "@/shared/types";

function Icon({ pass }: { pass: boolean | null }) {
  if (pass === true) return <span className="text-green-600">✅</span>;
  if (pass === false) return <span className="text-red-600">❌</span>;
  return <span className="text-gray-400">❓</span>;
}

export function ResultRow({ result }: { result: EvaluationResult }) {
  return (
    <li className="flex items-start gap-2 py-2 border-b border-gray-100 last:border-0">
      <div className="mt-0.5 text-lg leading-none">
        <Icon pass={result.pass} />
      </div>
      <div className="flex-1">
        <div className="text-sm text-gray-900">{result.filter}</div>
        <div className="mt-1 text-xs text-gray-500 italic">{result.evidence}</div>
      </div>
    </li>
  );
}
