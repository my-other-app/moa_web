"use client";

import * as React from "react";
import { MailIcon, MessageCircleIcon } from "lucide-react";
import { SectionTitle, formatDate } from "@moa/app-kit";
import { Card, CardContent, ProgressBar, Skeleton, StatusBadge } from "@moa/ui";

import { useCan } from "@/hooks/use-can";

import { useClearOwnLimits, useClubMessages, useSetOwnLimits } from "../queries";
import {
  BILLING_LABEL,
  CHANNELS,
  STATEMENT_LABEL,
  STATEMENT_TONE,
  ownLimitsProblems,
  paiseText,
  toOwnLimitsForm,
  usedOf,
  type ChannelUsage,
  type ClubMessages,
  type OwnLimitsForm,
} from "../schemas";

const TITLE = { email: "Emails", whatsapp: "WhatsApp" } as const;

/**
 * A club's messages, on its page: this month against its plan's allowance
 * (or its own, on Enterprise), then its bought credits; the closed months;
 * and -- for an Enterprise club -- its own limits, which `manage_money` sets.
 *
 * Prepaid credits retired per-message overage billing: nothing past the
 * allowance is charged. A month from before shows what became of its extra
 * ("Not charged (overage retired)" when it was cancelled). The credits
 * themselves -- lots, purchases, grants and refunds -- are the Credits panel.
 */
