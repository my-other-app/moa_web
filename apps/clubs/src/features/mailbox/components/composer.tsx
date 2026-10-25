"use client";

import * as React from "react";
import Link from "next/link";
import { FileIcon, Loader2Icon, PaperclipIcon, SendIcon, XIcon } from "lucide-react";
import { ApiError } from "@moa/api";
import { Checkbox, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Notice, Textarea, toast } from "@moa/ui";

import type { ComposeMode } from "../api";
import { errorText, useSendMail } from "../queries";
import {
  MAX_ATTACHMENT_BYTES,
  NO_EMAIL_CREDITS,
  formatBytes,
  isAddress,
  replySubject,
  splitAddresses,
  type MailAttachment,
  type MailMessage,
} from "../schemas";

/** What the composer opens on: new mail, or an answer to (a forward of) one mail. */
export interface ComposeTarget {
  mode: ComposeMode;
  original?: MailMessage | null;
  /** The club's own addresses: a reply to all leaves them out. */
  ownAddresses?: string[];
}

/** Who an answer goes to by default: the sender (their Reply-To first); reply-all adds everyone else on it, less the club. */
export function defaultRecipients(target: ComposeTarget): { to: string[]; cc: string[] } {
  const o = target.original;
  if (!o || target.mode === "new" || target.mode === "forward") return { to: [], cc: [] };
  const mine = new Set((target.ownAddresses ?? []).map((a) => a.toLowerCase()));
  const first = o.direction === "in" ? [(o.reply_to || o.from_address || "").toLowerCase()] : o.to.map((a) => a.toLowerCase());
  const to = first.filter((a) => a && !mine.has(a));
  const cc: string[] = [];
  if (target.mode === "reply_all") {
    for (const raw of [...o.to, ...o.cc]) {
      const a = raw.toLowerCase();
      if (!mine.has(a) && !to.includes(a) && !cc.includes(a)) cc.push(a);
    }
  }
  return { to, cc };
}

export const MODE_TITLE: Record<ComposeMode, string> = { new: "New mail", reply: "Reply", reply_all: "Reply to all", forward: "Forward" };

export interface ComposeProblems {
  to?: string;
  cc?: string;
  bcc?: string;
  text?: string;
  files?: string;
}

/** What stops a mail before it is sent: addresses, an empty body, files past 10 MB together. */
export function composeProblems(v: { to: string; cc: string; bcc: string; text: string; mode: ComposeMode; bytes: number }): ComposeProblems {
  const out: ComposeProblems = {};
  for (const field of ["to", "cc", "bcc"] as const) {
    const bad = splitAddresses(v[field]).find((a) => !isAddress(a));
    if (bad) out[field] = `${bad} isn't an email address.`;
  }
  if (!out.to && !out.cc && splitAddresses(v.to).length + splitAddresses(v.cc).length === 0) out.to = "Who is it to? Add an address.";
  if (!v.text.trim() && v.mode !== "forward") out.text = "Write something first.";
  if (v.bytes > MAX_ATTACHMENT_BYTES) out.files = `Files can weigh 10 MB at most together (these are ${formatBytes(v.bytes)}).`;
  return out;
}

