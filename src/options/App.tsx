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
  Check,
  GripVertical,
  Plus,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { getSupabase, signOut } from "@/lib/auth";
import { openPricing } from "@/lib/links";
import {
  FILTER_TEXT_MAX,
  MAX_FILTERS_PER_PROFILE,
  MAX_PROFILES_PER_USER,
  PROFILE_NAME_MAX,
  type FilterOut,
  type FilterProfileWithFilters,
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
  const [busy, setBusy] = useState(false);
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

  return (
    <div className="mx-auto mt-10 max-w-sm rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
      <h2 className="mb-4 text-lg font-semibold tracking-tight">
        {view === "signin" ? "Sign in" : "Create account"}
      </h2>
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
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20"
          autoComplete={view === "signin" ? "current-password" : "new-password"}
        />
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
// Profiles editor (two-pane container)
// ---------------------------------------------------------------------------

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
                        onChange={refresh}
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
              onCreated={refresh}
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
            <FilterEditor profile={selected} onChange={refresh} onError={setError} />
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
  onChange,
  onError,
  dragAttributes,
  dragListeners,
}: {
  profile: FilterProfileWithFilters;
  isSelected: boolean;
  canDelete: boolean;
  onSelect: () => void;
  onChange: () => Promise<void>;
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
      await api.updateProfile(profile.id, { name: t });
      await onChange();
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
      await onChange();
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
      await onChange();
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
  onCreated,
  onError,
}: {
  disabled: boolean;
  onCreated: () => Promise<void>;
  onError: (msg: string) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = name.trim();
    if (!t || disabled) return;
    try {
      await api.createProfile({ name: t });
      setName("");
      setShowForm(false);
      await onCreated();
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

function FilterEditor({
  profile,
  onChange,
  onError,
}: {
  profile: FilterProfileWithFilters;
  onChange: () => Promise<void>;
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
      await onChange();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : String(err));
      setLocalOrder(null);
    }
  }

  function add() {
    if (display.length >= MAX_FILTERS_PER_PROFILE || addingFilter) return;
    setAddingFilter(true);
  }

  async function createDraftFilter(text: string) {
    try {
      await api.createFilter(profile.id, { text });
      setAddingFilter(false);
      await onChange();
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
                    onChange={onChange}
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

function NewFilterDraft({
  onConfirm,
  onCancel,
}: {
  onConfirm: (text: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
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

  async function submit() {
    const trimmed = text.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      await onConfirm(trimmed);
    } catch {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-start gap-3 rounded-lg border bg-card p-3 text-card-foreground shadow-sm">
      <div className="mt-1.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border border-input bg-background" />
      <div className="min-w-0 flex-1">
        <textarea
          ref={textareaRef}
          value={text}
          maxLength={FILTER_TEXT_MAX}
          rows={1}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
            if (e.key === "Escape") {
              onCancel();
            }
          }}
          placeholder="New filter"
          className="w-full resize-none overflow-hidden rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
        />
        <div className="mt-1 text-right text-xs text-muted-foreground">
          {text.length} / {FILTER_TEXT_MAX}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1 pt-1">
        <button
          type="button"
          onClick={submit}
          disabled={!text.trim() || saving}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          title="Confirm filter"
          aria-label="Confirm filter"
        >
          <Check size={16} />
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
          title="Cancel"
          aria-label="Cancel"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

function FilterCard({
  filter,
  onChange,
  onError,
  dragAttributes,
  dragListeners,
}: {
  filter: FilterOut;
  onChange: () => Promise<void>;
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
      await api.updateFilter(filter.id, { text: t });
      await onChange();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : String(err));
      setText(filter.text);
    }
  }

  async function toggle(enabled: boolean) {
    try {
      await api.updateFilter(filter.id, { enabled });
      await onChange();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : String(err));
    }
  }

  async function remove() {
    if (!confirm("Delete this filter?")) return;
    try {
      await api.deleteFilter(filter.id);
      await onChange();
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
        <ProfilesEditor />
      ) : (
        <div className="mx-auto max-w-6xl px-6 py-6">
          <AuthPanel />
        </div>
      )}
    </div>
  );
}
