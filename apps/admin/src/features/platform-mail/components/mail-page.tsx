"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { Loader2Icon, LockIcon, PenSquareIcon, ServerOffIcon } from "lucide-react";
import { ApiError } from "@moa/api";
import { formatNumber } from "@moa/app-kit";
import {
  Composer,
  FOLDER_LABEL,
  FolderNav,
  MailProvider,
  ThreadRow,
  ThreadView,
  threadsOf,
  useDebounced,
  useThreads,
  type ComposeMode,
  type ComposeTarget,
  type FetchFile,
  type Folder,
  type MailMessage,
  type MailThread,
} from "@moa/mail-ui";
import { Chip, EmptyState, FigurePanel, SearchField, Skeleton, cn } from "@moa/ui";

import { useCan } from "@/hooks/use-can";

import { MAIL_PAGE } from "../api";
import { PLATFORM_MAIL, useMailOverview, useMayReadMail } from "../queries";
import { addressOf, type MailAddress } from "../schemas";

/** How often the open folder and the open conversation are asked again (there is no live stream here). */
export const LIST_POLL_MS = 30_000;
export const THREAD_POLL_MS = 20_000;

/** The address picked under From at first: the one the mail came to, else the tab's, else info@, else the first. */
export function defaultFrom(addresses: MailAddress[], ...preferred: (string | null | undefined)[]): string | null {
  for (const m of [...preferred, "info"]) if (m && addresses.some((a) => a.mailbox === m)) return m;
  return addresses[0]?.mailbox ?? null;
}

function MailboxTabs({ addresses, total, value, onPick }: { addresses: MailAddress[]; total: number; value: string | null; onPick: (mailbox: string | null) => void }) {
  const tab = (key: string | null, label: string, unread: number, title?: string) => (
    <Chip key={key ?? "all"} active={value === key} onClick={() => onPick(key)}>
      <span title={title}>{label}</span>
      {unread ? (
        <span className="font-mono text-[11px] tabular-nums">
          {formatNumber(unread)}
          <span className="sr-only"> unread</span>
        </span>
      ) : null}
    </Chip>
  );
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Mailboxes">
      {tab(null, "All", total)}
      {addresses.map((a) => tab(a.mailbox, `${a.mailbox}@`, a.unread, a.address))}
    </div>
  );
}

