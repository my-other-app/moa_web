"use client";

import * as React from "react";
import { TicketXIcon } from "lucide-react";
import { ExportMenu, downloadCsv, downloadXlsx, formatDateTime, formatNumber, plural, timestampedName, toCsv, type CsvColumn, type ExportFormat } from "@moa/app-kit";
import { Button, CardLabel, FigurePanel, cn, toast } from "@moa/ui";

import { useGivenBack } from "../queries";
import type { GivenBack } from "../schemas";

/** How many show before "Show all". */
const FIRST = 10;

const CELL = "px-4 py-2.5 text-left align-top";
const HEAD = "text-ink-3 px-4 py-2 text-left font-mono text-[10px] font-normal tracking-[0.06em] uppercase";

export const GIVEN_BACK_COLUMNS: CsvColumn<GivenBack>[] = [
  { header: "Name", value: (r) => r.full_name },
  { header: "Email", value: (r) => r.email },
  { header: "Ticket", value: (r) => r.ticket_id },
  { header: "Their reason", value: (r) => r.reason },
  { header: "Given back", value: (r) => (r.cancelled_at ? formatDateTime(r.cancelled_at) : "") },
];

/**
 * "Given back", on the Attendees tab under the list: the guests who gave
 * their free ticket back by the link in their emails, newest first, with
 * what they said and when. They are no longer on the list (their place went
 * to the waiting list), so this is the one place they show.
 *
 * Nothing shows on an API without it (a 404), while it loads, or while
 * nobody has given a ticket back. The bell's notice leads here
 * (`#given-back`). Whoever may export the list exports this too, as Excel
 * or CSV, built from the rows on hand.
 */
export function GivenBackPanel({ eventId, canExport, selfCancelOff = false }: { eventId: number; canExport: boolean; selfCancelOff?: boolean }) {
  const list = useGivenBack(eventId);
  const [all, setAll] = React.useState(false);
  const [exporting, setExporting] = React.useState(false);
  const rows = list.data ?? [];
  const reachedHere = React.useRef(false);

  // The bell's link: once the rows are on the page, bring them into view.
  React.useEffect(() => {
    if (reachedHere.current || rows.length === 0 || typeof window === "undefined") return;
    if (window.location.hash !== "#given-back") return;
    reachedHere.current = true;
    document.getElementById("given-back")?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }, [rows.length]);

  if (rows.length === 0) return null;
  const shown = all ? rows : rows.slice(0, FIRST);

  const download = async (format: ExportFormat) => {
    setExporting(true);
    try {
      const stem = `given-back-${eventId}`;
      if (format === "xlsx") await downloadXlsx(timestampedName(stem, "xlsx"), rows, GIVEN_BACK_COLUMNS, { sheet: "Given back" });
      else downloadCsv(timestampedName(stem), toCsv(rows, GIVEN_BACK_COLUMNS));
      toast.success(`Exported ${plural(rows.length, "ticket")} given back`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not export who gave their ticket back");
    } finally {
      setExporting(false);
    }
  };

  return (
    <section id="given-back" aria-label="Given back" className="scroll-mt-4">
      <FigurePanel className="overflow-hidden p-0">
        <div className="border-line-soft flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3">
          <div className="min-w-0 flex-1">
            <CardLabel>
              <span className="inline-flex items-center gap-1.5">
                <TicketXIcon aria-hidden="true" className="size-3.5" /> Given back · {formatNumber(rows.length)}
              </span>
            </CardLabel>
            <p className="text-ink-3 m-0 mt-1 text-[12px]">
              Guests who gave their free ticket back with the link in their email. They are off the list, and each place went to the next person waiting.
              {selfCancelOff ? " Giving tickets back is now switched off for this event." : ""}
            </p>
          </div>
          {canExport ? <ExportMenu size="sm" onExport={(format) => void download(format)} busy={exporting} title="Everyone who gave their ticket back, with their reasons" /> : null}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse">
            <thead>
              <tr>
                <th scope="col" className={HEAD}>
                  Guest
                </th>
                <th scope="col" className={HEAD}>
                  Ticket
                </th>
                <th scope="col" className={HEAD}>
                  Their reason
                </th>
                <th scope="col" className={cn(HEAD, "text-right")}>
                  Given back
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={`${r.registration_id}-${r.cancelled_at ?? ""}`} className="border-line-soft border-t">
                  <td className={CELL}>
                    <span className="text-ink block max-w-[260px] truncate text-[13px] font-medium">{r.full_name || "Unknown"}</span>
                    <span className="text-ink-3 block max-w-[260px] truncate font-mono text-[11px]">{r.email || "no email on file"}</span>
                  </td>
                  <td className={CELL}>
                    <span className="text-ink font-mono text-[12px]">{r.ticket_id || "—"}</span>
                  </td>
                  <td className={CELL}>
                    {r.reason ? (
                      <span className="text-ink-2 block max-w-[360px] text-[12.5px] [overflow-wrap:anywhere] whitespace-pre-wrap">&ldquo;{r.reason}&rdquo;</span>
                    ) : (
                      <span className="text-ink-3 text-[12.5px]">No reason given</span>
                    )}
                  </td>
                  <td className={cn(CELL, "text-ink-3 text-right font-mono text-[11.5px] whitespace-nowrap")}>{r.cancelled_at ? formatDateTime(r.cancelled_at) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length > FIRST ? (
          <div className="border-line-soft border-t px-4 py-2">
            <Button variant="ghost" size="sm" aria-expanded={all} onClick={() => setAll((v) => !v)}>
              {all ? "Show fewer" : `Show all ${formatNumber(rows.length)}`}
            </Button>
          </div>
        ) : null}
      </FigurePanel>
    </section>
  );
}
