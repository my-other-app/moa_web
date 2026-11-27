"use client";

import * as React from "react";
import { BellOffIcon, ClockIcon, Loader2Icon, MessageCircleIcon, SendIcon } from "lucide-react";
import { formatTime, relativeTime } from "@moa/app-kit";
import { Chip, EmptyState, FigurePanel, Input, NativeSelect, SearchField, Skeleton, Textarea, cn } from "@moa/ui";

import { useConversations, useManualTemplates, useMarkRead, useSendReply, useThread } from "../queries";
import { PARAM_LABEL, labelText, windowLeft, type CanSend, type Conversation, type Message } from "../schemas";

function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** A clock that moves every 30 seconds, for the window's countdown. */
function useNow(ms = 30_000): Date {
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const t = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

function initialsOf(name: string): string {
  const parts = name.replace(/[^\p{L}\p{N} ]/gu, "").trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0]![0]}${parts[1]![0]}` : (parts[0] ?? "?").slice(0, 2)).toUpperCase();
}

function errorText(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "Couldn't send it. Try again.";
}

function ConversationRow({ c, active, onPick, now }: { c: Conversation; active: boolean; onPick: () => void; now: Date }) {
  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        aria-current={active || undefined}
        className={cn("border-line-soft hover:bg-sunken flex w-full items-start gap-2.5 border-b px-3 py-2.5 text-left transition-colors", active && "bg-sunken")}
      >
        <span aria-hidden="true" className="bg-brand-soft text-brand mt-0.5 grid size-8 shrink-0 place-items-center rounded-full font-mono text-[11px] font-semibold">
          {initialsOf(c.name)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className={cn("text-ink min-w-0 flex-1 truncate text-[13.5px]", c.unread_count > 0 ? "font-semibold" : "font-medium")}>{c.name}</span>
            {c.last_message_at ? (
              <time className="text-ink-3 shrink-0 text-[11px]" dateTime={c.last_message_at}>
                {now.getTime() - new Date(c.last_message_at).getTime() < 86_400_000 ? formatTime(c.last_message_at) : relativeTime(c.last_message_at, now)}
              </time>
            ) : null}
          </span>
          {c.phone && c.phone !== c.name ? <span className="text-ink-3 block font-mono text-[11px]">{c.phone}</span> : null}
          <span className="flex items-center gap-1.5">
            <span className="text-ink-2 min-w-0 flex-1 truncate text-[12.5px]">
              {c.last_direction === "out" ? "You: " : ""}
              {c.last_preview ?? "No messages yet"}
            </span>
            {c.unread_count > 0 ? (
              <span className="bg-brand text-brand-foreground shrink-0 rounded-full px-1.5 font-mono text-[10.5px] font-semibold tabular-nums">
                {c.unread_count}
                <span className="sr-only"> unread</span>
              </span>
            ) : null}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-1 text-[11px]">
            {c.opted_out ? (
              <span className="text-caution inline-flex items-center gap-1 font-medium">
                <BellOffIcon className="size-3" aria-hidden="true" /> Wrote STOP
              </span>
            ) : null}
            {c.about.club_name ? <span className="bg-sunken text-ink-2 rounded-full px-1.5 py-px">{c.about.club_name}</span> : null}
            {c.about.event_name ? <span className="bg-sunken text-ink-2 truncate rounded-full px-1.5 py-px">{c.about.event_name}</span> : null}
          </span>
        </span>
      </button>
    </li>
  );
}

function Bubble({ m }: { m: Message }) {
  const out = m.direction === "out";
  const label = out ? labelText(m.label) : m.probably_about ? `Probably about ${labelText({ ...m.probably_about, kind_label: "" })}` : "";
  const body =
    m.body ??
    (m.automatic ? `${m.label?.kind_label ?? "Message"} sent automatically` : m.media ? (m.media.filename ?? `${m.type} (${m.media.mime ?? "file"})`) : m.template_name ? `Template: ${m.template_name}` : "");
  return (
    <li className={cn("flex", out ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "flex max-w-[78%] flex-col gap-1 rounded-2xl px-3 py-2 text-[13.5px] leading-[1.45]",
          out ? "bg-brand-soft text-ink rounded-br-md" : "bg-sunken text-ink rounded-bl-md",
        )}
      >
        {label ? <span className="text-ink-3 text-[11px] font-medium">{label}</span> : null}
        {m.type === "template" && m.template_name && m.body ? <span className="text-ink-3 text-[11px]">Template: {m.template_name}</span> : null}
        <span className={cn("whitespace-pre-wrap break-words", m.automatic && "text-ink-2 italic")}>{body}</span>
        {m.media && m.body ? <span className="text-ink-3 text-[11px]">{m.media.filename ?? m.media.mime ?? "Attachment"}</span> : null}
        <span className="text-ink-3 flex items-center justify-end gap-1.5 text-[11px]">
          {m.sent_by ? <span>{m.sent_by}</span> : null}
          {m.at ? <time dateTime={m.at}>{formatTime(m.at)}</time> : null}
          {out && m.status ? <span>{m.status === "failed" ? "Not sent" : m.status}</span> : null}
        </span>
        {m.error ? <span className="text-refuse text-[11px]">{m.error}</span> : null}
      </div>
    </li>
  );
}

function Composer({ id, can }: { id: number; can: CanSend }) {
  const now = useNow();
  const send = useSendReply(id);
  const templates = useManualTemplates();
  const [text, setText] = React.useState("");
  const [template, setTemplate] = React.useState("");
  const [params, setParams] = React.useState<Record<string, string>>({});
  const left = windowLeft(can.window_expires_at, now);
  const textAllowed = can.text && left !== null;
  const chosen = templates.data?.find((t) => t.name === template);

  if (!can.text && !can.template) {
    return (
      <p role="status" className="text-caution border-line-soft m-0 border-t p-3 text-[12.5px]">
        {can.reason || "Nothing can be sent to them now."}
      </p>
    );
  }
  if (textAllowed) {
    return (
      <form
        className="border-line-soft flex flex-col gap-2 border-t p-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          send.mutate({ mode: "text", text }, { onSuccess: () => setText("") });
        }}
      >
        <p className="text-ink-3 m-0 inline-flex items-center gap-1 text-[11.5px]" role="status">
          <ClockIcon className="size-3.5" aria-hidden="true" /> Free text allowed: {left}
        </p>
        <div className="flex items-end gap-2">
          <Textarea aria-label="Reply" value={text} onChange={(e) => setText(e.target.value)} rows={2} className="flex-1" placeholder="Write a reply" />
          <button type="submit" className="btn btn-primary btn-sm" disabled={send.isPending || !text.trim()}>
            {send.isPending ? <Loader2Icon className="size-3.5 animate-spin" aria-hidden="true" /> : <SendIcon className="size-3.5" aria-hidden="true" />} Send
          </button>
        </div>
        {send.isError ? <p className="text-refuse m-0 text-[12px]">{errorText(send.error)}</p> : null}
      </form>
    );
  }
  return (
    <form
      className="border-line-soft flex flex-col gap-2 border-t p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!chosen) return;
        send.mutate({ mode: "template", template: chosen.name, params }, { onSuccess: () => setParams({}) });
      }}
    >
      <p className="text-ink-3 m-0 text-[11.5px]" role="status">
        More than 24 hours since they last wrote: only an approved template can be sent.
      </p>
      <NativeSelect size="sm" aria-label="Template" value={template} onChange={(e) => setTemplate(e.target.value)}>
        <option value="">Choose a template</option>
        {(templates.data ?? []).map((t) => (
          <option key={t.name} value={t.name}>
            {t.label || t.name}
          </option>
        ))}
      </NativeSelect>
      {chosen ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {chosen.params.map((p) => (
            <label key={p} className="text-ink-2 flex flex-col gap-1 text-[12px]">
              {PARAM_LABEL[p] ?? p}
              <Input value={params[p] ?? ""} onChange={(e) => setParams((v) => ({ ...v, [p]: e.target.value }))} />
            </label>
          ))}
        </div>
      ) : null}
      <div className="flex justify-end">
        <button type="submit" className="btn btn-primary btn-sm" disabled={!chosen || send.isPending || chosen.params.some((p) => !params[p]?.trim())}>
          {send.isPending ? <Loader2Icon className="size-3.5 animate-spin" aria-hidden="true" /> : <SendIcon className="size-3.5" aria-hidden="true" />} Send template
        </button>
      </div>
      {send.isError ? <p className="text-refuse m-0 text-[12px]">{errorText(send.error)}</p> : null}
    </form>
  );
}

function ThreadView({ id, onBack }: { id: number; onBack: () => void }) {
  const thread = useThread(id);
  const read = useMarkRead();
  const conv = thread.data?.conversation;
  const unread = conv?.unread_count ?? 0;
  const { mutate } = read;
  React.useEffect(() => {
    if (unread > 0) mutate(id);
  }, [id, unread, mutate]);
  const end = React.useRef<HTMLDivElement>(null);
  const count = thread.data?.items.length ?? 0;
  React.useEffect(() => {
    end.current?.scrollIntoView?.({ block: "end" });
  }, [count]);

  if (thread.isPending) return <Skeleton className="m-3 h-64 rounded-xl" />;
  if (thread.isError || !conv) return <p className="text-ink-3 m-0 p-3 text-[12.5px]">Couldn&apos;t load this conversation.</p>;
  return (
    <>
      <header className="border-line-soft flex items-center gap-2 border-b px-3 py-2.5">
        <button type="button" className="btn btn-ghost btn-sm lg:hidden" onClick={onBack}>
          Back
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="text-ink m-0 truncate text-[14px] font-semibold">{conv.name}</h2>
          <p className="text-ink-3 m-0 truncate text-[11.5px]">
            {[conv.phone, conv.about.event_name, conv.about.club_name].filter(Boolean).join(" · ")}
          </p>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label="Messages">
          {thread.data.items.map((m) => (
            <Bubble key={m.id} m={m} />
          ))}
        </ul>
        <div ref={end} />
      </div>
      <Composer key={conv.id} id={conv.id} can={conv.can_send} />
    </>
  );
}

/**
 * The admin WhatsApp inbox: what guests wrote to MyOtherApp's own number
 * (the one that sends every club's tickets, reminders and certificates),
 * beside what the number sent them. Conversations on the left, newest first,
 * with the club and event each is probably about; the open one on the right.
 * Asked again every few seconds (polling, as the side menu's counts are).
 */
export function WhatsAppInboxPage() {
  const [search, setSearch] = React.useState("");
  const q = useDebounced(search);
  const [unread, setUnread] = React.useState(false);
  const [clubId, setClubId] = React.useState<number | null>(null);
  const [eventId, setEventId] = React.useState<number | null>(null);
  const [openId, setOpenId] = React.useState<number | null>(null);
  const list = useConversations({ q, unread, club_id: clubId, event_id: eventId });
  const now = useNow(60_000);
  const items = React.useMemo(() => list.data?.items ?? [], [list.data]);

  // The clubs and events seen so far, for the filters (kept as the list narrows): updated while rendering, when the list changes.
  const [seen, setSeen] = React.useState<{ from: readonly Conversation[] | null; clubs: Map<number, string>; events: Map<number, string> }>(() => ({
    from: null,
    clubs: new Map(),
    events: new Map(),
  }));
  if (seen.from !== items) {
    const clubs = new Map(seen.clubs);
    const events = new Map(seen.events);
    for (const c of items) {
      if (c.about.club_id && c.about.club_name) clubs.set(c.about.club_id, c.about.club_name);
      if (c.about.event_id && c.about.event_name) events.set(c.about.event_id, c.about.event_name);
    }
    setSeen({ from: items, clubs, events });
  }

  return (
    <FigurePanel
      role="region"
      aria-label="WhatsApp inbox"
      className="grid h-[calc(100dvh-15rem)] min-h-[420px] grid-rows-[minmax(0,1fr)] overflow-hidden p-0 lg:grid-cols-[360px_minmax(0,1fr)]"
    >
      <section className={cn("border-line-soft flex min-h-0 flex-col lg:border-r", openId !== null && "hidden lg:flex")} aria-label="Conversations">
        <div className="flex flex-col gap-2 p-3">
          <SearchField value={search} onChange={setSearch} label="Search conversations" placeholder="Name or phone number" size="sm" />
          <div className="flex flex-wrap items-center gap-1.5">
            <Chip active={!unread} onClick={() => setUnread(false)}>
              All
            </Chip>
            <Chip active={unread} onClick={() => setUnread(true)}>
              Unread{list.data?.unread_conversations ? ` ${list.data.unread_conversations}` : ""}
            </Chip>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <NativeSelect size="sm" aria-label="Filter by club" value={clubId ?? ""} onChange={(e) => setClubId(Number(e.target.value) || null)}>
              <option value="">Every club</option>
              {[...seen.clubs].map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect size="sm" aria-label="Filter by event" value={eventId ?? ""} onChange={(e) => setEventId(Number(e.target.value) || null)}>
              <option value="">Every event</option>
              {[...seen.events].map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>
        {list.isPending ? (
          <div className="flex flex-col gap-2 p-3">
            <Skeleton className="h-14 rounded-xl" />
            <Skeleton className="h-14 rounded-xl" />
          </div>
        ) : list.isError && !list.data ? (
          <p className="text-ink-3 m-0 p-3 text-[12.5px]">Couldn&apos;t load the conversations.</p>
        ) : items.length === 0 ? (
          q || unread || clubId || eventId ? (
            <p className="text-ink-3 m-0 p-3 text-[12.5px]">Nobody matches that.</p>
          ) : (
            <EmptyState
              tone="muted"
              icon={<MessageCircleIcon />}
              title="No messages yet"
              description="When a guest writes to MyOtherApp's WhatsApp number, the conversation shows here."
            />
          )
        ) : (
          <ul className="m-0 min-h-0 flex-1 list-none overflow-y-auto p-0">
            {items.map((c) => (
              <ConversationRow key={c.id} c={c} active={openId === c.id} onPick={() => setOpenId(c.id)} now={now} />
            ))}
          </ul>
        )}
      </section>
      <section className={cn("flex min-h-0 flex-col", openId === null && "hidden lg:flex")} aria-label="Conversation">
        {openId === null ? (
          <div className="grid flex-1 place-items-center p-6">
            <p className="text-ink-3 m-0 text-[13px]">Pick a conversation.</p>
          </div>
        ) : (
          <ThreadView key={openId} id={openId} onBack={() => setOpenId(null)} />
        )}
      </section>
    </FigurePanel>
  );
}
