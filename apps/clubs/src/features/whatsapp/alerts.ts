"use client";

import * as React from "react";

import { contactName, type Conversation } from "./schemas";

/**
 * What tells someone at the dashboard that a WhatsApp message came, besides
 * the server's bell and mails: the unread count in the tab's title ("(3)
 * Inbox"), and -- each browser opting in for itself -- the browser's own
 * notification (and, if they like, a short sound) while the inbox's tab is
 * hidden. Never a word of the message: who it is from, nothing more.
 *
 * The choice is kept in this browser alone (localStorage), read safely: a
 * private window or blocked storage just means "off".
 */

export const NOTIFY_KEY = "moa.whatsapp.notify";

export interface BrowserNotify {
  enabled: boolean;
  sound: boolean;
}

const OFF: BrowserNotify = { enabled: false, sound: false };

export function readNotify(): BrowserNotify {
  try {
    const raw = window.localStorage.getItem(NOTIFY_KEY);
    if (!raw) return OFF;
    const v = JSON.parse(raw) as Partial<BrowserNotify>;
    return { enabled: v.enabled === true, sound: v.sound === true };
  } catch {
    return OFF;
  }
}

const listeners = new Set<() => void>();

export function writeNotify(next: BrowserNotify): void {
  try {
    window.localStorage.setItem(NOTIFY_KEY, JSON.stringify(next));
  } catch {
    // Storage blocked: the choice lasts this page only.
  }
  cached = next;
  for (const l of listeners) l();
}

let cached: BrowserNotify | null = null;

function snapshot(): BrowserNotify {
  if (cached === null) cached = readNotify();
  return cached;
}

/** This browser's choice, and a way to change it. */
export function useBrowserNotify(): [BrowserNotify, (next: BrowserNotify) => void] {
  const value = React.useSyncExternalStore(
    (on) => {
      listeners.add(on);
      return () => listeners.delete(on);
    },
    snapshot,
    () => OFF,
  );
  return [value, writeNotify];
}

/** For tests: forget what was read. */
export function resetNotifyCache(): void {
  cached = null;
}

/** Whether this browser has notifications at all, and what it has said of them. */
export function notifyPermission(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || typeof window.Notification === "undefined") return "unsupported";
  return window.Notification.permission;
}

/** Ask the browser (a click must lead here). Granted, or why not. */
export async function askNotifyPermission(): Promise<NotificationPermission | "unsupported"> {
  if (notifyPermission() === "unsupported") return "unsupported";
  try {
    return await window.Notification.requestPermission();
  } catch {
    return window.Notification.permission;
  }
}

/** A short, soft two-note chime, made here: no sound file to fetch. */
export function chime(): void {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const notes = [880, 1320];
    notes.forEach((hz, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = hz;
      osc.type = "sine";
      const at = ctx.currentTime + i * 0.12;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.15, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.25);
      osc.connect(gain).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + 0.3);
    });
    setTimeout(() => void ctx.close().catch(() => {}), 800);
  } catch {
    // No sound is no harm.
  }
}

/** What the browser's notification says: who wrote, never what. */
export function notificationFor(c: Conversation, more: number): { title: string; body: string; tag: string } {
  return {
    title: contactName(c),
    body: more > 1 ? `${more} new WhatsApp messages` : "New WhatsApp message",
    tag: `moa-whatsapp-${c.id}`,
  };
}

/** Whether the tab is hidden (the only time a notification is shown). */
function hidden(): boolean {
  return typeof document !== "undefined" && document.visibilityState === "hidden";
}

/**
 * Watches the inbox's list as the stream (or the poll) brings it again:
 * while the tab is hidden and this browser opted in, each conversation whose
 * unread count went up -- with the last message theirs, not blocked -- is a
 * notification (and one chime per batch, if wanted). Clicking it brings the
 * tab to the front on that conversation (`onOpen`).
 */
export function useNewMessageNotifier(items: Conversation[], onOpen?: (conversationId: number) => void, make?: (title: string, options: NotificationOptions) => Notification | null) {
  const [prefs] = useBrowserNotify();
  const seen = React.useRef<Map<number, number> | null>(null);
  const open = React.useRef(onOpen);
  React.useEffect(() => {
    open.current = onOpen;
  }, [onOpen]);
  React.useEffect(() => {
    const before = seen.current;
    const now = new Map(items.map((c) => [c.id, c.unread_count] as const));
    seen.current = now;
    // The first read is what was already there: nothing new.
    if (before === null || !prefs.enabled || !hidden() || notifyPermission() !== "granted") return;
    let rang = false;
    for (const c of items) {
      const was = before.get(c.id) ?? 0;
      if (c.unread_count <= was || c.blocked || c.last_message?.direction !== "in") continue;
      const n = notificationFor(c, c.unread_count);
      try {
        const shown = make
          ? make(n.title, { body: n.body, tag: n.tag })
          : new window.Notification(n.title, { body: n.body, tag: n.tag });
        if (shown) {
          shown.onclick = () => {
            window.focus();
            open.current?.(c.id);
            shown.close();
          };
        }
      } catch {
        // A browser that refuses (a mobile one wants a service worker): the title still counts.
      }
      if (prefs.sound && !rang) {
        chime();
        rang = true;
      }
    }
  }, [items, prefs, make]);
}

const PREFIX = /^\(\d+\+?\)\s/;

/** The title with "(n) " in front when something is unread, and as it was otherwise. */
export function titled(title: string, count: number): string {
  const base = title.replace(PREFIX, "");
  if (count <= 0) return base;
  return `(${count > 99 ? "99+" : count}) ${base}`;
}

/**
 * Keeps the tab's title saying how many WhatsApp messages are unread, even as
 * pages set titles of their own (a MutationObserver puts the count back).
 */
export function useUnreadTitle(count: number) {
  React.useEffect(() => {
    if (typeof document === "undefined") return;
    const apply = () => {
      const next = titled(document.title, count);
      if (next !== document.title) document.title = next;
    };
    apply();
    const head = document.querySelector("head");
    if (!head || typeof MutationObserver === "undefined") return () => void (document.title = titled(document.title, 0));
    const watch = new MutationObserver(apply);
    watch.observe(head, { subtree: true, childList: true, characterData: true });
    return () => {
      watch.disconnect();
      document.title = titled(document.title, 0);
    };
  }, [count]);
}
