"use client";

import * as React from "react";
import Link from "next/link";
import { AlertCircleIcon, ArrowLeftIcon, CheckCheckIcon, CheckIcon, ClockIcon, FileIcon, Loader2Icon, MapPinIcon } from "lucide-react";
import { formatDate, formatDateTime, formatTime } from "@moa/app-kit";
import { EmptyState, Skeleton, cn } from "@moa/ui";

import { fetchMessages, mediaHref } from "../api";
import { useMarkRead, useMessages, useSetConversationStatus } from "../queries";
import { contactName, handle, type Conversation, type Message, type MessageStatus } from "../schemas";
import { Composer } from "./composer";

/** The ticks WhatsApp shows: a clock while sending, one grey tick, two, two blue; a mark when it failed. */
export function StatusTicks({ status, title }: { status: MessageStatus | string | null | undefined; title?: string | null }) {
  const label =
    status === "pending" ? "Sending" : status === "sent" ? "Sent" : status === "delivered" ? "Delivered" : status === "read" ? "Read" : status === "failed" ? "Failed" : null;
  if (!label) return null;
  const Icon = status === "pending" ? ClockIcon : status === "sent" ? CheckIcon : status === "failed" ? AlertCircleIcon : CheckCheckIcon;
  return (
    <span
      role="img"
      aria-label={title ? `${label}: ${title}` : label}
      title={title ? `${label}: ${title}` : label}
      className={cn("inline-flex shrink-0", status === "read" ? "text-info" : status === "failed" ? "text-refuse" : "text-ink-3")}
    >
      <Icon className="size-3.5" />
    </span>
  );
}

