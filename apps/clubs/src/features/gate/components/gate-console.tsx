"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ApiError } from "@moa/api";
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, EmptyState, FigurePanel, InitialsAvatar, Skeleton, cn } from "@moa/ui";
import { ChevronDownIcon, DoorOpenIcon, LockIcon, PackageIcon, RefreshCwIcon, ScanLineIcon, SearchIcon, ServerCrashIcon, Link2OffIcon, UserPlusIcon, UserXIcon, WifiOffIcon } from "lucide-react";

import { DOOR_STORAGE, KEY_STORAGE } from "../api";
import { HAPTIC } from "../lib/outcome-copy";
import { withReplayed, type ReplayReport as ReplayReportModel, type ReplayedScan } from "../lib/replay";
import { useGateContext, useOfflineQueue } from "../queries";
import type { GateContext } from "../schemas";
import { DOOR_FIELD, DoorBanner, DoorCount, DoorProgress, TouchChoice } from "./door-kit";
import { FindPanel } from "./find-panel";
import { ReplayReport } from "./replay-report";
import { ScanStage } from "./scan-stage";
import { WalkupPanel } from "./walkup-panel";
import { MerchPanel } from "@/features/merch";

type Tab = "checkin" | "find" | "walkup" | "merch";

const TAB_ICON: Record<Tab, React.ComponentType<{ className?: string }>> = { checkin: ScanLineIcon, find: SearchIcon, walkup: UserPlusIcon, merch: PackageIcon };

const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* private mode */
  }
};

/**
 * The gate console: minimal, one decision at a time, usable one-handed in
 * sunlight. Tabs render only where permitted. The door is a per-device
 * setting -- a volunteer moves between doors during a shift; the phone stays
 * at one. Opened from a gate link, the key on the link is kept on the phone.
 */
export function GateConsole({ eventId }: { eventId: number }) {
  const params = useSearchParams();
  const [key, setKey] = React.useState<string | null>(() => params.get("key") || read(KEY_STORAGE(eventId)));
  React.useEffect(() => {
    const fromUrl = params.get("key");
    if (fromUrl) {
      // The key moves from the address bar onto the phone.
      write(KEY_STORAGE(eventId), fromUrl);
      window.history.replaceState(null, "", `/gate/${eventId}`);
    }
  }, [params, eventId]);

  const ctxQ = useGateContext(key, eventId);
  if (ctxQ.isPending)
    return (
      <div className="bg-canvas min-h-dvh" aria-busy="true">
        <div className="mx-auto flex w-full max-w-[512px] flex-col gap-4 p-4">
          <Skeleton className="h-20" />
          <Skeleton className="h-12" />
          <Skeleton className="aspect-square" />
        </div>
      </div>
    );
  if (ctxQ.isError) {
    const err = ctxQ.error;
    const status = err instanceof ApiError ? err.status : 0;
    const invalidKey = status === 403 && key;
    const serverDown = status >= 500 || status === 0;
    const Icon = status === 401 ? LockIcon : invalidKey ? Link2OffIcon : status === 403 ? UserXIcon : ServerCrashIcon;
    return (
      <main className="bg-canvas flex min-h-dvh items-center justify-center px-5 py-10">
        <FigurePanel className="w-full max-w-[460px] p-2">
          <EmptyState
            icon={<Icon />}
            title={status === 401 ? "Sign in to open this gate" : invalidKey ? "This gate link no longer works" : status === 403 ? "You’re not on this event’s team" : "The gate could not open"}
            description={
              status === 401
                ? "Sign in with the account the organiser added as a volunteer, or open the gate link they sent you."
                : invalidKey
                  ? "The organiser made a new link or switched this one off. Ask them for the current one."
                  : status === 403
                    ? "Ask the organiser to add you under Team & doors. Nothing is broken — your account simply has no door permissions here yet."
                    : serverDown
                      ? "The server did not answer. It may be restarting or your connection dropped — nothing on this phone is lost. Try again in a moment."
                      : (err instanceof Error ? err.message : "Try again.")
            }
            action={
              <div className="flex flex-wrap justify-center gap-2">
                {status === 401 ? (
                  <Button asChild size="lg">
                    <Link href={`/login?next=${encodeURIComponent(`/gate/${eventId}`)}`}>Sign in</Link>
                  </Button>
                ) : null}
                {invalidKey ? (
                  <Button variant="secondary" size="lg" onClick={() => (write(KEY_STORAGE(eventId), null), setKey(null))}>
                    Forget this link
                  </Button>
                ) : null}
                {status !== 401 && !invalidKey ? (
                  <Button size="lg" onClick={() => ctxQ.refetch()} disabled={ctxQ.isFetching}>
                    <RefreshCwIcon className={cn(ctxQ.isFetching && "animate-spin motion-reduce:animate-none")} />
                    {ctxQ.isFetching ? "Trying…" : "Try again"}
                  </Button>
                ) : null}
              </div>
            }
          />
        </FigurePanel>
      </main>
    );
  }
  return <Console gateKey={key} ctx={ctxQ.data} />;
}