export function ClubMessagesPanel({ clubId }: { clubId: number }) {
  const canMoney = useCan("manage_money");
  const q = useClubMessages(clubId);
  const data = q.data;

  // A backend from before message quotas: nothing to show, so no section at all.
  if (data === null) return null;

  return (
    <section className="space-y-3" aria-label="Messages">
      <SectionTitle>Messages</SectionTitle>
      <Card>
        <CardContent className="flex flex-col gap-4">
          {q.isPending ? (
            <Skeleton className="h-24 w-full" />
          ) : q.isError || !data ? (
            <p className="text-muted-foreground text-sm">Could not load the club&apos;s messages.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-[15px] font-semibold">{data.usage.period_label}</span>
                <span className="text-muted-foreground text-xs">
                  {data.usage.plan_name ?? "Free"}
                  {data.usage.custom ? " · its own limits" : ""} · {BILLING_LABEL[data.usage.billing] ?? data.usage.billing}
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {CHANNELS.map((ch) => (
                  <ChannelLine key={ch} title={TITLE[ch]} icon={ch} c={data.usage.channels[ch]} billing={data.usage.billing} />
                ))}
              </div>
              <History data={data} />

              {data.usage.plan_key === "enterprise" || data.own_limits ? (
                // Keyed by what is saved: a save (or a clear) starts the form again from it.
                <OwnLimits key={JSON.stringify(data.own_limits ?? null)} clubId={clubId} data={data} canEdit={canMoney} />
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

/** "1,240 / 5,000" against the plan's allowance; then, on a prepaid server, what bought credits did. */
export function channelNote(c: ChannelUsage, billing: string): string {
  const n = (v: number | null | undefined) => (v ?? 0).toLocaleString("en-IN");
  const held = c.blocked > 0 ? ` · ${n(c.blocked)} held back` : "";
  if (billing === "prepaid") {
    const parts = [
      c.limit === null ? "No limit on the plan" : `Plan: ${n(c.plan_remaining)} left`,
      `bought: ${n(c.credits_remaining)} left${c.credits_used ? ` (${n(c.credits_used)} used this month)` : ""}`,
    ];
    if (c.over) parts.push(`${n(c.over)} essential past everything, not charged`);
    return parts.join(" · ") + held;
  }
  return (c.extra > 0 ? `${n(c.extra)} past the allowance` : "Within the allowance") + held;
}

function ChannelLine({ title, icon, c, billing }: { title: string; icon: "email" | "whatsapp"; c: ChannelUsage; billing: string }) {
  const Icon = icon === "email" ? MailIcon : MessageCircleIcon;
  const tone = c.state === "blocked" ? "refuse" : c.state === "over" || c.state === "near" || c.state === "credits" ? "caution" : "accent";
  const planUsed = c.plan_used ?? c.used;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="flex items-center gap-1.5 font-medium">
          <Icon className="text-muted-foreground size-3.5" aria-hidden="true" /> {title}
        </span>
        <span className="tabular-nums">{usedOf({ used: planUsed, limit: c.limit })}</span>
      </div>
      {c.limit !== null && c.limit > 0 ? <ProgressBar value={Math.min(planUsed, c.limit)} max={c.limit} tone={tone} height={6} label={`${title}: ${planUsed} of ${c.limit}`} /> : null}
      <span className="text-muted-foreground text-xs">{channelNote(c, billing)}</span>
    </div>
  );
}

function History({ data }: { data: ClubMessages }) {
  if (!data.history.length) return <p className="text-muted-foreground text-xs">No closed months yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[13px]" aria-label="Closed months">
        <thead className="text-muted-foreground text-xs">
          <tr>
            <th className="py-1.5 pr-3 font-medium">Month</th>
            <th className="py-1.5 pr-3 font-medium">Emails</th>
            <th className="py-1.5 pr-3 font-medium">WhatsApp</th>
            <th className="py-1.5 pr-3 font-medium">Charged</th>
            <th className="py-1.5 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {data.history.map((s) => (
            <tr key={s.id} className="border-t">
              <td className="py-1.5 pr-3 whitespace-nowrap">{s.period_label}</td>
              <td className="py-1.5 pr-3 tabular-nums">{usedOf(s.email)}</td>
              <td className="py-1.5 pr-3 tabular-nums">{usedOf(s.whatsapp)}</td>
              <td className="py-1.5 pr-3 tabular-nums">{s.amount_paise ? paiseText(s.amount_paise) : "—"}</td>
              <td className="py-1.5">
                <span className="flex flex-wrap items-center gap-1.5">
                  <StatusBadge label={STATEMENT_LABEL[s.status] ?? s.status} tone={STATEMENT_TONE[s.status] ?? "default"} />
                  {s.charged_at ? <span className="text-muted-foreground text-xs">{formatDate(s.charged_at)}</span> : null}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OwnLimits({ clubId, data, canEdit }: { clubId: number; data: ClubMessages; canEdit: boolean }) {
  const save = useSetOwnLimits(clubId);
  const clear = useClearOwnLimits(clubId);
  const [form, setForm] = React.useState<OwnLimitsForm>(() => toOwnLimitsForm(data.own_limits));
  const problems = ownLimitsProblems(form);
  const bad = Object.keys(problems).length > 0;
  const set = (key: keyof OwnLimitsForm) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const field = (key: keyof OwnLimitsForm, label: string, placeholder: string) => (
    <div className="field">
      <label htmlFor={`own-${key}`}>{label}</label>
      <input id={`own-${key}`} className="input" inputMode="numeric" value={form[key]} placeholder={placeholder} disabled={!canEdit} onChange={set(key)} aria-invalid={Boolean(problems[key])} />
      {problems[key] ? <span className="text-refuse text-xs">{problems[key]}</span> : null}
    </div>
  );

  return (
    <div className="flex flex-col gap-2.5 border-t pt-3" role="group" aria-label="Own message limits">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium">Own limits (Enterprise)</span>
        <span className="text-muted-foreground text-xs">
          {data.own_limits ? (data.own_limits_apply ? "In use" : "Saved; used once the club is on Enterprise") : "Unlimited until set"}
        </span>
      </div>
      <div className="grid gap-2.5 sm:grid-cols-2">
        {field("emails", "Emails a month", "No limit")}
        {field("whatsapp", "WhatsApp a month", "No limit")}
        <div className="field sm:col-span-2">
          <label htmlFor="own-note">Note</label>
          <input id="own-note" className="input" value={form.note} disabled={!canEdit} onChange={set("note")} placeholder="What was agreed" />
          {problems.note ? <span className="text-refuse text-xs">{problems.note}</span> : null}
        </div>
      </div>
      {canEdit ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-primary btn-sm" disabled={bad || save.isPending} onClick={() => save.mutate(form)}>
            Save limits
          </button>
          {data.own_limits ? (
            <button type="button" className="btn btn-ghost btn-sm" disabled={clear.isPending} onClick={() => clear.mutate()}>
              Back to the plan&apos;s
            </button>
          ) : null}
        </div>
      ) : (
        <span className="text-muted-foreground text-xs">Only admins who manage money can change these.</span>
      )}
    </div>
  );
}
