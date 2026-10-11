"use client";

import * as React from "react";
import Link from "next/link";
import { CardLabel, FigurePanel, ProgressBar, StatusBadge, type StatusTone } from "@moa/ui";

import { formatTime, pct, plural } from "../format";
import type { EventFigures } from "./schemas";

const VIA_COLOR: Record<string, string> = {
  gate: "var(--brand, #17a58f)",
  kiosk: "#34d399",
  desk: "#fbbf24",
  walkup: "#a9adb0",
  offline_sync: "#767b80",
  phone: "#9747ff",
  app: "#4cc8ae",
};
const KIND_TONE: Record<string, StatusTone> = { door: "info", desk: "warning", kiosk: "success" };
const KIND_LABEL: Record<string, string> = { door: "Door", desk: "Desk", kiosk: "Kiosk" };
const CHANNEL_LABEL: Record<string, string> = { email: "Email", whatsapp: "WhatsApp" };

function Row({ children }: { children: React.ReactNode }) {
  return <div className="border-border/60 border-t py-2 first:border-t-0">{children}</div>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-muted-foreground py-5 text-center text-[12.5px]">{children}</p>;
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="text-muted-foreground mt-2.5 text-[11.5px] leading-[1.5]">{children}</p>;
}

/**
 * How the door went, as panels: each door's load, each role's turnout (with
 * a route into Messages for the ones who have not come), whether tickets
 * reached people, and how guests were admitted. Shared by the club's event
 * console and the admin's event page; the links are the caller's, because
 * the two apps route differently.
 */
