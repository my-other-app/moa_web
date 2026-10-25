"use client";

import Link from "next/link";
import { CardLabel, FigurePanel, ProgressBar, Skeleton } from "@moa/ui";

import { useTicketSales } from "../queries";
import { priceText, rupees, salesWorthShowing, soldText, type Sales, type TypeSales } from "../schemas";

/**
 * What each ticket type sold: places taken against its cap, the money in,
 * the registrations still waiting for their payment, and who is in line.
 * Then the codes used at the event. Paid places only count once paid; a
 * free ticket, or one a code made free, counts at once.
 */
function TypeRow({ t }: { t: TypeSales }) {
  return (
    <tr className="border-line-soft border-t align-top">
      <td className="py-2 pr-3">
        <span className="text-ink text-[13px] font-medium">{t.name}</span>
        {t.is_hidden ? <span className="text-ink-3 ml-1.5 font-mono text-[10px] uppercase">hidden</span> : null}
        <span className="text-ink-3 block text-[11.5px]">{priceText(t.price)}</span>
        {t.capacity !== null ? <ProgressBar value={t.sold} max={t.capacity} height={5} className="mt-1.5 max-w-[160px]" label={soldText(t.sold, t.capacity)} /> : null}
      </td>
      <td className="py-2 pr-3 text-right font-mono text-[12.5px] tabular-nums">{soldText(t.sold, t.capacity)}</td>
      <td className="py-2 pr-3 text-right font-mono text-[12.5px] tabular-nums">{rupees(t.revenue)}</td>
      <td className="py-2 pr-3 text-right font-mono text-[12.5px] tabular-nums">{t.pending ? t.pending.toLocaleString("en-IN") : "—"}</td>
      <td className="py-2 pr-3 text-right font-mono text-[12.5px] tabular-nums">{t.available === null ? "No cap" : t.available.toLocaleString("en-IN")}</td>
      <td className="py-2 text-right font-mono text-[12.5px] tabular-nums">{t.waiting || t.offered ? `${t.waiting}${t.offered ? ` · ${t.offered} offered` : ""}` : "—"}</td>
    </tr>
  );
}

export function TicketSalesTable({ sales }: { sales: Sales }) {
  const totals = sales.totals;
  return (
    <div className="grid gap-4">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left" aria-label="Sales by ticket type">
          <thead>
            <tr className="text-ink-3 font-mono text-[10px] tracking-[0.08em] uppercase">
              <th className="pb-1.5 font-medium">Type</th>
              <th className="pb-1.5 text-right font-medium">Sold</th>
              <th className="pb-1.5 text-right font-medium">Revenue</th>
              <th className="pb-1.5 text-right font-medium">Awaiting payment</th>
              <th className="pb-1.5 text-right font-medium">Left</th>
              <th className="pb-1.5 text-right font-medium">Waiting</th>
            </tr>
          </thead>
          <tbody>
            {sales.types.map((t) => (
              <TypeRow key={t.id} t={t} />
            ))}
          </tbody>
          <tfoot>
            <tr className="border-line border-t">
              <td className="text-ink pt-2 text-[12.5px] font-semibold">All types</td>
              <td className="pt-2 text-right font-mono text-[12.5px] font-semibold tabular-nums">{soldText(totals.sold ?? 0, sales.event_capacity)}</td>
              <td className="pt-2 text-right font-mono text-[12.5px] font-semibold tabular-nums">{rupees(totals.revenue ?? 0)}</td>
              <td className="pt-2 text-right font-mono text-[12.5px] tabular-nums">{totals.pending ? totals.pending.toLocaleString("en-IN") : "—"}</td>
              <td className="pt-2 text-right font-mono text-[12.5px] tabular-nums">{sales.event_available === null ? "—" : sales.event_available.toLocaleString("en-IN")}</td>
              <td className="pt-2 text-right font-mono text-[12.5px] tabular-nums">{totals.waiting ? totals.waiting.toLocaleString("en-IN") : "—"}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {sales.codes.length ? (
        <div>
          <p className="eyebrow mb-1.5">Discount codes used</p>
          <ul className="grid gap-1">
            {sales.codes.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 text-[12.5px]">
                <span className="text-ink font-mono">{c.code}</span>
                <span className="text-ink-2 font-mono tabular-nums">
                  {c.uses.toLocaleString("en-IN")} {c.uses === 1 ? "use" : "uses"} · {rupees(c.discount_total)} off
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/**
 * On the event's Overview: shown once the event sells more than one type,
 * a code was used, or it has a waiting list. A single-type event's overview
 * stays as it was, and a backend without ticket types shows nothing.
 */
export function TicketSalesCard({ eventId }: { eventId: number }) {
  const sales = useTicketSales(eventId);
  if (!sales.data || !salesWorthShowing(sales.data)) return null;
  return (
    <FigurePanel>
      <CardLabel
        right={
          <Link href={`/events/${eventId}/tickets`} className="text-brand text-[12px] font-medium hover:underline">
            Tickets
          </Link>
        }
      >
        Sales by ticket type
      </CardLabel>
      <div className="mt-3">
        <TicketSalesTable sales={sales.data} />
      </div>
    </FigurePanel>
  );
}

/** The Tickets tab's own: always shown, with a skeleton while it loads. */
export function TicketSalesPanel({ eventId }: { eventId: number }) {
  const sales = useTicketSales(eventId);
  return (
    <FigurePanel>
      <CardLabel>Sales by ticket type</CardLabel>
      <div className="mt-3">
        {sales.isPending ? (
          <Skeleton className="h-28 w-full" />
        ) : sales.isError ? (
          <p className="text-ink-3 text-[12.5px]">The sales could not load. Try again in a moment.</p>
        ) : sales.data ? (
          <TicketSalesTable sales={sales.data} />
        ) : null}
      </div>
    </FigurePanel>
  );
}
