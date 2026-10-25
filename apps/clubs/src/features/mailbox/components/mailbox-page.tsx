"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { InboxIcon, Loader2Icon, PaperclipIcon, PenSquareIcon, RadioIcon } from "lucide-react";
import { formatTime, relativeTime } from "@moa/app-kit";
import { Chip, EmptyState, FigurePanel, SearchField, Skeleton, cn } from "@moa/ui";

import { RESYNC, planRefresh, pollEvery, useCoalesced, useInboxStream, type StreamChange, type StreamMode } from "@/features/whatsapp/stream";

import { useNewMailNotifier } from "../alerts";
import { MAIL_STREAM_URL, type ComposeMode, type FetchFile } from "../api";
import { errorText, isLapsedError, isPermissionError, isPrivateError, threadsOf, useApplyMailRefresh, useMailbox, useThreads } from "../queries";
import { FOLDERS, FOLDER_LABEL, PERMISSION_MESSAGE, PRIVATE_MESSAGE, initialsOf, type Folder, type MailMessage, type MailThread } from "../schemas";
import { Composer, type ComposeTarget } from "./composer";
import { LapseNotice, MailHeader, MailUnavailable, MailUpgradeNotice, NoAccessPanel } from "./shared";
import { ThreadView } from "./thread-view";

