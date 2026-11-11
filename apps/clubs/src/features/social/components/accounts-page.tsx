"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { CheckIcon, Loader2Icon, LockIcon, PlugIcon, RefreshCwIcon, UnplugIcon } from "lucide-react";
import { formatDate } from "@moa/app-kit";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  CardLabel,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  FigurePanel,
  Notice,
  Skeleton,
  StatusBadge,
  Switch,
  buttonVariants,
  cn,
  toast,
} from "@moa/ui";

import { openUpgrade, usePlan } from "@/features/plan";

import {
  SOCIAL_KEY,
  useConnect,
  useDisconnect,
  usePendingChoices,
  usePickPending,
  useSaveSocialSettings,
  useSocialAccounts,
  useSocialPlatforms,
  useSocialRole,
  useSocialSettings,
} from "../queries";
import {
  EXPIRY_WARN_DAYS,
  PLATFORMS,
  PLATFORM_LABEL,
  PLATFORM_NEEDS,
  SOCIAL_SETTINGS_PATH,
  cardState,
  connectErrorText,
  daysLeft,
  readConnectReturn,
  type CardState,
  type ConnectReturn,
  type Platform,
  type PlatformRow,
  type SocialAccount,
} from "../schemas";
import { PlatformMark } from "./platform-mark";

/**
 * Settings → Social accounts: one card per platform.
 *
 * Owners and admins connect each of the club's accounts once, through the
 * platform's own sign-in (no passwords shared), and disconnect them. Editors
 * see what is connected, since their posts go out from these accounts, but
 * not the buttons the server would refuse them. A platform MyOtherApp has not
 * set up yet, or one the plan doesn't include, says so on its card; the share
 * kit on every event's Promote tab works whatever this page shows.
 *
 * Coming back from a platform's sign-in, the page reads `?social=…`: a toast
 * when it connected, the reason when it didn't, and for Facebook or Instagram
 * with several Pages, the step that picks one.
 */
export function SocialAccountsPage() {
  const role = useSocialRole();
  const platforms = useSocialPlatforms(role.see);
  const on = platforms.data != null;
  const accounts = useSocialAccounts(on);
  const [back, setBack] = React.useState<ConnectReturn | null>(null);
  useConnectReturn(setBack);

  const rows = React.useMemo(() => {
    const list = platforms.data ?? [];
    // In the product's order, whatever order the server sends.
    return PLATFORMS.flatMap((p) => list.filter((r) => r.platform === p));
  }, [platforms.data]);

  return (
    <div className="flex flex-col gap-3.5">
      <header className="min-w-0">
        <h2 className="page-title m-0 font-semibold tracking-[-0.02em]">Social accounts</h2>
        <p className="text-ink-2 mt-1 max-w-[70ch] text-[13px]">
          Connect your club&apos;s accounts once. Each event&apos;s posts then go out from them at the time you pick, from the event&apos;s Promote tab.
        </p>
      </header>

      {back?.kind === "error" ? (
        <Notice tone="refuse" tag="Not connected" action={<button type="button" className="btn btn-ghost btn-sm" onClick={() => setBack(null)}>Dismiss</button>}>
          {connectErrorText(back.reason, back.platform)}
        </Notice>
      ) : null}
      {back?.kind === "pick" ? <PickAccountDialog stateId={back.stateId} platform={back.platform} onDone={() => setBack(null)} /> : null}

      {platforms.isError ? (
        <EmptyState tone="muted" title="Could not load your social accounts" description="Try reloading the page." />
      ) : platforms.data === undefined || (on && accounts.data === undefined && !accounts.isError) ? (
        <div className="grid gap-3.5 md:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-[190px] rounded-2xl" />
          ))}
        </div>
      ) : platforms.data === null ? (
        <Notice tone="neutral" tag="Social">
          Connecting social accounts isn&apos;t available yet. It turns up here by itself once it is.
        </Notice>
      ) : (
        <>
          {!role.manage ? (
            <Notice tone="neutral" tag="Read only">
              Only the club&apos;s owner or an admin can connect or disconnect accounts. You can write and schedule posts to the ones connected here.
            </Notice>
          ) : null}
          {accounts.isError ? <Notice tone="refuse" tag="Accounts">We couldn&apos;t read which accounts are connected. Try reloading the page.</Notice> : null}
          <div className="grid items-start gap-3.5 md:grid-cols-2">
            {rows.map((row) => (
              <PlatformCard key={row.platform} row={row} state={cardState(row, accounts.data ?? [])} manage={role.manage} />
            ))}
          </div>
          <ApprovalPanel manage={role.manage} />
          <HowItWorks />
        </>
      )}
    </div>
  );
}

