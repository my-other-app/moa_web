"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { formatDate } from "@moa/app-kit";
import { Notice } from "@moa/ui";

import { useEntitlements } from "../queries";
import { daysWord, mailto, trialView, type Entitlements } from "../schemas";

/**
 * The trial, above every page of the dashboard:
 *
 * - the free trial: "Pro trial · 12 days left · Choose a plan", louder in its
 *   last three days; with a plan picked, when that plan starts;
 * - an Enterprise trial the team granted, with its end date;
 * - once the free trial is over and the club is on Free: what Free limits.
 *
 * Read from the entitlements every page already shares, so it costs no
 * request of its own. Nothing while they load or fail.
 */
export function TrialBanner() {
  const ent = useEntitlements().data;
  const onBilling = usePathname()?.startsWith("/billing") ?? false;
  const view = trialView(ent);
  if (!view || !ent) return null;

  const choose = onBilling ? null : (
    <Link className={view.kind !== "ended" && view.urgent ? "btn btn-primary btn-sm" : "btn btn-secondary btn-sm"} href="/billing">
      {view.kind === "ended" ? "See plans" : view.kind === "free_trial" && view.chosen ? "Billing" : "Choose a plan"}
    </Link>
  );

  if (view.kind === "ended") {
    return (
      <Notice tone="neutral" tag="Free plan" action={choose} className="mb-4">
        <strong className="text-ink font-semibold">You&apos;re on Free.</strong> Your trial has ended; your published events, tickets and data keep working.{" "}
        {freeLimits(ent)}
      </Notice>
    );
  }

  const ends = formatDate(view.endsAt);
  const headline = `${view.planName} trial · ${daysWord(view.daysLeft)} left`;

  if (view.kind === "enterprise_trial") {
    return (
      <Notice
        tone={view.urgent ? "caution" : "accent"}
        tag="Enterprise trial"
        className="mb-4"
        action={
          <a className="btn btn-secondary btn-sm" href={mailto("Staying on Enterprise", "We'd like to keep Enterprise after our trial.")}>
            Talk to us
          </a>
        }
      >
        <strong className="font-semibold">{headline}</strong> · ends {ends}. Then the club is back on the plan it had.
      </Notice>
    );
  }

  if (view.chosen) {
    return (
      <Notice tone="accent" tag="Trial" action={choose} className="mb-4">
        <strong className="font-semibold">{headline}</strong> · {view.chosen.plan_name} starts on {formatDate(view.chosen.billing_starts_at)}, when billing begins.
      </Notice>
    );
  }

  return (
    <Notice tone={view.urgent ? "caution" : "accent"} tag="Trial" action={choose} className="mb-4">
      <strong className="font-semibold">{headline}</strong> · Choose a plan
      {view.urgent
        ? ` before ${ends} to keep everything ${view.planName} includes. After that the club moves to Free; nothing is charged until the trial ends.`
        : ` any time: billing starts only when the trial ends on ${ends}.`}
    </Notice>
  );
}

/** Feature flags the Free plan most often lacks, as a sentence names them. */
const LOCKED_ON_FREE: ReadonlyArray<[string, string]> = [
  ["tickets", "paid tickets"],
  ["website", "a club website"],
  ["quiz", "the live room"],
  ["networking", "networking"],
  ["merch", "merchandise"],
];

/** "Free covers 2 events and 300 registrations a month and 2 team seats; paid tickets and a club website need a plan." */
export function freeLimits(ent: Pick<Entitlements, "limits" | "features">): string {
  const parts: string[] = [];
  const events = ent.limits.events_per_month;
  const regs = ent.limits.registrations_per_month;
  const seats = ent.limits.committee_seats;
  const month = [
    typeof events === "number" ? `${events} event${events === 1 ? "" : "s"}` : null,
    typeof regs === "number" ? `${regs.toLocaleString("en-IN")} registrations` : null,
  ].filter(Boolean);
  if (month.length) parts.push(`${month.join(" and ")} a month`);
  if (typeof seats === "number") parts.push(`${seats} team seat${seats === 1 ? "" : "s"}`);
  const locked = LOCKED_ON_FREE.filter(([key]) => ent.features[key] === false).map(([, words]) => words);
  const covers = parts.length ? `Free covers ${parts.join(" and ")}` : "Free has smaller limits";
  return locked.length ? `${covers}; ${listWords(locked)} need a plan.` : `${covers}.`;
}

function listWords(words: string[]): string {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}
