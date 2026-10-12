"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ApiError } from "@moa/api";
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, EmptyState, Skeleton, cn } from "@moa/ui";

import { DOOR_STORAGE, KEY_STORAGE } from "../api";
import { useGateContext, useOfflineQueue } from "../queries";
import type { GateContext } from "../schemas";
import { FindPanel } from "./find-panel";
import { ScanStage } from "./scan-stage";
import { WalkupPanel } from "./walkup-panel";
import { MerchPanel } from "@/features/merch";

type Tab = "checkin" | "find" | "walkup" | "merch";

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
  if (ctxQ.isPending) return <Skeleton className="m-4 h-96" />;
  if (ctxQ.isError) {
    const err = ctxQ.error;
    const status = err instanceof ApiError ? err.status : 0;
    const invalidKey = status === 403 && key;
    return (
      <main className="mx-auto flex min-h-dvh max-w-[512px] items-center px-5">
        <EmptyState
          tone="muted"
          title={status === 401 ? "Sign in to open this gate" : invalidKey ? "This gate link no longer works" : status === 403 ? "You’re not on this event’s team" : "The gate could not open"}
          description={
            status === 401
              ? "Sign in with the account the organiser added as a volunteer, or open the gate link they sent you."
              : invalidKey
                ? "The organiser made a new link or switched this one off. Ask them for the current one."
                : status === 403
                  ? "Ask the organiser to add you under Team & doors. Nothing is broken — your account simply has no door permissions here yet."
                  : (err instanceof Error ? err.message : "Try again.")
          }
        />
        <div className="absolute inset-x-0 bottom-8 flex justify-center gap-2">
          {status === 401 ? (
            <Button asChild>
              <Link href={`/login?next=${encodeURIComponent(`/gate/${eventId}`)}`}>Sign in</Link>
            </Button>
          ) : null}
          {invalidKey ? (
            <Button variant="outline" onClick={() => (write(KEY_STORAGE(eventId), null), setKey(null))}>
              Forget this link
            </Button>
          ) : null}
        </div>
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

  const { online, queued, enqueue } = useOfflineQueue(gateKey, eventId);
  const p = ctx.permissions;
  const allowed: { key: Tab; label: string }[] = [
    ...(p.check_in ? [{ key: "checkin" as Tab, label: "Check-in" }, { key: "find" as Tab, label: "Find" }] : []),
    ...(p.walkup ? [{ key: "walkup" as Tab, label: "Walk-up" }] : []),
    ...(p.merch && (ctx.has_merch || ctx.has_store) ? [{ key: "merch" as Tab, label: "Merch" }] : []),
  ];
  const [tab, setTab] = React.useState<Tab>("checkin");
  const current = allowed.some((a) => a.key === tab) ? tab : allowed[0]?.key;
  const permLine = p.full ? "FULL GATE ACCESS" : [p.check_in && "CHECK-IN", p.walkup && "WALK-UP", p.merch && "MERCH"].filter(Boolean).join(" · ") || "NO DOOR PERMISSIONS";

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[512px] flex-col bg-background">
      <header className="flex items-center gap-2.5 border-b bg-card px-4 py-3 pt-[max(12px,env(safe-area-inset-top))]">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-medium">{ctx.event.name}</div>
          <button type="button" onClick={() => ctx.me.kind !== "door" && setPickDoor(true)} className="mt-0.5 font-mono text-[10.5px] font-medium tracking-[0.07em] text-primary">
            {(door || "PICK A DOOR").toUpperCase()}
            {ctx.me.kind !== "door" ? " · CHANGE" : ""}
          </button>
        </div>
        <div className="text-right">
          <div className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground">Checked in</div>
          <div className="font-mono text-[22px] leading-none text-emerald-600 dark:text-emerald-400">
            {ctx.counters.checked_in}
            <span className="text-[12px] text-muted-foreground"> / {ctx.counters.registered}</span>
          </div>
        </div>
      </header>

      {!online ? (
        <div role="status" className="border-b border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-[12px] text-amber-700 dark:text-amber-300">
          No signal. Scans are being saved on this phone and will sync when you’re back. <strong>{queued} waiting.</strong>
        </div>
      ) : queued > 0 ? (
        <div role="status" className="border-b border-primary/40 bg-primary/10 px-4 py-2 text-[12px] text-primary">
          Back online — syncing {queued} saved {queued === 1 ? "scan" : "scans"}…
        </div>
      ) : null}

      {allowed.length === 0 ? (
        <main className="flex flex-1 items-center justify-center px-5 py-9">
          <EmptyState tone="muted" title="Nothing switched on for you here" description="Ask the organiser to switch on check-in or walk-up for you under Team & doors." />
        </main>
      ) : (
        <main className="flex flex-1 flex-col">
          <div role="tablist" aria-label="Gate" className="grid bg-card" style={{ gridTemplateColumns: `repeat(${allowed.length}, minmax(0, 1fr))` }}>
            {allowed.map((a) => (
              <button key={a.key} type="button" role="tab" aria-selected={current === a.key} onClick={() => setTab(a.key)} className={cn("h-12 border-b-2 text-[13px] font-medium", current === a.key ? "border-primary text-foreground" : "border-transparent text-muted-foreground")}>
                {a.label}
              </button>
            ))}
          </div>
          <div className="flex flex-1 flex-col gap-3.5 p-4">
            {current === "checkin" && door ? <ScanStage key={door} gateKey={gateKey} ctx={ctx} door={door} online={online} enqueue={enqueue} /> : null}
            {current === "find" && door ? <FindPanel gateKey={gateKey} ctx={ctx} door={door} /> : null}
            {current === "walkup" && door ? <WalkupPanel gateKey={gateKey} ctx={ctx} door={door} /> : null}
            {current === "merch" && door ? <MerchPanel gateKey={gateKey} ctx={ctx} door={door} /> : null}
          </div>
        </main>
      )}

      <footer className="flex items-center gap-2.5 border-t bg-card px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))]">
        <span className="min-w-0 flex-1">
          <span className="block text-[12.5px] font-medium">{ctx.me.name}</span>
          <span className="block truncate font-mono text-[10px] tracking-[0.05em] text-muted-foreground">{permLine}</span>
        </span>
        {p.full ? (
          <Button asChild size="sm" variant="ghost">
            <Link href={`/events/${eventId}/team`}>Team &amp; doors</Link>
          </Button>
        ) : null}
      </footer>

      <Dialog open={pickDoor} onOpenChange={setPickDoor}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Which door is this phone on?</DialogTitle>
            <DialogDescription>Set once per device. Every scan from here is attributed to it, so the check-in log shows who came through where.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-1.5">
            {[...new Set([...ctx.doors.map((d) => d.name), ...(door ? [door] : [])])].map((g) => (
              <button key={g} type="button" onClick={() => chooseDoor(g)} className={cn("min-h-11 rounded-md border px-3.5 font-mono text-[13px] font-medium tracking-[0.05em]", door === g ? "border-primary bg-primary/10 text-primary" : "bg-muted/40 text-muted-foreground")}>
                {g}
                {expected === g ? <span className="ml-1.5 text-[9px] opacity-70">YOURS</span> : null}
              </button>
            ))}
          </div>
          {p.full ? (
            <div className="mt-3 flex gap-1.5">
              <input placeholder="Add a door, e.g. Loading bay" value={customDoor} onChange={(e) => setCustomDoor(e.target.value)} aria-label="New door name" className="h-11 min-w-0 flex-1 rounded-md border bg-muted/40 px-3 text-[14px]" />
              <Button type="button" variant="outline" className="h-11" disabled={!customDoor.trim()} onClick={() => (chooseDoor(customDoor.trim()), setCustomDoor(""))}>
                Add
              </Button>
            </div>
          ) : (
            <p className="mt-3 text-[12px] text-muted-foreground">Missing a door? The organiser adds it under Team &amp; doors.</p>
          )}
          {door ? (
            <Button className="mt-3 w-full" onClick={() => setPickDoor(false)}>
              Done
            </Button>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
