"use client";

import { formatNumber } from "@moa/app-kit";
import { Skeleton, cn } from "@moa/ui";
import { hoverLift, stagger } from "@moa/ui/motion";

import { eventStatus, type EventDetail, type EventStatus } from "@/features/events";
import { useEventAnalytics } from "../queries";

/**
 * The four tinted cards from the design (node 168:1265): status, registrations,
 * visitors and institutions.
 *
 * Not the shared StatCard: that is a white card with an icon and a label, and
 * these are solid colour fields where the number is the whole design. Forcing
 * them through it would mean overriding the surface, the type scale and the
 * icon slot -- i.e. all of it.
 */
const STATUS_COPY: Record<
  EventStatus,
  { label: string; caption: string; fill: string; ink: string; dot: string }
> = {
  live: {
    label: "Live",
    caption: "The event is live and registrations are open",
    fill: "var(--swatch-mint)",
    ink: "var(--stat-mint-ink)",
    dot: "var(--stat-mint-ink)",
  },
  closed: {
    label: "Closed",
    caption: "Registrations have closed; the event has not finished",
    fill: "var(--chip-sand)",
    ink: "#7a4a00",
    dot: "#7a4a00",
  },
  ended: {
    label: "Ended",
    caption: "This event has finished",
    fill: "#e8e9eb",
    ink: "var(--swatch-ink)",
    dot: "var(--swatch-grey)",
  },
};

function TintCard({
  fill,
  ink,
  index,
  children,
}: {
  fill: string;
  ink: string;
  index: number;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{ backgroundColor: fill, color: ink, ...stagger(index) }}
      className={cn(
        "animate-in fade-in-0 slide-in-from-bottom-2 flex min-h-[151px] flex-col items-center justify-center gap-2 rounded-lg px-6 py-7 text-center duration-500 motion-reduce:animate-none",
        hoverLift
      )}
    >
      {children}
    </div>
  );
}

function Figure({ value, label }: { value: string; label: string }) {
  return (
    <>
      <p className="text-[2rem] leading-none font-bold tabular-nums">{value}</p>
      <p className="max-w-[169px] text-base font-light">{label}</p>
    </>
  );
}

export function EventStatCards({ event }: { event: EventDetail | undefined }) {
  const { data, isPending, isError } = useEventAnalytics(event?.id ?? -1);

  if (isPending || !event) {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[151px] w-full rounded-lg" />
        ))}
      </div>
    );
  }

  const status = STATUS_COPY[eventStatus(event)];

  // Page views live on the event, not on the analytics response -- the
  // endpoint only exposes them indirectly, through conversion_rate.
  const visitors = event.page_views ?? 0;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <TintCard fill={status.fill} ink={status.ink} index={0}>
        <span className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="size-4 rounded-full"
            style={{ backgroundColor: status.dot }}
          />
          <span className="text-[2rem] leading-none font-medium">{status.label}</span>
        </span>
        <p className="max-w-[169px] text-base font-light">{status.caption}</p>
      </TintCard>

      <TintCard fill="var(--swatch-lavender)" ink="var(--swatch-violet)" index={1}>
        <Figure
          value={isError ? "--" : formatNumber(data?.total_registrations ?? 0)}
          label="Total Registration Count"
        />
      </TintCard>

      <TintCard fill="var(--swatch-sky)" ink="var(--stat-sky-ink)" index={2}>
        <Figure value={formatNumber(visitors)} label="Event Visitors" />
      </TintCard>

      <TintCard fill="var(--swatch-salmon)" ink="var(--swatch-red)" index={3}>
        <Figure
          value={isError ? "--" : formatNumber(data?.total_institutions ?? 0)}
          label="Institutions"
        />
      </TintCard>
    </div>
  );
}
