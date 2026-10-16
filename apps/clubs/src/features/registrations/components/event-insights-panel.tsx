"use client";

import { formatCurrency, formatNumber } from "@moa/app-kit";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DistributionBar,
  EmptyState,
  ProgressMeter,
  Skeleton,
  cn,
} from "@moa/ui";
import { stagger } from "@moa/ui/motion";

import { useEventAnalytics } from "../queries";

/**
 * Everything the analytics endpoint returns, which was almost all of it.
 *
 * The page already made this request -- the stat cards above read two fields
 * from it and the rest of the response was discarded. A club running a paid
 * event could not see what it earned, whether anyone turned up, or when
 * people signed up. There is no new call here; it is the same response, read.
 */
const SLOTS = [
  { key: "morning", label: "Morning", hint: "before noon" },
  { key: "afternoon", label: "Afternoon", hint: "12–5pm" },
  { key: "evening", label: "Evening", hint: "5–9pm" },
  { key: "night", label: "Night", hint: "after 9pm" },
] as const;

function Figure({
  label,
  value,
  caption,
}: {
  label: string;
  value: string;
  caption?: string;
}) {
  return (
    <div className="bg-muted/50 rounded-xl p-4">
      <p className="text-muted-foreground text-xs font-medium">{label}</p>
      <p className="mt-1.5 text-2xl leading-none font-semibold tabular-nums">
        {value}
      </p>
      {caption ? (
        <p className="text-muted-foreground mt-1 text-xs">{caption}</p>
      ) : null}
    </div>
  );
}

export function EventInsightsPanel({ eventId }: { eventId: number }) {
  const { data, isPending, isError } = useEventAnalytics(eventId);

  if (isPending) {
    return <Skeleton className="h-80 w-full rounded-2xl" />;
  }

  if (isError || !data) {
    return (
      <EmptyState
        tone="muted"
        title="Could not load insights"
        description="Try reloading the page."
      />
    );
  }

  const payment = data.payment_status;
  const attendance = data.attendance_status;
  const slots = data.registration_time;
  const busiest = slots
    ? Math.max(slots.morning, slots.afternoon, slots.evening, slots.night)
    : 0;

  return (
    <Card className="rounded-2xl shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_24px_-14px_rgba(16,24,40,0.12)]">
      <CardHeader>
        <CardTitle className="text-base">Insights</CardTitle>
        <CardDescription>
          How this event performed, from registration through to the door.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <Figure
            label="Revenue"
            value={formatCurrency(data.total_revenue)}
            caption={
              payment
                ? `${formatNumber(payment.paid)} paid registrations`
                : undefined
            }
          />
          <Figure
            label="Turnout"
            value={`${Math.round(data.attendance_rate)}%`}
            caption={
              attendance
                ? `${formatNumber(attendance.attended)} of ${formatNumber(
                    attendance.attended + attendance.absent,
                  )} checked in`
                : undefined
            }
          />
          <Figure
            label="Sign-up rate"
            value={`${Math.round(data.conversion_rate)}%`}
            caption="of people who viewed it"
          />
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {payment && payment.paid + payment.unpaid > 0 ? (
            <div className="space-y-2">
              <p className="text-muted-foreground text-xs font-medium">
                Payment
              </p>
              <DistributionBar
                segments={[
                  {
                    key: "paid",
                    label: "Paid",
                    value: payment.paid,
                    tone: "success",
                  },
                  {
                    key: "unpaid",
                    label: "Unpaid",
                    value: payment.unpaid,
                    tone: "warning",
                  },
                ]}
              />
            </div>
          ) : null}

          {attendance && attendance.attended + attendance.absent > 0 ? (
            <div className="space-y-2">
              <p className="text-muted-foreground text-xs font-medium">
                Attendance
              </p>
              <DistributionBar
                segments={[
                  {
                    key: "attended",
                    label: "Checked in",
                    value: attendance.attended,
                    tone: "brand",
                  },
                  {
                    key: "absent",
                    label: "Did not attend",
                    value: attendance.absent,
                    tone: "neutral",
                  },
                ]}
              />
            </div>
          ) : null}
        </div>

        {slots && busiest > 0 ? (
          <div className="space-y-2.5">
            <p className="text-muted-foreground text-xs font-medium">
              When people signed up
            </p>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {SLOTS.map((slot, i) => (
                <div key={slot.key} style={stagger(i)}>
                  <ProgressMeter
                    value={slots[slot.key]}
                    total={busiest}
                    tone={slots[slot.key] === busiest ? "brand" : "neutral"}
                    leading={slot.label}
                    trailing={`${formatNumber(slots[slot.key])} · ${slot.hint}`}
                    label={`${slots[slot.key]} registrations in the ${slot.label.toLowerCase()}`}
                  />
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {data.top_institutions.length > 0 ? (
          <div className="space-y-2.5">
            <p className="text-muted-foreground text-xs font-medium">
              Where they came from
              {data.total_institutions > data.top_institutions.length
                ? ` · top ${data.top_institutions.length} of ${formatNumber(
                    data.total_institutions,
                  )}`
                : ""}
            </p>
            <div className="space-y-2">
              {data.top_institutions.map((institution, i) => (
                <div
                  key={institution.name}
                  style={stagger(i)}
                  className={cn(
                    "animate-in fade-in-0 slide-in-from-bottom-1 bg-muted/40 flex items-center gap-3 rounded-xl p-3 duration-300 motion-reduce:animate-none",
                  )}
                >
                  <span className="bg-background text-muted-foreground grid size-6 shrink-0 place-items-center rounded-md text-xs font-semibold tabular-nums">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {institution.name}
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">
                    {formatNumber(institution.value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