function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function ThreadRow({ t, active, onPick, now, folder }: { t: MailThread; active: boolean; onPick: () => void; now: Date; folder: Folder }) {
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
          <span className="text-ink-3 block truncate text-[12px]">{t.snippet}</span>
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
 * Mail: the folders (Inbox, Sent, Archive, Spam, each with what is unread),
 * a folder's conversations with a search, and the open one. On a phone
 * they stack: the list, then the conversation with a way back.
 *
 * Only the club's own account and members with the Mail permission read it
 * (403 MAILBOX_PERMISSION otherwise; MAILBOX_PRIVATE for an admin acting as
 * the club). `readFile` stands in for the gateway in tests.
 */
export function MailboxPage({ readFile }: { readFile?: FetchFile } = {}) {
  const status = useMailbox();
  const mb = status.data;
  const [folder, setFolder] = React.useState<Folder>("inbox");
  const [unreadOnly, setUnreadOnly] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const q = useDebounced(search);
  // A bell notice or a browser notification leads here as /mail?t=<id>: that thread opens.
  const params = useSearchParams();
  const asked = Number(params?.get("t") ?? "") || null;
  const [openId, setOpenId] = React.useState<number | null>(asked);
  const [seenAsk, setSeenAsk] = React.useState(asked);
  if (asked !== seenAsk) {
    setSeenAsk(asked);
    if (asked) setOpenId(asked);
  }
  const [compose, setCompose] = React.useState<{ key: number; target: ComposeTarget } | null>(null);
  const answer = (mode: ComposeMode, original?: MailMessage | null, ownAddresses: string[] = []) =>
    setCompose({ key: Date.now(), target: { mode, original: original ?? null, ownAddresses } });

  const usable = Boolean(mb?.on_server && mb.available && mb.can_mail && mb.set_up && mb.state !== "expired");
  const canSend = Boolean(mb && mb.plan_allows && mb.state === "open");
  const onScreen = React.useRef<ReadonlySet<number>>(new Set());
  const applyRefresh = useApplyMailRefresh();
  const push = useCoalesced<StreamChange>((batch) => applyRefresh(planRefresh(batch, onScreen.current)));
  const mode = useInboxStream({ enabled: usable, onChange: push, onReady: () => push(RESYNC), url: MAIL_STREAM_URL });
  const list = useThreads(folder, q, unreadOnly, usable ? pollEvery(mode, "list") : false, usable);
  const items = React.useMemo(() => threadsOf(list.data), [list.data]);
  const counts = list.data?.pages[0]?.counts;
  const [now] = React.useState(() => new Date());
  React.useEffect(() => {
    onScreen.current = new Set(items.map((t) => t.id));
  }, [items]);
  useNewMailNotifier(folder === "inbox" ? items : [], setOpenId);

  if (mb && (!mb.on_server || !mb.available)) return <MailUnavailable />;
  const forbidden = (status.isError && (isPermissionError(status.error) || isPrivateError(status.error))) || (list.isError && (isPermissionError(list.error) || isPrivateError(list.error)));

  const folderCount = (f: Folder) => (f === "inbox" ? counts?.unread_total : f === "spam" ? counts?.spam_unread : f === "archive" ? counts?.archive_unread : 0) ?? 0;

  return (
    <div className="flex flex-col gap-3.5">
      <MailHeader
        title="Mail"
        sub={mb?.address ? <>The club&apos;s mailbox, {mb.address}</> : "The club's own mailbox"}
        right={
          <>
            {usable ? <LiveMark mode={mode} /> : null}
            {usable && canSend ? (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => answer("new")}>
                <PenSquareIcon className="size-3.5" aria-hidden="true" /> New mail
              </button>
            ) : null}
          </>
        }
      />

      {forbidden ? (
        <NoAccessPanel title="Mail isn't open to you" body={isPrivateError(status.error ?? list.error) ? PRIVATE_MESSAGE : PERMISSION_MESSAGE} />
      ) : status.isError ? (
        <EmptyState tone="muted" title="Could not load Mail" description="Try reloading the page." />
      ) : !mb ? (
        <Skeleton className="h-[420px] rounded-2xl" />
      ) : mb.impersonated ? (
        <NoAccessPanel title="Mail is for the club's own team" body={PRIVATE_MESSAGE} />
      ) : !mb.can_mail ? (
        <NoAccessPanel
          title="Mail needs the Mail permission"
          body={`The club's owner gives it person by person on the Access page.${mb.can_manage ? " You can still set up the club's address in Mail settings." : ""}`}
        />
      ) : (
        <>
          {!mb.plan_allows && mb.state === "open" ? <MailUpgradeNotice upgrade={mb.upgrade} /> : null}
          <LapseNotice mailbox={mb} />
          {!mb.set_up ? (
            <EmptyState
              tone="muted"
              icon={<InboxIcon />}
              title="Pick the club's address to start"
              description={`Your club gets one address, like yourclub@${mb.domain}. Mail sent to it shows here, and the team answers from the dashboard.`}
              action={
                mb.can_manage && mb.plan_allows ? (
                  <Link href="/mail/settings" className="btn btn-primary btn-sm">
                    Pick the address
                  </Link>
                ) : undefined
              }
            />
          ) : mb.state === "expired" ? null : (
            <FigurePanel
              role="region"
              aria-label="Mailbox"
              className={cn("grid min-h-[460px] grid-rows-[minmax(0,1fr)] overflow-hidden p-0 lg:grid-cols-[150px_320px_minmax(0,1fr)]", "h-[calc(100dvh-17rem)] sm:h-[calc(100dvh-15rem)]")}
            >
              <nav aria-label="Folders" className={cn("border-line-soft flex gap-1 overflow-x-auto border-b p-2 lg:flex-col lg:border-r lg:border-b-0", openId !== null && "hidden lg:flex")}>
                {FOLDERS.map((f) => {
                  const n = folderCount(f);
                  return (
                    <button
                      key={f}
                      type="button"
                      aria-current={folder === f || undefined}
                      onClick={() => {
                        setFolder(f);
                        setOpenId(null);
                      }}
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
              <section className={cn("border-line-soft flex min-h-0 flex-col lg:border-r", openId !== null && "hidden lg:flex")} aria-label="Conversations">
                <div className="flex flex-col gap-2 p-3">
                  <SearchField value={search} onChange={setSearch} label="Search mail" placeholder="Subject, sender or words" size="sm" />
                  <div className="flex gap-1.5" role="group" aria-label="Show">
                    <Chip active={!unreadOnly} onClick={() => setUnreadOnly(false)}>
                      All
                    </Chip>
                    <Chip active={unreadOnly} onClick={() => setUnreadOnly(true)}>
                      Unread
                    </Chip>
                  </div>
                </div>
                {list.isPending ? (
                  <div className="flex flex-col gap-2 p-3">
                    <Skeleton className="h-14 rounded-xl" />
                    <Skeleton className="h-14 rounded-xl" />
                  </div>
                ) : list.isError && !list.data ? (
                  <p className="text-ink-3 m-0 p-3 text-[12.5px]">{isLapsedError(list.error) ? errorText(list.error) : "Couldn't load the mail."}</p>
                ) : items.length === 0 ? (
                  <p className="text-ink-3 m-0 p-3 text-[12.5px]">
                    {q ? "Nothing matches that." : unreadOnly ? "Nothing unread here." : folder === "inbox" ? `Nothing yet. Mail sent to ${mb.address} shows here.` : `Nothing in ${FOLDER_LABEL[folder]}.`}
                  </p>
                ) : (
                  <div className="min-h-0 flex-1 overflow-y-auto">
                    <ul className="m-0 flex list-none flex-col p-0" aria-label={FOLDER_LABEL[folder]}>
                      {items.map((t) => (
                        <ThreadRow key={t.id} t={t} folder={folder} active={openId === t.id} onPick={() => setOpenId(t.id)} now={now} />
                      ))}
                    </ul>
                    {list.hasNextPage ? (
                      <div className="flex justify-center p-3">
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => void list.fetchNextPage()} disabled={list.isFetchingNextPage}>
                          {list.isFetchingNextPage ? <Loader2Icon className="size-3.5 animate-spin" aria-hidden="true" /> : null} Load more
                        </button>
                      </div>
                    ) : null}
                  </div>
                )}
              </section>
              <section className={cn("flex min-h-0 flex-col", openId === null && "hidden lg:flex")} aria-label="Conversation">
                {openId === null ? (
                  <div className="grid flex-1 place-items-center p-6">
                    <p className="text-ink-3 m-0 text-[13px]">Pick a conversation.</p>
                  </div>
                ) : (
                  <ThreadView
                    key={openId}
                    threadId={openId}
                    poll={pollEvery(mode, "thread")}
                    canSend={canSend}
                    onBack={() => setOpenId(null)}
                    onAnswer={(m, original, own) => answer(m, original, own)}
                    onGone={() => setOpenId(null)}
                    readFile={readFile}
                  />
                )}
              </section>
            </FigurePanel>
          )}
          {usable && mb.credits_left != null ? (
            <p className="text-ink-3 m-0 text-[12px]">
              {mb.credits_left.toLocaleString("en-IN")} email {mb.credits_left === 1 ? "credit" : "credits"} left: each mail sent is one.
            </p>
          ) : null}
        </>
      )}

      {compose ? (
        <Composer
          key={compose.key}
          target={compose.target}
          signature={mb?.signature}
          open
          onOpenChange={(o) => (o ? null : setCompose(null))}
          onSent={(m) => {
            if (compose.target.mode === "new" || compose.target.mode === "forward") setFolder("sent");
            setOpenId(m.thread_id);
          }}
        />
      ) : null}
    </div>
  );
}