/** Reads `?social=…` once, says it, and takes it off the address so a reload doesn't say it again. */
function useConnectReturn(onReturn: (r: ConnectReturn) => void) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const handled = React.useRef(false);
  React.useEffect(() => {
    if (handled.current) return;
    const r = readConnectReturn(new URLSearchParams(params.toString()));
    if (!r) return;
    handled.current = true;
    if (r.kind === "connected") {
      toast.success(`${r.platform ? PLATFORM_LABEL[r.platform] : "Account"} connected`);
      void queryClient.invalidateQueries({ queryKey: SOCIAL_KEY });
    }
    onReturn(r);
    router.replace(pathname);
  }, [params, router, pathname, queryClient, onReturn]);
}

// ─── A platform's card ───────────────────────────────────────────────────

const STATE_BADGE: Record<CardState["kind"], { label: string; tone: "default" | "success" | "warning" | "destructive" | "info" }> = {
  not_configured: { label: "Not available yet", tone: "default" },
  review_pending: { label: "Coming soon", tone: "info" },
  plan: { label: "Not on your plan", tone: "default" },
  connect: { label: "Not connected", tone: "default" },
  connected: { label: "Connected", tone: "success" },
};

function PlatformCard({ row, state, manage }: { row: PlatformRow; state: CardState; manage: boolean }) {
  const name = PLATFORM_LABEL[row.platform];
  const attention = state.kind === "connected" && state.accounts.some((a) => a.status === "needs_reconnect");
  const badge = attention ? { label: "Needs attention", tone: "warning" as const } : STATE_BADGE[state.kind];
  return (
    <FigurePanel className="flex flex-col gap-3 p-4" role="region" aria-label={name} data-platform={row.platform}>
      <CardLabel right={<StatusBadge label={badge.label} tone={badge.tone} />}>{name}</CardLabel>
      <div className="flex items-start gap-3">
        <PlatformMark platform={row.platform} size="lg" className={cn(state.kind !== "connected" && state.kind !== "connect" && "opacity-60")} />
        <p className="text-ink-2 m-0 min-w-0 text-[12.5px] leading-[1.55]">{PLATFORM_NEEDS[row.platform]}</p>
      </div>
      {state.kind === "connected" ? (
        state.accounts.map((a) => <AccountRow key={a.id} account={a} manage={manage} />)
      ) : state.kind === "connect" ? (
        manage ? (
          <ConnectButton platform={row.platform} />
        ) : (
          <p className="text-ink-3 m-0 text-[12.5px]">Not connected. Ask the club&apos;s owner or an admin to connect it.</p>
        )
      ) : state.kind === "plan" ? (
        <PlanLocked platform={row.platform} feature={state.feature} />
      ) : state.kind === "review_pending" ? (
        <p className="text-ink-3 m-0 text-[12.5px] leading-[1.5]">
          Waiting for {row.platform === "linkedin_page" ? "LinkedIn" : name} to approve MyOtherApp.{" "}
          {row.platform === "linkedin_page" ? "Posting from your own LinkedIn profile works meanwhile." : ""}
        </p>
      ) : (
        <p className="text-ink-3 m-0 text-[12.5px] leading-[1.5]">
          MyOtherApp is still setting up {name}. Until then, each event&apos;s Promote tab has the text and poster ready to post by hand.
        </p>
      )}
    </FigurePanel>
  );
}

function PlanLocked({ platform, feature }: { platform: Platform; feature: string | null }) {
  const plan = usePlan();
  const lock = plan.lockFor(feature ?? (platform === "x" ? "social_x" : "social_autopost"));
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-ink-3 m-0 flex items-center gap-1.5 text-[12.5px]">
        <LockIcon className="size-3.5 shrink-0" aria-hidden="true" />
        Automatic posting to {PLATFORM_LABEL[platform]} is part of {lock.requiredPlanName ?? "a bigger plan"}.
      </p>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => openUpgrade(lock)}>
        See plans
      </button>
    </div>
  );
}

