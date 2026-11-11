"use client";

import * as React from "react";
import type { AttentionItem } from "@moa/app-kit";

import { useClubAlerts, type ClubAlert } from "@/features/club-alerts";

import { useSocialAccounts, useSocialOnServer, useSocialRole } from "./queries";
import { EXPIRY_WARN_DAYS, PLATFORM_LABEL, SOCIAL_SETTINGS_PATH, daysLeft, type SocialAccount } from "./schemas";

/**
 * The dashboard's "Needs attention" items for social posting (spec:
 * "Overview"): an account that needs reconnecting, with the posts it holds;
 * access that ends within a week; and a post that failed (from the club's
 * alerts feed, `social_failed`), which leads to that event's Promote tab.
 */
export const SOCIAL_KINDS = { disconnected: "SOCIAL_DISCONNECTED", expiring: "SOCIAL_EXPIRING", failed: "SOCIAL_FAILED" } as const;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function eventOf(a: Pick<ClubAlert, "data" | "link">): number | null {
  const raw = a.data?.event_id;
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : Number.NaN;
  if (Number.isInteger(n) && n > 0) return n;
  const m = /^\/events\/(\d+)/.exec(a.link ?? "");
  return m ? Number(m[1]) : null;
}

export function socialAttention(accounts: SocialAccount[], alerts: ClubAlert[], manage: boolean, now: Date = new Date()): AttentionItem[] {
  const out: AttentionItem[] = [];
  for (const a of accounts) {
    const name = PLATFORM_LABEL[a.platform];
    if (a.status === "needs_reconnect") {
      out.push({
        kind: SOCIAL_KINDS.disconnected,
        tone: "red",
        title: `${name} disconnected${a.waiting_posts ? ` — ${plural(a.waiting_posts, "post", "posts")} waiting` : ""}`,
        body: manage ? "Reconnect it under Social accounts; its posts go out once it's back." : "Ask the club's owner or an admin to reconnect it; its posts wait until then.",
        event_id: null,
      });
      continue;
    }
    const left = a.status === "connected" ? daysLeft(a.expires_at, now) : null;
    if (left !== null && left > 0 && left <= EXPIRY_WARN_DAYS) {
      out.push({
        kind: SOCIAL_KINDS.expiring,
        tone: "amber",
        title: `${name} access ends in ${plural(left, "day", "days")}`,
        body: manage ? "Reconnect it under Social accounts before then, so posts keep going out." : "Ask the club's owner or an admin to reconnect it before then.",
        event_id: null,
      });
    }
  }
  for (const al of alerts) {
    if (al.kind !== "social_failed" || al.read) continue;
    out.push({
      kind: SOCIAL_KINDS.failed,
      tone: "red",
      title: al.title || "A post failed — share it manually",
      body: al.body || "Retry it, or copy its text and poster from the event's Promote tab and post it by hand.",
      event_id: eventOf(al),
    });
  }
  return out;
}

/** Where a social attention item leads; null for any other kind. */
export function socialAttentionHref(item: Pick<AttentionItem, "kind" | "event_id">): string | null {
  if (item.kind === SOCIAL_KINDS.disconnected || item.kind === SOCIAL_KINDS.expiring) return SOCIAL_SETTINGS_PATH;
  if (item.kind === SOCIAL_KINDS.failed) return item.event_id ? `/events/${item.event_id}/promote` : SOCIAL_SETTINGS_PATH;
  return null;
}

/** The items for the signed-in role: none for door staff, and none on an API without social posting. */
export function useSocialAttention(): AttentionItem[] {
  const role = useSocialRole();
  const on = useSocialOnServer(role.see) === true;
  const accounts = useSocialAccounts(on);
  const alerts = useClubAlerts();
  return React.useMemo(
    () => (on ? socialAttention(accounts.data ?? [], alerts.data?.items ?? [], role.manage) : []),
    [on, accounts.data, alerts.data, role.manage],
  );
}