/** An image through the authenticated proxy: fetched with the session, shown from memory. */
function ImageAttachment({ href, alt }: { href: string; alt: string }) {
  const [src, setSrc] = React.useState<string | null>(null);
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    fetch(href, { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        url = URL.createObjectURL(await r.blob());
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [href]);
  if (failed) return <span className="text-ink-3 text-[12px]">The picture isn&apos;t available any more (WhatsApp keeps them 30 days).</span>;
  if (!src) return <Skeleton className="h-40 w-56 rounded-lg" />;
  // eslint-disable-next-line @next/next/no-img-element -- a blob from the session, not an optimisable URL
  return <img src={src} alt={alt} className="max-h-72 max-w-full rounded-lg object-contain" />;
}

function Attachment({ m }: { m: Message }) {
  if (!m.media) return null;
  const href = mediaHref(m.media.url);
  if (m.type === "image" || m.type === "sticker") return <ImageAttachment href={href} alt={m.body ?? "A picture they sent"} />;
  if (m.type === "audio") return <audio controls src={href} className="max-w-full" aria-label="Voice message" />;
  if (m.type === "video") return <video controls src={href} className="max-h-72 max-w-full rounded-lg" aria-label="Video" />;
  return (
    <a href={href} download={m.media.filename ?? undefined} className="bg-surface/60 text-ink inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[12.5px]">
      <FileIcon className="size-4" /> {m.media.filename ?? "Download the document"}
    </a>
  );
}

function mapsLink(m: Message): string | null {
  const l = m.location;
  if (!l || l.latitude == null || l.longitude == null) return null;
  return `https://www.google.com/maps?q=${l.latitude},${l.longitude}`;
}

export function Bubble({ m }: { m: Message }) {
  const out = m.direction === "out";
  const time = m.wa_timestamp ?? m.created_at;
  if (m.type === "reaction") {
    return (
      <div className={cn("flex", out ? "justify-end" : "justify-start")}>
        <span className="text-ink-3 text-[12px]" aria-label={`Reacted ${m.body ?? ""}`}>
          Reacted {m.body || "👍"}
        </span>
      </div>
    );
  }
  const link = m.type === "location" ? mapsLink(m) : null;
  return (
    <div className={cn("flex", out ? "justify-end" : "justify-start")} data-direction={m.direction} data-status={m.status}>
      <div
        className={cn(
          "flex max-w-[78%] flex-col gap-1 rounded-2xl px-3 py-2 text-[13.5px] leading-[1.45]",
          out ? "bg-brand-soft text-ink rounded-br-md" : "bg-sunken text-ink rounded-bl-md",
          m.status === "failed" && "ring-refuse ring-1",
        )}
      >
        {m.template ? <span className="text-ink-3 font-mono text-[10.5px] tracking-[0.04em] uppercase">Template · {m.template.name}</span> : null}
        <Attachment m={m} />
        {link ? (
          <a href={link} target="_blank" rel="noreferrer" className="text-brand inline-flex items-center gap-1 font-medium">
            <MapPinIcon className="size-3.5" /> {m.location?.name || m.location?.address || "Shared a location"}
          </a>
        ) : m.body ? (
          <p className="m-0 break-words whitespace-pre-wrap">{m.body}</p>
        ) : m.template ? (
          <p className="text-ink-3 m-0 italic">Template {m.template.name}</p>
        ) : !m.media ? (
          <p className="text-ink-3 m-0 italic">{m.type === "unsupported" ? "A message WhatsApp can't show here" : `A ${m.type} message`}</p>
        ) : null}
        <div className="text-ink-3 flex items-center justify-end gap-1.5 text-[11px]">
          {out && m.sent_by ? <span>{m.via === "delivery" ? "Sent automatically" : m.sent_by}</span> : null}
          <time dateTime={time} title={formatDateTime(time)}>
            {formatTime(time)}
          </time>
          {out ? <StatusTicks status={m.status} title={m.error?.title} /> : null}
        </div>
        {m.status === "failed" ? (
          <p className="text-refuse m-0 text-[12px]" role="alert">
            Not delivered{m.error?.title ? `: ${m.error.title}` : ""}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function dayOf(iso: string): string {
  return iso ? formatDate(iso) : "";
}

/**
 * One conversation: who it is (and which of the club's events they
 * registered for), the messages oldest first with "Load older" above, the
 * window, and the reply box. Opening it marks it read.
 */
export function Thread({ conversationId, poll, onBack }: { conversationId: number; poll: number | false; onBack?: () => void }) {
  const q = useMessages(conversationId, poll);
  const markRead = useMarkRead();
  const status = useSetConversationStatus();
  const [older, setOlder] = React.useState<Message[]>([]);
  const [more, setMore] = React.useState<boolean | null>(null);
  const [loadingOlder, setLoadingOlder] = React.useState(false);
  const read = React.useRef<number | null>(null);
  const conv: Conversation | undefined = q.data?.conversation;
  const unread = conv?.unread_count ?? 0;

  // The log keeps the newest message in view: on opening, and as messages
  // arrive while the reader is at the bottom. Someone scrolled up to read
  // older ones is left where they are.
  const log = React.useRef<HTMLDivElement>(null);
  const atBottom = React.useRef(true);
  const onScroll = () => {
    const el = log.current;
    if (el) atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };
  const latestItems = q.data?.items;
  const newest = latestItems?.length ? latestItems[latestItems.length - 1]!.id : null;
  React.useLayoutEffect(() => {
    const el = log.current;
    if (el && newest !== null && atBottom.current) el.scrollTop = el.scrollHeight;
  }, [newest]);
  // Older messages go in above: the one being read stays where it was on screen.
  const fromBottom = React.useRef<number | null>(null);
  const keepPlace = () => {
    const el = log.current;
    fromBottom.current = el ? el.scrollHeight - el.scrollTop : null;
  };
  const oldest = older[0]?.id ?? null;
  React.useLayoutEffect(() => {
    const el = log.current;
    if (el && fromBottom.current !== null) el.scrollTop = el.scrollHeight - fromBottom.current;
    fromBottom.current = null;
  }, [oldest]);

  React.useEffect(() => {
    if (unread > 0 && read.current !== conversationId) {
      read.current = conversationId;
      markRead.mutate(conversationId);
    }
  }, [conversationId, unread, markRead]);

  if (q.isError) return <EmptyState tone="muted" title="Could not load this conversation" description="Try again in a moment." />;
  if (!q.data || !conv) {
    return (
      <div className="flex flex-col gap-2 p-4">
        <Skeleton className="h-12 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
      </div>
    );
  }

  const latest = q.data.items;
  const seen = new Set(latest.map((m) => m.id));
  const items = [...older.filter((m) => !seen.has(m.id)), ...latest];
  const hasMore = more ?? q.data.has_more;

  const loadOlder = async () => {
    const first = items[0];
    if (!first) return;
    setLoadingOlder(true);
    keepPlace();
    try {
      const page = await fetchMessages(conversationId, { before: first.id });
      setOlder((o) => [...page.items, ...o]);
      setMore(page.has_more);
    } finally {
      setLoadingOlder(false);
    }
  };

  const name = contactName(conv);
  const at = handle(conv);
  // Their number, @username and WhatsApp name, as far as they share them; never a blank number.
  const about = [conv.phone.trim(), at && at !== name ? at : "", conv.profile_name && conv.profile_name !== name ? `on WhatsApp as ${conv.profile_name}` : ""]
    .filter(Boolean)
    .join(" · ");
  let lastDay = "";
  return (
    <div className="flex min-h-0 flex-1 flex-col" aria-label={`Conversation with ${name}`}>
      <div className="border-line-soft flex shrink-0 flex-wrap items-start gap-2 border-b p-3">
        {onBack ? (
          <button type="button" className="btn btn-ghost btn-sm lg:hidden" onClick={onBack} aria-label="Back to conversations">
            <ArrowLeftIcon className="size-4" />
          </button>
        ) : null}
        <div className="min-w-0 flex-1">
          <h3 className="text-ink m-0 truncate text-[15px] font-semibold">{name}</h3>
          {about ? <p className="text-ink-3 m-0 truncate text-[12px]">{about}</p> : null}
          {conv.contact.events.length ? (
            <ul className="m-0 mt-1 flex list-none flex-wrap gap-1 p-0" aria-label="Registered for">
              {conv.contact.events.map((e) => (
                <li key={e.id}>
                  <Link href={`/events/${e.id}`} className="tag">
                    {e.name ?? `Event ${e.id}`}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={status.isPending}
          onClick={() => status.mutate({ id: conv.id, status: conv.status === "open" ? "closed" : "open" })}
        >
          {conv.status === "open" ? "Close" : "Reopen"}
        </button>
      </div>

      <div ref={log} onScroll={onScroll} className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain p-3" role="log" aria-label="Messages">
        {hasMore ? (
          <button type="button" className="btn btn-ghost btn-sm self-center" onClick={() => void loadOlder()} disabled={loadingOlder}>
            {loadingOlder ? <Loader2Icon className="size-3.5 animate-spin" /> : null} Load older
          </button>
        ) : null}
        {items.length === 0 ? <p className="text-ink-3 m-0 self-center text-[12.5px]">No messages yet.</p> : null}
        {items.map((m) => {
          const day = dayOf(m.wa_timestamp ?? m.created_at);
          const divider = day !== lastDay;
          lastDay = day;
          return (
            <React.Fragment key={m.id}>
              {divider ? <div className="text-ink-3 self-center font-mono text-[10.5px] tracking-[0.06em] uppercase">{day}</div> : null}
              <Bubble m={m} />
            </React.Fragment>
          );
        })}
      </div>

      <Composer key={`${conv.id}-${conv.window_open}`} conversation={conv} />
    </div>
  );
}