function Calm({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return <EmptyState tone="muted" icon={icon} title={title} description={body} />;
}

/**
 * The platform's inbox: admin@, developer@, developers@ and info@ in one
 * place (a tab each, or all), their folders, a search, a conversation and
 * an answer from any of the addresses. The screens are the club mailbox's
 * (@moa/mail-ui); there is no live stream, so the open folder and
 * conversation are asked again every few seconds.
 *
 * Owners and support read and answer it; a viewer is told it isn't theirs
 * (the API refuses them too). Deleting a conversation is the owners'.
 * Until the API has it (a bare 404) the page says so calmly and the side
 * menu doesn't offer it. `readFile` stands in for the gateway in tests.
 */
export function PlatformMailPage({ readFile }: { readFile?: FetchFile } = {}) {
  const may = useMayReadMail();
  const overview = useMailOverview(may === true);
  if (may === undefined || (may && overview.isPending)) return <Skeleton className="h-[420px] rounded-2xl" />;
  if (!may || (overview.error instanceof ApiError && overview.error.isForbidden)) {
    return (
      <Calm
        icon={<LockIcon />}
        title="Mail is for owners and support"
        body="admin@, developer@, developers@ and info@myotherapp.in are read and answered by admins with the owner or support role. Ask an owner if you need to."
      />
    );
  }
  if (overview.data === null) {
    return (
      <Calm
        icon={<ServerOffIcon />}
        title="Mail isn't available yet"
        body="The platform's inbox arrives with a newer version of the API. Once the server is updated it appears here on its own."
      />
    );
  }
  if (overview.isError || !overview.data) return <Calm icon={<ServerOffIcon />} title="Could not load Mail" body="Try reloading the page." />;
  return (
    <MailProvider config={PLATFORM_MAIL}>
      <Inbox addresses={overview.data.addresses} total={overview.data.unread_total} canDelete={overview.data.can_delete} readFile={readFile} />
    </MailProvider>
  );
}

function Inbox({ addresses, total, canDelete: allowed, readFile }: { addresses: MailAddress[]; total: number; canDelete: boolean | null; readFile?: FetchFile }) {
  // The API says whether this admin may delete (owners); an older answer leaves it to the role.
  const owner = useCan("destroy");
  const canDelete = allowed ?? owner;
  const [mailbox, setMailbox] = React.useState<string | null>(null);
  const [folder, setFolder] = React.useState<Folder>("inbox");
  const [search, setSearch] = React.useState("");
  const q = useDebounced(search);
  // A link to one conversation: /mail?t=<id>.
  const params = useSearchParams();
  const asked = Number(params?.get("t") ?? "") || null;
  const [openId, setOpenId] = React.useState<number | null>(asked);
  const [compose, setCompose] = React.useState<{ key: number; target: ComposeTarget; from: string | null } | null>(null);
  const list = useThreads({ folder, q, mailbox }, LIST_POLL_MS, true, MAIL_PAGE);
  const items = React.useMemo(() => threadsOf(list.data), [list.data]);
  const counts = list.data?.pages[0]?.counts;
  const [now] = React.useState(() => new Date());

  const answer = (mode: ComposeMode, original: MailMessage | null, ownAddresses: string[], thread?: MailThread) =>
    setCompose({ key: Date.now(), target: { mode, original, ownAddresses }, from: defaultFrom(addresses, original?.mailbox, thread?.mailbox, mailbox) });
  const pickMailbox = (m: string | null) => {
    setMailbox(m);
    setOpenId(null);
  };
  const where = mailbox ? addressOf(mailbox, addresses) : null;

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MailboxTabs addresses={addresses} total={total} value={mailbox} onPick={pickMailbox} />
        <button type="button" className="btn btn-primary btn-sm" onClick={() => answer("new", null, [])} disabled={!addresses.length}>
          <PenSquareIcon className="size-3.5" aria-hidden="true" /> New mail
        </button>
      </div>
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
          <div className="p-3">
            <SearchField value={search} onChange={setSearch} label="Search mail" placeholder="Subject, sender or words" size="sm" />
          </div>
          {list.isPending ? (
            <div className="flex flex-col gap-2 p-3">
              <Skeleton className="h-14 rounded-xl" />
              <Skeleton className="h-14 rounded-xl" />
            </div>
          ) : list.isError && !list.data ? (
            <p className="text-ink-3 m-0 p-3 text-[12.5px]">{PLATFORM_MAIL.describeError!(list.error, "Couldn't load the mail.")}</p>
          ) : items.length === 0 ? (
            <p className="text-ink-3 m-0 p-3 text-[12.5px]">
              {q ? "Nothing matches that." : folder === "inbox" ? `Nothing yet. Mail sent to ${where ?? "the platform's addresses"} shows here.` : `Nothing in ${FOLDER_LABEL[folder]}.`}
            </p>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <ul className="m-0 flex list-none flex-col p-0" aria-label={FOLDER_LABEL[folder]}>
                {items.map((t) => (
                  <ThreadRow key={t.id} t={t} folder={folder} active={openId === t.id} onPick={() => setOpenId(t.id)} now={now} tag={!mailbox && t.mailbox ? `${t.mailbox}@` : undefined} />
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
              poll={THREAD_POLL_MS}
              canSend
              canDelete={canDelete}
              onBack={() => setOpenId(null)}
              onAnswer={(mode, original, own, thread) => answer(mode, original, own, thread)}
              onGone={() => setOpenId(null)}
              readFile={readFile}
              tag={(t) => addressOf(t.mailbox, addresses)}
            />
          )}
        </section>
      </FigurePanel>
      <p className="text-ink-3 m-0 text-[12px]">Sent as “MyOtherApp” from the address picked under From.</p>

      {compose ? (
        <Composer
          key={compose.key}
          target={compose.target}
          open
          onOpenChange={(o) => (o ? null : setCompose(null))}
          fromLine="From one of MyOtherApp's addresses."
          from={{ choices: addresses.map((a) => ({ value: a.mailbox, label: `MyOtherApp <${a.address}>` })), initial: compose.from }}
          onSent={(m) => {
            if (compose.target.mode === "new" || compose.target.mode === "forward") setFolder("sent");
            setOpenId(m.thread_id);
          }}
        />
      ) : null}
    </div>
  );
}