export function EventAnalyticsPanels({
  a,
  timezone,
  fromReport,
  registered,
  doorOpen,
  teamHref,
  messagesHref,
}: {
  a: EventFigures;
  timezone: string;
  fromReport: boolean;
  registered: number;
  doorOpen: boolean;
  /** Where doors are managed; omitted on a read-only page. */
  teamHref?: string;
  /** A route to message the guests of one role who have not arrived. */
  messagesHref?: (role: string) => string;
}) {
  const admitted = a.total_admitted;
  const nobody = admitted === 0;
  const sent = a.deliveries.reduce((s, d) => s + d.sent, 0);
  const attempted = a.deliveries.reduce((s, d) => s + d.sent + d.failed + d.skipped + d.pending, 0);

  return (
    <>
      <FigurePanel>
        <CardLabel className="mb-3">Load by door</CardLabel>
        {nobody ? <Empty>Each door shows its share once it admits someone.</Empty> : null}
        {a.by_door.map((d) => (
          <Row key={d.door_id ?? d.name}>
            <div className="flex items-baseline gap-2">
              <span className="min-w-0 flex-1 truncate text-[12.5px]">{d.name}</span>
              <StatusBadge tone={KIND_TONE[d.kind] ?? "default"} label={KIND_LABEL[d.kind] ?? d.kind} />
              <span className="text-muted-foreground font-mono text-[12px] tabular-nums">
                {d.admits} <span className="opacity-70">· {Math.round(d.share_pct)}%</span>
              </span>
            </div>
            <ProgressBar value={d.admits} max={Math.max(1, admitted)} height={7} className="mt-1.5" label={`${d.name} admitted`} tone={d.kind === "desk" ? "muted" : d.kind === "kiosk" ? "admit" : "accent"} />
            <div className="text-muted-foreground mt-1 font-mono text-[10.5px] uppercase">
              peak {d.peak_admits} / 15 min
              {d.last_admit_at ? ` · last ${formatTime(d.last_admit_at, timezone)}` : ""}
            </div>
          </Row>
        ))}
        {!nobody ? (
          <Note>
            A door carrying most of the load while another sits quiet is a staffing signal for next time, not a fault.
            {teamHref ? (
              <>
                {" "}
                Doors are managed under{" "}
                <Link href={teamHref} className="text-brand hover:text-foreground">
                  Team &amp; doors
                </Link>
                .
              </>
            ) : null}
          </Note>
        ) : null}
      </FigurePanel>

      <FigurePanel>
        <CardLabel className="mb-3">Turnout by role</CardLabel>
        {a.by_type.length === 0 ? <Empty>No guests on the list yet.</Empty> : null}
        {a.by_type
          // A role nobody was ever on is noise in a finished event's report; live, it is a gap worth seeing.
          .filter((ty) => !fromReport || ty.registered > 0 || ty.checked_in > 0)
          .map((ty) => {
            const missing = Math.max(0, ty.registered - ty.checked_in);
            const canNudge = !fromReport && missing > 0 && doorOpen && !!messagesHref;
            const share = ty.registered ? pct(ty.checked_in, ty.registered) : null;
            return (
              <Row key={ty.role}>
                <div className="flex items-baseline gap-2">
                  <span aria-hidden="true" className="size-2 shrink-0 self-center rounded-full" style={{ background: ty.color }} />
                  <span className="min-w-0 flex-1 truncate text-[12.5px]">{ty.label}</span>
                  <span className="text-muted-foreground font-mono text-[12px] tabular-nums">
                    {ty.checked_in} / {ty.registered}
                  </span>
                  <span className={`w-10 text-right font-mono text-[12px] tabular-nums ${share !== null && share < 50 ? "text-amber-500" : "text-emerald-500"}`}>
                    {share !== null ? `${share}%` : "—"}
                  </span>
                </div>
                <ProgressBar value={ty.checked_in} max={Math.max(1, ty.registered)} height={7} className="mt-1.5" label={`${ty.label} checked in`} tone="admit" />
                {canNudge ? (
                  <Link href={messagesHref!(ty.role)} className="text-muted-foreground hover:text-brand mt-1 inline-block text-[11px]">
                    Message the {missing} not yet here →
                  </Link>
                ) : null}
              </Row>
            );
          })}
        {registered > 0 && a.by_type.length > 1 ? (
          <Note>
            {doorOpen && !fromReport
              ? "Turnout differs by role more often than by anything else. A role under half is worth a reminder while the door is still open."
              : "Turnout differs by role more often than by anything else — the number to plan the next list around."}
          </Note>
        ) : null}
      </FigurePanel>

      <FigurePanel>
        <CardLabel className="mb-3">Did tickets reach people?</CardLabel>
        {a.deliveries.length === 0 ? (
          <Empty>{registered ? "No tickets have been sent yet." : "Nothing to send until there is a guest list."}</Empty>
        ) : (
          <>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-[26px] leading-none tabular-nums">{sent}</span>
              <span className="text-muted-foreground font-mono text-[12px]">of {attempted} delivered</span>
            </div>
            {a.deliveries.map((d) => {
              const all = d.sent + d.failed + d.skipped + d.pending;
              return (
                <div key={d.channel} className="border-border/60 mt-3 border-t pt-2">
                  <div className="flex items-baseline justify-between gap-2 text-[12.5px]">
                    <span>{CHANNEL_LABEL[d.channel] ?? d.channel}</span>
                    <span className="text-muted-foreground font-mono text-[11px] tabular-nums">
                      {d.sent} sent{d.failed ? ` · ${d.failed} failed` : ""}
                      {d.skipped ? ` · ${d.skipped} skipped` : ""}
                      {d.pending ? ` · ${d.pending} pending` : ""}
                    </span>
                  </div>
                  <div className="bg-muted mt-1.5 flex h-[7px] w-full overflow-hidden rounded-full" role="img" aria-label={`${d.channel}: ${d.sent} sent, ${d.failed} failed, ${d.skipped} skipped, ${d.pending} pending`}>
                    {(
                      [
                        ["sent", "bg-emerald-500"],
                        ["failed", "bg-red-500"],
                        ["skipped", "bg-muted-foreground/50"],
                        ["pending", "bg-amber-400"],
                      ] as const
                    ).map(([k, cls]) => {
                      const v = d[k];
                      return v ? <span key={k} className={cls} style={{ width: `${(v / all) * 100}%` }} /> : null;
                    })}
                  </div>
                </div>
              );
            })}
            <Note>Skipped means the guest had no address on that channel, or it bounced before. Failed means the provider refused it.</Note>
          </>
        )}
      </FigurePanel>

      <FigurePanel>
        <CardLabel className="mb-3">How guests were admitted</CardLabel>
        {nobody ? <Empty>Gate, kiosk, desk and walk-up shares appear as people arrive.</Empty> : null}
        {!nobody ? (
          <div className="bg-muted flex h-[9px] w-full overflow-hidden rounded-full" role="img" aria-label={a.via.map((v) => `${v.label}: ${v.admits}`).join(", ")}>
            {a.via.map((v) => (
              <span key={v.via} style={{ width: `${(v.admits / admitted) * 100}%`, background: VIA_COLOR[v.via] ?? VIA_COLOR.walkup }} />
            ))}
          </div>
        ) : null}
        {a.via.map((v) => (
          <div key={v.via} className="border-border/60 flex items-center gap-2 border-t py-2 first:border-t-0">
            <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ background: VIA_COLOR[v.via] ?? VIA_COLOR.walkup }} />
            <span className="flex-1 text-[12.5px]">{v.label}</span>
            <span className="text-muted-foreground font-mono text-[12px] tabular-nums">
              {v.admits} <span className="opacity-70">· {pct(v.admits, admitted)}%</span>
            </span>
          </div>
        ))}
        {a.cards.printed + a.cards.failed > 0 ? (
          <div className="border-border bg-muted/50 text-muted-foreground mt-3 rounded-lg border px-3 py-2 text-[12px]">
            <StatusBadge tone="info" label="Cards" className="mr-2" />
            {plural(a.cards.printed, "card")} printed for {plural(a.cards.holders, "guest")}
            {a.cards.failed ? <span className="text-red-500"> · {a.cards.failed} failed</span> : null}
          </div>
        ) : null}
        {a.contacts.phone + a.contacts.email > 0 ? (
          <Note>
            {plural(a.contacts.email, "email address", "email addresses")} and {plural(a.contacts.phone, "phone number")} on record
            {a.contacts.bounced ? ` · ${a.contacts.bounced} bounced` : ""}.
          </Note>
        ) : null}
      </FigurePanel>
    </>
  );
}
