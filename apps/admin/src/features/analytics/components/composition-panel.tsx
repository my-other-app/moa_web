"use client";

import Link from "next/link";
import { formatNumber } from "@moa/app-kit";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DistributionBar,
  InlineAlert,
  Skeleton,
  cn,
} from "@moa/ui";
import { hoverLift } from "@moa/ui/motion";

import { useDashboardSignals } from "../queries";

/**
 * What the platform is made of, as proportions rather than counts.
 *
 * "412 clubs" and "87 pending" are two numbers an admin has to divide in their
 * head before either means anything. The bar answers the actual question --
 * how much of the platform is waiting on us -- at a glance, and the alert turns
 * that into somewhere to click when the answer is "too much".
 */
function Stat({
  value,
  label,
  href,
}: {
  value: number;
  label: string;
  href?: string;
}) {
  const body = (
    <>
      <p className="text-lg leading-none font-semibold tabular-nums">
        {formatNumber(value)}
      </p>
      <p className="text-muted-foreground mt-1 text-xs">{label}</p>
    </>
  );

  if (!href) {
    return <div className="rounded-lg border p-2.5">{body}</div>;
  }

  return (
    <Link
      href={href}
      className={cn("block rounded-lg border p-2.5 transition-colors hover:bg-accent")}
    >
      {body}
    </Link>
  );
}

export function CompositionPanel() {
  const { data, isPending, isError } = useDashboardSignals();

  return (
    <Card className={cn(hoverLift)}>
      <CardHeader>
        <CardTitle className="text-base">Platform composition</CardTitle>
      </CardHeader>

      <CardContent className="space-y-5">
        {isPending ? (
          <div className="space-y-4">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : isError || !data ? (
          <p className="text-muted-foreground text-sm">Could not load composition.</p>
        ) : (
          <>
            <div className="space-y-2">
              <p className="text-muted-foreground text-xs font-medium">
                Clubs ({formatNumber(data.clubs.total)})
              </p>
              <DistributionBar
                segments={[
                  {
                    key: "verified",
                    label: "Verified",
                    value: data.clubs.verified,
                    tone: "success",
                  },
                  {
                    key: "pending",
                    label: "Awaiting approval",
                    value: data.clubs.pending,
                    tone: "warning",
                  },
                ]}
                emptyLabel="No clubs yet"
              />
            </div>

            <div className="space-y-2">
              <p className="text-muted-foreground text-xs font-medium">
                Events ({formatNumber(data.events.total)})
              </p>
              <DistributionBar
                segments={[
                  {
                    key: "upcoming",
                    label: "Upcoming",
                    value: data.events.upcoming,
                    tone: "brand",
                  },
                  {
                    key: "past",
                    label: "Past",
                    value: data.events.past,
                    tone: "neutral",
                  },
                ]}
                emptyLabel="No events yet"
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <Stat value={data.events.paid} label="Paid events" href="/events" />
              <Stat
                value={data.users.clubAccounts}
                label="Club accounts"
                href="/users"
              />
              <Stat value={data.users.admins} label="Admins" href="/security" />
            </div>

            {data.clubs.pending > 0 ? (
              <InlineAlert
                tone="warning"
                title={`${formatNumber(data.clubs.pending)} ${
                  data.clubs.pending === 1 ? "club is" : "clubs are"
                } waiting for approval`}
              >
                They cannot publish events until someone approves them.{" "}
                <Link href="/clubs?is_verified=false" className="font-medium underline">
                  Review now
                </Link>
              </InlineAlert>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