function ConnectButton({ platform, again = false }: { platform: Platform; again?: boolean }) {
  const connect = useConnect();
  const go = () => connect.mutate({ platform, returnTo: `${window.location.origin}${SOCIAL_SETTINGS_PATH}` });
  const busy = connect.isPending || connect.isSuccess;
  return (
    <div>
      <button type="button" className={cn("btn btn-sm", again ? "btn-secondary" : "btn-primary")} onClick={go} disabled={busy}>
        {busy ? <Loader2Icon className="size-3.5 animate-spin" /> : again ? <RefreshCwIcon className="size-3.5" /> : <PlugIcon className="size-3.5" />}
        {again ? "Reconnect" : `Connect ${PLATFORM_LABEL[platform]}`}
      </button>
    </div>
  );
}

function AccountRow({ account: a, manage }: { account: SocialAccount; manage: boolean }) {
  const disconnect = useDisconnect();
  const [confirming, setConfirming] = React.useState(false);
  const [now] = React.useState(() => new Date());
  const left = daysLeft(a.expires_at, now);
  const name = PLATFORM_LABEL[a.platform];
  const reconnect = a.status === "needs_reconnect";
  const waiting = a.waiting_posts;

  return (
    <div className="border-line-soft flex flex-col gap-2.5 border-t pt-3">
      <div className="flex items-center gap-2.5">
        {a.picture_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- the platform's own picture, from its CDN
          <img src={a.picture_url} alt="" className="border-line-soft size-9 shrink-0 rounded-full border object-cover" />
        ) : (
          <PlatformMark platform={a.platform} />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-ink m-0 truncate text-[13.5px] font-semibold">{a.name ?? name}</p>
          {a.handle ? <p className="text-ink-3 m-0 truncate font-mono text-[11.5px]">@{a.handle.replace(/^@/, "")}</p> : null}
        </div>
      </div>
      <p className="text-ink-3 m-0 text-[12px] leading-[1.5]">
        {a.connected_by?.name ? `Connected by ${a.connected_by.name}` : "Connected"}
        {a.connected_at ? ` · ${formatDate(a.connected_at)}` : ""}
        {left !== null && !reconnect ? (
          <>
            {" · "}
            <span className={cn(left <= EXPIRY_WARN_DAYS && "text-caution font-medium")}>
              {left <= 0 ? "Access has ended" : `Reconnect by ${new Date(a.expires_at!).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`}
            </span>
          </>
        ) : null}
      </p>
      {reconnect ? (
        <Notice tone="caution" tag="Reconnect">
          {waiting > 0 ? `Reconnect — ${waiting} ${waiting === 1 ? "post" : "posts"} waiting.` : `${name} needs you to sign in again.`}
          {a.last_error ? ` ${name} said: ${a.last_error.replace(/\.$/, "")}.` : ""}
          {!manage ? " Ask the club's owner or an admin to reconnect it." : ""}
        </Notice>
      ) : null}
      {manage ? (
        <div className="flex flex-wrap items-center gap-2">
          {reconnect || (left !== null && left <= EXPIRY_WARN_DAYS) ? <ConnectButton platform={a.platform} again /> : null}
          <button type="button" className="btn btn-ghost btn-sm text-refuse" onClick={() => setConfirming(true)} disabled={disconnect.isPending}>
            {disconnect.isPending ? <Loader2Icon className="size-3.5 animate-spin" /> : <UnplugIcon className="size-3.5" />} Disconnect
          </button>
        </div>
      ) : null}
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect {a.name ?? name}?</AlertDialogTitle>
            <AlertDialogDescription>
              We delete our access to it at once{a.platform === "x" ? "" : ` and take it back on ${name}`}. Posts waiting for it stay in each event, held until an account is connected again. Posts already out stay on {name}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep connected</AlertDialogCancel>
            <AlertDialogAction
              className={cn(buttonVariants({ variant: "destructive" }))}
              onClick={() => {
                setConfirming(false);
                disconnect.mutate(a);
              }}
            >
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Facebook and Instagram: which Page ──────────────────────────────────

/** After Meta's sign-in with several Pages or Instagram accounts: the club picks the one to post as. */
export function PickAccountDialog({ stateId, platform, onDone }: { stateId: string; platform: Platform | null; onDone: () => void }) {
  const choices = usePendingChoices(stateId);
  const pick = usePickPending();
  const [chosen, setChosen] = React.useState<string | null>(null);
  const name = platform ? PLATFORM_LABEL[platform] : "Facebook";
  const what = platform === "instagram" ? "Instagram account" : "Page";
  const list = choices.data ?? [];
  const value = chosen ?? (list.length === 1 ? list[0]!.external_id : null);

  const confirm = () => {
    if (!value) return;
    pick.mutate(
      { stateId, externalId: value },
      {
        onSuccess: () => {
          toast.success(`${list.find((c) => c.external_id === value)?.name ?? name} connected`);
          onDone();
        },
      },
    );
  };

  return (
    <Dialog open onOpenChange={(o) => (o ? null : onDone())}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Which {what} should the club post as?</DialogTitle>
          <DialogDescription>
            {name} gave MyOtherApp more than one. Pick the club&apos;s; you can connect another later.
          </DialogDescription>
        </DialogHeader>
        {choices.isError ? (
          <Notice tone="refuse" tag="Expired">
            That choice has expired. Close this and connect again.
          </Notice>
        ) : !choices.data ? (
          <div className="grid gap-2">
            <Skeleton className="h-12 rounded-xl" />
            <Skeleton className="h-12 rounded-xl" />
          </div>
        ) : (
          <div role="radiogroup" aria-label={`${what}s`} className="grid max-h-[320px] gap-2 overflow-y-auto">
            {list.map((c) => (
              <button
                key={c.external_id}
                type="button"
                role="radio"
                aria-checked={value === c.external_id}
                onClick={() => setChosen(c.external_id)}
                className={cn(
                  "flex items-center gap-3 rounded-[var(--radius-field)] border px-3 py-2 text-left text-[13px] transition-colors",
                  value === c.external_id ? "border-brand-line bg-brand-soft text-ink" : "border-line text-ink-2 hover:bg-sunken",
                )}
              >
                {c.picture ? (
                  // eslint-disable-next-line @next/next/no-img-element -- the platform's own picture
                  <img src={c.picture} alt="" className="size-8 shrink-0 rounded-full object-cover" />
                ) : platform ? (
                  <PlatformMark platform={platform} />
                ) : null}
                <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>
                {value === c.external_id ? <CheckIcon className="text-brand size-4 shrink-0" aria-hidden="true" /> : null}
              </button>
            ))}
          </div>
        )}
        <DialogFooter>
          <button type="button" className="btn btn-ghost" onClick={onDone}>
            Not now
          </button>
          <button type="button" className="btn btn-primary" onClick={confirm} disabled={!value || pick.isPending}>
            {pick.isPending ? <Loader2Icon className="size-4 animate-spin" /> : null} Connect
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Approval, and how it works ──────────────────────────────────────────

/** The optional approval step (off by default): an editor's post waits until an owner or admin approves it. */
function ApprovalPanel({ manage }: { manage: boolean }) {
  const settings = useSocialSettings();
  const save = useSaveSocialSettings();
  const on = settings.data?.approval_required ?? false;
  return (
    <FigurePanel className="flex flex-col gap-2 p-4" role="region" aria-label="Approval">
      <CardLabel
        right={
          settings.data ? (
            <label className="text-ink-2 flex items-center gap-2 text-[12.5px]">
              <Switch
                checked={on}
                disabled={!manage || save.isPending}
                onCheckedChange={(next) => save.mutate({ approval_required: next })}
                aria-label="Editors' posts need approval"
              />
              {on ? "On" : "Off"}
            </label>
          ) : null
        }
      >
        Approval
      </CardLabel>
      <p className="text-ink m-0 text-[13.5px] font-medium">Editors&apos; posts wait for an owner or admin</p>
      <p className="text-ink-3 m-0 text-[12.5px] leading-[1.55]">
        {on
          ? "An editor's post shows as “Needs approval” until an owner or an admin approves it on the event's Promote tab. Theirs go out without waiting."
          : "Off: an editor's post goes out at its time like anyone's. Turn it on to see every editor's post before it goes out."}
        {!manage ? " Only the owner or an admin can change this." : ""}
      </p>
    </FigurePanel>
  );
}

function HowItWorks() {
  return (
    <FigurePanel className="p-4">
      <CardLabel>How it works</CardLabel>
      <ul className="text-ink-2 m-0 mt-2 flex list-disc flex-col gap-1.5 pl-5 text-[12.5px] leading-[1.55]">
        <li>Each event drafts one post per platform from its details, with the right poster size and its own tracking link.</li>
        <li>You edit them on the event&apos;s Promote tab and pick when each goes out: on publish, at a time, or before the event.</li>
        <li>Nothing goes out between 11 PM and 7 AM unless you pick that time yourself.</li>
        <li>Disconnecting deletes our access at once. Your passwords never reach MyOtherApp.</li>
      </ul>
    </FigurePanel>
  );
}
