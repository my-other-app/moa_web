"use client";

import * as React from "react";
import Link from "next/link";
import { Loader2Icon, MessageCircleIcon, RadioIcon } from "lucide-react";
import { formatTime, relativeTime } from "@moa/app-kit";
import { Chip, EmptyState, FigurePanel, SearchField, Skeleton, cn } from "@moa/ui";

import { conversationsOf, forbiddenText, isPermissionError, isPrivateError, useAccount, useApplyRefresh, useConversations } from "../queries";
import { FILTERS, FILTER_LABEL, PRIVATE_MESSAGE, contactName, initialsOf, type Conversation, type InboxFilter } from "../schemas";
import { RESYNC, planRefresh, pollEvery, useCoalesced, useInboxStream, type StreamChange, type StreamMode } from "../stream";
import { NoAccessPanel, UpgradeNotice, WhatsAppHeader, WhatsAppUnavailable } from "./shared";
import { StatusTicks, Thread } from "./thread";

/** The search, a moment after the typing stops. */
function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function ConversationRow({ c, active, onPick, now }: { c: Conversation; active: boolean; onPick: () => void; now: Date }) {
  const name = contactName(c);
  const last = c.last_message;
  const event = c.contact.events[0];
  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        aria-current={active || undefined}
        className={cn("border-line-soft hover:bg-sunken flex w-full items-start gap-2.5 border-b px-3 py-2.5 text-left transition-colors", active && "bg-sunken")}
      >
        <span aria-hidden="true" className="bg-brand-soft text-brand mt-0.5 grid size-8 shrink-0 place-items-center rounded-full font-mono text-[11px] font-semibold">
          {initialsOf(name)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className={cn("text-ink min-w-0 flex-1 truncate text-[13.5px]", c.unread_count > 0 ? "font-semibold" : "font-medium")}>{name}</span>
            {last?.at ? (
              <time className="text-ink-3 shrink-0 text-[11px]" dateTime={last.at}>
                {now.getTime() - new Date(last.at).getTime() < 86_400_000 ? formatTime(last.at) : relativeTime(last.at, now)}
              </time>
            ) : null}
          </span>
          <span className="flex items-center gap-1.5">
            {last?.direction === "out" ? <StatusTicks status={last.status} /> : null}
            <span className="text-ink-2 min-w-0 flex-1 truncate text-[12.5px]">{last?.preview ?? "No messages yet"}</span>
            {c.unread_count > 0 ? (
              // Its words are part of the row's name: "… 2 unread".
              <span className="bg-brand text-brand-foreground shrink-0 rounded-full px-1.5 font-mono text-[10.5px] font-semibold tabular-nums">
                {c.unread_count}
                <span className="sr-only"> unread</span>
              </span>
            ) : null}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px]">
            {c.awaiting_reply ? <span className="text-caution font-medium">Waiting for a reply</span> : null}
            {event ? (
              <span className="text-ink-3 truncate">
                {event.name ?? "An event"}
                {c.contact.events.length > 1 ? ` +${c.contact.events.length - 1}` : ""}
              </span>
            ) : null}
            {c.status === "closed" ? <span className="text-ink-3">Closed</span> : null}
          </span>
        </span>
      </button>
    </li>
  );
}

/**
 * The next page of conversations: on a click, or by itself when the end of
 * the list scrolls into view (where the browser can tell).
 */
function LoadMore({ onMore, loading, failed }: { onMore: () => void; loading: boolean; failed: boolean }) {
  const sentinel = React.useRef<HTMLDivElement>(null);
  const more = React.useRef(onMore);
  React.useEffect(() => {
    more.current = onMore;
  }, [onMore]);
  React.useEffect(() => {
    const el = sentinel.current;
    if (!el || failed || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) more.current();
    });
    io.observe(el);
    return () => io.disconnect();
  }, [failed]);
  return (
    <div ref={sentinel} className="flex flex-col items-center gap-1.5 p-3">
      {failed ? <p className="text-refuse m-0 text-[12px]">Couldn&apos;t load more conversations.</p> : null}
      <button type="button" className="btn btn-ghost btn-sm" onClick={onMore} disabled={loading}>
        {loading ? <Loader2Icon className="size-3.5 animate-spin" aria-hidden="true" /> : null} {failed ? "Try again" : "Load more"}
      </button>
    </div>
  );
}

function LiveMark({ mode }: { mode: StreamMode }) {
  return (
    <span className={cn("inline-flex items-center gap-1 text-[11.5px]", mode === "live" ? "text-admit" : "text-ink-3")} role="status">
      <RadioIcon className="size-3.5" aria-hidden="true" />
      {mode === "live" ? "Live" : "Refreshing every few seconds"}
    </span>
  );
}

/**
 * The inbox: conversations on the left (filters, search, unread counts, who
 * each person is to the club), the open one on the right. On a phone the two
 * stack: the list, then the conversation with a way back.
 *
 * Only the club's own account and members with the WhatsApp permission get
 * here (403 WHATSAPP_PERMISSION otherwise; WHATSAPP_PRIVATE for an admin
 * acting as the club).
 */
