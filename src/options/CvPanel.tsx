import { useEffect, useRef, useState } from "react";
import {
  FileText,
  Loader2,
  Pencil,
  Plus,
  ShieldCheck,
  Target,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type { CvProfile, CvProfileResponse, Seniority } from "@/shared/types";

const ACCEPTED = ".pdf,.docx,.txt";

const SENIORITY_OPTIONS: Seniority[] = [
  "junior",
  "mid",
  "senior",
  "lead",
  "principal",
  "unknown",
];
const SENIORITY_LABELS: Record<Seniority, string> = {
  junior: "Junior",
  mid: "Mid",
  senior: "Senior",
  lead: "Lead",
  principal: "Principal",
  unknown: "Unknown",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3 py-2">
      <div className="pt-0.5 text-sm text-muted-foreground">{label}</div>
      <div>{children}</div>
    </div>
  );
}

// --- read-only view --------------------------------------------------------
function Chips({ items }: { items: string[] }) {
  if (items.length === 0) return <span className="text-sm text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item, i) => (
        <span key={i} className="rounded-md bg-muted px-2 py-0.5 text-xs text-foreground">
          {item}
        </span>
      ))}
    </div>
  );
}

function ParsedProfile({ profile }: { profile: CvProfile }) {
  const years =
    profile.years_experience !== null ? `${profile.years_experience} years` : "—";
  const seniority =
    profile.seniority === "unknown" ? "—" : SENIORITY_LABELS[profile.seniority];
  return (
    <div className="divide-y">
      {profile.summary && (
        <p className="pb-3 text-sm leading-relaxed text-foreground">{profile.summary}</p>
      )}
      <Field label="Seniority">
        <span className="text-sm text-foreground">{seniority}</span>
      </Field>
      <Field label="Experience">
        <span className="text-sm text-foreground">{years}</span>
      </Field>
      <Field label="Skills">
        <Chips items={profile.skills} />
      </Field>
      <Field label="Role titles">
        <Chips items={profile.titles} />
      </Field>
      <Field label="Domains">
        <Chips items={profile.domains} />
      </Field>
      <Field label="Education">
        <Chips items={profile.education} />
      </Field>
      <Field label="Languages">
        <Chips items={profile.languages} />
      </Field>
    </div>
  );
}

