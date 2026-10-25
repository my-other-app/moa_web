"use client";

import Link from "next/link";
import { MessageCircleWarningIcon } from "lucide-react";
import { SectionTitle, formatNumber } from "@moa/app-kit";
import { Card, CardContent } from "@moa/ui";

import { useFallbackClubs } from "../queries";

/**
 * The clubs whose WhatsApp deliveries -- wanted from their own number -- went
 * from MyOtherApp's most this month, each with its commonest reason. Counts and
 * Meta's codes only: never a message. Not shown against a backend without it
 * (a bare 404), nor while there is nothing to show.
 */
export function WhatsAppFallbacksCard({ limit = 5 }: { limit?: number }) {
  const { data } = useFallbackClubs(limit);
  if (!data || !data.items.length) return null;
  return (
    <section className="space-y-3" aria-label="WhatsApp fallbacks this month">
      <SectionTitle>WhatsApp fallbacks this month</SectionTitle>
      <Card>
        <CardContent className="space-y-2">
          <p className="text-muted-foreground flex items-center gap-2 text-sm">
            <MessageCircleWarningIcon className="size-4" aria-hidden="true" />
            Clubs whose tickets, certificates or reminders went from MyOtherApp&apos;s number though they wanted their own.
          </p>
          <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
            {data.items.map((c) => (
              <li key={c.club_id} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <Link href={`/clubs/${c.club_id}`} className="font-medium hover:underline">
                  {c.club_name ?? `Club ${c.club_id}`}
                </Link>
                <span className="tabular-nums">{formatNumber(c.fallbacks)}</span>
                {c.top_reason || c.top_code ? (
                  <span className="text-muted-foreground min-w-0 flex-1 truncate">
                    mostly: {c.top_reason ?? c.top_code}
                    {c.top_code && c.top_reason && !c.top_reason.includes(c.top_code) ? ` (${c.top_code})` : ""}
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </section>
  );
}
