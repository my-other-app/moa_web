"use client";

import * as React from "react";

import { chime, notifyPermission } from "@/features/whatsapp/alerts";

import type { MailThread } from "./schemas";

/**
 * What tells someone at the dashboard that mail came, besides the server's
 * bell: the unread count in the tab's title (with WhatsApp's, see
 * SidebarNav), and -- each browser opting in for itself, on Mail settings --
 * the browser's own notification while the tab is hidden. Never a word of
 * the mail: who it is from and how many, nothing more (the WhatsApp inbox's
 * rule). The choice is kept in this browser alone, read safely: blocked
 * storage just means "off".
 */

export const MAIL_NOTIFY_KEY = "moa.mail.notify";

export interface MailNotify {
  enabled: boolean;
  sound: boolean;
}

const OFF: MailNotify = { enabled: false, sound: false };

export function readMailNotify(): MailNotify {
  try {
    const raw = window.localStorage.getItem(MAIL_NOTIFY_KEY);
    if (!raw) return OFF;
    const v = JSON.parse(raw) as Partial<MailNotify>;
    return { enabled: v.enabled === true, sound: v.sound === true };
  } catch {
    return OFF;
  }
}

const listeners = new Set<() => void>();
let cached: MailNotify | null = null;

export function writeMailNotify(next: MailNotify): void {
  try {
    window.localStorage.setItem(MAIL_NOTIFY_KEY, JSON.stringify(next));
  } catch {
    // Storage blocked: the choice lasts this page only.
  }
  cached = next;
  for (const l of listeners) l();
}

function snapshot(): MailNotify {
  if (cached === null) cached = readMailNotify();
  return cached;
}

/** For tests: forget what was read. */
export function resetMailNotifyCache(): void {
  cached = null;
}

export function useMailNotify(): [MailNotify, (next: MailNotify) => void] {
  const value = React.useSyncExternalStore(
    (on) => {
      listeners.add(on);
      return () => listeners.delete(on);
    },
    snapshot,
    () => OFF,
  );
  return [value, writeMailNotify];
}

/** What the browser's notification says: who wrote, never what. */
export function mailNotificationFor(t: MailThread, count: number): { title: string; body: string; tag: string } {
  return {
    title: t.last_from || "New email",
    body: count > 1 ? `${count} new emails` : "New email",
    tag: `moa-mail-${t.id}`,
  };
}

function hidden(): boolean {
  return typeof document !== "undefined" && document.visibilityState === "hidden";
}

/**
 * Watches the Inbox's threads as the stream (or the poll) brings them
 * again: while the tab is hidden and this browser opted in, each thread
 * whose unread count went up is a notification (and one chime per batch, if
 * wanted). Clicking it brings the tab back on that thread.
 */
export function useNewMailNotifier(
  items: MailThread[],
  onOpen?: (threadId: number) => void,
  make?: (title: string, options: NotificationOptions) => Notification | null,
) {
  const [prefs] = useMailNotify();
  const seen = React.useRef<Map<number, number> | null>(null);
  const open = React.useRef(onOpen);
  React.useEffect(() => {
    open.current = onOpen;
  }, [onOpen]);
  React.useEffect(() => {
    const before = seen.current;
    seen.current = new Map(items.map((t) => [t.id, t.unread_count] as const));
    if (before === null || !prefs.enabled || !hidden() || notifyPermission() !== "granted") return;
    let rang = false;
    for (const t of items) {
      if (t.folder !== "inbox" || t.unread_count <= (before.get(t.id) ?? 0)) continue;
      const n = mailNotificationFor(t, t.unread_count);
      try {
        const shown = make ? make(n.title, { body: n.body, tag: n.tag }) : new window.Notification(n.title, { body: n.body, tag: n.tag });
        if (shown) {
          shown.onclick = () => {
            window.focus();
            open.current?.(t.id);
            shown.close();
          };
        }
      } catch {
        // A browser that refuses: the title still counts.
      }
      if (prefs.sound && !rang) {
        chime();
        rang = true;
      }
    }
  }, [items, prefs, make]);
}
