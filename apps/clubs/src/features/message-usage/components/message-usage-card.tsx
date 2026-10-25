"use client";

import * as React from "react";
import Link from "next/link";
import { MailIcon, MessageCircleIcon } from "lucide-react";
import { CardLabel, FigurePanel, Notice, ProgressBar, Skeleton, StatusBadge, cn } from "@moa/ui";

import { useMessageHistory, useMessageUsage } from "../queries";
import {
  CHANNELS,
  CHANNEL_TITLE,
  STATEMENT_LABEL,
  barTone,
  channelName,
  extraLine,
  historyLine,
  isPrepaid,
  paiseText,
  policyLine,
  promotionalLine,
  remainingLines,
  usedLine,
  wantsCredits,
  wantsUpgrade,
  type Channel,
  type MessageUsage,
  type Statement,
} from "../schemas";

/**
 * "Messages this month": the club's emails and WhatsApp messages against its
 * plan's monthly allowance, then its bought credits and the total left, and
 * a way to buy credits (or upgrade) when it is near or past the allowance.
 *
 * On Billing (`variant="billing"`) it also lists the closed months, and
 * "Buy credits" goes to the Credits area below it; on the overview it is the
 * same card, leading to Billing. Nothing is shown on the overview when the
 * answer cannot be had: the card is a convenience there, never a reason for
 * the page to look broken. On a backend from before message quotas (the
 * route answers a bare 404) it is shown on neither page; on one from before
 * prepaid credits it shows the month's count against the limit.
 */
export function MessageUsageCard({ variant = "overview" }: { variant?: "overview" | "billing" }) {
  const usage = useMessageUsage();
  const history = useMessageHistory(variant === "billing");
  const u = usage.data;

  if (usage.isPending) return <Skeleton className="h-[180px] rounded-2xl" />;
  // null: the backend has no message quotas yet.
  if (u === null) return null;
  if (usage.isError || !u) {
    return variant === "billing" ? (
      <FigurePanel className="p-4" role="region" aria-label="Messages this month">
        <CardLabel>Messages this month</CardLabel>
        <p className="text-ink-3 m-0 mt-2 text-[12.5px]">Could not load this month&apos;s messages. Try reloading the page.</p>
      </FigurePanel>
    ) : null;
  }

  // Paused: nothing left to send with, or a reminder held back on a channel the plan has none of.
  const blocked = CHANNELS.filter((ch) => u.channels[ch].state === "blocked" && (u.channels[ch].limit !== 0 || u.channels[ch].blocked > 0));
  const over = CHANNELS.some((ch) => u.channels[ch].state === "over");
  const onCredits = CHANNELS.some((ch) => u.channels[ch].state === "credits");
  const upgradeHref = variant === "billing" ? "#plans-title" : "/billing";
  const creditsHref = variant === "billing" ? "#credits" : "/billing#credits";
  const prepaid = isPrepaid(u);

  return (
    <FigurePanel className="flex flex-col gap-3 p-4" role="region" aria-label="Messages this month">
      <CardLabel
        right={
          blocked.length ? (
            <StatusBadge label="Paused" tone="destructive" />
          ) : onCredits ? (
            <StatusBadge label="On bought credits" tone="info" />
          ) : over ? (
            <StatusBadge label="Past the limit" tone="warning" />
          ) : (
            <span className="text-ink-3 text-[11px]">{u.period_label}</span>
          )
        }
      >
        Messages this month
      </CardLabel>

      <div className={cn("grid gap-3", variant === "overview" && "sm:grid-cols-2")}>
        {CHANNELS.map((ch) => (
          <ChannelRow key={ch} u={u} channel={ch} />
        ))}
      </div>

      {blocked.length ? (
        <Notice
          tone="caution"
          tag="Paused"
          action={
            <span className="flex flex-wrap gap-1.5">
              {prepaid ? (
                <Link className="btn btn-primary btn-sm" href={creditsHref}>
                  Buy credits
                </Link>
              ) : null}
              {u.upgrade ? (
                <Link className={prepaid ? "btn btn-secondary btn-sm" : "btn btn-primary btn-sm"} href={upgradeHref}>
                  Upgrade
                </Link>
              ) : null}
            </span>
          }
        >
          <strong>{pausedHeadline(u, blocked)}</strong>{" "}
          {prepaid
            ? "Announcements, campaigns and reminders are on hold until next month, or until you buy credits, with the reason on each message. Tickets, certificates and payment messages still go, so nobody misses their ticket."
            : "Announcements, campaigns and reminders are on hold until next month, with the reason on each message. Tickets, certificates and payment messages still go, so nobody misses their ticket."}
          {u.upgrade ? ` ${u.upgrade.plan_name} includes more.` : ""}
        </Notice>
      ) : wantsCredits(u) || wantsUpgrade(u) ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-ink-2 text-[12.5px]">
            {wantsUpgrade(u) && u.upgrade
              ? `${u.upgrade.plan_name} includes ${limitsOf(u.upgrade.limits)}.${prepaid ? " Or top up with a pack of credits." : ""}`
              : "Top up with a pack of credits: they last 12 months."}
          </span>
          <span className="flex flex-wrap gap-1.5">
            {wantsCredits(u) ? (
              <Link className="btn btn-secondary btn-sm" href={creditsHref}>
                Buy credits
              </Link>
            ) : null}
            {wantsUpgrade(u) && u.upgrade ? (
              <Link className="btn btn-secondary btn-sm" href={upgradeHref}>
                Upgrade
              </Link>
            ) : null}
          </span>
        </div>
      ) : null}

      <p className="text-ink-3 m-0 text-[12px] leading-[1.5]">
        Tickets, certificates, reminders, announcements, campaigns and journey emails all count. {policyLine(u)}
        {u.custom ? " Your club has limits of its own, agreed with MyOtherApp." : ""}
      </p>

      {variant === "billing" ? <History items={history.data?.items ?? []} loading={history.isPending} /> : null}
    </FigurePanel>
  );
}

