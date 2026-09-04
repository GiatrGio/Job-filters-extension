import { useEffect, useState } from "react";
import {
  BriefcaseBusiness,
  ChartNoAxesColumnIncreasing,
  CircleArrowUp,
  CircleUser,
  LogOut,
  PenLine,
  Settings,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { signOut } from "@/lib/auth";
import { FREE_TRACKED_JOB_LIMIT } from "@/lib/limits";
import { openPricing, openSettings } from "@/lib/links";
import type { MeResponse } from "@/shared/types";

/**
 * Account sheet — the side panel's mirror of the website's account menu, so the
 * same email, meters, upgrade CTA, Settings and Log out sit behind the same
 * icon in both apps. Settings itself opens on the website; this is the only
 * place the extension still owns.
 */
export function AccountButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        title="Account and settings"
        aria-label="Open account menu"
        aria-haspopup="dialog"
      >
        <CircleUser size={18} aria-hidden="true" />
      </button>
      {open && <AccountSheet onClose={() => setOpen(false)} />}
    </>
  );
}

function AccountSheet({ onClose }: { onClose: () => void }) {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [trackedJobs, setTrackedJobs] = useState<number | null>(null);
  // Meters stay in a neutral placeholder state until /me lands. Rendering them
  // from a null `me` would read as "no limit" for a split second and flash
  // "Unlimited this month" at free users before their real quota arrives.
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [meRes, apps] = await Promise.all([
        api.me().catch(() => null),
        api.listApplications().catch(() => null),
      ]);
      if (cancelled) return;
      setMe(meRes);
      setTrackedJobs(apps?.length ?? null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const isPro = me?.plan === "pro";

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background text-foreground">
      <header className="flex items-center justify-between border-b px-3 py-2">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <CircleUser size={14} aria-hidden="true" /> Account
        </span>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title="Close"
          aria-label="Close account menu"
        >
          <X size={16} />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <p className="truncate px-2 pb-3 text-sm font-medium text-muted-foreground">
          {me?.email ?? "…"}
        </p>

        <MenuSection>
          <MetricRow
            icon={ChartNoAxesColumnIncreasing}
            label="Job evaluations"
            loading={loading}
            used={me?.usage.used ?? 0}
            limit={isPro ? null : (me?.usage.limit ?? null)}
            unlimitedLabel="Unlimited this month"
          />
          <MetricRow
            icon={PenLine}
            label="Cover letters"
            loading={loading}
            used={me?.cover_letters.used ?? 0}
            limit={me?.cover_letters.limit ?? null}
            unlimitedLabel="Unlimited this month"
          />
          <MetricRow
            icon={BriefcaseBusiness}
            label="Jobs tracking"
            loading={loading || trackedJobs === null}
            used={trackedJobs ?? 0}
            limit={isPro ? null : FREE_TRACKED_JOB_LIMIT}
            unlimitedLabel="Unlimited tracked jobs"
          />
          <MenuButton
            icon={CircleArrowUp}
            onClick={() => {
              openPricing();
              onClose();
            }}
          >
            Upgrade plan
          </MenuButton>
        </MenuSection>

        <MenuSection>
          <MenuButton
            icon={Settings}
            onClick={() => {
              openSettings();
              onClose();
            }}
          >
            Settings
          </MenuButton>
        </MenuSection>

        <MenuSection>
          <MenuButton
            icon={LogOut}
            onClick={async () => {
              onClose();
              await signOut();
            }}
          >
            Log out
          </MenuButton>
        </MenuSection>
      </div>
    </div>
  );
}

function MenuSection({ children }: { children: React.ReactNode }) {
  return <div className="border-t py-2 first:border-t-0 first:pt-0 last:pb-0">{children}</div>;
}

function MenuButton({
  icon: Icon,
  children,
  onClick,
}: {
  icon: React.ElementType;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="flex h-11 w-full items-center gap-3 rounded-md px-2 text-left text-sm transition-colors hover:bg-accent"
      onClick={onClick}
    >
      <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </button>
  );
}

function MetricRow({
  icon: Icon,
  label,
  loading,
  used,
  limit,
  unlimitedLabel,
}: {
  icon: React.ElementType;
  label: string;
  loading: boolean;
  used: number;
  limit: number | null;
  unlimitedLabel: string;
}) {
  const hasLimit = typeof limit === "number";
  const progress = hasLimit && limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;

  return (
    <div className="rounded-md px-2 py-2">
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <span className="truncate text-sm">{label}</span>
            <span className="shrink-0 text-xs font-medium text-muted-foreground">
              {loading ? "…" : hasLimit ? `${used} / ${limit}` : `${used} used`}
            </span>
          </div>
          {/* An empty track while loading: same height as the real meter, but it
              doesn't claim a limit the account may not have. */}
          {loading || hasLimit ? (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
              {!loading && (
                <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
              )}
            </div>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">{unlimitedLabel}</p>
          )}
        </div>
      </div>
    </div>
  );
}
