"use client";

import * as React from "react";
import { toast } from "@moa/ui";

import type { Notified } from "./schemas";

/**
 * "Notify the room": starting the quiz or launching a poll can push a nudge
 * to every checked-in phone. The host's last choice is kept per event on this
 * device, and the server's answer is read back into the action's own toast.
 */
export type NotifyWhat = "quiz" | "poll";

/** A quiz is the moment to bring the room in; a poll mid-talk usually is not. */
export const NOTIFY_DEFAULT: Record<NotifyWhat, boolean> = { quiz: true, poll: false };

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

/**
 * What to tell the host about the push. Nothing when they did not ask for
 * one, when the server has it switched off, or when the server says nothing
 * at all (one that predates notifying the room).
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

/** The action's toast, unchanged, with the push's outcome as its second line. */
export function announce(title: string, notified: Notified | null | undefined) {
  const note = notifiedNote(notified);
  if (!note) return void toast.success(title);
  // Rate-limited is the one a host must not miss: it stays up longer, in amber.
  if (note.tone === "warning") return void toast.warning(title, { description: note.text, duration: 8_000 });
  toast.success(title, { description: note.text });
}
