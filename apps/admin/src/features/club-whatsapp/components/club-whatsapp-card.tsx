"use client";

import { MessageCircleIcon } from "lucide-react";
import { SectionTitle, formatDateTime, formatNumber } from "@moa/app-kit";
import { Card, CardContent, Skeleton, StatusBadge } from "@moa/ui";

import { useClubWhatsApp } from "../queries";
import { QUALITY_LABEL, STATUS_TEXT, qualityTone, tierWords } from "../schemas";

/**
 * Whether the club sends from its own WhatsApp Business number, and how Meta
 * rates it. What its number says to people is the club's alone: nothing of a
 * message is here, nor in the endpoint behind it. Not shown at all against a
 * backend from before clubs' own WhatsApp (its route answers a bare 404).
 */
export function ClubWhatsAppCard({ clubId }: { clubId: number }) {
  const { data: w, isPending, isError } = useClubWhatsApp(clubId);
  const status = w?.status ? STATUS_TEXT[w.status] : null;
  if (w === null) return null;
  return (
    <section className="space-y-3" aria-label="WhatsApp">
      <SectionTitle>WhatsApp</SectionTitle>
      <Card>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <span className="bg-brand-soft text-brand grid size-10 shrink-0 place-items-center rounded-xl" aria-hidden="true">
            <MessageCircleIcon className="size-4" />
          </span>
          <div className="min-w-0 flex-1 space-y-2">
            {isPending ? (
              <Skeleton className="h-5 w-48" />
            ) : isError || !w ? (
              <p className="text-muted-foreground text-sm">Could not load the club&apos;s WhatsApp number.</p>
            ) : !w.status ? (
              <p className="text-muted-foreground text-sm">
                No WhatsApp number of its own: its tickets go out from MyOtherApp&apos;s number.
                {w.plan_allows ? " Its plan includes one." : " Its plan doesn't include one (Enterprise)."}
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[16px] font-semibold">{w.display_phone_number ?? "A number"}</span>
                  {status ? <StatusBadge label={status.label} tone={status.tone} /> : null}
                  {w.connected ? (
                    <StatusBadge label={`Quality: ${QUALITY_LABEL[(w.quality_rating ?? "UNKNOWN").toUpperCase()] ?? w.quality_rating}`} tone={qualityTone(w.quality_rating)} />
                  ) : null}
                </div>
                <dl className="text-muted-foreground grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[max-content_1fr]">
                  <dt>Verified name</dt>
                  <dd className="text-foreground">{w.verified_name ?? "—"}</dd>
                  <dt>Messaging limit</dt>
                  <dd className="text-foreground">
                    {tierWords(w.messaging_limit_tier)}
                    <span className="text-muted-foreground block text-xs">The business portfolio&apos;s, shared by all its numbers</span>
                  </dd>
                  <dt>Tickets from it</dt>
                  <dd className="text-foreground">{w.routing ? "Yes, when its templates are approved" : "No"}</dd>
                  <dt>Conversations</dt>
                  <dd className="text-foreground">{formatNumber(w.conversations)}</dd>
                  {w.club_sends_this_month !== null || w.fallbacks_this_month !== null ? (
                    <>
                      <dt>This month</dt>
                      <dd className="text-foreground">
                        {formatNumber(w.club_sends_this_month ?? 0)} from its own number
                        {w.fallbacks_this_month ? (
                          <span className="text-destructive"> · {formatNumber(w.fallbacks_this_month)} fell back to MyOtherApp&apos;s</span>
                        ) : (
                          <span className="text-muted-foreground"> · none fell back</span>
                        )}
                      </dd>
                    </>
                  ) : null}
                  <dt>Last word from Meta</dt>
                  <dd className="text-foreground">{w.last_webhook_at ? formatDateTime(w.last_webhook_at) : "Nothing yet"}</dd>
                  <dt>Connected on</dt>
                  <dd className="text-foreground">{w.connected_at ? formatDateTime(w.connected_at) : "—"}</dd>
                </dl>
                {w.last_error ? <p className="text-destructive text-sm">Meta: {w.last_error}</p> : null}
                {!w.plan_allows && w.connected ? (
                  <p className="text-muted-foreground text-xs">Its plan no longer includes its own number: nothing is sent from it.</p>
                ) : null}
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
