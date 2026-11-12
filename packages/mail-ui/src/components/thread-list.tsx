"use client";

import * as React from "react";
import { PaperclipIcon } from "lucide-react";
import { formatTime, relativeTime } from "@moa/app-kit";
import { cn } from "@moa/ui";

import { FOLDERS, FOLDER_LABEL, initialsOf, type Folder, type MailSummary, type MailThread } from "../schemas";

/** One conversation in a folder's list: who, when, the subject, a line of it, what is unread. `tag` names its mailbox where several are listed. */
export function ThreadRow({
  t,
  active,
  onPick,
  now,
  folder,
  tag,
}: {
  t: MailThread;
  active: boolean;
  onPick: () => void;
  now: Date;
  folder: Folder;
  tag?: React.ReactNode;
}) {
  const at = folder === "sent" ? (t.last_outbound_at ?? t.last_message_at) : t.last_message_at;
  const who = folder === "sent" ? (t.participants.length ? `To ${t.participants.slice(0, 2).join(", ")}${t.participants.length > 2 ? ` +${t.participants.length - 2}` : ""}` : "To —") : t.last_from || "Someone";
  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        aria-current={active || undefined}
        className={cn("border-line-soft hover:bg-sunken flex w-full items-start gap-2.5 border-b px-3 py-2.5 text-left transition-colors", active && "bg-sunken")}
      >
        <span aria-hidden="true" className="bg-brand-soft text-brand mt-0.5 grid size-8 shrink-0 place-items-center rounded-full font-mono text-[11px] font-semibold">
          {initialsOf(t.last_from || t.participants[0] || "?")}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className={cn("text-ink min-w-0 flex-1 truncate text-[13.5px]", t.unread_count > 0 ? "font-semibold" : "font-medium")}>{who}</span>
            {at ? (
              <time className="text-ink-3 shrink-0 text-[11px]" dateTime={at}>
                {now.getTime() - new Date(at).getTime() < 86_400_000 ? formatTime(at) : relativeTime(at, now)}
              </time>
            ) : null}
          </span>
          <span className="flex items-center gap-1.5">
            <span className={cn("min-w-0 flex-1 truncate text-[12.5px]", t.unread_count > 0 ? "text-ink font-medium" : "text-ink-2")}>{t.subject || "(no subject)"}</span>
            {t.has_attachments ? <PaperclipIcon className="text-ink-3 size-3 shrink-0" aria-label="Has files" /> : null}
            {t.unread_count > 0 ? (
              <span className="bg-brand text-brand-foreground shrink-0 rounded-full px-1.5 font-mono text-[10.5px] font-semibold tabular-nums">
                {t.unread_count}
                <span className="sr-only"> unread</span>
              </span>
            ) : null}
          </span>
          <span className="flex items-center gap-1.5">
            {tag ? <span className="bg-sunken text-ink-2 shrink-0 rounded-md px-1.5 font-mono text-[10.5px]">{tag}</span> : null}
            <span className="text-ink-3 block min-w-0 flex-1 truncate text-[12px]">{t.snippet}</span>
          </span>
        </span>
      </button>
    </li>
  );
}

/** What each folder shows unread, from a list's counts. */
export function folderUnread(counts: MailSummary | undefined, f: Folder): number {
  return (f === "inbox" ? counts?.unread_total : f === "spam" ? counts?.spam_unread : f === "archive" ? counts?.archive_unread : 0) ?? 0;
}

/** The folders, each with what is unread in it; a row on a phone, a column from lg. */
export function FolderNav({ folder, counts, onPick, className }: { folder: Folder; counts: MailSummary | undefined; onPick: (f: Folder) => void; className?: string }) {
  return (
    <nav aria-label="Folders" className={cn("border-line-soft flex gap-1 overflow-x-auto border-b p-2 lg:flex-col lg:border-r lg:border-b-0", className)}>
      {FOLDERS.map((f) => {
        const n = folderUnread(counts, f);
        return (
          <button
            key={f}
            type="button"
            aria-current={folder === f || undefined}
            onClick={() => onPick(f)}
            className={cn("flex shrink-0 items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px]", folder === f ? "bg-brand-soft text-brand font-semibold" : "text-ink-2 hover:bg-sunken")}
          >
            {FOLDER_LABEL[f]}
            {n ? (
              <span className="font-mono text-[11px] tabular-nums">
                {n}
                <span className="sr-only"> unread</span>
              </span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}

/** A value that settles a moment after the typing stops. */
export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
