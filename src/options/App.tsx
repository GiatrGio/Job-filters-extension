import { useCallback, useEffect, useMemo, useState } from "react";
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
import { api, ApiError } from "@/lib/api";
import { getSupabase, signOut } from "@/lib/auth";
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
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          autoComplete="email"
        />
        <input
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          autoComplete={view === "signin" ? "current-password" : "new-password"}
        />
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded bg-brand-accent text-white py-2 text-sm disabled:opacity-60"
        >
          {busy ? "…" : view === "signin" ? "Sign in" : "Sign up"}
        </button>
      </form>
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      {info && <p className="mt-3 text-sm text-green-700">{info}</p>}
      <div className="mt-4 text-xs text-gray-500">
        {view === "signin" ? "No account?" : "Already have an account?"}{" "}
        <button
          className="underline"
          onClick={() => setView(view === "signin" ? "signup" : "signin")}
        >
          {view === "signin" ? "Create one" : "Sign in"}
        </button>
      </div>
    </div>
  );
}

function AccountBar({ email }: { email: string }) {
  const [me, setMe] = useState<MeResponse | null>(null);

  useEffect(() => {
    api.me().then(setMe).catch(() => setMe(null));
  }, []);

  return (
    <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-200">
      <div className="text-sm">
        <div className="font-medium text-gray-900">{email}</div>
        <div className="text-gray-500">
          Plan: {me?.plan ?? "…"}
          {me ? ` · ${me.usage.used} / ${me.usage.limit} this month` : ""}
        </div>
      </div>
      <button onClick={signOut} className="text-sm underline">
        Sign out
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sortable item — minimal wrapper around dnd-kit's useSortable. The drag
// handle is a separate node so we don't hijack clicks on the row content
// (text input, buttons, etc.).
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
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
    >
      {children({ attributes, listeners })}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Profiles editor
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
      // Default selection: keep current if still valid, else pick the active one.
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
    setProfiles(reordered); // optimistic
    try {
      await api.reorderProfiles({ ids: reordered.map((p) => p.id) });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
      await refresh();
    }
  }

  if (loading) return <p className="text-sm text-gray-500">Loading…</p>;

  return (
    <div className="flex gap-6">
      <aside className="w-60 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold">Profiles</h3>
          <span className="text-xs text-gray-500">
            {profiles.length} / {MAX_PROFILES_PER_USER}
          </span>
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
            <ul className="space-y-1 mb-3">
              {profiles.map((p) => (
                <SortableRow key={p.id} id={p.id}>
                  {({ attributes, listeners }) => (
                    <ProfileRow
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
            </ul>
          </SortableContext>
        </DndContext>
        <NewProfileForm
          disabled={profiles.length >= MAX_PROFILES_PER_USER}
          onCreated={refresh}
          onError={setError}
        />
        {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      </aside>

      <section className="flex-1 min-w-0">
        {selected ? (
          <FilterEditor profile={selected} onChange={refresh} onError={setError} />
        ) : (
          <p className="text-sm text-gray-500">No profile selected.</p>
        )}
      </section>
    </div>
  );
}

function ProfileRow({
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

  async function activate() {
    if (profile.is_active) return;
    try {
      await api.activateProfile(profile.id);
      await onChange();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : String(err));
    }
  }

  async function remove() {
    if (!canDelete) return;
    if (!confirm(`Delete profile "${profile.name}" and all its filters?`)) return;
    try {
      await api.deleteProfile(profile.id);
      await onChange();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : String(err));
    }
  }

  return (
    <div
      className={`flex items-center gap-1 rounded border p-2 text-sm ${
        isSelected ? "border-brand-accent bg-amber-50" : "border-gray-200"
      }`}
    >
      <button
        {...dragAttributes}
        {...dragListeners}
        className="cursor-grab text-gray-400 hover:text-gray-600 px-1"
        title="Drag to reorder"
        aria-label="Drag to reorder"
      >
        ⋮⋮
      </button>
      {editing ? (
        <input
          autoFocus
          value={draft}
          maxLength={PROFILE_NAME_MAX}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={rename}
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
        <button
          onClick={onSelect}
          onDoubleClick={() => setEditing(true)}
          className="flex-1 min-w-0 text-left truncate"
          title="Click to select, double-click to rename"
        >
          {profile.is_active && <span className="text-amber-600 mr-1">★</span>}
          {profile.name}
        </button>
      )}
      {!profile.is_active && (
        <button
          onClick={activate}
          className="text-xs text-gray-500 hover:text-gray-900 underline"
          title="Set as active"
        >
          activate
        </button>
      )}
      {canDelete && (
        <button
          onClick={remove}
          className="text-xs text-red-600 hover:underline"
          title="Delete"
          aria-label="Delete profile"
        >
          ✕
        </button>
      )}
    </div>
  );
}

function NewProfileForm({
  disabled,
  onCreated,
  onError,
}: {
  disabled: boolean;
  onCreated: () => Promise<void>;
  onError: (msg: string) => void;
}) {
  const [name, setName] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = name.trim();
    if (!t || disabled) return;
    try {
      await api.createProfile({ name: t });
      setName("");
      await onCreated();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : String(err));
    }
  }

  return (
    <form onSubmit={submit} className="flex gap-1">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={PROFILE_NAME_MAX}
        placeholder={disabled ? "Limit reached" : "New profile…"}
        disabled={disabled}
        className="flex-1 min-w-0 rounded border border-gray-300 px-2 py-1 text-sm disabled:bg-gray-100"
      />
      <button
        type="submit"
        disabled={disabled || !name.trim()}
        className="rounded bg-brand-accent text-white px-2 py-1 text-xs disabled:opacity-50"
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

  const [newText, setNewText] = useState("");
  // Local optimistic copy to keep drag-and-drop snappy without a refetch.
  const [localOrder, setLocalOrder] = useState<FilterOut[] | null>(null);
  const display = localOrder ?? filters;

  // When the underlying profile.filters changes (after refresh), drop the
  // optimistic order so we don't show stale data.
  useEffect(() => {
    setLocalOrder(null);
  }, [profile.filters]);

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
    const t = newText.trim();
    if (!t || display.length >= MAX_FILTERS_PER_PROFILE) return;
    try {
      await api.createFilter(profile.id, { text: t });
      setNewText("");
      await onChange();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : String(err));
    }
  }

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <h3 className="text-base font-semibold">{profile.name}</h3>
        <span className="text-xs text-gray-500">
          {display.length} / {MAX_FILTERS_PER_PROFILE} filters
        </span>
      </div>
      <p className="text-sm text-gray-600 mb-3">
        Write each filter in plain English. Examples: <em>Must be fully remote</em>,{" "}
        <em>Must mention a salary of at least €6,000/month</em>.
      </p>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={display.map((f) => f.id)}
          strategy={verticalListSortingStrategy}
        >
          <ul className="space-y-2 mb-4">
            {display.map((f) => (
              <SortableRow key={f.id} id={f.id}>
                {({ attributes, listeners }) => (
                  <FilterRowInner
                    filter={f}
                    onChange={onChange}
                    onError={onError}
                    dragAttributes={attributes}
                    dragListeners={listeners}
                  />
                )}
              </SortableRow>
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      <div className="flex gap-2">
        <input
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          maxLength={FILTER_TEXT_MAX}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder={
            display.length >= MAX_FILTERS_PER_PROFILE
              ? "Limit reached — delete one to add another"
              : "Add a filter…"
          }
          disabled={display.length >= MAX_FILTERS_PER_PROFILE}
          className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100"
        />
        <button
          onClick={add}
          disabled={display.length >= MAX_FILTERS_PER_PROFILE || !newText.trim()}
          className="rounded bg-brand-accent text-white px-3 py-2 text-sm disabled:opacity-50"
        >
          Add
        </button>
      </div>
    </div>
  );
}

function FilterRowInner({
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

  // Keep local state in sync if the row is replaced by a refresh.
  useEffect(() => setText(filter.text), [filter.text]);

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
    try {
      await api.deleteFilter(filter.id);
      await onChange();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : String(err));
    }
  }

  const overLimit = text.length > FILTER_TEXT_MAX;

  return (
    <div className="flex items-start gap-2 rounded border border-gray-200 p-2">
      <button
        {...dragAttributes}
        {...dragListeners}
        className="cursor-grab text-gray-400 hover:text-gray-600 px-1 mt-1"
        title="Drag to reorder"
        aria-label="Drag to reorder"
      >
        ⋮⋮
      </button>
      <input
        type="checkbox"
        checked={filter.enabled}
        onChange={(e) => toggle(e.target.checked)}
        className="mt-2"
        title="Enabled"
      />
      <div className="flex-1">
        <input
          className={`w-full rounded border px-2 py-1 text-sm ${
            overLimit ? "border-red-400" : "border-gray-200"
          }`}
          value={text}
          maxLength={FILTER_TEXT_MAX}
          onChange={(e) => setText(e.target.value)}
          onBlur={commitText}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
        />
        <div className="text-xs text-gray-400 text-right mt-0.5">
          {text.length} / {FILTER_TEXT_MAX}
        </div>
      </div>
      <button
        onClick={remove}
        className="text-xs text-red-600 underline mt-1"
      >
        Delete
      </button>
    </div>
  );
}

export default function App() {
  const { email, loading } = useSession();

  if (loading) {
    return <div className="p-6 text-sm text-gray-500">Loading…</div>;
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="text-xl font-semibold mb-4">LinkedIn Job Filter</h1>
      {email ? (
        <>
          <AccountBar email={email} />
          <ProfilesEditor />
        </>
      ) : (
        <AuthPanel />
      )}
    </div>
  );
}
