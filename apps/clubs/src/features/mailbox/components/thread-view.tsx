"use client";

import * as React from "react";
import {
  ArchiveIcon,
  ArrowLeftIcon,
  ForwardIcon,
  ImageIcon,
  InboxIcon,
  Loader2Icon,
  MailIcon,
  PaperclipIcon,
  ReplyAllIcon,
  ReplyIcon,
  RotateCwIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  Trash2Icon,
} from "lucide-react";
import { formatDateTime } from "@moa/app-kit";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Notice,
  Skeleton,
  StatusBadge,
  buttonVariants,
  cn,
  toast,
  type StatusTone,
} from "@moa/ui";

import { fileHref, inlineImages, type ComposeMode, type FetchFile } from "../api";
import { errorText, isLapsedError, useDeleteThread, useMarkRead, useMarkUnread, useMoveThread, useRetryMail, useThread } from "../queries";
import {
  FRAME_SANDBOX,
  cidsIn,
  formatBytes,
  initialsOf,
  senderName,
  srcdocFor,
  textBlocks,
  withInlineImages,
  type MailAttachment,
  type MailMessage,
  type MessageStatus,
} from "../schemas";

const STATUS: Partial<Record<MessageStatus, { label: string; tone: StatusTone }>> = {
  sending: { label: "Sending", tone: "info" },
  sent: { label: "Sent", tone: "success" },
  failed: { label: "Not sent", tone: "destructive" },
  bounced: { label: "Bounced", tone: "destructive" },
  complained: { label: "Marked as spam", tone: "warning" },
};

/**
 * A mail's HTML, shown only here: in a frame with no scripts and an opaque
 * origin (sandbox without allow-scripts or allow-same-origin), under its own
 * Content-Security-Policy that loads nothing from the web until the reader
 * asks for the pictures. Links open in a new tab, outside the sandbox.
 * Pictures the mail carries (`cid:`) are read through the gateway and put
 * in as data: addresses, which the frame may show.
 */
export function MailHtml({ html, attachments, hasRemoteImages, readFile }: { html: string; attachments: MailAttachment[]; hasRemoteImages: boolean; readFile?: FetchFile }) {
  const [showImages, setShowImages] = React.useState(false);
  const [tall, setTall] = React.useState(false);
  const [inline, setInline] = React.useState<Record<string, string>>({});
  const cids = React.useMemo(() => cidsIn(html), [html]);
  React.useEffect(() => {
    if (!cids.length) return;
    let live = true;
    void inlineImages(cids, attachments, readFile).then((found) => {
      if (live) setInline(found);
    });
    return () => {
      live = false;
    };
  }, [cids, attachments, readFile]);
  const doc = React.useMemo(() => srcdocFor(withInlineImages(html, inline), showImages), [html, inline, showImages]);
  return (
    <div className="flex flex-col gap-2">
      {hasRemoteImages && !showImages ? (
        <div className="bg-sunken text-ink-2 flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-[12.5px]" role="note">
          <ImageIcon className="size-3.5" aria-hidden="true" />
          <span className="flex-1">Pictures from the web are hidden, so the sender can&apos;t tell you opened it.</span>
          <button type="button" className="btn btn-ghost btn-xs" onClick={() => setShowImages(true)}>
            Show images
          </button>
        </div>
      ) : null}
      <iframe
        title="The mail"
        sandbox={FRAME_SANDBOX}
        referrerPolicy="no-referrer"
        srcDoc={doc}
        className={cn("border-line-soft w-full rounded-lg border bg-white", tall ? "h-[80dvh]" : "h-[420px]")}
      />
      <button type="button" className="btn btn-ghost btn-xs self-end" onClick={() => setTall((t) => !t)}>
        {tall ? "Smaller" : "Taller"}
      </button>
    </div>
  );
}

/** A plain-text mail: escaped by React, line breaks kept, what it quotes folded away. */
export function MailText({ text }: { text: string }) {
  const blocks = React.useMemo(() => textBlocks(text.trimEnd()), [text]);
  const [open, setOpen] = React.useState<Set<number>>(new Set());
  return (
    <div className="text-ink text-[13.5px] leading-[1.6] break-words whitespace-pre-wrap">
      {blocks.map((b, i) =>
        b.quoted && !open.has(i) ? (
          <button key={i} type="button" className="btn btn-ghost btn-xs my-1 block" onClick={() => setOpen((s) => new Set(s).add(i))} aria-label="Show the quoted text">
            ···
          </button>
        ) : (
          <div key={i} className={cn(b.quoted && "border-line text-ink-3 border-l-2 pl-3")}>
            {b.lines.join("\n")}
          </div>
        ),
      )}
    </div>
  );
}

