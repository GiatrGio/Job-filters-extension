import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  FileText,
  Loader2,
  PenLine,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import {
  COVER_LETTER_EMAIL_MAX,
  COVER_LETTER_FULL_NAME_MAX,
  COVER_LETTER_INSTRUCTIONS_MAX,
  COVER_LETTER_LOCATION_MAX,
  COVER_LETTER_PHONE_MAX,
  type CoverLetterSettings,
} from "@/shared/types";

const EMPTY: CoverLetterSettings = {
  instructions: "",
  full_name: "",
  email: "",
  phone: "",
  location: "",
};

// Drives the instructions quality check on save. `verdict` mirrors the filter
// flow: vague warns but allows "Save anyway"; rejected blocks until edited.
type ValidationState =
  | { kind: "idle" }
  | { kind: "validating" }
  | { kind: "verdict"; verdict: "vague" | "rejected"; reason: string; suggestion: string | null }
  | { kind: "quota" }
  | { kind: "error"; message: string };

function TextField({
  label,
  value,
  onChange,
  placeholder,
  max,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  max: number;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-muted-foreground">{label}</span>
      <input
        type={type}
        value={value}
        maxLength={max}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring/20"
      />
    </label>
  );
}

export function CoverLetterPanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedTick, setSavedTick] = useState(false);
  const [draft, setDraft] = useState<CoverLetterSettings>(EMPTY);
  // Instructions text already accepted (loaded from server or validated good /
  // saved anyway) — lets us skip re-validating unchanged instructions on save.
  const [acceptedInstructions, setAcceptedInstructions] = useState("");
  const [validation, setValidation] = useState<ValidationState>({ kind: "idle" });

  useEffect(() => {
    void (async () => {
      try {
        const res = await api.getCoverLetterSettings();
        setDraft(res.settings);
        setAcceptedInstructions(res.settings.instructions.trim());
      } catch (err) {
        setError(err instanceof ApiError ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function update(patch: Partial<CoverLetterSettings>) {
    setDraft((d) => ({ ...d, ...patch }));
    setSavedTick(false);
    if (patch.instructions !== undefined && validation.kind !== "idle") {
      setValidation({ kind: "idle" });
    }
  }

  async function persist() {
    const saved = await api.updateCoverLetterSettings(draft);
    setDraft(saved.settings);
    setAcceptedInstructions(saved.settings.instructions.trim());
    setValidation({ kind: "idle" });
    setSavedTick(true);
  }

  async function save({ skipInstructionCheck = false }: { skipInstructionCheck?: boolean } = {}) {
    if (saving) return;
    const instructions = draft.instructions.trim();
    const needsCheck =
      !skipInstructionCheck && instructions.length > 0 && instructions !== acceptedInstructions;

    setSaving(true);
    setError(null);

    if (needsCheck) {
      setValidation({ kind: "validating" });
      try {
        const res = await api.validateCoverLetterInstructions({ text: instructions });
        if (res.verdict === "rejected" || res.verdict === "vague") {
          setValidation({
            kind: "verdict",
            verdict: res.verdict,
            reason: res.reason,
            suggestion: res.suggestion,
          });
          setSaving(false);
          return; // rejected blocks; vague waits for "Save anyway"
        }
        // good → fall through and persist.
      } catch (err) {
        setSaving(false);
        if (err instanceof ApiError && err.status === 402) {
          setValidation({ kind: "quota" });
        } else {
          setValidation({
            kind: "error",
            message: err instanceof ApiError ? err.message : String(err),
          });
        }
        return;
      }
    }

    try {
      await persist();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  const isRejected = validation.kind === "verdict" && validation.verdict === "rejected";
  const isVague = validation.kind === "verdict" && validation.verdict === "vague";

  return (
    <section className="mx-auto max-w-6xl px-6 py-6">
      <div className="rounded-lg border bg-card p-5 text-card-foreground shadow-sm">
        <div className="flex items-center gap-2">
          <PenLine size={18} className="text-primary" aria-hidden="true" />
          <h2 className="text-base font-semibold text-foreground">Cover letter</h2>
        </div>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          Set your details and default instructions once. Then, on any job, click{" "}
          <span className="font-medium text-foreground">Generate cover letter</span> in the side
          panel to get a tailored letter you can download as a PDF.
        </p>

        <div className="mt-3 flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          <ShieldCheck size={15} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
          <span>
            Your name and contact details are stored so we can put them in the letter header. The
            letter itself is generated on demand and never stored on our servers — it's downloaded
            straight to your device.
          </span>
        </div>

        {error && (
          <p className="mt-4 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        {loading ? (
          <p className="mt-5 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 size={15} className="animate-spin" aria-hidden="true" /> Loading…
          </p>
        ) : (
          <div className="mt-5 space-y-6">
            {/* Identity block */}
            <div>
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
                <FileText size={15} aria-hidden="true" /> Your details
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField
                  label="Full name"
                  value={draft.full_name}
                  onChange={(v) => update({ full_name: v })}
                  placeholder="Jane Doe"
                  max={COVER_LETTER_FULL_NAME_MAX}
                />
                <TextField
                  label="Email"
                  type="email"
                  value={draft.email}
                  onChange={(v) => update({ email: v })}
                  placeholder="jane@example.com"
                  max={COVER_LETTER_EMAIL_MAX}
                />
                <TextField
                  label="Phone"
                  value={draft.phone}
                  onChange={(v) => update({ phone: v })}
                  placeholder="+30 690 000 0000"
                  max={COVER_LETTER_PHONE_MAX}
                />
                <TextField
                  label="Location"
                  value={draft.location}
                  onChange={(v) => update({ location: v })}
                  placeholder="Athens, Greece"
                  max={COVER_LETTER_LOCATION_MAX}
                />
              </div>
            </div>

            {/* Instructions & emphasis (validated on save) */}
            <div>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-foreground">
                  Default instructions &amp; other things to consider{" "}
                  <span className="font-normal text-muted-foreground">(optional)</span>
                </span>
                <span className="mb-2 block text-xs text-muted-foreground">
                  How the letter should read — tone, length, paragraphs — and anything specific to
                  emphasize, like concrete achievements your CV summary can't capture.
                </span>
                <textarea
                  value={draft.instructions}
                  maxLength={COVER_LETTER_INSTRUCTIONS_MAX}
                  rows={5}
                  onChange={(e) => update({ instructions: e.target.value })}
                  placeholder="e.g. Two short paragraphs, warm but professional. Emphasize that I led a 5-person team that cut checkout latency by 40%."
                  className={`w-full resize-y rounded-md border bg-background px-3 py-2 text-sm leading-relaxed text-foreground outline-none focus:ring-2 focus:ring-ring/20 ${
                    isRejected
                      ? "border-destructive/40"
                      : isVague
                        ? "border-amber-300"
                        : "border-input"
                  }`}
                />
              </label>
              <div className="mt-1 text-right text-xs text-muted-foreground">
                {draft.instructions.length} / {COVER_LETTER_INSTRUCTIONS_MAX}
              </div>

              {validation.kind === "validating" && (
                <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 size={12} className="animate-spin" /> Checking your instructions…
                </div>
              )}

              {validation.kind === "verdict" && (
                <ValidationNote
                  verdict={validation.verdict}
                  reason={validation.reason}
                  suggestion={validation.suggestion}
                  onSaveAnyway={() => void save({ skipInstructionCheck: true })}
                  saving={saving}
                />
              )}

              {validation.kind === "quota" && (
                <div className="mt-2 flex items-start gap-2 rounded-md border border-destructive/30 bg-background px-3 py-2 text-xs">
                  <ShieldAlert size={14} className="mt-0.5 shrink-0 text-destructive" />
                  <div>
                    Instruction-check limit reached this month. You can still{" "}
                    <button
                      type="button"
                      onClick={() => void save({ skipInstructionCheck: true })}
                      className="font-medium text-foreground underline-offset-2 hover:underline"
                    >
                      save without checking
                    </button>
                    .
                  </div>
                </div>
              )}

              {validation.kind === "error" && (
                <div className="mt-2 flex items-start gap-2 rounded-md border border-destructive/30 bg-background px-3 py-2 text-xs">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0 text-destructive" />
                  <div>
                    Couldn't check your instructions. {validation.message}{" "}
                    <button
                      type="button"
                      onClick={() => void save({ skipInstructionCheck: true })}
                      className="font-medium text-foreground underline-offset-2 hover:underline"
                    >
                      Save without checking
                    </button>
                    .
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving || isRejected}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
              >
                {saving && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
                Save
              </button>
              {savedTick && !saving && (
                <span className="inline-flex items-center gap-1 text-sm text-emerald-700">
                  <Check size={14} aria-hidden="true" /> Saved
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function ValidationNote({
  verdict,
  reason,
  suggestion,
  onSaveAnyway,
  saving,
}: {
  verdict: "vague" | "rejected";
  reason: string;
  suggestion: string | null;
  onSaveAnyway: () => void;
  saving: boolean;
}) {
  if (verdict === "vague") {
    return (
      <div className="mt-2 flex items-start gap-2 rounded-md border border-amber-300 bg-background px-3 py-2 text-xs">
        <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-600" />
        <div className="flex-1">
          <div className="font-medium text-amber-800">These instructions look vague.</div>
          <div className="mt-0.5 text-muted-foreground">{reason}</div>
          {suggestion && (
            <div className="mt-1.5 rounded bg-amber-50 px-2 py-1 text-foreground">
              <span className="font-medium">Try: </span>
              {suggestion}
            </div>
          )}
          <button
            type="button"
            onClick={onSaveAnyway}
            disabled={saving}
            className="mt-1.5 font-medium text-foreground underline-offset-2 hover:underline disabled:opacity-60"
          >
            Save anyway
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="mt-2 flex items-start gap-2 rounded-md border border-destructive/30 bg-background px-3 py-2 text-xs">
      <ShieldAlert size={14} className="mt-0.5 shrink-0 text-destructive" />
      <div className="flex-1">
        <div className="font-medium text-destructive">
          This doesn't look like cover-letter instructions.
        </div>
        <div className="mt-0.5 text-muted-foreground">{reason}</div>
        <div className="mt-1.5 text-muted-foreground">
          Describe how the letter should read — for example,{" "}
          <em>"Two short paragraphs, formal tone"</em>. Edit and save again.
        </div>
      </div>
    </div>
  );
}
