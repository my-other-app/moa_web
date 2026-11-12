"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { InboxIcon, Loader2Icon, PenSquareIcon, RadioIcon } from "lucide-react";
import { FolderNav, ThreadRow, useDebounced } from "@moa/mail-ui";
import { Chip, EmptyState, FigurePanel, SearchField, Skeleton, cn } from "@moa/ui";

import { RESYNC, planRefresh, pollEvery, useCoalesced, useInboxStream, type StreamChange, type StreamMode } from "@/features/whatsapp/stream";

import { useNewMailNotifier } from "../alerts";
import { MAIL_STREAM_URL, type ComposeMode, type FetchFile } from "../api";
import { errorText, isLapsedError, isPermissionError, isPrivateError, threadsOf, useApplyMailRefresh, useMailbox, useThreads } from "../queries";
import { FOLDER_LABEL, PERMISSION_MESSAGE, PRIVATE_MESSAGE, type Folder, type MailMessage } from "../schemas";
import { ClubMail } from "./club-mail";
import { Composer, type ComposeTarget } from "./composer";
import { LapseNotice, MailHeader, MailUnavailable, MailUpgradeNotice, NoAccessPanel } from "./shared";
import { ThreadView } from "./thread-view";

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
function Mailbox({ readFile }: { readFile?: FetchFile }) {
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
              <FolderNav
                folder={folder}
                counts={counts}
                onPick={(f) => {
                  setFolder(f);
                  setOpenId(null);
                }}
                className={cn(openId !== null && "hidden lg:flex")}
              />
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

/** Mail, its screens asking the club's own mailbox (ClubMail). */
export function MailboxPage({ readFile }: { readFile?: FetchFile } = {}) {
  return (
    <ClubMail>
      <Mailbox readFile={readFile} />
    </ClubMail>
  );
}