/**
 * "Free's 200 emails for October 2026 are used up." / "WhatsApp reminders
 * aren't included on Free." On a prepaid server it says the bought credits
 * are gone too ("… and your bought email credits are used up.").
 */
export function pausedHeadline(u: MessageUsage, channels: Channel[]): string {
  const plan = u.trial === "free_trial" ? "your free trial" : (u.plan_name ?? "your plan");
  const prepaid = isPrepaid(u);
  return channels
    .map((ch) => {
      const c = u.channels[ch];
      const kind = ch === "whatsapp" ? "WhatsApp" : "email";
      if (c.limit === 0) {
        return prepaid
          ? `${ch === "whatsapp" ? "WhatsApp isn't" : "Email isn't"} included on ${plan}, and there are no ${kind} credits left.`
          : `${ch === "whatsapp" ? "WhatsApp reminders aren't" : "Emails aren't"} included on ${plan}.`;
      }
      const owner = u.trial === "free_trial" ? "Your free trial's" : `${plan}'s`;
      const allowance = `${owner} ${(c.limit ?? 0).toLocaleString("en-IN")} ${channelName(ch, c.limit ?? 0)} for ${u.period_label}`;
      return prepaid ? `${allowance} and your bought ${kind} credits are used up.` : `${allowance} are used up.`;
    })
    .join(" ");
}

function limitsOf(limits: Record<string, number | null>): string {
  const part = (key: string, ch: Channel) => {
    const v = limits[key];
    if (v === undefined) return null;
    return v === null ? `unlimited ${channelName(ch)}` : `${v.toLocaleString("en-IN")} ${channelName(ch, v)}`;
  };
  return [part("emails_per_month", "email"), part("whatsapp_per_month", "whatsapp")].filter(Boolean).join(" and ") + " a month";
}

function ChannelRow({ u, channel }: { u: MessageUsage; channel: Channel }) {
  const c = u.channels[channel];
  const Icon = channel === "email" ? MailIcon : MessageCircleIcon;
  const note = extraLine(u, channel);
  const promo = channel === "whatsapp" ? promotionalLine(c) : null;
  const left = remainingLines(u, channel);
  const planUsed = c.plan_used ?? c.used;
  return (
    <div className="flex flex-col gap-1.5" data-channel={channel}>
      <div className="flex items-baseline justify-between gap-3 text-[13px]">
        <span className="text-ink flex items-center gap-1.5 font-medium">
          <Icon className="text-ink-3 size-3.5" aria-hidden="true" /> {CHANNEL_TITLE[channel]}
        </span>
        <span className="text-ink-2 shrink-0 tabular-nums">{usedLine(c)}</span>
      </div>
      {c.limit !== null && c.limit > 0 ? (
        <ProgressBar
          value={Math.min(planUsed, c.limit)}
          max={c.limit}
          tone={barTone(c.state)}
          height={6}
          label={`${CHANNEL_TITLE[channel]}: ${planUsed} of ${c.limit} this month`}
        />
      ) : null}
      {left ? (
        <dl className="m-0 grid grid-cols-3 gap-2 text-[12px]" aria-label={`${CHANNEL_TITLE[channel]} left`}>
          <div className="flex flex-col">
            <dt className="text-ink-3">Plan</dt>
            <dd className="text-ink m-0 tabular-nums">{left.plan}</dd>
          </div>
          <div className="flex flex-col">
            <dt className="text-ink-3">Bought</dt>
            <dd className="text-ink m-0 tabular-nums">{left.bought}</dd>
          </div>
          <div className="flex flex-col">
            <dt className="text-ink-3">Total</dt>
            <dd className="text-ink m-0 font-medium tabular-nums">{left.total}</dd>
          </div>
        </dl>
      ) : null}
      {note ? <p className={cn("m-0 text-[12px] leading-[1.45]", c.state === "blocked" ? "text-refuse" : "text-ink-3")}>{note}</p> : null}
      {promo ? <p className="text-ink-3 m-0 text-[12px] leading-[1.45]">{promo}</p> : null}
    </div>
  );
}

function History({ items, loading }: { items: Statement[]; loading: boolean }) {
  if (loading) return <Skeleton className="h-12 w-full" />;
  if (!items.length) return null;
  return (
    <div className="border-line-soft flex flex-col gap-1 border-t pt-3">
      <span className="eyebrow">Earlier months</span>
      <ul className="m-0 flex list-none flex-col p-0" aria-label="Earlier months">
        {items.map((s) => (
          <li key={s.id} className="border-line-soft flex flex-wrap items-baseline justify-between gap-2 border-b py-2 text-[12.5px] last:border-0">
            <span className="text-ink font-medium">{s.period_label}</span>
            <span className="text-ink-2 tabular-nums">{historyLine(s)}</span>
            <span className="text-ink-3">
              {s.status === "charged" && s.amount_paise > 0 ? `${paiseText(s.amount_paise)} · ` : ""}
              {STATEMENT_LABEL[s.status] ?? s.status}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