export function WhatsAppInboxPage() {
  const account = useAccount();
  const a = account.data;
  const [filter, setFilter] = React.useState<InboxFilter>("all");
  const [search, setSearch] = React.useState("");
  const q = useDebounced(search);
  const [openId, setOpenId] = React.useState<number | null>(null);
  const allowed = Boolean(a?.can_inbox);
  // Only a connected number on a plan that has it can receive anything: only then is the stream opened, or the inbox polled.
  const live = allowed && Boolean(a?.connected && a?.plan_allows);
  // A number that is, or was, connected: its conversations stay to be read after a disconnect or a downgrade. Never one: nothing to list.
  const listable = allowed && Boolean(a && (a.connected || a.status !== null));

  // The stream's frames, a burst at a time: at most one refresh in COALESCE_MS, and only of what changed.
  const onScreen = React.useRef<ReadonlySet<number>>(new Set());
  const applyRefresh = useApplyRefresh();
  const push = useCoalesced<StreamChange>((batch) => applyRefresh(planRefresh(batch, onScreen.current)));
  const mode = useInboxStream({ enabled: live, onChange: push, onReady: () => push(RESYNC) });
  const list = useConversations(filter, q, live ? pollEvery(mode, "list") : false, listable);
  const [now] = React.useState(() => new Date());

  const forbidden = (account.isError && (isPermissionError(account.error) || isPrivateError(account.error))) || (list.isError && (isPermissionError(list.error) || isPrivateError(list.error)));
  const items = React.useMemo(() => conversationsOf(list.data), [list.data]);
  const unreadTotal = list.data?.pages[0]?.unread_total ?? 0;
  const loadMore = () => {
    if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
  };
  React.useEffect(() => {
    onScreen.current = new Set(items.map((c) => c.id));
  }, [items]);

  // A server without the feature (its routes answer a bare 404): no inbox to open yet.
  if (a && !a.on_server) return <WhatsAppUnavailable />;

  return (
    <div className="flex flex-col gap-3.5">
      <WhatsAppHeader
        title="WhatsApp"
        sub="Conversations with your attendees and followers"
        right={live ? <LiveMark mode={mode} /> : null}
      />

      {forbidden ? (
        <NoAccessPanel title="WhatsApp isn't open to you" body={forbiddenText(account.error ?? list.error)} />
      ) : account.isError ? (
        <EmptyState tone="muted" title="Could not load WhatsApp" description="Try reloading the page." />
      ) : !a ? (
        <Skeleton className="h-[420px] rounded-2xl" />
      ) : !a.can_inbox ? (
        a.impersonated ? (
          // A platform admin acting as the club: the connection, never the messages.
          <NoAccessPanel title="The inbox is for the club's own team" body={PRIVATE_MESSAGE} />
        ) : (
          <NoAccessPanel
            title="The inbox needs the WhatsApp permission"
            body="The club's owner gives it person by person on the Access page. You can still see the number's settings."
          />
        )
      ) : (
        <>
          {!a.plan_allows ? <UpgradeNotice upgrade={a.upgrade} /> : null}
          {!a.connected && (!listable || (list.isSuccess && items.length === 0)) ? (
            <EmptyState
              tone="muted"
              icon={<MessageCircleIcon />}
              title="Connect your WhatsApp number to start"
              description="Once your club's own number is connected, what people send it shows here and you can answer from the dashboard."
              action={
                a.can_manage ? (
                  <Link href="/whatsapp/settings" className="btn btn-primary btn-sm">
                    Connect a number
                  </Link>
                ) : undefined
              }
            />
          ) : (
            // One viewport tall, less the shell and this page's header: the list and the conversation
            // each scroll inside it, so the reply box stays in view however long the conversation.
            <FigurePanel
              role="region"
              aria-label="Inbox"
              className={cn(
                "grid min-h-[420px] grid-rows-[minmax(0,1fr)] overflow-hidden p-0 lg:grid-cols-[340px_minmax(0,1fr)]",
                "h-[calc(100dvh-17rem)] sm:h-[calc(100dvh-15rem)]",
              )}
            >
              <section className={cn("border-line-soft flex min-h-0 flex-col lg:border-r", openId !== null && "hidden lg:flex")} aria-label="Conversations">
                <div className="flex flex-col gap-2 p-3">
                  <SearchField value={search} onChange={setSearch} label="Search conversations" placeholder="Name, @username or number" size="sm" />
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label="Show">
                    {FILTERS.map((f) => (
                      <Chip key={f} active={filter === f} onClick={() => setFilter(f)}>
                        {FILTER_LABEL[f]}
                        {f === "unread" && unreadTotal ? ` ${unreadTotal}` : ""}
                      </Chip>
                    ))}
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
                  <p className="text-ink-3 m-0 p-3 text-[12.5px]">{q ? "Nobody matches that." : filter === "all" ? "No conversations yet." : `No ${FILTER_LABEL[filter].toLowerCase()} conversations.`}</p>
                ) : (
                  <div className="min-h-0 flex-1 overflow-y-auto">
                    <ul className="m-0 flex list-none flex-col p-0">
                      {items.map((c) => (
                        <ConversationRow key={c.id} c={c} active={openId === c.id} onPick={() => setOpenId(c.id)} now={now} />
                      ))}
                    </ul>
                    {list.hasNextPage ? <LoadMore onMore={loadMore} loading={list.isFetchingNextPage} failed={list.isFetchNextPageError} /> : null}
                  </div>
                )}
              </section>
              <section className={cn("flex min-h-0 flex-col", openId === null && "hidden lg:flex")} aria-label="Conversation">
                {openId === null ? (
                  <div className="grid flex-1 place-items-center p-6">
                    <p className="text-ink-3 m-0 text-[13px]">Pick a conversation.</p>
                  </div>
                ) : (
                  <Thread key={openId} conversationId={openId} poll={live ? pollEvery(mode, "thread") : false} onBack={() => setOpenId(null)} />
                )}
              </section>
            </FigurePanel>
          )}
        </>
      )}
    </div>
  );
}
