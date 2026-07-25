import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Loader2, ShieldAlert, X } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import {
  FILTER_TEXT_MAX,
  type FilterKind,
  type FilterValidationResponse,
  type FilterValidationVerdict,
} from "@/shared/types";

// Drives the new-filter flow's per-attempt UI. `idle` is the default;
// `validating` shows a spinner while the LLM call is in flight; `verdict`
// surfaces the LLM's bucket so the user can either save anyway (vague),
// edit (rejected), or get an actionable suggestion. `quota` and `error`
// cover the not-success paths that aren't a verdict. Successful or
// save-anyway paths read `kind` from `lastValidated`, see below.
type DraftValidationState =
  | { kind: "idle" }
  | { kind: "validating" }
  | {
      kind: "verdict";
      verdict: FilterValidationVerdict;
      reason: string;
      suggestion: string | null;
    }
  | { kind: "quota"; used: number; limit: number }
  | { kind: "error"; message: string };

// Shared new-filter editor: validates the typed filter through the backend
// (good / vague / rejected) before it's saved. Used both in the options
// filters editor and in the first-run onboarding wizard so the exact same
// quality checks apply everywhere a filter is created.
export function NewFilterDraft({
  onConfirm,
  onCancel,
  initialText = "",
  onDirtyChange,
  highlightSave = false,
}: {
  // Carries the validated FilterKind so the parent can store it on the
  // new filter row. Undefined when validation didn't complete (quota /
  // error / save-anyway-without-LLM); the backend defaults to criterion.
  onConfirm: (text: string, kind: FilterKind | undefined) => Promise<void>;
  onCancel: () => void;
  // Optional seed text (e.g. an example the user tapped to prefill).
  initialText?: string;
  // Reports whether there is unsaved text so a parent can warn before it
  // navigates away with an un-added question. Pass a stable setter.
  onDirtyChange?: (dirty: boolean) => void;
  // Draws attention to the save control when the parent needs the user to
  // press it (e.g. they hit "Continue" with a filter still unsaved).
  highlightSave?: boolean;
}) {
  const [text, setText] = useState(initialText);
  const [busy, setBusy] = useState(false);
  const [validation, setValidation] = useState<DraftValidationState>({ kind: "idle" });
  // Latest LLM-classified kind for the current text. Cleared whenever
  // the text changes (so a stale kind never gets persisted alongside
  // edited text). Read by every save path that goes through the LLM.
  const [lastValidatedKind, setLastValidatedKind] = useState<FilterKind | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  // Report unsaved-text status up. Cleanup fires on text change and on unmount,
  // so a parent's flag lands back on `false` once the draft is added/cancelled.
  useEffect(() => {
    onDirtyChange?.(text.trim().length > 0);
    return () => onDirtyChange?.(false);
  }, [text, onDirtyChange]);

  // Editing after a verdict resets the panel — anything the user types
  // invalidates the prior LLM judgment, and we don't want stale red/
  // yellow framing to mislead them. The validate-on-save round trip
  // re-runs.
  function onTextChange(next: string) {
    setText(next);
    if (lastValidatedKind !== null) setLastValidatedKind(null);
    if (validation.kind !== "idle" && validation.kind !== "validating") {
      setValidation({ kind: "idle" });
    }
  }

  async function attemptSave() {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setValidation({ kind: "validating" });

    let result: FilterValidationResponse;
    try {
      result = await api.validateFilter({ text: trimmed });
    } catch (err) {
      setBusy(false);
      if (err instanceof ApiError && err.status === 402) {
        // Backend body shape: {error, usage:{used,limit,period}}. The api
        // helper surfaces the `error` string as the message — we just
        // need to flag the state; the panel below doesn't need numbers.
        setValidation({ kind: "quota", used: 0, limit: 0 });
        return;
      }
      setValidation({
        kind: "error",
        message: err instanceof ApiError ? err.message : String(err),
      });
      return;
    }

    setLastValidatedKind(result.kind);

    if (result.verdict === "good") {
      // Skip the panel entirely — the user's intent was Save and the
      // verdict was good, so just save.
      try {
        await onConfirm(trimmed, result.kind);
      } catch {
        // onConfirm already surfaces failures via the parent's onError;
        // fall through and let the user retry.
        setBusy(false);
        setValidation({ kind: "idle" });
      }
      return;
    }

    setBusy(false);
    setValidation({
      kind: "verdict",
      verdict: result.verdict,
      reason: result.reason,
      suggestion: result.suggestion,
    });
  }

  async function saveAnyway() {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      // lastValidatedKind is set when this is reached from a vague
      // verdict (we have a fresh classification). On the quota / error
      // paths it's null and we let the backend default to criterion.
      await onConfirm(trimmed, lastValidatedKind ?? undefined);
    } catch {
      setBusy(false);
    }
  }

  function backToEdit() {
    setValidation({ kind: "idle" });
    textareaRef.current?.focus();
  }

  // Borders + tones mirror the verdict so the visual state is unambiguous
  // even at a glance. Default to neutral when idle/validating.
  const containerTone = (() => {
    if (validation.kind === "verdict" && validation.verdict === "vague")
      return "border-amber-300 bg-amber-50/50";
    if (validation.kind === "verdict" && validation.verdict === "rejected")
      return "border-destructive/40 bg-destructive/5";
    if (validation.kind === "quota" || validation.kind === "error")
      return "border-destructive/40 bg-destructive/5";
    return "border bg-card";
  })();

  const isRejected = validation.kind === "verdict" && validation.verdict === "rejected";
  const isVague = validation.kind === "verdict" && validation.verdict === "vague";
  const isBlocked = isRejected || validation.kind === "quota";

  return (
    <div
      className={`flex flex-col gap-3 rounded-lg p-3 text-card-foreground shadow-sm ${containerTone}`}
    >
      <div className="flex items-start gap-3">
        <div className="mt-1.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border border-input bg-background" />
        <div className="min-w-0 flex-1">
          <textarea
            ref={textareaRef}
            value={text}
            maxLength={FILTER_TEXT_MAX}
            rows={1}
            onChange={(e) => onTextChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (isVague) void saveAnyway();
                else if (!isBlocked) void attemptSave();
              }
              if (e.key === "Escape") {
                onCancel();
              }
            }}
            placeholder="New filter — e.g. Must be fully remote within the EU"
            className="w-full resize-none overflow-hidden rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
            disabled={busy && validation.kind === "validating"}
          />
          <div className="mt-1 text-right text-xs text-muted-foreground">
            {text.length} / {FILTER_TEXT_MAX}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1 pt-1">
          {isVague ? (
            <button
              type="button"
              onClick={saveAnyway}
              disabled={busy || !text.trim()}
              className={`inline-flex h-8 items-center gap-1.5 rounded-md bg-amber-500 px-2.5 text-xs font-medium text-white transition-colors hover:bg-amber-600 disabled:opacity-50 ${
                highlightSave ? "ring-2 ring-amber-400 ring-offset-1 animate-pulse" : ""
              }`}
              title="Save this filter anyway"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              Save anyway
            </button>
          ) : (
            <button
              type="button"
              onClick={attemptSave}
              disabled={!text.trim() || busy || isBlocked}
              className={`inline-flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 ${
                highlightSave && !isBlocked ? "ring-2 ring-amber-400 ring-offset-1 animate-pulse" : ""
              }`}
              title={isBlocked ? "Edit your filter to continue" : "Validate and save"}
              aria-label="Validate and save filter"
            >
              {validation.kind === "validating" ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Check size={16} />
              )}
            </button>
          )}
          <button
            type="button"
            onClick={onCancel}
            disabled={busy && validation.kind === "validating"}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
            title="Cancel"
            aria-label="Cancel"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {validation.kind === "validating" && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 size={12} className="animate-spin" />
          Checking that your filter is clear and on-topic…
        </div>
      )}

      {validation.kind === "verdict" && (
        <ValidationPanel
          verdict={validation.verdict}
          reason={validation.reason}
          suggestion={validation.suggestion}
          onEdit={backToEdit}
        />
      )}

      {validation.kind === "quota" && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-background px-3 py-2 text-xs">
          <ShieldAlert size={14} className="mt-0.5 shrink-0 text-destructive" />
          <div>
            <div className="font-medium text-destructive">
              Filter check limit reached for this month.
            </div>
            <div className="mt-0.5 text-muted-foreground">
              You can still save this filter without a quality check —{" "}
              <button
                type="button"
                onClick={saveAnyway}
                className="font-medium text-foreground underline-offset-2 hover:underline"
              >
                save anyway
              </button>
              .
            </div>
          </div>
        </div>
      )}

      {validation.kind === "error" && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-background px-3 py-2 text-xs">
          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-destructive" />
          <div>
            <div className="font-medium text-destructive">Couldn't check this filter.</div>
            <div className="mt-0.5 text-muted-foreground">
              {validation.message}{" "}
              <button
                type="button"
                onClick={attemptSave}
                className="font-medium text-foreground underline-offset-2 hover:underline"
              >
                Try again
              </button>{" "}
              or{" "}
              <button
                type="button"
                onClick={saveAnyway}
                className="font-medium text-foreground underline-offset-2 hover:underline"
              >
                save without checking
              </button>
              .
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ValidationPanel({
  verdict,
  reason,
  suggestion,
  onEdit,
}: {
  verdict: FilterValidationVerdict;
  reason: string;
  suggestion: string | null;
  onEdit: () => void;
}) {
  if (verdict === "vague") {
    return (
      <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-background px-3 py-2 text-xs">
        <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-600" />
        <div className="flex-1">
          <div className="font-medium text-amber-800">This filter looks vague.</div>
          <div className="mt-0.5 text-muted-foreground">{reason}</div>
          {suggestion && (
            <div className="mt-1.5 rounded bg-amber-50 px-2 py-1 text-foreground">
              <span className="font-medium">Try: </span>
              {suggestion}
            </div>
          )}
          <div className="mt-1.5 text-muted-foreground">
            Click{" "}
            <button
              type="button"
              onClick={onEdit}
              className="font-medium text-foreground underline-offset-2 hover:underline"
            >
              Edit
            </button>{" "}
            to refine, or use “Save anyway”.
          </div>
        </div>
      </div>
    );
  }
  if (verdict === "rejected") {
    return (
      <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-background px-3 py-2 text-xs">
        <ShieldAlert size={14} className="mt-0.5 shrink-0 text-destructive" />
        <div className="flex-1">
          <div className="font-medium text-destructive">
            This doesn't look like a job filter.
          </div>
          <div className="mt-0.5 text-muted-foreground">{reason}</div>
          <div className="mt-1.5 text-muted-foreground">
            Filters describe what a job posting must contain or ask about it — for example,{" "}
            <em>“Must be fully remote”</em>,{" "}
            <em>“Salary mentioned ≥ €5,000/month”</em>, or{" "}
            <em>“What programming languages are required?”</em>.{" "}
            <button
              type="button"
              onClick={onEdit}
              className="font-medium text-foreground underline-offset-2 hover:underline"
            >
              Edit
            </button>
            .
          </div>
        </div>
      </div>
    );
  }
  return null;
}