function FieldRow({ id, label, error, children }: { id: string; label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="eyebrow">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-refuse m-0 text-[12px]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Writing mail: new, a reply, a reply to all or a forward, always from the
 * club's own address (the server's From, never this form's). Files are
 * checked here against 10 MB together before anything is sent; the server
 * checks again, and the recipients, the club's limits and its email credits.
 */
export function Composer({
  target,
  signature,
  open,
  onOpenChange,
  onSent,
}: {
  target: ComposeTarget;
  signature?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSent?: (m: MailMessage) => void;
}) {
  const o = target.original ?? null;
  const defaults = React.useMemo(() => defaultRecipients(target), [target]);
  const [to, setTo] = React.useState(defaults.to.join(", "));
  const [cc, setCc] = React.useState(defaults.cc.join(", "));
  const [bcc, setBcc] = React.useState("");
  const [showCc, setShowCc] = React.useState(defaults.cc.length > 0);
  const [subject, setSubject] = React.useState(o ? replySubject(o.subject, target.mode === "new" ? "reply" : target.mode) : "");
  const [text, setText] = React.useState("");
  const [withSignature, setWithSignature] = React.useState(true);
  const [files, setFiles] = React.useState<File[]>([]);
  const [kept, setKept] = React.useState<MailAttachment[]>(target.mode === "forward" && o ? o.attachments : []);
  const [tried, setTried] = React.useState(false);
  const send = useSendMail();
  const fileInput = React.useRef<HTMLInputElement>(null);

  const bytes = files.reduce((n, f) => n + f.size, 0) + kept.reduce((n, a) => n + a.size_bytes, 0);
  const problems = composeProblems({ to, cc, bcc, text, mode: target.mode, bytes });
  const blocked = Object.keys(problems).length > 0;
  const shown = tried ? problems : { files: problems.files };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (blocked || send.isPending) return;
    send.mutate(
      {
        mode: target.mode,
        messageId: o?.id ?? null,
        to: splitAddresses(to),
        cc: splitAddresses(cc),
        bcc: splitAddresses(bcc),
        subject: subject.trim(),
        text,
        includeSignature: Boolean(signature) && withSignature,
        forwardAttachments: kept.map((a) => a.id),
        files,
      },
      {
        onSuccess: (m) => {
          if (m.status === "failed") toast.error(m.error || "It wasn't sent. Send it again from the conversation.");
          else toast.success("Sent");
          onSent?.(m);
          onOpenChange(false);
        },
      },
    );
  };

  const error = send.error;
  const outOfCredits = error instanceof ApiError && error.errorCode === NO_EMAIL_CREDITS;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>{MODE_TITLE[target.mode]}</DialogTitle>
          <DialogDescription>{o ? `About “${o.subject || "(no subject)"}”` : "From the club's own address."}</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-3" onSubmit={submit} aria-label={MODE_TITLE[target.mode]} noValidate>
          <FieldRow id="mail-to" label="To" error={shown.to}>
            <Input id="mail-to" value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@example.com, another@example.com" aria-invalid={Boolean(shown.to) || undefined} autoComplete="off" />
          </FieldRow>
          {showCc ? (
            <>
              <FieldRow id="mail-cc" label="Cc" error={shown.cc}>
                <Input id="mail-cc" value={cc} onChange={(e) => setCc(e.target.value)} aria-invalid={Boolean(shown.cc) || undefined} autoComplete="off" />
              </FieldRow>
              <FieldRow id="mail-bcc" label="Bcc" error={shown.bcc}>
                <Input id="mail-bcc" value={bcc} onChange={(e) => setBcc(e.target.value)} aria-invalid={Boolean(shown.bcc) || undefined} autoComplete="off" />
              </FieldRow>
            </>
          ) : (
            <button type="button" className="btn btn-ghost btn-xs self-start" onClick={() => setShowCc(true)}>
              Add Cc or Bcc
            </button>
          )}
          <FieldRow id="mail-subject" label="Subject">
            <Input id="mail-subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={300} />
          </FieldRow>
          <FieldRow id="mail-text" label="Message" error={shown.text}>
            <Textarea id="mail-text" value={text} onChange={(e) => setText(e.target.value)} rows={9} aria-invalid={Boolean(shown.text) || undefined} />
          </FieldRow>
          {o && target.mode !== "new" ? (
            <p className="text-ink-3 m-0 text-[12px]">
              {target.mode === "forward" ? "The mail you're forwarding goes below what you write." : "What you're answering is quoted below what you write."}
            </p>
          ) : null}
          {signature ? (
            <label className="text-ink-2 inline-flex items-center gap-2 text-[12.5px]">
              <Checkbox checked={withSignature} onCheckedChange={(v) => setWithSignature(v === true)} aria-label="Add the signature" />
              Add the signature
            </label>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => fileInput.current?.click()}>
                <PaperclipIcon className="size-3.5" aria-hidden="true" /> Attach files
              </button>
              <span className="text-ink-3 text-[12px]">Up to 10 MB together</span>
              <input
                ref={fileInput}
                type="file"
                multiple
                className="sr-only"
                aria-label="Attach files"
                onChange={(e) => {
                  const picked = Array.from(e.target.files ?? []);
                  setFiles((now) => [...now, ...picked]);
                  e.target.value = "";
                }}
              />
            </div>
            {kept.length || files.length ? (
              <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0" aria-label="Files">
                {kept.map((a) => (
                  <li key={`kept-${a.id}`} className="bg-sunken inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12px]">
                    <FileIcon className="size-3.5" aria-hidden="true" />
                    {a.filename ?? "A file"} · {formatBytes(a.size_bytes)}
                    <button type="button" className="text-ink-3 hover:text-ink" aria-label={`Don't send ${a.filename ?? "this file"}`} onClick={() => setKept((k) => k.filter((x) => x.id !== a.id))}>
                      <XIcon className="size-3.5" />
                    </button>
                  </li>
                ))}
                {files.map((f, i) => (
                  <li key={`new-${i}`} className="bg-sunken inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12px]">
                    <FileIcon className="size-3.5" aria-hidden="true" />
                    {f.name} · {formatBytes(f.size)}
                    <button type="button" className="text-ink-3 hover:text-ink" aria-label={`Remove ${f.name}`} onClick={() => setFiles((all) => all.filter((_, j) => j !== i))}>
                      <XIcon className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {shown.files ? <p className="text-refuse m-0 text-[12px]">{shown.files}</p> : null}
          </div>

          {error ? (
            <Notice tone="refuse" tag="Not sent" action={outOfCredits ? <Link href="/billing" className="btn btn-primary btn-sm">Buy more email credits</Link> : undefined}>
              {errorText(error)}
            </Notice>
          ) : null}

          <DialogFooter>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onOpenChange(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={send.isPending || (tried && blocked)}>
              {send.isPending ? <Loader2Icon className="size-3.5 animate-spin" aria-hidden="true" /> : <SendIcon className="size-3.5" aria-hidden="true" />} Send
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
