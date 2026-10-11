"use client";

import * as React from "react";
import Link from "next/link";
import { IdCardIcon, PaletteIcon, PrinterIcon } from "lucide-react";
import { PageHeader, formatDateTime } from "@moa/app-kit";
import { Button, EmptyState, Skeleton, cn } from "@moa/ui";
import { pressable } from "@moa/ui/motion";

import { AdmissionPanel } from "@/features/admission";
import { useEventDetail } from "@/features/events";

import { batchPdfUrl } from "../api";
import { useCardSummary, usePrintJobs, useRefreshCards, useUpdateCardSettings } from "../queries";
import { SOURCE_LABEL, type ReprintPolicy } from "../schemas";
import { openPdf } from "./print-frame";

const panel = "rounded-lg border-[0.5px] border-[var(--swatch-grey)]";
const heading = "font-mono text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted-foreground";
const note = "text-[12px] leading-[1.5] text-muted-foreground";
const ROLE: Record<string, string> = { attendee: "Attendees", speaker: "Speakers", staff: "Staff" };

function Tile({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className={cn(panel, "px-4 py-3")}>
      <p className={heading}>{label}</p>
      <p className="text-2xl font-medium text-[var(--swatch-ink)] tabular-nums">{value}</p>
      {sub ? <p className={note}>{sub}</p> : null}
    </div>
  );
}

