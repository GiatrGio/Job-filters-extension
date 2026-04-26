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
    <div className="max-w-sm mx-auto mt-10">
      <h2 className="text-lg font-semibold mb-4">
        {view === "signin" ? "Sign in" : "Create account"}
      </h2>
      <form onSubmit={submit} className="space-y-3">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          autoComplete="email"
        />
        <input
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          autoComplete={view === "signin" ? "current-password" : "new-password"}
        />
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-brand-accent text-white py-2 text-sm font-medium disabled:opacity-60"
        >
          {busy ? "…" : view === "signin" ? "Sign in" : "Sign up"}
        </button>
      </form>
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      {info && <p className="mt-3 text-sm text-green-700">{info}</p>}
      <div className="mt-4 text-xs text-gray-500">
        {view === "signin" ? "No account?" : "Already have an account?"}{" "}
        <button
          className="text-brand-accent hover:underline"
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
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto max-w-6xl px-6 py-4 flex items-start justify-between gap-4">
        <h1 className="text-xl font-semibold text-brand-accent">LinkedIn Job Filter</h1>
        {email && (
          <div className="flex items-start gap-6">
            <div className="text-right text-sm">
              <div className="font-medium text-gray-900">{email}</div>
              <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-2 justify-end">
                <span>
                  Plan: {me?.plan ?? "…"}
                  {me ? ` · ${me.usage.used} / ${me.usage.limit} this month` : ""}
                </span>
                {me?.plan === "free" && (
                  <button
                    onClick={openPricing}
                    className="rounded-full bg-amber-100 hover:bg-amber-200 text-amber-900 px-2 py-0.5 text-xs font-semibold transition-colors"
                    title="See Pro plan benefits"
                  >
                    Upgrade to Pro
                  </button>
                )}
              </div>
            </div>
            <button
              onClick={signOut}
              className="text-sm text-brand-accent hover:underline"
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
      <div className="mx-auto max-w-6xl px-6 py-12 text-sm text-gray-500">
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
            <h2 className="text-base font-semibold text-gray-900">
              Job Profiles{" "}
              <span className="text-gray-500 font-normal">
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
            <p className="mt-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </aside>

        {/* Right pane — filters */}
        <section className="md:border-l md:border-gray-200 md:pl-6 min-w-0">
          {selected ? (
            <FilterEditor profile={selected} onChange={refresh} onError={setError} />
          ) : (
            <p className="text-sm text-gray-500">No profile selected.</p>
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

  const baseClasses = "group relative flex items-center gap-2 rounded-xl bg-white px-3 py-2.5 transition-colors cursor-pointer";
  const stateClasses = isSelected
    ? "border-2 border-brand-accent shadow-sm"
    : "border border-gray-200 hover:border-gray-300";

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
        className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab text-gray-400 hover:text-gray-600 p-1"
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
              ? "text-brand-accent fill-brand-accent"
              : "text-gray-400 hover:text-brand-accent"
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
          className="flex-1 min-w-0 rounded border border-gray-200 px-1 py-0.5 text-sm"
        />
      ) : (
        <span
          onDoubleClick={(e) => {
            e.stopPropagation();
            setEditing(true);
          }}
          className={`flex-1 min-w-0 truncate text-sm ${
            isSelected ? "font-medium text-brand-accent" : "text-gray-800"
          }`}
          title="Double-click to rename"
        >
          {profile.name}
        </span>
      )}

      {canDelete && (
        <button
          onClick={remove}
          className="text-gray-400 hover:text-red-600 p-1 -m-1 shrink-0"
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
      <p className="text-center text-xs text-gray-500">
        Profile limit reached ({MAX_PROFILES_PER_USER})
      </p>
    );
  }

  if (!showForm) {
    return (
      <button
        onClick={() => setShowForm(true)}
        className="w-full flex items-center justify-center gap-1.5 text-sm text-brand-accent hover:bg-brand-accent/5 rounded-lg py-2 font-medium"
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
        className="flex-1 min-w-0 rounded-lg border border-gray-300 px-3 py-2 text-sm"
      />
      <button
        type="submit"
        disabled={!name.trim()}
        className="rounded-lg bg-brand-accent text-white px-3 py-2 text-sm font-medium disabled:opacity-50"
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
  const display = localOrder ?? filters;

  useEffect(() => setLocalOrder(null), [profile.filters]);

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

  async function add() {
    if (display.length >= MAX_FILTERS_PER_PROFILE) return;
    try {
      // Create with placeholder text so the row appears immediately and the
      // user can edit in place. Empty text would fail the 1-char min.
      await api.createFilter(profile.id, { text: "New filter" });
      await onChange();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : String(err));
    }
  }

  const atLimit = display.length >= MAX_FILTERS_PER_PROFILE;

  return (
    <div>
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-900">
          {profile.name} Profile Filters
        </h2>
        <span className="text-sm text-gray-500">
          {display.length} / {MAX_FILTERS_PER_PROFILE} filters
        </span>
      </div>

      {display.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-300 px-6 py-10 text-center text-sm text-gray-500 mb-4">
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
          </div>
        </SortableContext>
      </DndContext>

      <button
        onClick={add}
        disabled={atLimit}
        className="w-full rounded-xl bg-brand-accent text-white py-3 text-sm font-medium hover:bg-[#085bb0] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        <Plus size={18} />
        {atLimit ? "Filter limit reached" : "Add New Filter"}
      </button>
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
    <div className="group relative flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-3 hover:border-gray-300 transition-colors">
      {/* Drag handle — appears on hover */}
      <button
        {...dragAttributes}
        {...dragListeners}
        className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab text-gray-400 hover:text-gray-600 p-1"
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
        <span className="h-5 w-5 rounded border border-gray-300 bg-white peer-checked:bg-brand-accent peer-checked:border-brand-accent flex items-center justify-center transition-colors">
          <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-3.5 w-3.5 text-white opacity-0 peer-checked:opacity-100"
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
          className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm leading-relaxed focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent overflow-hidden"
        />
        <div className="text-right text-xs text-gray-400 mt-1">
          {text.length} / {FILTER_TEXT_MAX}
        </div>
      </div>

      {/* Delete with icon + label */}
      <button
        onClick={remove}
        className="flex flex-col items-center gap-0.5 text-gray-500 hover:text-red-600 px-2 py-1 shrink-0"
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
    return <div className="p-6 text-sm text-gray-500">Loading…</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50">
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
