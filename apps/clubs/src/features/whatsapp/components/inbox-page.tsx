"use client";

import * as React from "react";
import Link from "next/link";
import { MessageCircleIcon, RadioIcon } from "lucide-react";
import { formatTime, relativeTime } from "@moa/app-kit";
import { Chip, EmptyState, FigurePanel, SearchField, Skeleton, cn } from "@moa/ui";

import { forbiddenText, isPermissionError, isPrivateError, useAccount, useConversations, useRefreshInbox } from "../queries";
import { FILTERS, FILTER_LABEL, PRIVATE_MESSAGE, contactName, initialsOf, type Conversation, type InboxFilter } from "../schemas";
import { pollEvery, useInboxStream, type StreamMode } from "../stream";
import { NoAccessPanel, UpgradeNotice, WhatsAppHeader } from "./shared";
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
        <span className="bg-brand-soft text-brand mt-0.5 grid size-8 shrink-0 place-items-center rounded-full font-mono text-[11px] font-semibold">
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
              <span className="bg-brand text-brand-foreground shrink-0 rounded-full px-1.5 font-mono text-[10.5px] font-semibold tabular-nums" aria-label={`${c.unread_count} unread`}>
                {c.unread_count}
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
  const refresh = useRefreshInbox();
  const allowed = Boolean(a?.can_inbox);
  const mode = useInboxStream({ enabled: allowed, onChange: (c) => refresh(c.conversationId) });
  const list = useConversations(filter, q, allowed ? pollEvery(mode, "list") : false, allowed);
  const [now] = React.useState(() => new Date());

  const forbidden = (account.isError && (isPermissionError(account.error) || isPrivateError(account.error))) || (list.isError && (isPermissionError(list.error) || isPrivateError(list.error)));
  const items = list.data?.items ?? [];

  return (
    <div className="flex flex-col gap-3.5">
      <WhatsAppHeader
        title="WhatsApp"
        sub="Conversations with your attendees and followers"
        right={allowed ? <LiveMark mode={mode} /> : null}
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
          {!a.connected && items.length === 0 && !list.isPending ? (
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
            <FigurePanel className="grid min-h-[560px] overflow-hidden p-0 lg:grid-cols-[340px_minmax(0,1fr)]">
              <section className={cn("border-line-soft flex min-h-0 flex-col lg:border-r", openId !== null && "hidden lg:flex")} aria-label="Conversations">
                <div className="flex flex-col gap-2 p-3">
                  <SearchField value={search} onChange={setSearch} label="Search conversations" placeholder="Name, @username or number" size="sm" />
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label="Show">
                    {FILTERS.map((f) => (
                      <Chip key={f} active={filter === f} onClick={() => setFilter(f)}>
                        {FILTER_LABEL[f]}
                        {f === "unread" && list.data?.unread_total ? ` ${list.data.unread_total}` : ""}
                      </Chip>
                    ))}
                  </div>
                </div>
                {list.isPending ? (
                  <div className="flex flex-col gap-2 p-3">
                    <Skeleton className="h-14 rounded-xl" />
                    <Skeleton className="h-14 rounded-xl" />
                  </div>
                ) : list.isError ? (
                  <p className="text-ink-3 m-0 p-3 text-[12.5px]">Couldn&apos;t load the conversations.</p>
                ) : items.length === 0 ? (
                  <p className="text-ink-3 m-0 p-3 text-[12.5px]">{q ? "Nobody matches that." : filter === "all" ? "No conversations yet." : `No ${FILTER_LABEL[filter].toLowerCase()} conversations.`}</p>
                ) : (
                  <ul className="m-0 flex list-none flex-col overflow-y-auto p-0">
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
                  <Thread key={openId} conversationId={openId} poll={pollEvery(mode, "thread")} onBack={() => setOpenId(null)} />
                )}
              </section>
            </FigurePanel>
          )}
        </>
      )}
    </div>
  );
}
