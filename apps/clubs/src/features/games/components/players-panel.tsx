"use client";

import * as React from "react";
import { DownloadIcon, KeyRoundIcon } from "lucide-react";
import { formatNumber } from "@moa/app-kit";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Checkbox,
  FigurePanel,
  Notice,
  Skeleton,
  StatusBadge,
  toast,
} from "@moa/ui";

import { exportUrl } from "../api";
import { errorText } from "../lib/time";
import { usePlayers, useResetPin } from "../queries";
import { DEFAULT_NAME, boardName, type GameKind, type GameSettings, type Player } from "../schemas";

const EXPORTS: readonly { kind: GameKind; all: boolean; label: string }[] = [
  { kind: "cards", all: false, label: "top 20" },
  { kind: "cards", all: true, label: "everyone" },
  { kind: "hunt", all: false, label: "top 20" },
  { kind: "hunt", all: true, label: "everyone" },
];

function Exports({ eventId, s }: { eventId: number; s: GameSettings }) {
  return (
    <FigurePanel className="p-0">
      <div className="p-4">
        <span className="text-ink block text-[15px] font-semibold">Export the boards</span>
        <span className="text-ink-3 mt-0.5 block text-[12.5px] leading-[1.5]">Each game has its own board. Download the top 20 for prizes, or everyone who played. Names are the full names on the registrations.</span>
      </div>
      <div className="border-line-soft grid gap-3 border-t p-4 sm:grid-cols-2">
        {(["cards", "hunt"] as const).map((k) => (
          <div key={k} className="border-line-soft rounded-xl border p-3">
            <p className="m-0 text-[13px] font-semibold">{(k === "cards" ? s.cards_name : s.hunt_name) || DEFAULT_NAME[k]}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {EXPORTS.filter((e) => e.kind === k).map((e) => (
                <a key={e.label} className="btn btn-secondary btn-sm" href={exportUrl(eventId, e.kind, e.all)} download aria-label={`Download ${e.label} for ${DEFAULT_NAME[k]} as CSV`}>
                  <DownloadIcon /> CSV, {e.label}
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
    </FigurePanel>
  );
}

export function PlayersPanel({ eventId, s, canEdit, canExport }: { eventId: number; s: GameSettings; canEdit: boolean; canExport: boolean }) {
  const [text, setText] = React.useState("");
  const [q, setQ] = React.useState("");
  const [optedOut, setOptedOut] = React.useState(false);
  const players = usePlayers(eventId, { q, optedOut });
  const reset = useResetPin(eventId);
  const [asking, setAsking] = React.useState<Player | null>(null);
  const items = players.data?.items ?? [];

  return (
    <div className="flex flex-col gap-3.5">
      <FigurePanel className="p-0">
        <div className="p-4">
          <span className="text-ink block text-[15px] font-semibold">Players</span>
          <span className="text-ink-3 mt-0.5 block text-[12.5px] leading-[1.5]">
            Anyone checked in who has opened a game. Look someone up to reset a forgotten PIN: their old badge code stops working and the ID card needs reprinting.
          </span>
        </div>
        <form
          className="border-line-soft flex flex-wrap items-center gap-3 border-t p-4"
          onSubmit={(e) => {
            e.preventDefault();
            setQ(text.trim());
          }}
        >
          <input type="search" aria-label="Search players" className="input min-w-[240px] flex-1" placeholder="Search by name or email" value={text} onChange={(e) => setText(e.target.value)} />
          <Button type="submit" variant="secondary">
            Search
          </Button>
          <label className="flex items-center gap-2 text-[13px]">
            <Checkbox checked={optedOut} onCheckedChange={(v) => setOptedOut(v === true)} aria-label="Only players who opted out" />
            Only players who opted out
          </label>
        </form>
        <div className="border-line-soft border-t">
          {players.isPending ? (
            <div className="p-4">
              <Skeleton className="h-24 rounded-xl" />
            </div>
          ) : players.isError ? (
            <p className="text-ink-3 m-0 p-4 text-[13px]">Could not load the players.</p>
          ) : items.length ? (
            <ul className="m-0 list-none p-0" aria-label="Players">
              {items.map((p) => (
                <li key={p.registration_id} className="border-line-soft flex flex-wrap items-center gap-x-3 gap-y-1 border-t px-4 py-2.5 first:border-t-0">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium">{p.name || "Unnamed"}</span>
                    <span className="text-ink-3 block truncate text-[12px]">
                      {p.email ?? "No email"} · shown as {boardName(p)}
                    </span>
                  </span>
                  {!p.public ? <StatusBadge tone="info" label="Opted out" /> : null}
                  {p.pin_locked ? <StatusBadge tone="warning" label="PIN locked" /> : null}
                  {canEdit ? (
                    <Button size="sm" variant="secondary" aria-label={`Reset PIN for ${p.name || "player"}`} onClick={() => setAsking(p)}>
                      <KeyRoundIcon /> Reset PIN
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-ink-3 m-0 p-4 text-[13px]">{q || optedOut ? "No player matches." : "No players yet."}</p>
          )}
          {players.data && players.data.total > items.length ? <p className="text-ink-3 m-0 px-4 pb-3 text-[12px]">Showing {formatNumber(items.length)} of {formatNumber(players.data.total)}. Search to narrow it down.</p> : null}
        </div>
      </FigurePanel>
      {canExport ? <Exports eventId={eventId} s={s} /> : <Notice tone="neutral" tag="Read only">Exports are for the club&apos;s owner, admins and editors.</Notice>}

      <AlertDialog open={Boolean(asking)} onOpenChange={(o) => !o && setAsking(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset the PIN for {asking?.name || "this player"}?</AlertDialogTitle>
            <AlertDialogDescription>
              They get a new PIN and a new badge code. Their old badge code and any open game session stop working, and their score and deck stay.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="secondary">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (!asking) return;
                reset.mutate(asking.registration_id, {
                  onSuccess: () => {
                    toast.success("PIN reset", { description: `${asking.name || "The player"} can see the new PIN on their ticket.` });
                    setAsking(null);
                  },
                  onError: (err) => toast.error(errorText(err)),
                });
              }}
            >
              Reset PIN
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
