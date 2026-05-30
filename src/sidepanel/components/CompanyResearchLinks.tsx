import { ExternalLink } from "lucide-react";
import { openGlassdoorCompanySearch, openIndeedCompanySearch } from "@/lib/links";

export function CompanyResearchLinks({ company }: { company: string | null }) {
  const companyName = company?.trim();
  if (!companyName) return null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={() => openGlassdoorCompanySearch(companyName)}
        className="inline-flex h-7 items-center gap-1 rounded-full border border-border bg-background px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
        aria-label={`Search ${companyName} on Glassdoor`}
      >
        Glassdoor
        <ExternalLink size={11} aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => openIndeedCompanySearch(companyName)}
        className="inline-flex h-7 items-center gap-1 rounded-full border border-border bg-background px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
        aria-label={`Search ${companyName} on Indeed`}
      >
        Indeed
        <ExternalLink size={11} aria-hidden="true" />
      </button>
    </div>
  );
}