/** ID cards: the design, the rules, batches to print, and every card put out. */
export function IdCardsPage({ eventId }: { eventId: number }) {
  const event = useEventDetail(eventId);
  const summary = useCardSummary(eventId);
  const jobs = usePrintJobs(eventId);
  const update = useUpdateCardSettings(eventId);
  const refresh = useRefreshCards(eventId);
  const [record, setRecord] = React.useState(true);
  const s = summary.data;
  const print = (scope: "all" | "not_printed", role?: string) => {
    openPdf(batchPdfUrl(eventId, { scope, role, record }));
    // The batch marks cards as printed on the server; the numbers follow once the tab has fetched it.
    setTimeout(refresh, 2500);
  };
  return (
    <div className="space-y-6">
      <PageHeader
        title="ID cards"
        description="The card or label each guest wears, drawn from the design at print time: at check-in from the gate, by hand from the attendees page, or all at once."
        action={
          <Button variant="outline" asChild className={pressable}>
            <Link href={`/events/${eventId}/design`}>
              <PaletteIcon /> Card design
            </Link>
          </Button>
        }
      />
      {summary.isPending ? (
        <Skeleton className="h-96 w-full" />
      ) : summary.isError || !s ? (
        <EmptyState tone="muted" title="Could not load the cards" description={summary.error?.message ?? "Try again."} />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Tile label="Printed" value={s.printed} sub={`of ${s.registered} with a ticket`} />
            <Tile label="Not yet" value={s.registered - s.printed} sub="no card put out so far" />
            <Tile label="Design" value={s.design_version ? `v${s.design_version}` : "starter"} sub="cards use the design as it stands when printed" />
            <Tile label="Print runs" value={s.jobs} sub="cards and batches recorded" />
          </div>

          <section className={cn(panel, "space-y-3 p-4")}>
            <div>
              <p className="text-xl font-medium text-[var(--swatch-ink)]">Print a batch</p>
              <p className={note}>One PDF, a card per page at the card&apos;s own size — for a card printer on the desk machine, or a print shop. Ticking “record” marks each card as printed, which the reprint rule and “not yet printed” read.</p>
            </div>
            <label className="flex items-center gap-2 text-[13px]">
              <input type="checkbox" checked={record} onChange={(e) => setRecord(e.target.checked)} className="size-4 accent-primary" /> Record these as printed
            </label>
            <div className="flex flex-wrap gap-2">
              <Button className={pressable} onClick={() => print("not_printed")} disabled={s.registered - s.printed === 0}>
                <PrinterIcon /> Not yet printed ({s.registered - s.printed})
              </Button>
              <Button variant="outline" className={pressable} onClick={() => print("all")}>
                <PrinterIcon /> Everyone ({s.registered})
              </Button>
              {s.by_role.map((r) => (
                <Button key={r.role} variant="outline" className={pressable} onClick={() => print("all", r.role)}>
                  {ROLE[r.role] ?? r.role} ({r.registered})
                </Button>
              ))}
            </div>
          </section>

          <section className={cn(panel, "space-y-4 p-4")}>
            <div>
              <p className="text-xl font-medium text-[var(--swatch-ink)]">Rules</p>
            </div>
            <div>
              <p className={heading}>Who may print a second card</p>
              <div className="mt-2 grid gap-2 md:grid-cols-3" role="radiogroup" aria-label="Reprint policy">
                {s.reprint_policies.map((p) => (
                  <button key={p.key} type="button" role="radio" aria-checked={s.settings.reprint_policy === p.key} onClick={() => update.mutate({ reprint_policy: p.key as ReprintPolicy })} className={cn("rounded-md border px-3 py-2.5 text-left", s.settings.reprint_policy === p.key ? "border-primary bg-primary/10" : "hover:bg-muted")}>
                    <span className={cn("block text-sm font-medium", s.settings.reprint_policy === p.key && "text-primary")}>{p.label}</span>
                    <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{p.note}</span>
                  </button>
                ))}
              </div>
            </div>
            <label className="flex cursor-pointer items-start gap-2.5 rounded-md border px-2.5 py-2 hover:bg-muted/40">
              <input type="checkbox" checked={s.settings.auto_print_badges} onChange={(e) => update.mutate({ auto_print_badges: e.target.checked })} className="mt-0.5 size-4 accent-primary" />
              <span>
                <span className="block text-[13px]">Print the card when a guest is checked in</span>
                <span className={note}>The gate console opens the print dialog on the guest&apos;s first admission. A second scan never prints.</span>
              </span>
            </label>
            <div>
              <p className={heading}>Already on the blank cards</p>
              <p className={cn(note, "mb-2")}>Tick what the stock you bought already carries; those parts are left out at print time so nothing prints twice. Layers marked pre-printed in the designer are left out too.</p>
              <div className="grid gap-2 md:grid-cols-3">
                {s.preprinted_layers.map((l) => {
                  const on = s.settings.preprinted_carries.includes(l.key);
                  return (
                    <label key={l.key} className="flex cursor-pointer items-start gap-2.5 rounded-md border px-2.5 py-2 hover:bg-muted/40">
                      <input type="checkbox" checked={on} onChange={(e) => update.mutate({ preprinted_carries: e.target.checked ? [...s.settings.preprinted_carries, l.key] : s.settings.preprinted_carries.filter((k) => k !== l.key) })} className="mt-0.5 size-4 accent-primary" />
                      <span>
                        <span className="block text-[13px]">{l.label}</span>
                        <span className={note}>{l.note}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          </section>

          <AdmissionPanel eventId={eventId} />

          <section className="space-y-3">
            <p className={heading}>Cards put out</p>
            {jobs.data?.length ? (
              <div className={cn(panel, "overflow-hidden")}>
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-medium">When</th>
                      <th className="px-4 py-2.5 text-left font-medium">What</th>
                      <th className="px-4 py-2.5 text-left font-medium">How</th>
                      <th className="px-4 py-2.5 text-left font-medium">Where</th>
                      <th className="px-4 py-2.5 text-right font-medium">Design</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobs.data.map((j) => (
                      <tr key={j.id} className="border-t-[0.5px] border-[var(--swatch-grey)]">
                        <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">{formatDateTime(j.created_at)}</td>
                        <td className="px-4 py-2.5">
                          {j.guest ?? `${j.cards} cards`}
                          {j.overrode ? <span className="ml-1.5 rounded-full bg-amber-500/10 px-2 py-0.5 font-mono text-[10px] text-amber-700 dark:text-amber-300">RULE OVERRIDDEN</span> : null}
                        </td>
                        <td className="px-4 py-2.5">{SOURCE_LABEL[j.source] ?? j.source}</td>
                        <td className="px-4 py-2.5">{j.door ?? "—"}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-[11px] text-muted-foreground">v{j.design_version}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className={note}>
                <IdCardIcon className="mr-1 inline size-3.5" /> No card printed yet. The first comes from a check-in, the attendees page, or a batch above.
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
