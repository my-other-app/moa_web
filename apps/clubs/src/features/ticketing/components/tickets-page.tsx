"use client";

import Link from "next/link";
import { PencilIcon } from "lucide-react";
import { EmptyState, FigurePanel, Skeleton } from "@moa/ui";

import { useAccess } from "@/features/access";

import { useTicketTypes } from "../queries";
import { priceText, soldText } from "../schemas";
import { DiscountCodesPanel } from "./discount-codes";
import { TicketSalesPanel } from "./ticket-sales";
import { WaitlistPanel } from "./waitlist-panel";

/**
 * The event's Tickets tab: what each type sold, its waiting list, and the
 * codes it takes. The types themselves are edited with the rest of the
 * event (Settings → Places and money), so a price and the event's fee are
 * never changed in two places.
 */
export function TicketsPage({ eventId }: { eventId: number }) {
  const types = useTicketTypes(eventId);
  const { can } = useAccess();

  if (types.isPending) return <Skeleton className="h-64 w-full" />;
  if (types.data === null || types.isError) {
    return (
      <FigurePanel>
        <EmptyState size="sm" title="Ticket types aren't available yet" description="They arrive with the next update of MyOtherApp. The event sells its tickets as before." />
      </FigurePanel>
    );
  }
  const t = types.data;
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-ink m-0 text-[15px] font-semibold">{t.types.length === 1 ? "One kind of ticket" : `${t.types.length} ticket types`}</h2>
          <p className="text-ink-3 mt-0.5 text-[12.5px]">
            {t.types.map((x) => `${x.name} · ${priceText(x.price)} · ${soldText(x.sold, x.capacity)}`).join("  ·  ")}
            {t.event_capacity !== null && t.types.length > 1 ? `  ·  ${t.event_capacity.toLocaleString("en-IN")} places across all types` : ""}
          </p>
        </div>
        {can.edit_events ? (
          <Link href={`/events/${eventId}/edit#section-entry`} className="btn btn-secondary btn-sm">
            <PencilIcon className="size-4" /> Edit ticket types
          </Link>
        ) : null}
      </div>
      <TicketSalesPanel eventId={eventId} />
      <WaitlistPanel eventId={eventId} />
      <DiscountCodesPanel eventId={eventId} title="This event's discount codes" />
    </div>
  );
}
