import { useEffect, useState } from "react";
import {
  Check,
  CircleArrowUp,
  Copy,
  Download,
  FileText,
  Loader2,
  PenLine,
  RefreshCw,
  Upload,
  UserPlus,
  X,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { openSettings } from "@/lib/links";
import { getLastCoverLetter, setLastCoverLetter } from "@/lib/storage";
import type {
  CoverLetterContent,
  CoverLetterSettings,
  ScrapedJob,
  UsageOut,
} from "@/shared/types";
import { COVER_LETTER_PDF_TEXT_MAX } from "@/shared/types";

// Compose the editable letter text from the identity block (header + signature,
// added client-side) and the generated prose. The user can freely edit the
// result before downloading — edits only affect the PDF, never the server.
function composeLetter(s: CoverLetterSettings, letter: CoverLetterContent): string {
  const headerLines = [s.full_name, s.email, s.phone, s.location]
    .map((x) => x.trim())
    .filter(Boolean);
  const date = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const blocks: string[] = [];
  if (headerLines.length) blocks.push(headerLines.join("\n"));
  blocks.push(date);
  if (letter.greeting.trim()) blocks.push(letter.greeting.trim());
  for (const p of letter.body_paragraphs) {
    if (p.trim()) blocks.push(p.trim());
  }
  if (letter.closing.trim()) blocks.push(letter.closing.trim());
  if (s.full_name.trim()) blocks.push(s.full_name.trim());
  return blocks.join("\n\n");
}

// Ask the backend to render the final, possibly edited text entirely in memory,
// then download the returned PDF bytes. The backend never stores the text/PDF.
async function downloadPdf(text: string, company: string | null): Promise<void> {
  const { blob, filename } = await api.createCoverLetterPdf({ text, company });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename ?? "Cover-Letter.pdf";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

function parseQuota(err: ApiError): { plan: string | null; usage: UsageOut | null } {
  const body = err.body as { plan?: unknown; usage?: unknown } | null | undefined;
  return {
    plan: typeof body?.plan === "string" ? body.plan : null,
    usage: (body?.usage as UsageOut | undefined) ?? null,
  };
}

type Phase =
  | { kind: "init" }
  | { kind: "intro" }
  | { kind: "need_identity" }
  | { kind: "need_cv" }
  | { kind: "generating" }
  | { kind: "ready" }
  | { kind: "quota"; plan: string | null }
  | { kind: "error"; message: string };

export function CoverLetterButton({ job }: { job: ScrapedJob }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent"
        title="Generate a cover letter for this job"
      >
        <PenLine size={12} aria-hidden="true" /> Cover letter
      </button>
      {open && <CoverLetterSheet job={job} onClose={() => setOpen(false)} />}
    </>
  );
}

function CoverLetterSheet({ job, onClose }: { job: ScrapedJob; onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>({ kind: "init" });
  const [settings, setSettings] = useState<CoverLetterSettings | null>(null);
  const [text, setText] = useState("");
  const [usage, setUsage] = useState<UsageOut | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmingRegen, setConfirmingRegen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // Persist the current (edited) letter so reopening the job shows it for free.
  function cache(next: string) {
    void setLastCoverLetter({
      jobId: job.linkedin_job_id,
      text: next,
      storedAt: Date.now(),
    });
  }

  function close() {
    if (phase.kind === "ready") cache(text);
    onClose();
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [me, settingsRes, cached] = await Promise.all([
          api.me().catch(() => null),
          api.getCoverLetterSettings(),
          getLastCoverLetter(),
        ]);
        if (cancelled) return;
        setSettings(settingsRes.settings);
        setUsage(me?.cover_letters ?? null);

        if (cached && cached.jobId === job.linkedin_job_id) {
          setText(cached.text);
          setPhase({ kind: "ready" });
          return;
        }
        if (!settingsRes.settings.full_name.trim()) {
          setPhase({ kind: "need_identity" });
          return;
        }
        setPhase({ kind: "intro" });
      } catch (err) {
        if (!cancelled) {
          setPhase({
            kind: "error",
            message: err instanceof ApiError ? err.message : String(err),
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [job.linkedin_job_id]);

  async function generate() {
    setConfirmingRegen(false);
    setPhase({ kind: "generating" });
    try {
      const resp = await api.generateCoverLetter({
        linkedin_job_id: job.linkedin_job_id,
        job_title: job.job_title,
        job_company: job.job_company,
        job_location: job.job_location,
        job_url: job.job_url,
        job_description: job.job_description,
      });
      setUsage(resp.usage);
      if (!resp.has_cv) {
        setPhase({ kind: "need_cv" });
        return;
      }
      if (!resp.has_identity || !settings || !resp.letter) {
        setPhase({ kind: "need_identity" });
        return;
      }
      const composed = composeLetter(settings, resp.letter);
      setText(composed);
      cache(composed);
      setPhase({ kind: "ready" });
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) {
        const { plan, usage: u } = parseQuota(err);
        if (u) setUsage(u);
        setPhase({ kind: "quota", plan });
        return;
      }
      setPhase({
        kind: "error",
        message: err instanceof ApiError ? err.message : String(err),
      });
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked; ignore — Download is the primary path.
    }
  }

  async function download() {
    cache(text);
    setDownloading(true);
    setDownloadError(null);
    try {
      await downloadPdf(text, job.job_company);
    } catch (err) {
      setDownloadError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setDownloading(false);
    }
  }

  const usageLine = usage ? `${usage.used} / ${usage.limit} cover letters this month` : null;

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background text-foreground">
      <header className="flex items-center justify-between border-b px-3 py-2">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <PenLine size={14} aria-hidden="true" /> Cover letter
        </span>
        <button
          type="button"
          onClick={close}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title="Close"
          aria-label="Close cover letter"
        >
          <X size={16} />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mb-3">
          <div className="text-base font-medium text-foreground">{job.job_title ?? "Job"}</div>
          <div className="text-sm text-muted-foreground">
            {[job.job_company, job.job_location].filter(Boolean).join(" · ")}
          </div>
        </div>

        {phase.kind === "init" && (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 size={15} className="animate-spin" aria-hidden="true" /> Loading…
          </div>
        )}

        {phase.kind === "intro" && (
          <div className="rounded-lg border bg-card p-4">
            <p className="text-sm leading-relaxed text-muted-foreground">
              We'll write a cover letter tailored to this job using your CV, your details, and your
              default instructions. You can edit it before downloading.
            </p>
            {usageLine && <p className="mt-2 text-xs text-muted-foreground">{usageLine}</p>}
            <button
              type="button"
              onClick={generate}
              className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <PenLine size={14} aria-hidden="true" /> Generate cover letter
            </button>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Uses one of your monthly generations.
            </p>
          </div>
        )}

        {phase.kind === "generating" && (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 size={15} className="animate-spin" aria-hidden="true" /> Writing your cover
            letter…
          </div>
        )}

        {phase.kind === "need_identity" && (
          <Nudge
            icon={UserPlus}
            title="Add your details first"
            body="We need your name and contact details to put in the letter's header and signature."
            cta="Open cover letter settings"
            onCta={() => {
              openSettings("cover");
              onClose();
            }}
          />
        )}

        {phase.kind === "need_cv" && (
          <Nudge
            icon={Upload}
            title="Upload your CV first"
            body="Your cover letter is written from your CV. Upload it once in Job fit settings."
            cta="Open Job fit settings"
            onCta={() => {
              openSettings("fit");
              onClose();
            }}
          />
        )}

        {phase.kind === "quota" && (
          <div className="rounded-lg border bg-card p-4 text-sm">
            <p className="font-medium text-destructive">
              You've used all your cover letters this month.
            </p>
            {usageLine && <p className="mt-1 text-xs text-muted-foreground">{usageLine}</p>}
            {phase.plan === "pro" ? (
              <p className="mt-2 leading-relaxed text-muted-foreground">
                You've hit the monthly safety limit for Pro. Email{" "}
                <a
                  href="mailto:canvasjob@gmail.com"
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  canvasjob@gmail.com
                </a>{" "}
                and we'll refresh your limit.
              </p>
            ) : (
              <button
                type="button"
                disabled
                className="mt-3 inline-flex w-full cursor-not-allowed items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground opacity-60"
              >
                <CircleArrowUp size={14} aria-hidden="true" /> Pro coming soon…
              </button>
            )}
          </div>
        )}

        {phase.kind === "error" && (
          <div className="rounded-lg border bg-card p-4 text-sm">
            <p className="font-medium text-destructive">Couldn't generate the letter.</p>
            <p className="mt-1 text-muted-foreground">{phase.message}</p>
            <button
              type="button"
              onClick={generate}
              className="mt-3 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Try again
            </button>
          </div>
        )}

        {phase.kind === "ready" && (
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
              <FileText size={15} aria-hidden="true" /> Your letter
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={COVER_LETTER_PDF_TEXT_MAX}
              rows={18}
              className="w-full resize-y rounded-md border border-input bg-background p-3 text-sm leading-relaxed text-foreground outline-none focus:ring-2 focus:ring-ring/20"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Edit freely — the final text is sent securely for PDF rendering only when you
              download, and neither the text nor PDF is stored on our servers.
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void download()}
                disabled={downloading}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
              >
                {downloading ? (
                  <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                ) : (
                  <Download size={14} aria-hidden="true" />
                )}
                {downloading ? "Preparing PDF…" : "Download PDF"}
              </button>
              <button
                type="button"
                onClick={copy}
                className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
              >
                {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            {downloadError && (
              <p className="mt-2 text-xs text-destructive">Couldn't download: {downloadError}</p>
            )}

            <div className="mt-3 border-t pt-3">
              {confirmingRegen ? (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">
                    Regenerate? This uses another generation.
                  </span>
                  <button
                    type="button"
                    onClick={generate}
                    className="rounded-md bg-primary px-2.5 py-1 font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    Regenerate
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingRegen(false)}
                    className="rounded-md px-2 py-1 font-medium text-muted-foreground hover:text-foreground"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingRegen(true)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-primary underline-offset-4 hover:underline"
                >
                  <RefreshCw size={12} aria-hidden="true" /> Regenerate
                </button>
              )}
              {usageLine && <p className="mt-2 text-[11px] text-muted-foreground">{usageLine}</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Nudge({
  icon: Icon,
  title,
  body,
  cta,
  onCta,
}: {
  icon: React.ElementType;
  title: string;
  body: string;
  cta: string;
  onCta: () => void;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon size={18} aria-hidden="true" />
      </div>
      <div className="text-sm font-medium text-foreground">{title}</div>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{body}</p>
      <button
        type="button"
        onClick={onCta}
        className="mt-3 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        {cta}
      </button>
    </div>
  );
}