function Console({ gateKey, ctx }: { gateKey: string | null; ctx: GateContext }) {
  const eventId = ctx.event.id;
  const expected = ctx.doors.find((d) => d.id === ctx.expected_door_id)?.name ?? null;
  // A door this phone was set to earlier wins; then the door the team put this
  // volunteer on (or the link's door); then the only door there is. Otherwise, ask.
  const firstDoor = () => {
    if (ctx.me.kind === "door" && expected) return expected;
    const stored = read(DOOR_STORAGE(eventId));
    if (stored) return stored;
    if (expected) return expected;
    if (ctx.doors.length === 1) return ctx.doors[0]!.name;
    if (ctx.doors.length === 0) return "Main door";
    return "";
  };
  const [door, setDoor] = React.useState<string>(firstDoor);
  const [pickDoor, setPickDoor] = React.useState(() => firstDoor() === "");
  const [customDoor, setCustomDoor] = React.useState("");
  const chooseDoor = (d: string) => {
    setDoor(d);
    setPickDoor(false);
    write(DOOR_STORAGE(eventId), d);
  };
  const canChangeDoor = ctx.me.kind !== "door";

  /*
   * What the server said about the scans saved without signal. Each guest
   * behind them was let in at the time; the ones it did not admit stay
   * listed, by name, until the volunteer has read them.
   */
  const [replay, setReplay] = React.useState<ReplayReportModel | null>(null);
  const onDrained = React.useCallback((results: ReplayedScan[]) => {
    setReplay((report) => withReplayed(report, results));
    if (results.some((r) => r.response.outcome !== "CHECKED_IN")) {
      try {
        navigator.vibrate?.(HAPTIC.refuse);
      } catch {
        /* no vibration here */
      }
    }
  }, []);
  const { online, queued, enqueue } = useOfflineQueue(gateKey, eventId, onDrained);
  const p = ctx.permissions;
  const allowed: { key: Tab; label: string }[] = [
    ...(p.check_in ? [{ key: "checkin" as Tab, label: "Check-in" }, { key: "find" as Tab, label: "Find" }] : []),
    ...(p.walkup ? [{ key: "walkup" as Tab, label: "Walk-up" }] : []),
    ...(p.merch && (ctx.has_merch || ctx.has_store) ? [{ key: "merch" as Tab, label: "Merch" }] : []),
  ];
  const [tab, setTab] = React.useState<Tab>("checkin");
  const current = allowed.some((a) => a.key === tab) ? tab : allowed[0]?.key;
  const permLine = p.full ? "Full gate access" : [p.check_in && "Check-in", p.walkup && "Walk-up", p.merch && "Merch"].filter(Boolean).join(" · ") || "No door permissions";

  return (
    <div className="bg-canvas min-h-dvh">
      <div className="mx-auto flex min-h-dvh w-full max-w-[512px] flex-col lg:max-w-[1080px]">
        <header className="bg-surface border-line-soft sticky top-0 z-20 border-b">
          <div className="flex items-start gap-3 px-4 pt-[max(12px,env(safe-area-inset-top))] pb-3">
            <div className="min-w-0 flex-1">
              <p className="eyebrow truncate">{ctx.event.org_name || "Gate"}</p>
              <h1 className="text-ink mt-0.5 truncate text-[16px] leading-[1.3] font-semibold tracking-[-0.01em]">{ctx.event.name}</h1>
              {canChangeDoor ? (
                <Button type="button" variant="secondary" size="lg" className="mt-2 max-w-full" onClick={() => setPickDoor(true)} aria-label={door ? `Door: ${door}. Change door` : "Pick a door"}>
                  <DoorOpenIcon className="text-brand" />
                  <span className="min-w-0 truncate">{door || "Pick a door"}</span>
                  <ChevronDownIcon className="text-ink-3" />
                </Button>
              ) : (
                <p className="text-ink-2 mt-1.5 flex min-h-6 items-center gap-1.5 text-[13.5px] font-medium">
                  <DoorOpenIcon aria-hidden="true" className="text-brand size-4" />
                  {door}
                </p>
              )}
            </div>
            <DoorCount checkedIn={ctx.counters.checked_in} registered={ctx.counters.registered} />
          </div>
          <DoorProgress checkedIn={ctx.counters.checked_in} registered={ctx.counters.registered} />
          {!online ? (
            <DoorBanner tone="caution" icon={<WifiOffIcon />} title="No signal" className="border-x-0 border-b-0" action={<span className="bg-surface text-caution rounded-full px-2.5 py-1 font-mono text-[12px] font-semibold tabular-nums">{queued} waiting</span>}>
              Scans are being saved on this phone and will sync when you’re back.
            </DoorBanner>
          ) : queued > 0 ? (
            <DoorBanner tone="info" icon={<RefreshCwIcon className="animate-spin motion-reduce:animate-none" />} title="Back online" className="border-x-0 border-b-0">
              Syncing {queued} saved {queued === 1 ? "scan" : "scans"}…
            </DoorBanner>
          ) : null}
          {replay ? <ReplayReport report={replay} onDismiss={() => setReplay(null)} /> : null}
        </header>

        {allowed.length === 0 ? (
          <main className="flex flex-1 items-center justify-center px-5 py-9">
            <FigurePanel className="w-full max-w-[460px] p-2">
              <EmptyState icon={<LockIcon />} title="Nothing switched on for you here" description="Ask the organiser to switch on check-in or walk-up for you under Team & doors." />
            </FigurePanel>
          </main>
        ) : (
          <main className="flex flex-1 flex-col gap-4 p-4">
            <div role="tablist" aria-label="Gate" className="bg-sunken grid gap-1 rounded-[var(--radius-field)] p-1" style={{ gridTemplateColumns: `repeat(${allowed.length}, minmax(0, 1fr))` }}>
              {allowed.map((a) => {
                const Icon = TAB_ICON[a.key];
                const on = current === a.key;
                return (
                  <button
                    key={a.key}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    onClick={() => setTab(a.key)}
                    className={cn("flex min-h-11 items-center justify-center gap-1.5 rounded-[calc(var(--radius-field)-4px)] px-2 text-[14px] font-medium transition-colors", on ? "bg-surface text-ink shadow-card" : "text-ink-2 hover:text-ink")}
                  >
                    <Icon aria-hidden="true" className={cn("size-4 shrink-0 max-[380px]:hidden", on ? "text-brand" : "text-ink-3")} />
                    {a.label}
                  </button>
                );
              })}
            </div>
            {!door ? (
              <FigurePanel className="p-2">
                <EmptyState
                  icon={<DoorOpenIcon />}
                  title="Pick the door this phone is on"
                  description="Every scan from here is attributed to it, so the check-in log shows who came through where."
                  action={
                    <Button size="lg" onClick={() => setPickDoor(true)}>
                      Pick a door
                    </Button>
                  }
                />
              </FigurePanel>
            ) : null}
            {current === "checkin" && door ? <ScanStage key={door} gateKey={gateKey} ctx={ctx} door={door} online={online} enqueue={enqueue} /> : null}
            {current === "find" && door ? <FindPanel gateKey={gateKey} ctx={ctx} door={door} /> : null}
            {current === "walkup" && door ? <WalkupPanel gateKey={gateKey} ctx={ctx} door={door} /> : null}
            {current === "merch" && door ? <MerchPanel gateKey={gateKey} ctx={ctx} door={door} /> : null}
          </main>
        )}

        <footer className="bg-surface border-line-soft flex items-center gap-3 border-t px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))]">
          <InitialsAvatar name={ctx.me.name} size={32} />
          <span className="min-w-0 flex-1">
            <span className="text-ink block truncate text-[13.5px] font-medium">{ctx.me.name}</span>
            <span className="text-ink-3 block truncate text-[12px]">{permLine}</span>
          </span>
          {p.full ? (
            <Button asChild size="lg" variant="ghost">
              <Link href={`/events/${eventId}/team`}>Team &amp; doors</Link>
            </Button>
          ) : null}
        </footer>
      </div>

      <Dialog open={pickDoor} onOpenChange={setPickDoor}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Which door is this phone on?</DialogTitle>
            <DialogDescription>Set once per device. Every scan from here is attributed to it, so the check-in log shows who came through where.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Doors">
            {[...new Set([...ctx.doors.map((d) => d.name), ...(door ? [door] : [])])].map((g) => (
              <TouchChoice key={g} checked={door === g} onClick={() => chooseDoor(g)} aside={expected === g ? <span className="tag tag-accent">Yours</span> : null}>
                {g}
              </TouchChoice>
            ))}
          </div>
          {p.full ? (
            <div className="mt-1 flex gap-2">
              <input placeholder="Add a door, e.g. Loading bay" value={customDoor} onChange={(e) => setCustomDoor(e.target.value)} aria-label="New door name" className={cn(DOOR_FIELD, "min-w-0 flex-1")} />
              <Button size="lg" type="button" variant="secondary" disabled={!customDoor.trim()} onClick={() => (chooseDoor(customDoor.trim()), setCustomDoor(""))}>
                Add
              </Button>
            </div>
          ) : (
            <p className="text-ink-3 mt-1 text-[12.5px]">Missing a door? The organiser adds it under Team &amp; doors.</p>
          )}
          {door ? (
            <Button size="lg" className="mt-1 w-full" onClick={() => setPickDoor(false)}>
              Done
            </Button>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
