import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  AlertTriangle,
  BriefcaseBusiness,
  Check,
  CheckCircle2,
  CircleUser,
  GripVertical,
  HelpCircle,
  Lightbulb,
  ListChecks,
  Loader2,
  Plus,
  Search,
  ShieldAlert,
  Star,
  Trash2,
  X,
} from "lucide-react";
import type { Provider } from "@supabase/supabase-js";
import { api, ApiError } from "@/lib/api";
import { getSupabase, signInWithOAuth, signOut } from "@/lib/auth";
import { openPricing } from "@/lib/links";
import { getOnboardingFlag, setOnboardingFlag } from "@/lib/storage";
import {
  FILTER_TEXT_MAX,
  MAX_FILTERS_PER_PROFILE,
  MAX_PROFILES_PER_USER,
  PROFILE_NAME_MAX,
  STARTER_PROFILE_NAME,
  type FilterKind,
  type FilterOut,
  type FilterProfileOut,
  type FilterProfileWithFilters,
  type FilterValidationResponse,
  type FilterValidationVerdict,
  type MeResponse,
} from "@/shared/types";

type AuthView = "signin" | "signup";

function useSession() {
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = getSupabase();
    supabase.auth.getSession().then(({ data }) => {
      setEmail(data.session?.user.email ?? null);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_, session) => {
      setEmail(session?.user.email ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return { email, loading };
}

function AuthPanel() {
  const [view, setView] = useState<AuthView>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [oauthProvider, setOauthProvider] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const supabase = getSupabase();
      if (view === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        if (password !== confirmPassword) {
          throw new Error("Passwords do not match.");
        }
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setInfo("Check your inbox to confirm your email, then sign in.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function startOAuth(provider: Provider) {
    setOauthProvider(provider);
    setError(null);
    setInfo(null);
    try {
      await signInWithOAuth(provider);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setOauthProvider(null);
    }
  }

  return (
    <div className="mx-auto mt-10 max-w-sm rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
      <h2 className="mb-4 text-lg font-semibold tracking-tight">
        {view === "signin" ? "Sign in" : "Create account"}
      </h2>
      <div className="space-y-2">
        <button
          type="button"
          disabled={busy || oauthProvider !== null}
          onClick={() => startOAuth("google")}
          className="flex w-full items-center justify-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-60"
        >
          <CircleUser className="h-4 w-4" />
          {oauthProvider === "google" ? "Opening Google..." : "Continue with Google"}
        </button>
        <button
          type="button"
          disabled={busy || oauthProvider !== null}
          onClick={() => startOAuth("linkedin_oidc")}
          className="flex w-full items-center justify-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-60"
        >
          <BriefcaseBusiness className="h-4 w-4" />
          {oauthProvider === "linkedin_oidc" ? "Opening LinkedIn..." : "Continue with LinkedIn"}
        </button>
      </div>
      <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
        <div className="h-px flex-1 bg-border" />
        <span>or</span>
        <div className="h-px flex-1 bg-border" />
      </div>
      <form onSubmit={submit} className="space-y-3">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20"
          autoComplete="email"
        />
        <input
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20"
          autoComplete={view === "signin" ? "current-password" : "new-password"}
        />
        {view === "signup" && (
          <input
            type="password"
            required
            minLength={8}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirm password"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20"
            autoComplete="new-password"
          />
        )}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-primary py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
        >
          {busy ? "…" : view === "signin" ? "Sign in" : "Sign up"}
        </button>
      </form>
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      {info && <p className="mt-3 text-sm text-emerald-700">{info}</p>}
      <div className="mt-4 text-xs text-muted-foreground">
        {view === "signin" ? "No account?" : "Already have an account?"}{" "}
        <button
          className="font-medium text-primary underline-offset-4 hover:underline"
          onClick={() => setView(view === "signin" ? "signup" : "signin")}
        >
          {view === "signin" ? "Create one" : "Sign in"}
        </button>
      </div>
    </div>
  );
}

function Header({ email }: { email: string | null }) {
  const [me, setMe] = useState<MeResponse | null>(null);

  useEffect(() => {
    if (!email) return;
    api.me().then(setMe).catch(() => setMe(null));
  }, [email]);

  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-6">
        <h1 className="text-xl font-semibold tracking-tight">canvasjob</h1>
        {email && (
          <div className="flex items-center gap-6">
            <div className="text-right text-sm">
              <div className="font-medium text-foreground">{email}</div>
              <div className="mt-0.5 flex items-center justify-end gap-2 text-xs text-muted-foreground">
                <span>
                  Plan: {me?.plan ?? "…"}
                  {me ? ` · ${me.usage.used} / ${me.usage.limit} this month` : ""}
                </span>
                {me?.plan === "free" && (
                  <button
                    onClick={openPricing}
                    className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-secondary-foreground transition-colors hover:bg-secondary/80"
                    title="See Pro plan benefits"
                  >
                    Upgrade to Pro
                  </button>
                )}
              </div>
            </div>
            <button
              onClick={signOut}
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Sortable wrapper — exposes drag listeners so the row can attach them to a
// dedicated handle instead of the whole row (preserves clicks on inputs).
// ---------------------------------------------------------------------------

function SortableRow({
  id,
  children,
}: {
  id: string;
  children: (handleProps: {
    attributes: ReturnType<typeof useSortable>["attributes"];
    listeners: ReturnType<typeof useSortable>["listeners"];
  }) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
    >
      {children({ attributes, listeners })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Onboarding strip — three-step explainer + mock result preview shown above
// the profiles editor for first-time users. Dismissable; persists in
// chrome.storage.local so the strip stays gone across sessions and devices
// that share the same Chrome profile sync.
// ---------------------------------------------------------------------------

function HowItWorksStrip() {
  const [show, setShow] = useState<boolean | null>(null);
  useEffect(() => {
    void getOnboardingFlag("howItWorksDismissed").then((dismissed) => setShow(!dismissed));
  }, []);

  if (show !== true) return null;

  const steps: Array<{ icon: React.ElementType; title: string; body: string }> = [
    {
      icon: ListChecks,
      title: "1. Define your filters",
      body: "Plain English: \"Must be remote\", \"Salary ≥ €5k\". Edit anytime.",
    },
    {
      icon: Search,
      title: "2. Open any LinkedIn job",
      body: "We read the description while you browse — no extra clicks.",
    },
    {
      icon: CheckCircle2,
      title: "3. See ✅ / ❌ instantly",
      body: "Every filter gets a verdict and a quote from the description.",
    },
  ];

  return (
    <section
      id="how-it-works"
      className="mx-auto mt-6 max-w-6xl px-6"
      aria-labelledby="how-it-works-heading"
    >
      <div className="relative rounded-xl border bg-card p-5 shadow-sm">
        <button
          onClick={async () => {
            setShow(false);
            await setOnboardingFlag("howItWorksDismissed", true);
          }}
          className="absolute right-3 top-3 -m-1 rounded p-1 text-muted-foreground hover:text-foreground"
          title="Dismiss"
          aria-label="Dismiss the how-it-works panel"
        >
          <X size={14} />
        </button>
        <div className="mb-1 flex items-center gap-2">
          <HelpCircle size={14} className="text-primary" />
          <h2 id="how-it-works-heading" className="text-sm font-semibold text-foreground">
            How canvasjob works
          </h2>
        </div>
        <p className="mb-4 text-xs text-muted-foreground">
          A 30-second tour. Dismiss this panel once you've got the idea.
        </p>
        <div className="grid gap-4 md:grid-cols-3">
          {steps.map(({ icon: Icon, title, body }, i) => (
            <div key={i} className="flex items-start gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Icon size={16} />
              </span>
              <div className="min-w-0">
                <div className="text-sm font-medium text-foreground">{title}</div>
                <div className="text-xs leading-relaxed text-muted-foreground">{body}</div>
              </div>
            </div>
          ))}
        </div>
        <InlinePreview />
      </div>
    </section>
  );
}

// Mock evaluation card rendered inside the how-it-works strip so users can
// see, in concrete terms, what their filters will produce in the side panel
// before they ever open a real LinkedIn job.
function InlinePreview() {
  return (
    <div className="mt-5 rounded-lg border border-dashed bg-background p-4">
      <div className="mb-3 text-xs uppercase tracking-wide text-muted-foreground">
        Preview — what you'll see in the side panel
      </div>
      <div className="mb-3">
        <div className="text-sm font-medium text-foreground">Senior Backend Engineer</div>
        <div className="text-xs text-muted-foreground">Acme Corp · Remote, EU</div>
      </div>
      <ul className="space-y-2">
        <PreviewRow
          pass="pass"
          filter="Must be fully remote"
          evidence="“100% remote within the EU.”"
        />
        <PreviewRow
          pass="fail"
          filter="Permanent role (not contract)"
          evidence="“6-month contract with possible extension.”"
        />
        <PreviewRow
          pass="unknown"
          filter="Salary mentioned ≥ €5,000/month"
          evidence="Not mentioned in the description."
        />
      </ul>
    </div>
  );
}

function PreviewRow({
  pass,
  filter,
  evidence,
}: {
  pass: "pass" | "fail" | "unknown";
  filter: string;
  evidence: string;
}) {
  const Icon = pass === "pass" ? Check : pass === "fail" ? X : HelpCircle;
  const tone =
    pass === "pass"
      ? "bg-emerald-50 text-emerald-700"
      : pass === "fail"
        ? "bg-destructive/10 text-destructive"
        : "bg-muted text-muted-foreground";
  return (
    <li className="flex items-start gap-3">
      <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${tone}`}>
        <Icon size={12} />
      </span>
      <div className="min-w-0">
        <div className="text-sm font-medium text-foreground">{filter}</div>
        <div className="text-xs italic leading-relaxed text-muted-foreground">{evidence}</div>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Profiles editor (two-pane container)
// ---------------------------------------------------------------------------

// Mutators apply server responses to local state instead of refetching the
// whole list — keeps the UI mounted across CRUD actions, no flash of the
// "Loading…" placeholder. `refresh` is still used for the initial load and
// as a safety net if a mutation puts state in an unknown shape.
interface Mutators {
  addProfile: (p: FilterProfileOut) => void;
  updateProfile: (p: FilterProfileOut) => void;
  deleteProfile: (id: string) => void;
  activateProfile: (id: string) => void;
  addFilter: (profileId: string, f: FilterOut) => void;
  updateFilter: (f: FilterOut) => void;
  deleteFilter: (profileId: string, filterId: string) => void;
  reorderFilters: (profileId: string, ordered: FilterOut[]) => void;
}

function ProfilesEditor() {
  const [profiles, setProfiles] = useState<FilterProfileWithFilters[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.listProfiles();
      list.sort((a, b) => a.position - b.position);
      setProfiles(list);
      setSelectedId((prev) => {
        if (prev && list.some((p) => p.id === prev)) return prev;
        return list.find((p) => p.is_active)?.id ?? list[0]?.id ?? null;
      });
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const mutators = useMemo<Mutators>(
    () => ({
      addProfile: (p) =>
        setProfiles((prev) => [...prev, { ...p, filters: [] }]),
      updateProfile: (p) =>
        setProfiles((prev) =>
          prev.map((x) => (x.id === p.id ? { ...x, ...p } : x)),
        ),
      deleteProfile: (id) => {
        setProfiles((prev) => prev.filter((p) => p.id !== id));
        setSelectedId((prevSel) => {
          if (prevSel !== id) return prevSel;
          const remaining = profiles.filter((p) => p.id !== id);
          return (
            remaining.find((p) => p.is_active)?.id ?? remaining[0]?.id ?? null
          );
        });
      },
      activateProfile: (id) =>
        setProfiles((prev) =>
          prev.map((p) => ({ ...p, is_active: p.id === id })),
        ),
      addFilter: (profileId, f) =>
        setProfiles((prev) =>
          prev.map((p) =>
            p.id === profileId ? { ...p, filters: [...p.filters, f] } : p,
          ),
        ),
      updateFilter: (f) =>
        setProfiles((prev) =>
          prev.map((p) =>
            p.id === f.profile_id
              ? {
                  ...p,
                  filters: p.filters.map((x) => (x.id === f.id ? f : x)),
                }
              : p,
          ),
        ),
      deleteFilter: (profileId, filterId) =>
        setProfiles((prev) =>
          prev.map((p) =>
            p.id === profileId
              ? { ...p, filters: p.filters.filter((f) => f.id !== filterId) }
              : p,
          ),
        ),
      reorderFilters: (profileId, ordered) =>
        setProfiles((prev) =>
          prev.map((p) =>
            p.id === profileId
              ? {
                  ...p,
                  filters: ordered.map((f, i) => ({ ...f, position: i })),
                }
              : p,
          ),
        ),
    }),
    [profiles],
  );

  const selected = useMemo(
    () => profiles.find((p) => p.id === selectedId) ?? null,
    [profiles, selectedId],
  );

  async function handleProfileDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = profiles.findIndex((p) => p.id === active.id);
    const newIndex = profiles.findIndex((p) => p.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(profiles, oldIndex, newIndex);
    setProfiles(reordered);
    try {
      await api.reorderProfiles({ ids: reordered.map((p) => p.id) });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
      await refresh();
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-12 text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      <div className="grid grid-cols-1 md:grid-cols-[18rem_1fr] gap-6">
        {/* Left pane — profiles */}
        <aside className="flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-foreground">
              Job Profiles{" "}
              <span className="font-normal text-muted-foreground">
                ({profiles.length}/{MAX_PROFILES_PER_USER})
              </span>
            </h2>
          </div>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleProfileDragEnd}
          >
            <SortableContext
              items={profiles.map((p) => p.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {profiles.map((p) => (
                  <SortableRow key={p.id} id={p.id}>
                    {({ attributes, listeners }) => (
                      <ProfileCard
                        profile={p}
                        isSelected={p.id === selectedId}
                        canDelete={profiles.length > 1}
                        onSelect={() => setSelectedId(p.id)}
                        mutators={mutators}
                        onError={setError}
                        dragAttributes={attributes}
                        dragListeners={listeners}
                      />
                    )}
                  </SortableRow>
                ))}
              </div>
            </SortableContext>
          </DndContext>

          <div className="mt-4">
            <NewProfileButton
              disabled={profiles.length >= MAX_PROFILES_PER_USER}
              mutators={mutators}
              onError={setError}
            />
          </div>

          {error && (
            <p className="mt-4 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
        </aside>

        {/* Right pane — filters */}
        <section className="min-w-0 md:border-l md:pl-6">
          {selected ? (
            <FilterEditor
              profile={selected}
              mutators={mutators}
              onError={setError}
            />
          ) : (
            <p className="text-sm text-muted-foreground">No profile selected.</p>
          )}
        </section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Profile card (left pane)
// ---------------------------------------------------------------------------

function ProfileCard({
  profile,
  isSelected,
  canDelete,
  onSelect,
  mutators,
  onError,
  dragAttributes,
  dragListeners,
}: {
  profile: FilterProfileWithFilters;
  isSelected: boolean;
  canDelete: boolean;
  onSelect: () => void;
  mutators: Mutators;
  onError: (msg: string) => void;
  dragAttributes: ReturnType<typeof useSortable>["attributes"];
  dragListeners: ReturnType<typeof useSortable>["listeners"];
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(profile.name);

  useEffect(() => setDraft(profile.name), [profile.name]);

  async function rename() {
    const t = draft.trim();
    setEditing(false);
    if (!t || t === profile.name) {
      setDraft(profile.name);
      return;
    }
    try {
      const updated = await api.updateProfile(profile.id, { name: t });
      mutators.updateProfile(updated);
    } catch (err) {
      onError(err instanceof ApiError ? err.message : String(err));
      setDraft(profile.name);
    }
  }

  async function activate(e: React.MouseEvent) {
    e.stopPropagation();
    if (profile.is_active) return;
    try {
      await api.activateProfile(profile.id);
      mutators.activateProfile(profile.id);
    } catch (err) {
      onError(err instanceof ApiError ? err.message : String(err));
      throw err;
    }
  }

  async function remove(e: React.MouseEvent) {
    e.stopPropagation();
    if (!canDelete) return;
    if (!confirm(`Delete profile "${profile.name}" and all its filters?`)) return;
    try {
      await api.deleteProfile(profile.id);
      mutators.deleteProfile(profile.id);
    } catch (err) {
      onError(err instanceof ApiError ? err.message : String(err));
    }
  }

  const baseClasses =
    "group relative flex cursor-pointer items-center gap-2 rounded-lg bg-card px-3 py-2.5 text-card-foreground transition-colors";
  const stateClasses = isSelected
    ? "border border-primary shadow-sm"
    : "border hover:bg-accent hover:text-accent-foreground";

  return (
    <div
      className={`${baseClasses} ${stateClasses}`}
      onClick={onSelect}
    >
      {/* Drag handle — visible on hover */}
      <button
        {...dragAttributes}
        {...dragListeners}
        onClick={(e) => e.stopPropagation()}
        className="absolute left-0 top-1/2 -translate-x-1 -translate-y-1/2 cursor-grab p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
        title="Drag to reorder"
        aria-label="Drag to reorder"
      >
        <GripVertical size={14} />
      </button>

      <button
        onClick={activate}
        disabled={profile.is_active}
        className="shrink-0 p-0.5 -m-0.5 rounded transition-colors disabled:cursor-default"
        title={profile.is_active ? "Active profile" : "Click to activate"}
        aria-label={profile.is_active ? "Active profile" : "Activate this profile"}
        aria-pressed={profile.is_active}
      >
        <Star
          size={18}
          className={
            profile.is_active
              ? "fill-primary text-primary"
              : "text-muted-foreground hover:text-primary"
          }
        />
      </button>

      {editing ? (
        <input
          autoFocus
          value={draft}
          maxLength={PROFILE_NAME_MAX}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={rename}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === "Enter") rename();
            if (e.key === "Escape") {
              setDraft(profile.name);
              setEditing(false);
            }
          }}
          className="min-w-0 flex-1 rounded-md border border-input bg-background px-1 py-0.5 text-sm outline-none focus:ring-2 focus:ring-ring/20"
        />
      ) : (
        <span
          onDoubleClick={(e) => {
            e.stopPropagation();
            setEditing(true);
          }}
          className={`flex-1 min-w-0 truncate text-sm ${
            isSelected ? "font-medium text-foreground" : "text-muted-foreground"
          }`}
          title="Double-click to rename"
        >
          {profile.name}
        </span>
      )}

      {canDelete && (
        <button
          onClick={remove}
          className="-m-1 shrink-0 p-1 text-muted-foreground hover:text-destructive"
          title="Delete profile"
          aria-label="Delete profile"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}

function NewProfileButton({
  disabled,
  mutators,
  onError,
}: {
  disabled: boolean;
  mutators: Mutators;
  onError: (msg: string) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = name.trim();
    if (!t || disabled) return;
    try {
      const created = await api.createProfile({ name: t });
      setName("");
      setShowForm(false);
      mutators.addProfile(created);
    } catch (err) {
      onError(err instanceof ApiError ? err.message : String(err));
    }
  }

  if (disabled) {
    return (
      <p className="text-center text-xs text-muted-foreground">
        Profile limit reached ({MAX_PROFILES_PER_USER})
      </p>
    );
  }

  if (!showForm) {
    return (
      <button
        onClick={() => setShowForm(true)}
        className="flex w-full items-center justify-center gap-1.5 rounded-md py-2 text-sm font-medium text-primary transition-colors hover:bg-accent"
      >
        <Plus size={16} /> Add New Profile
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="flex gap-2">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={PROFILE_NAME_MAX}
        placeholder="Profile name"
        onBlur={() => {
          if (!name.trim()) setShowForm(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setName("");
            setShowForm(false);
          }
        }}
        className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/20"
      />
      <button
        type="submit"
        disabled={!name.trim()}
        className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        Add
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Filter editor (right pane)
// ---------------------------------------------------------------------------

function StarterBanner() {
  // Hidden by default to avoid a flash on dismissed instances; revealed once
  // we've confirmed the flag is unset.
  const [show, setShow] = useState(false);
  useEffect(() => {
    void getOnboardingFlag("starterBannerDismissed").then((dismissed) => setShow(!dismissed));
  }, []);

  if (!show) return null;
  return (
    <div className="mb-4 flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
      <Lightbulb size={16} className="mt-0.5 shrink-0 text-primary" />
      <div className="flex-1 text-foreground">
        <span className="font-medium">These are starter examples.</span>{" "}
        <span className="text-muted-foreground">
          Edit, reorder, or delete them — then add your own to make this profile yours.
        </span>
      </div>
      <button
        onClick={async () => {
          setShow(false);
          await setOnboardingFlag("starterBannerDismissed", true);
        }}
        className="-m-1 shrink-0 rounded p-1 text-muted-foreground hover:text-foreground"
        title="Dismiss"
        aria-label="Dismiss starter banner"
      >
        <X size={14} />
      </button>
    </div>
  );
}

function FilterEditor({
  profile,
  mutators,
  onError,
}: {
  profile: FilterProfileWithFilters;
  mutators: Mutators;
  onError: (msg: string) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const filters = useMemo(
    () => [...profile.filters].sort((a, b) => a.position - b.position),
    [profile.filters],
  );

  const [localOrder, setLocalOrder] = useState<FilterOut[] | null>(null);
  const [addingFilter, setAddingFilter] = useState(false);
  const display = localOrder ?? filters;
  const isStarter = profile.name === STARTER_PROFILE_NAME;

  useEffect(() => setLocalOrder(null), [profile.filters]);
  useEffect(() => setAddingFilter(false), [profile.id]);

  async function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = display.findIndex((f) => f.id === active.id);
    const newIndex = display.findIndex((f) => f.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(display, oldIndex, newIndex);
    setLocalOrder(reordered);
    try {
      await api.reorderFilters(profile.id, { ids: reordered.map((f) => f.id) });
      mutators.reorderFilters(profile.id, reordered);
    } catch (err) {
      onError(err instanceof ApiError ? err.message : String(err));
      setLocalOrder(null);
    }
  }

  function add() {
    if (display.length >= MAX_FILTERS_PER_PROFILE || addingFilter) return;
    setAddingFilter(true);
  }

  async function createDraftFilter(text: string, kind: FilterKind | undefined) {
    try {
      const created = await api.createFilter(profile.id, {
        text,
        // Omit when undefined so the backend uses its own default
        // (criterion). Sending kind:undefined would also work but is
        // less clear in the wire payload.
        ...(kind ? { kind } : {}),
      });
      setAddingFilter(false);
      mutators.addFilter(profile.id, created);
    } catch (err) {
      onError(err instanceof ApiError ? err.message : String(err));
    }
  }

  const visibleCount = display.length + (addingFilter ? 1 : 0);
  const atLimit = display.length >= MAX_FILTERS_PER_PROFILE;

  return (
    <div>
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-base font-semibold text-foreground">
          {profile.name} Profile Filters
        </h2>
        <span className="text-sm text-muted-foreground">
          {visibleCount} / {MAX_FILTERS_PER_PROFILE} filters
        </span>
      </div>

      {isStarter && <StarterBanner />}

      {display.length === 0 && (
        <div className="mb-4 rounded-lg border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
          No filters yet. Add one below — for example,{" "}
          <em>Must be fully remote</em>.
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={display.map((f) => f.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-3 mb-4">
            {display.map((f) => (
              <SortableRow key={f.id} id={f.id}>
                {({ attributes, listeners }) => (
                  <FilterCard
                    filter={f}
                    mutators={mutators}
                    onError={onError}
                    dragAttributes={attributes}
                    dragListeners={listeners}
                  />
                )}
              </SortableRow>
            ))}
            {addingFilter && (
              <NewFilterDraft
                onConfirm={createDraftFilter}
                onCancel={() => setAddingFilter(false)}
              />
            )}
          </div>
        </SortableContext>
      </DndContext>

      <button
        onClick={add}
        disabled={atLimit || addingFilter}
        className="flex w-full items-center justify-center gap-2 rounded-md bg-primary py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Plus size={18} />
        {addingFilter ? "Confirm the new filter" : atLimit ? "Filter limit reached" : "Add New Filter"}
      </button>
    </div>
  );
}

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

function NewFilterDraft({
  onConfirm,
  onCancel,
}: {
  // Carries the validated FilterKind so the parent can store it on the
  // new filter row. Undefined when validation didn't complete (quota /
  // error / save-anyway-without-LLM); the backend defaults to criterion.
  onConfirm: (text: string, kind: FilterKind | undefined) => Promise<void>;
  onCancel: () => void;
}) {
  const [text, setText] = useState("");
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
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-amber-500 px-2.5 text-xs font-medium text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
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
              className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
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

function FilterCard({
  filter,
  mutators,
  onError,
  dragAttributes,
  dragListeners,
}: {
  filter: FilterOut;
  mutators: Mutators;
  onError: (msg: string) => void;
  dragAttributes: ReturnType<typeof useSortable>["attributes"];
  dragListeners: ReturnType<typeof useSortable>["listeners"];
}) {
  const [text, setText] = useState(filter.text);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => setText(filter.text), [filter.text]);

  // Auto-grow textarea to fit its content.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  async function commitText() {
    const t = text.trim();
    if (!t) {
      setText(filter.text);
      return;
    }
    if (t === filter.text) return;
    try {
      const updated = await api.updateFilter(filter.id, { text: t });
      mutators.updateFilter(updated);
    } catch (err) {
      onError(err instanceof ApiError ? err.message : String(err));
      setText(filter.text);
    }
  }

  async function toggle(enabled: boolean) {
    try {
      const updated = await api.updateFilter(filter.id, { enabled });
      mutators.updateFilter(updated);
    } catch (err) {
      onError(err instanceof ApiError ? err.message : String(err));
    }
  }

  async function remove() {
    if (!confirm("Delete this filter?")) return;
    try {
      await api.deleteFilter(filter.id);
      mutators.deleteFilter(filter.profile_id, filter.id);
    } catch (err) {
      onError(err instanceof ApiError ? err.message : String(err));
    }
  }

  return (
    <div className="group relative flex items-start gap-3 rounded-lg border bg-card p-3 text-card-foreground transition-colors hover:bg-accent/40">
      {/* Drag handle — appears on hover */}
      <button
        {...dragAttributes}
        {...dragListeners}
        className="absolute left-0 top-1/2 -translate-x-1 -translate-y-1/2 cursor-grab p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
        title="Drag to reorder"
        aria-label="Drag to reorder"
      >
        <GripVertical size={14} />
      </button>

      {/* Custom-styled checkbox */}
      <label className="mt-1.5 inline-flex shrink-0 cursor-pointer">
        <input
          type="checkbox"
          checked={filter.enabled}
          onChange={(e) => toggle(e.target.checked)}
          className="peer sr-only"
        />
        <span className="flex h-5 w-5 items-center justify-center rounded border border-input bg-background transition-colors peer-checked:border-primary peer-checked:bg-primary">
          <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-3.5 w-3.5 text-primary-foreground opacity-0 peer-checked:opacity-100"
          >
            <path
              fillRule="evenodd"
              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
              clipRule="evenodd"
            />
          </svg>
        </span>
      </label>

      {/* Multi-line text input */}
      <div className="flex-1 min-w-0">
        <textarea
          ref={textareaRef}
          value={text}
          maxLength={FILTER_TEXT_MAX}
          rows={1}
          onChange={(e) => setText(e.target.value)}
          onBlur={commitText}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              (e.target as HTMLTextAreaElement).blur();
            }
          }}
          className="w-full resize-none overflow-hidden rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20"
        />
        <div className="mt-1 text-right text-xs text-muted-foreground">
          {text.length} / {FILTER_TEXT_MAX}
        </div>
      </div>

      {/* Delete with icon + label */}
      <button
        onClick={remove}
        className="flex shrink-0 flex-col items-center gap-0.5 px-2 py-1 text-muted-foreground hover:text-destructive"
        title="Delete filter"
        aria-label="Delete filter"
      >
        <Trash2 size={18} />
        <span className="text-xs">Delete</span>
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// App shell
// ---------------------------------------------------------------------------

export default function App() {
  const { email, loading } = useSession();

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="min-h-screen bg-muted/30 text-foreground">
      <Header email={email} />
      {email ? (
        <>
          <HowItWorksStrip />
          <ProfilesEditor />
        </>
      ) : (
        <div className="mx-auto max-w-6xl px-6 py-6">
          <AuthPanel />
        </div>
      )}
    </div>
  );
}
