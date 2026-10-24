"use client";

import Link from "next/link";
import { ArrowRightIcon, MessageCircleIcon } from "lucide-react";
import { formatNumber } from "@moa/app-kit";
import { CardLabel, FigurePanel, StatusBadge, cn } from "@moa/ui";

import { useAccess } from "@/features/access";

import { useOverview } from "../queries";
import { STATUS_LABEL, STATUS_TONE, TIER_LIMIT_NOTE, duration, tierWords, type Overview } from "../schemas";
import { QualityBadge } from "./shared";

function Figure({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="min-w-0">
      <div className="eyebrow">{label}</div>
      <div className="text-ink mt-1 text-[20px] font-semibold tracking-[-0.02em] tabular-nums">{value}</div>
      {note ? <div className="text-ink-3 mt-0.5 text-[11.5px]">{note}</div> : null}
    </div>
  );
}

/** The number's quality and limit, and how the inbox is being answered. */
export function OverviewFigures({ o, link = false, className }: { o: Overview; link?: boolean; className?: string }) {
  const a = o.account;
  const s = o.stats;
  const status = a.status ?? "active";
  return (
    <FigurePanel className={cn("flex flex-col gap-3 p-4", className)} role="region" aria-label="WhatsApp overview">
      <CardLabel
        right={
          link ? (
            <Link href="/whatsapp" className="text-brand hover:text-ink inline-flex items-center gap-1 text-[12px] font-medium">
              Open inbox <ArrowRightIcon className="size-3" />
            </Link>
          ) : (
            <StatusBadge label={STATUS_LABEL[status]} tone={STATUS_TONE[status]} />
          )
        }
      >
        WhatsApp
      </CardLabel>
      <div className="flex flex-wrap items-center gap-2">
        <span className="bg-admit-soft text-admit grid size-9 shrink-0 place-items-center rounded-xl">
          <MessageCircleIcon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-ink truncate text-[14px] font-semibold">{a.display_phone_number ?? "Your number"}</div>
          <div className="text-ink-3 truncate text-[12px]">{a.verified_name ?? "No verified name yet"}</div>
        </div>
        <QualityBadge rating={a.quality_rating} />
      </div>
      <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-1 text-[12.5px]">
        <dt className="text-ink-3">
          Messaging limit
          <span className="block text-[11px]">{TIER_LIMIT_NOTE}</span>
        </dt>
        <dd className="text-ink m-0 text-right">{tierWords(a.messaging_limit_tier)}</dd>
      </dl>
      {s ? (
        <div className="border-line-soft grid grid-cols-2 gap-3 border-t pt-3 sm:grid-cols-4">
          <Figure label="Conversations" value={formatNumber(s.conversations)} note={`${formatNumber(s.open)} open`} />
          <Figure label="Unanswered" value={formatNumber(s.unanswered)} note={`${formatNumber(s.unread)} unread`} />
          <Figure label="Replies" value={formatNumber(s.replies)} note={`last ${s.days} days`} />
          <Figure label="Reply time" value={duration(s.median_response_seconds)} note="median" />
        </div>
      ) : null}
    </FigurePanel>
  );
}

/**
 * For the club's dashboard: shown only to those who may see the WhatsApp
 * section, and only once a number is connected. Anything else -- no number,
 * no permission, a server without the feature -- renders nothing.
 */
export function WhatsAppOverviewCard() {
  const { can } = useAccess();
  const q = useOverview(7, Boolean(can.whatsapp));
  if (!can.whatsapp || !q.data || !q.data.account.connected) return null;
  return <OverviewFigures o={q.data} link />;
}