// --- editable view ---------------------------------------------------------
function ChipEditor({
  items,
  onChange,
  placeholder,
}: {
  items: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
}) {
  const [input, setInput] = useState("");

  function add() {
    const value = input.trim();
    setInput("");
    if (!value) return;
    if (items.some((i) => i.toLowerCase() === value.toLowerCase())) return;
    onChange([...items, value]);
  }

  return (
    <div>
      {items.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {items.map((item, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs text-foreground"
            >
              {item}
              <button
                type="button"
                onClick={() => onChange(items.filter((_, j) => j !== i))}
                aria-label={`Remove ${item}`}
                className="text-muted-foreground transition-colors hover:text-destructive"
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring/20"
        />
        <button
          type="button"
          onClick={add}
          className="inline-flex items-center gap-1 rounded-md border px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
        >
          <Plus size={13} aria-hidden="true" /> Add
        </button>
      </div>
    </div>
  );
}

function EditableProfile({
  draft,
  onChange,
}: {
  draft: CvProfile;
  onChange: (next: CvProfile) => void;
}) {
  const set = (patch: Partial<CvProfile>) => onChange({ ...draft, ...patch });

  return (
    <div className="divide-y">
      <div className="pb-3">
        <div className="mb-1 text-sm text-muted-foreground">Summary</div>
        <textarea
          value={draft.summary}
          onChange={(e) => set({ summary: e.target.value })}
          rows={2}
          maxLength={600}
          className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring/20"
        />
      </div>
      <Field label="Seniority">
        <select
          value={draft.seniority}
          onChange={(e) => set({ seniority: e.target.value as Seniority })}
          className="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring/20"
        >
          {SENIORITY_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {SENIORITY_LABELS[s]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Experience">
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            max={70}
            step={0.5}
            value={draft.years_experience ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              set({ years_experience: v === "" ? null : Number(v) });
            }}
            className="h-8 w-24 rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring/20"
          />
          <span className="text-sm text-muted-foreground">years</span>
        </div>
      </Field>
      <Field label="Skills">
        <ChipEditor items={draft.skills} onChange={(skills) => set({ skills })} placeholder="Add a skill" />
      </Field>
      <Field label="Role titles">
        <ChipEditor items={draft.titles} onChange={(titles) => set({ titles })} placeholder="Add a role title" />
      </Field>
      <Field label="Domains">
        <ChipEditor items={draft.domains} onChange={(domains) => set({ domains })} placeholder="Add a domain" />
      </Field>
      <Field label="Education">
        <ChipEditor items={draft.education} onChange={(education) => set({ education })} placeholder="e.g. BSc Computer Science" />
      </Field>
      <Field label="Languages">
        <ChipEditor items={draft.languages} onChange={(languages) => set({ languages })} placeholder="Add a language" />
      </Field>
    </div>
  );
}

// --- panel -----------------------------------------------------------------
export function CvPanel() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [cv, setCv] = useState<CvProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<CvProfile | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        setCv(await api.getCv());
      } catch (err) {
        setError(err instanceof ApiError ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // let the user re-pick the same file later
    if (!file) return;
    setError(null);
    setUploading(true);
    setDraft(null);
    try {
      setCv(await api.uploadCv(file));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  }

  async function onDelete() {
    setError(null);
    setDraft(null);
    try {
      await api.deleteCv();
      setCv(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    }
  }

  async function onSave() {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const res = await api.updateCv(draft);
      setCv(res);
      setDraft(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  const editing = draft !== null;

  return (
    <section className="mx-auto max-w-6xl px-6 pb-10">
      <div className="rounded-lg border bg-card p-5 text-card-foreground shadow-sm">
        <div className="flex items-center gap-2">
          <Target size={18} className="text-primary" aria-hidden="true" />
          <h2 className="text-base font-semibold text-foreground">Job fit</h2>
        </div>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          Upload your CV once and every LinkedIn job you open gets a 1–5 match score, with your
          strengths and the gaps to address — shown right in the side panel.
        </p>

        <div className="mt-3 flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          <ShieldCheck size={15} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
          <span>
            We never store your CV file. From it we keep only a non-identifying professional
            summary (skills, experience, domains) — not your name, email, or phone number. You can
            edit anything below.
          </span>
        </div>

        <input ref={fileRef} type="file" accept={ACCEPTED} onChange={onFile} className="hidden" />

        {error && (
          <p className="mt-4 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        {loading ? (
          <p className="mt-5 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 size={15} className="animate-spin" aria-hidden="true" /> Loading…
          </p>
        ) : uploading ? (
          <p className="mt-5 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 size={15} className="animate-spin" aria-hidden="true" /> Parsing your CV…
          </p>
        ) : cv ? (
          <div className="mt-5">
            <div className="mb-3 flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                <FileText size={15} aria-hidden="true" />
                {editing ? "Edit your profile" : "Your parsed profile"}
              </span>
              <div className="flex items-center gap-2">
                {editing ? (
                  <>
                    <button
                      type="button"
                      onClick={onSave}
                      disabled={saving}
                      className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
                    >
                      {saving && <Loader2 size={13} className="animate-spin" aria-hidden="true" />}
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setDraft(null)}
                      disabled={saving}
                      className="rounded-md border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-60"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setDraft(cv.profile)}
                      className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
                    >
                      <Pencil size={13} aria-hidden="true" /> Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
                    >
                      <Upload size={13} aria-hidden="true" /> Replace
                    </button>
                    <button
                      type="button"
                      onClick={onDelete}
                      className="inline-flex items-center gap-1.5 rounded-md border border-destructive/30 px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
                    >
                      <Trash2 size={13} aria-hidden="true" /> Delete
                    </button>
                  </>
                )}
              </div>
            </div>
            {editing && draft ? (
              <EditableProfile draft={draft} onChange={setDraft} />
            ) : (
              <ParsedProfile profile={cv.profile} />
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="mt-5 flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-6 py-8 text-center transition-colors hover:bg-accent/40"
          >
            <Upload size={20} className="text-muted-foreground" aria-hidden="true" />
            <span className="text-sm font-medium text-foreground">Upload your CV</span>
            <span className="text-xs text-muted-foreground">PDF, DOCX, or TXT</span>
          </button>
        )}
      </div>
    </section>
  );
}
