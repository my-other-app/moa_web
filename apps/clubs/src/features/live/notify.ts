"use client";

import * as React from "react";
import { toast } from "@moa/ui";

import { NOTIFY_GAP_SECONDS, NOTIFY_PER_DAY, type Notified } from "./schemas";

/**
 * "Notify the room": starting the quiz, launching a poll or opening Q&A (the
 * first question put up, or approval switched off) can push a nudge to every
 * checked-in phone. The host's last choice is kept per event on this device,
 * and the server's answer is read back into the action's own toast.
 */
export type NotifyWhat = "quiz" | "poll" | "qa";

/** All on unless the host says otherwise: each is a moment to bring the room in, and the server holds them to one every few minutes. */
export const NOTIFY_DEFAULT: Record<NotifyWhat, boolean> = { quiz: true, poll: true, qa: true };

export const NOTIFY_STORAGE = (eventId: number, what: NotifyWhat) => `moa.live.${eventId}.notify.${what}`;

const read = (key: string, fallback: boolean) => {
  try {
    const v = localStorage.getItem(key);
    return v === "1" ? true : v === "0" ? false : fallback;
  } catch {
    return fallback;
  }
};
const write = (key: string, on: boolean) => {
  try {
    localStorage.setItem(key, on ? "1" : "0");
  } catch {
    /* private mode: the switch still works for this visit */
  }
};

/** The switch's state for one event: the host's last choice, else the default. */
export function useNotifyChoice(eventId: number, what: NotifyWhat) {
  const key = NOTIFY_STORAGE(eventId, what);
  const [picked, setPicked] = React.useState<{ key: string; on: boolean } | null>(null);
  const on = picked?.key === key ? picked.on : read(key, NOTIFY_DEFAULT[what]);
  const set = (v: boolean) => {
    setPicked({ key, on: v });
    write(key, v);
  };
  return [on, set] as const;
}

// --- what is left of the room's attention -------------------------------------------------

/**
 * The server holds the room's pushes to one every three minutes and ten a
 * day per event, and a host who does not know that reads a skipped push as a
 * broken button. The console says the rule, and counts what it has seen go
 * out so it can also say when the next one is allowed.
 *
 * Counted here rather than asked for: the API reports a push's outcome only
 * in the reply to the action that caused it, so this is what this console
 * sent, not the event's whole ledger. Another console's push shows up the
 * moment the server refuses one here (`rate_limited` carries `last_sent_at`),
 * which is exactly when it matters.
 */
export interface NotifyBudget {
  /** Pushes this console has seen go out for this event today. */
  sentToday: number;
  /** Seconds until the server would allow the next one; 0 when it would allow one now. */
  waitSeconds: number;
  /** Today's ten are gone (as far as this console knows). */
  spent: boolean;
}

export const PUSH_STORAGE = (eventId: number) => `moa.live.${eventId}.pushes`;

const readPushes = (eventId: number): number[] => {
  try {
    const raw = JSON.parse(localStorage.getItem(PUSH_STORAGE(eventId)) ?? "[]");
    return Array.isArray(raw) ? raw.filter((n): n is number => typeof n === "number") : [];
  } catch {
    return [];
  }
};

/** Midnight in India, the day the server counts in (notify.py's day_start). */
const dayStart = (at: number) => {
  const india = new Date(at + 5.5 * 3_600_000);
  return Date.UTC(india.getUTCFullYear(), india.getUTCMonth(), india.getUTCDate()) - 5.5 * 3_600_000;
};

/** Reads the budget as it stands now. */
export function notifyBudget(eventId: number, now = Date.now()): NotifyBudget {
  const today = readPushes(eventId).filter((t) => t >= dayStart(now));
  const last = today.length ? Math.max(...today) : null;
  const waitSeconds = last === null ? 0 : Math.max(0, Math.ceil((last + NOTIFY_GAP_SECONDS * 1000 - now) / 1000));
  return { sentToday: today.length, waitSeconds, spent: today.length >= NOTIFY_PER_DAY };
}

/**
 * Records what became of a push. A push that went is one off the day's ten;
 * a refusal carries the time of the one that is holding it, which may be
 * another console's.
 */
export function recordPush(eventId: number, notified: Notified | null | undefined) {
  if (!notified) return;
  const went = notified.sent > 0 && !notified.skipped_reason;
  const held =
    notified.skipped_reason === "rate_limited"
      ? notified.last_sent_at
        ? Date.parse(notified.last_sent_at)
        : Date.now() - Math.max(0, NOTIFY_GAP_SECONDS - (notified.retry_after ?? 0)) * 1000
      : null;
  const at = went ? Date.now() : held;
  if (at === null || Number.isNaN(at)) return;
  try {
    const kept = [...readPushes(eventId), at].filter((t) => t >= dayStart(Date.now()));
    localStorage.setItem(PUSH_STORAGE(eventId), JSON.stringify(kept.slice(-NOTIFY_PER_DAY * 2)));
  } catch {
    /* private mode: the console simply shows the rule without a countdown */
  }
}

/** The budget, re-read every second so the countdown moves while the host watches it. */
export function useNotifyBudget(eventId: number): NotifyBudget {
  const [budget, setBudget] = React.useState<NotifyBudget>(() => ({ sentToday: 0, waitSeconds: 0, spent: false }));
  React.useEffect(() => {
    const tick = () => setBudget(notifyBudget(eventId));
    tick();
    const timer = setInterval(tick, 1_000);
    return () => clearInterval(timer);
  }, [eventId]);
  return budget;
}

/**
 * What to tell the host about the push. Nothing when they did not ask for
 * one, when the server has it switched off, when it went once already (Q&A
 * opening is told once per event), or when the server says nothing at all
 * (one that predates notifying the room).
 */
export function notifiedNote(notified: Notified | null | undefined): { tone: "success" | "warning"; text: string } | null {
  if (!notified) return null;
  switch (notified.skipped_reason) {
    case "rate_limited":
      return { tone: "warning", text: `Not notified — the room was notified recently; ${retryWait(notified.retry_after)}` };
    case "nobody_checked_in":
      return { tone: "success", text: "Nobody is checked in yet" };
    case "all_muted":
      return { tone: "success", text: "Not notified — everyone checked in has muted these notifications" };
    case "disabled":
    case "already_sent":
      return null;
    default:
      return { tone: "success", text: notified.sent ? `Sent to ${notified.sent}` : "Nobody to notify" };
  }
}

/** The wait in whole minutes, rounded up; a server that does not say gets the general wording. */
function retryWait(seconds: number | null | undefined) {
  if (seconds == null) return "try again in a few minutes";
  if (seconds < 60) return "you can notify again in less than a minute";
  return `you can notify again in ${Math.ceil(seconds / 60)} min`;
}

/**
 * The action's toast, unchanged, with the push's outcome as its second line.
 * With the event's id, the outcome also goes into the budget the console bar
 * counts down from.
 */
export function announce(title: string, notified: Notified | null | undefined, eventId?: number) {
  if (eventId !== undefined) recordPush(eventId, notified);
  const note = notifiedNote(notified);
  if (!note) return void toast.success(title);
  // Rate-limited is the one a host must not miss: it stays up longer, in amber.
  if (note.tone === "warning") return void toast.warning(title, { description: note.text, duration: 8_000 });
  toast.success(title, { description: note.text });
}