function Attachments({ items }: { items: MailAttachment[] }) {
  const files = items.filter((a) => !a.inline);
  if (!files.length) return null;
  return (
    <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0" aria-label="Attachments">
      {files.map((a) => (
        <li key={a.id}>
          <a href={fileHref(a.url)} target="_blank" rel="noopener noreferrer" className="bg-sunken hover:bg-line-soft text-ink inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px]">
            <PaperclipIcon className="size-3.5" aria-hidden="true" />
            {a.filename ?? "attachment"}
            <span className="text-ink-3">{formatBytes(a.size_bytes)}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

function MessageCard({
  m,
  expanded,
  onToggle,
  onAnswer,
  readFile,
}: {
  m: MailMessage;
  expanded: boolean;
  onToggle: () => void;
  onAnswer: (mode: ComposeMode, m: MailMessage) => void;
  readFile?: FetchFile;
}) {
  const retry = useRetryMail();
  const name = senderName(m);
  const status = m.direction === "out" ? STATUS[m.status] : null;
  const at = m.sent_at ?? m.created_at;
  return (
    <article className="border-line-soft flex flex-col gap-2.5 border-b px-4 py-3 last:border-0" aria-label={`Mail from ${name}`}>
      <button type="button" onClick={onToggle} className="flex w-full items-start gap-2.5 text-left" aria-expanded={expanded}>
        <span aria-hidden="true" className={cn("mt-0.5 grid size-8 shrink-0 place-items-center rounded-full font-mono text-[11px] font-semibold", m.direction === "out" ? "bg-sunken text-ink-2" : "bg-brand-soft text-brand")}>
          {initialsOf(name)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className={cn("text-ink text-[13.5px]", m.unread ? "font-semibold" : "font-medium")}>{name}</span>
            {m.direction === "in" && m.from_address && m.from_name ? <span className="text-ink-3 text-[12px]">{m.from_address}</span> : null}
            {status ? <StatusBadge label={status.label} tone={status.tone} /> : null}
            {at ? (
              <time className="text-ink-3 ml-auto text-[11.5px]" dateTime={at}>
                {formatDateTime(at)}
              </time>
            ) : null}
          </span>
          {expanded ? (
            <span className="text-ink-3 block text-[12px]">
              To {m.to.join(", ") || "—"}
              {m.cc.length ? ` · Cc ${m.cc.join(", ")}` : ""}
              {m.bcc.length ? ` · Bcc ${m.bcc.join(", ")}` : ""}
              {m.direction === "in" && m.delivered_to ? ` · to ${m.delivered_to}` : ""}
            </span>
          ) : (
            <span className="text-ink-2 block truncate text-[12.5px]">{m.snippet || m.text.slice(0, 160)}</span>
          )}
        </span>
      </button>
      {expanded ? (
        <>
          {m.status === "failed" || m.status === "bounced" || m.status === "complained" ? (
            <Notice
              tone="refuse"
              tag={m.status === "failed" ? "Not sent" : m.status === "bounced" ? "Bounced" : "Spam"}
              action={
                m.status === "failed" ? (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={retry.isPending}
                    onClick={() =>
                      retry.mutate(m.id, {
                        onSuccess: (next) => (next.status === "failed" ? toast.error(next.error || "Still not sent.") : toast.success("Sent")),
                        onError: (e) => toast.error(errorText(e)),
                      })
                    }
                  >
                    {retry.isPending ? <Loader2Icon className="size-3.5 animate-spin" aria-hidden="true" /> : <RotateCwIcon className="size-3.5" aria-hidden="true" />} Send again
                  </button>
                ) : undefined
              }
            >
              {m.error || (m.status === "failed" ? "It wasn't sent." : "It didn't reach everyone.")}
            </Notice>
          ) : null}
          {m.html ? <MailHtml html={m.html} attachments={m.attachments} hasRemoteImages={m.has_remote_images} readFile={readFile} /> : <MailText text={m.text} />}
          <Attachments items={m.attachments} />
          <div className="flex flex-wrap gap-1.5">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onAnswer("reply", m)}>
              <ReplyIcon className="size-3.5" aria-hidden="true" /> Reply
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onAnswer("reply_all", m)}>
              <ReplyAllIcon className="size-3.5" aria-hidden="true" /> Reply all
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onAnswer("forward", m)}>
              <ForwardIcon className="size-3.5" aria-hidden="true" /> Forward
            </button>
          </div>
        </>
      ) : null}
    </article>
  );
}

/**
 * One conversation: its mail oldest first (the latest and the unread ones
 * open, the rest folded to a line), what can be done with it, and an answer
 * from any of its mails. Opening it marks it read.
 */
export function ThreadView({
  threadId,
  poll,
  canSend,
  onBack,
  onAnswer,
  onGone,
  readFile,
}: {
  threadId: number;
  poll: number | false;
  /** The plan still has the mailbox (a lapsed one is read only). */
  canSend: boolean;
  onBack: () => void;
  onAnswer: (mode: ComposeMode, m: MailMessage, ownAddresses: string[]) => void;
  /** It was deleted, or moved out of the folder on screen. */
  onGone: () => void;
  readFile?: FetchFile;
}) {
  const q = useThread(threadId, poll);
  const markRead = useMarkRead();
  const markUnread = useMarkUnread();
  const move = useMoveThread();
  const remove = useDeleteThread();
  const [open, setOpen] = React.useState<Set<number>>(new Set());
  const [confirming, setConfirming] = React.useState(false);
  const readOnce = React.useRef<number | null>(null);
  const detail = q.data;
  const thread = detail?.thread;

  React.useEffect(() => {
    if (!thread || thread.unread_count <= 0 || readOnce.current === thread.id) return;
    readOnce.current = thread.id;
    markRead.mutate(thread.id);
  }, [thread, markRead]);

  if (q.isPending) {
    return (
      <div className="flex flex-col gap-2 p-4">
        <Skeleton className="h-6 w-2/3 rounded-lg" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  }
  if (q.isError || !detail || !thread) {
    return (
      <div className="flex flex-col items-start gap-2 p-4">
        <button type="button" className="btn btn-ghost btn-sm lg:hidden" onClick={onBack}>
          <ArrowLeftIcon className="size-3.5" aria-hidden="true" /> Back
        </button>
        <p className="text-ink-3 m-0 text-[13px]">{isLapsedError(q.error) ? errorText(q.error) : "Couldn't load this conversation."}</p>
      </div>
    );
  }

  const last = detail.messages[detail.messages.length - 1];
  const expanded = (m: MailMessage) => open.has(m.id) || m.id === last?.id || m.unread || m.status === "failed";
  const toggle = (m: MailMessage) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(m.id)) next.delete(m.id);
      else next.add(m.id);
      return next;
    });
  const moveTo = (folder: "inbox" | "archive" | "spam", said: string) =>
    move.mutate(
      { id: thread.id, folder },
      {
        onSuccess: () => {
          toast.success(said);
          onGone();
        },
        onError: (e) => toast.error(errorText(e)),
      },
    );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="border-line-soft flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <button type="button" className="btn btn-ghost btn-sm lg:hidden" onClick={onBack} aria-label="Back to the list">
          <ArrowLeftIcon className="size-3.5" aria-hidden="true" />
        </button>
        <h3 className="text-ink m-0 min-w-0 flex-1 truncate text-[15px] font-semibold">{thread.subject || "(no subject)"}</h3>
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Conversation actions">
          <button type="button" className="btn btn-ghost btn-xs" onClick={() => markUnread.mutate(thread.id, { onSuccess: () => toast.success("Marked unread") })} disabled={markUnread.isPending || !thread.last_inbound_at}>
            <MailIcon className="size-3.5" aria-hidden="true" /> Mark unread
          </button>
          {thread.folder === "archive" ? (
            <button type="button" className="btn btn-ghost btn-xs" onClick={() => moveTo("inbox", "Moved to the Inbox")} disabled={move.isPending}>
              <InboxIcon className="size-3.5" aria-hidden="true" /> Move to Inbox
            </button>
          ) : thread.folder !== "spam" ? (
            <button type="button" className="btn btn-ghost btn-xs" onClick={() => moveTo("archive", "Archived")} disabled={move.isPending}>
              <ArchiveIcon className="size-3.5" aria-hidden="true" /> Archive
            </button>
          ) : null}
          {thread.folder === "spam" ? (
            <button type="button" className="btn btn-ghost btn-xs" onClick={() => moveTo("inbox", "Moved to the Inbox")} disabled={move.isPending}>
              <ShieldCheckIcon className="size-3.5" aria-hidden="true" /> Not spam
            </button>
          ) : (
            <button type="button" className="btn btn-ghost btn-xs" onClick={() => moveTo("spam", "Moved to Spam")} disabled={move.isPending}>
              <ShieldAlertIcon className="size-3.5" aria-hidden="true" /> Spam
            </button>
          )}
          <button type="button" className="btn btn-ghost btn-xs text-refuse" onClick={() => setConfirming(true)}>
            <Trash2Icon className="size-3.5" aria-hidden="true" /> Delete
          </button>
        </div>
      </header>
      {thread.folder === "spam" ? (
        <Notice tone="caution" tag="Spam" className="mx-4 mt-3">
          This looks like spam. Pictures and links in it could be anything: open them only if you know the sender.
        </Notice>
      ) : null}
      {!canSend ? (
        <p className="text-ink-3 mx-4 mt-3 mb-0 text-[12px]">The mailbox is closed: what&apos;s here can be read, not answered.</p>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {detail.messages.map((m) => (
          <MessageCard
            key={m.id}
            m={m}
            expanded={expanded(m)}
            onToggle={() => toggle(m)}
            onAnswer={(mode, msg) => (canSend ? onAnswer(mode, msg, detail.own_addresses) : toast.error("The mailbox is closed: nothing can be sent from it."))}
            readFile={readFile}
          />
        ))}
      </div>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this conversation?</AlertDialogTitle>
            <AlertDialogDescription>Its {thread.message_count === 1 ? "mail" : `${thread.message_count} mails`} and their files are deleted for good, for everyone on the team.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              className={cn(buttonVariants({ variant: "destructive" }))}
              onClick={() =>
                remove.mutate(thread.id, {
                  onSuccess: () => {
                    toast.success("Deleted");
                    onGone();
                  },
                  onError: (e) => toast.error(errorText(e)),
                })
              }
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
