"use client";

import * as React from "react";
import Link from "next/link";
import { CopyIcon, FileIcon, Loader2Icon, PaperclipIcon, ReplyIcon, SendIcon, XIcon } from "lucide-react";
import { NativeSelect, Notice, Textarea, cn } from "@moa/ui";

import { isPlanLockError } from "@/features/plan";

import { uploadMedia } from "../api";
import { sendErrorMessage, usePutSentMessage, useSavedReplies, useSendMessage, useTemplates } from "../queries";
import {
  CAPTION_MAX,
  MEDIA_ACCEPT,
  bytesText,
  checkMedia,
  contactName,
  fillName,
  matchReplies,
  type Conversation,
  type MediaKind,
  type Message,
  type SavedReply,
  type Template,
  windowText,
} from "../schemas";
import { copy } from "./shared";

/**
 * The template's text with the values in, as they will see it: numbered
 * ({{1}}) by position, or -- for a template made with named values -- each
 * {{name}} by `names`, in order.
 */
export function fillTemplate(text: string, values: string[], names: string[] = []): string {
  if (names.length) {
    return text.replace(/\{\{\s*([a-z_][a-z0-9_]*)\s*\}\}/g, (whole, name: string) => {
      const v = values[names.indexOf(name)];
      return v && v.trim() ? v : whole;
    });
  }
  return text.replace(/\{\{\s*(\d+)\s*\}\}/g, (whole, n: string) => {
    const v = values[Number(n) - 1];
    return v && v.trim() ? v : whole;
  });
}

interface Values {
  header: string[];
  body: string[];
  buttons: Record<string, string>;
}

const emptyValues = (t: Template | null): Values => ({
  header: Array.from({ length: t?.header?.format === "TEXT" ? t.header.variables : 0 }, () => ""),
  body: Array.from({ length: t?.body_variables ?? 0 }, () => ""),
  buttons: Object.fromEntries((t?.buttons ?? []).filter((b) => b.type === "URL" && b.variables > 0).map((b) => [String(b.index), ""])),
});

/** What the inbox can't send: a template with a media header. */
function sendable(t: Template): boolean {
  const format = t.header?.format;
  return !format || format === "TEXT";
}

/**
 * The reply box. Inside the 24-hour window: free text (or a template, by
 * choice). Outside it -- or before they have ever written -- WhatsApp only
 * delivers an approved template, so the text box gives way to the picker,
 * with a field for each of the template's values. The thread keys it by
 * the conversation and its window, so either changing starts it afresh;
 * the reply being written and why the last one wasn't sent are the
 * thread's, so neither is lost when that happens (a 409 WINDOW_CLOSED).
 */
export function Composer({
  conversation,
  now,
  draft,
  onDraft,
  problem,
  onProblem,
  onSending,
  replyTo = null,
  onCancelReply,
  attachRef,
  tools = true,
}: {
  conversation: Conversation;
  /** The thread's clock, a minute at a time: the window counts down by itself. */
  now?: Date;
  draft: string;
  onDraft: (text: string) => void;
  problem: string | null;
  onProblem: (problem: string | null) => void;
  /** A message is on its way: the thread brings the newest into view. */
  onSending?: () => void;
  /** The message this answers: quoted above the box, named in what is sent. */
  replyTo?: Message | null;
  onCancelReply?: () => void;
  /** Where the thread hands a file dropped on it. */
  attachRef?: React.MutableRefObject<((file: File) => void) | null>;
  /** The API has files and saved replies (a server from before them has neither). */
  tools?: boolean;
}) {
  const send = useSendMessage(conversation.id);
  const putSent = usePutSentMessage(conversation.id);
  // Where a file goes: the thread's (it hands on what is dropped), else the box's own.
  const ownAttach = React.useRef<((file: File) => void) | null>(null);
  const attach = attachRef ?? ownAttach;
  const [mode, setMode] = React.useState<"text" | "template">(conversation.window_open ? "text" : "template");
  const hint = React.useId();
  const windowOpen = conversation.window_open;
  const usingTemplate = !windowOpen || mode === "template";

  const fail = (error: unknown) => {
    if (isPlanLockError(error)) return;
    onProblem(sendErrorMessage(error));
  };

  const sendText = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body || send.isPending) return;
    onProblem(null);
    onSending?.();
    try {
      // reply_to only when it answers one: an older server takes the body as it was.
      const m = await send.mutateAsync({ type: "text", text: body, ...(replyTo ? { reply_to: replyTo.id } : {}) });
      if (m.status !== "failed") {
        onDraft("");
        onCancelReply?.();
      } else onProblem(m.error?.title ?? "WhatsApp refused it.");
    } catch (error) {
      // The draft stays: on WINDOW_CLOSED it is shown above the template picker, to copy.
      fail(error);
    }
  };

  const sendTemplate: typeof send.mutateAsync = (body, options) => {
    onSending?.();
    return send.mutateAsync(body, options);
  };

  if (conversation.blocked) {
    return (
      <div className="border-line-soft text-ink-3 shrink-0 border-t p-3 text-[12.5px]" aria-label="Reply">
        You blocked them, so nothing can be sent. Unblock them to write again.
      </div>
    );
  }

  return (
    // Never taller than about half the conversation: a long template form scrolls inside it.
    <div className="border-line-soft flex max-h-[60%] shrink-0 flex-col gap-2 overflow-y-auto border-t p-3" aria-label="Reply">
      <p className={cn("m-0 text-[12px]", windowOpen ? "text-admit" : "text-caution")} data-testid="window-indicator">
        {windowText(conversation, now)}
      </p>
      {replyTo && windowOpen ? (
        <div className="bg-sunken flex items-start gap-2 rounded-xl px-3 py-1.5" role="group" aria-label="Replying to">
          <ReplyIcon className="text-ink-3 mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <div className="min-w-0 flex-1 text-[12px]">
            <span className="text-ink-3 block text-[10.5px] font-semibold">Replying to {replyTo.direction === "out" ? "your message" : contactName(conversation)}</span>
            <span className="text-ink-2 line-clamp-2 break-words">{replyTo.body || (replyTo.media ? replyTo.media.filename || `A ${replyTo.type}` : `A ${replyTo.type} message`)}</span>
          </div>
          <button type="button" className="btn btn-ghost btn-xs" aria-label="Don't reply to it" onClick={onCancelReply}>
            <XIcon className="size-3.5" />
          </button>
        </div>
      ) : null}
      {windowOpen && !usingTemplate && tools ? (
        <Attachments
          conversation={conversation}
          replyTo={replyTo}
          attachRef={attach}
          onSending={onSending}
          onSent={async (m) => {
            await putSent(m);
            onCancelReply?.();
          }}
          onProblem={onProblem}
        />
      ) : null}
      {usingTemplate ? (
        <TemplatePicker conversation={conversation} onProblem={onProblem} onFail={fail} sending={send.isPending} send={sendTemplate} />
      ) : (
        <form onSubmit={sendText} className="relative flex flex-col gap-1">
          {tools ? <SavedReplyPicker draft={draft} name={contactName(conversation)} onPick={(text) => onDraft(text)} /> : null}
          <div className="flex items-end gap-2">
            {tools ? (
              <button type="button" className="btn btn-ghost" aria-label="Attach a photo, video, sound or document" onClick={() => attach.current?.(null as unknown as File)}>
                <PaperclipIcon className="size-4" />
              </button>
            ) : null}
            <Textarea
              aria-label="Message"
              aria-describedby={hint}
              placeholder={tools ? "Write a reply, or / for a saved one" : "Write a reply"}
              value={draft}
              maxLength={4096}
              rows={2}
              onChange={(e) => onDraft(e.target.value)}
              onKeyDown={(e) => {
                // Not while an input method is still composing a word (Malayalam, Tamil, Hindi keyboards).
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) void sendText(e);
              }}
              className="min-h-[44px] flex-1 resize-y"
              disabled={send.isPending}
            />
            <button type="submit" className="btn btn-primary" disabled={send.isPending || !draft.trim()} aria-label="Send">
              {send.isPending ? <Loader2Icon className="size-4 animate-spin" /> : <SendIcon className="size-4" />}
            </button>
          </div>
          <p id={hint} className="text-ink-3 m-0 text-[11px]">
            <kbd className="font-mono">Ctrl</kbd> + <kbd className="font-mono">Enter</kbd> to send (<kbd className="font-mono">⌘</kbd> +{" "}
            <kbd className="font-mono">Enter</kbd> on a Mac){tools ? ". Drop a file here, or attach one." : ""}
          </p>
        </form>
      )}
      {windowOpen ? (
        <button type="button" className="text-brand hover:text-ink self-start text-[12px] font-medium" onClick={() => setMode(usingTemplate ? "text" : "template")}>
          {usingTemplate ? "Write a message instead" : "Send a template instead"}
        </button>
      ) : null}
      {problem ? (
        <Notice tone="refuse" tag="Not sent">
          {problem}
        </Notice>
      ) : null}
      {!windowOpen && draft.trim() ? <KeptDraft text={draft} onDiscard={() => onDraft("")} /> : null}
    </div>
  );
}

/** A reply the window closed on: kept, to copy into a template's values or to send if they write again. */
function KeptDraft({ text, onDiscard }: { text: string; onDiscard: () => void }) {
  return (
    <div className="bg-sunken flex flex-col gap-1 rounded-xl px-3 py-2" role="group" aria-label="Your unsent message">
      <div className="flex flex-wrap items-center gap-2">
        <span className="eyebrow min-w-0 flex-1">Your message, not sent</span>
        <button type="button" className="btn btn-ghost btn-xs" onClick={() => void copy(text)}>
          <CopyIcon className="size-3.5" aria-hidden="true" /> Copy
        </button>
        <button type="button" className="btn btn-ghost btn-xs" onClick={onDiscard}>
          Discard
        </button>
      </div>
      <p className="text-ink-2 m-0 text-[12.5px] break-words whitespace-pre-wrap">{text}</p>
    </div>
  );
}

function TemplatePicker({
  conversation,
  onProblem,
  onFail,
  sending,
  send,
}: {
  conversation: Conversation;
  onProblem: (p: string | null) => void;
  onFail: (error: unknown) => void;
  sending: boolean;
  send: ReturnType<typeof useSendMessage>["mutateAsync"];
}) {
  const q = useTemplates(false);
  const approved = (q.data?.items ?? []).filter((t) => t.status === "APPROVED" && sendable(t));
  const [key, setKey] = React.useState("");
  const chosen = approved.find((t) => `${t.name}|${t.language}` === key) ?? null;
  const [values, setValues] = React.useState<Values>(emptyValues(null));
  const pick = (next: string) => {
    setKey(next);
    setValues(emptyValues(approved.find((t) => `${t.name}|${t.language}` === next) ?? null));
  };

  const names = chosen?.parameter_format === "NAMED" ? chosen.body_names : [];
  const complete =
    chosen !== null && values.header.every((v) => v.trim()) && values.body.every((v) => v.trim()) && Object.values(values.buttons).every((v) => v.trim());

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chosen) return;
    onProblem(null);
    try {
      const m = await send({
        type: "template",
        template: chosen.name,
        language: chosen.language || null,
        params: { header: values.header.map((v) => v.trim()), body: values.body.map((v) => v.trim()), buttons: values.buttons },
      });
      if (m.status === "failed") onProblem(m.error?.title ?? "WhatsApp refused it.");
      else pick("");
    } catch (error) {
      onFail(error);
    }
  };

  if (q.isPending) return <p className="text-ink-3 m-0 text-[12.5px]">Loading your templates…</p>;
  if (q.isError || approved.length === 0) {
    return (
      <p className="text-ink-2 m-0 text-[12.5px]">
        {q.isError ? "Couldn't load your templates." : "No approved templates yet."}{" "}
        <Link href="/whatsapp/templates" className="text-brand font-medium">
          Templates
        </Link>
      </p>
    );
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-2" aria-label="Send a template">
      <NativeSelect aria-label="Template" value={key} onChange={(e) => pick(e.target.value)} disabled={sending}>
        <option value="">Pick an approved template</option>
        {approved.map((t) => (
          <option key={`${t.name}|${t.language}`} value={`${t.name}|${t.language}`}>
            {t.name} ({t.language})
          </option>
        ))}
      </NativeSelect>
      {chosen ? (
        <>
          {values.header.map((v, i) => (
            <input
              key={`h${i}`}
              className="input h-9"
              aria-label={`Header value {{${i + 1}}}`}
              placeholder={`Header {{${i + 1}}}`}
              value={v}
              onChange={(e) => setValues((s) => ({ ...s, header: s.header.map((x, j) => (j === i ? e.target.value : x)) }))}
            />
          ))}
          {values.body.map((v, i) => (
            <input
              key={`b${i}`}
              className="input h-9"
              // A template made with named values is filled by name: {{first_name}}, not {{1}}.
              aria-label={`Value {{${names[i] ?? i + 1}}}`}
              placeholder={`{{${names[i] ?? i + 1}}}`}
              value={v}
              onChange={(e) => setValues((s) => ({ ...s, body: s.body.map((x, j) => (j === i ? e.target.value : x)) }))}
            />
          ))}
          {Object.keys(values.buttons).map((index) => {
            const b = chosen.buttons.find((x) => String(x.index) === index);
            return (
              <input
                key={`u${index}`}
                className="input h-9"
                aria-label={`Link value for ${b?.text ?? "button"}`}
                placeholder={`${b?.url ?? "Link"}`}
                value={values.buttons[index] ?? ""}
                onChange={(e) => setValues((s) => ({ ...s, buttons: { ...s.buttons, [index]: e.target.value } }))}
              />
            );
          })}
          <div className="bg-sunken text-ink-2 rounded-xl px-3 py-2 text-[12.5px] whitespace-pre-wrap" aria-label="Preview">
            {chosen.header?.format === "TEXT" && chosen.header.text ? <strong className="text-ink block">{fillTemplate(chosen.header.text, values.header)}</strong> : null}
            {fillTemplate(chosen.body, values.body, names)}
            {chosen.footer ? <span className="text-ink-3 mt-1 block">{chosen.footer}</span> : null}
          </div>
        </>
      ) : null}
      <button type="submit" className="btn btn-primary btn-sm self-end" disabled={sending || !complete}>
        {sending ? <Loader2Icon className="size-3.5 animate-spin" /> : <SendIcon className="size-3.5" />} Send template
      </button>
      {conversation.window_open ? null : (
        <p className="text-ink-3 m-0 text-[11.5px]">A template starts a conversation Meta bills your club for.</p>
      )}
    </form>
  );
}

// ─── Saved replies: "/" in the box ───────────────────────────────────────

/**
 * Typing "/" (and a word) at the start of the box offers the club's saved
 * replies, its shortcuts first; picking one puts it in the box with "{name}"
 * as the contact's display name, to read over before sending.
 */
function SavedReplyPicker({ draft, name, onPick }: { draft: string; name: string; onPick: (text: string) => void }) {
  const typing = /^\/[^\s]*$/.test(draft);
  const q = useSavedReplies(typing);
  const [active, setActive] = React.useState(0);
  const items = React.useMemo(() => (typing ? matchReplies(q.data?.items ?? [], draft) : []), [typing, q.data, draft]);
  // Each new letter starts the list from its top.
  const [forDraft, setForDraft] = React.useState(draft);
  if (forDraft !== draft) {
    setForDraft(draft);
    setActive(0);
  }
  React.useEffect(() => {
    if (!typing || items.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.target instanceof HTMLTextAreaElement)) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => (i + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length);
      } else if ((e.key === "Enter" || e.key === "Tab") && !e.metaKey && !e.ctrlKey && !e.isComposing) {
        e.preventDefault();
        const r = items[active];
        if (r) onPick(fillName(r.body, name));
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [typing, items, active, name, onPick]);
  if (!typing) return null;
  return (
    <div className="bg-surface border-line absolute right-0 bottom-full left-0 z-10 mb-1 max-h-56 overflow-y-auto rounded-xl border p-1 shadow-lg">
      {q.isPending ? (
        <p className="text-ink-3 m-0 px-2 py-1.5 text-[12px]">Loading saved replies…</p>
      ) : items.length === 0 ? (
        <p className="text-ink-3 m-0 px-2 py-1.5 text-[12px]">
          {(q.data?.items.length ?? 0) === 0 ? "No saved replies yet. Add them in WhatsApp → Settings." : "No saved reply matches."}
        </p>
      ) : (
        <ul role="listbox" aria-label="Saved replies" className="m-0 flex list-none flex-col p-0">
          {items.map((r: SavedReply, i) => (
            <li key={r.id} role="option" aria-selected={i === active}>
              <button
                type="button"
                className={cn("flex w-full flex-col rounded-lg px-2 py-1.5 text-left", i === active ? "bg-sunken" : "hover:bg-sunken")}
                onMouseEnter={() => setActive(i)}
                onClick={() => onPick(fillName(r.body, name))}
              >
                <span className="text-ink text-[12.5px] font-medium">
                  {r.title}
                  {r.shortcut ? <span className="text-ink-3 ml-1.5 font-mono text-[11px]">/{r.shortcut}</span> : null}
                </span>
                <span className="text-ink-3 line-clamp-1 text-[11.5px]">{fillName(r.body, name)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Files ───────────────────────────────────────────────────────────────

type Pending = { file: File; kind: MediaKind };

/**
 * A photo, video, sound or document for them: picked, or dropped on the
 * conversation. It is checked here first, as WhatsApp would (type and size),
 * so a file that can't go never starts uploading; then it goes with a
 * progress bar, and an optional caption (not on a sound).
 */
function Attachments({
  conversation,
  replyTo,
  attachRef,
  onSending,
  onSent,
  onProblem,
}: {
  conversation: Conversation;
  replyTo: Message | null;
  attachRef: React.MutableRefObject<((file: File) => void) | null>;
  onSending?: () => void;
  onSent: (m: Message) => Promise<void> | void;
  onProblem: (p: string | null) => void;
}) {
  const input = React.useRef<HTMLInputElement>(null);
  const [pending, setPending] = React.useState<Pending | null>(null);
  const [caption, setCaption] = React.useState("");
  const [progress, setProgress] = React.useState<number | null>(null);
  const abort = React.useRef<AbortController | null>(null);

  const take = React.useCallback(
    (file: File | null) => {
      // The paperclip asks for the picker; a drop hands the file itself.
      if (!file) {
        input.current?.click();
        return;
      }
      const check = checkMedia(file);
      if (!check.ok) {
        setPending(null);
        onProblem(check.text);
        return;
      }
      onProblem(null);
      setPending({ file, kind: check.kind });
    },
    [onProblem],
  );
  React.useEffect(() => {
    attachRef.current = take as (file: File) => void;
    return () => {
      attachRef.current = null;
    };
  }, [attachRef, take]);
  React.useEffect(() => () => abort.current?.abort(), []);

  const sendIt = async () => {
    if (!pending) return;
    onProblem(null);
    onSending?.();
    const controller = new AbortController();
    abort.current = controller;
    setProgress(0);
    try {
      const m = await uploadMedia(conversation.id, pending.file, {
        caption: pending.kind === "audio" ? null : caption,
        replyTo: replyTo?.id ?? null,
        onProgress: setProgress,
        signal: controller.signal,
      });
      await onSent(m);
      if (m.status === "failed") onProblem(m.error?.title ?? "WhatsApp refused it.");
      setPending(null);
      setCaption("");
    } catch (error) {
      if (!isPlanLockError(error) && !(error instanceof Error && "errorCode" in error && (error as { errorCode?: string }).errorCode === "CANCELLED")) {
        onProblem(sendErrorMessage(error));
      }
    } finally {
      abort.current = null;
      setProgress(null);
    }
  };

  return (
    <>
      <input
        ref={input}
        type="file"
        className="sr-only"
        tabIndex={-1}
        aria-label="Choose a file to send"
        accept={MEDIA_ACCEPT}
        onChange={(e) => {
          const file = e.target.files?.[0] ?? null;
          e.target.value = "";
          if (file) take(file);
        }}
      />
      {pending ? (
        <div className="bg-sunken flex flex-col gap-2 rounded-xl p-2.5" role="group" aria-label="File to send">
          <div className="flex items-center gap-2 text-[12.5px]">
            <FileIcon className="text-ink-3 size-4 shrink-0" aria-hidden="true" />
            <span className="text-ink min-w-0 flex-1 truncate font-medium">{pending.file.name}</span>
            <span className="text-ink-3 shrink-0">{bytesText(pending.file.size)}</span>
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              aria-label={progress === null ? "Remove the file" : "Stop sending the file"}
              onClick={() => (progress === null ? setPending(null) : abort.current?.abort())}
            >
              <XIcon className="size-3.5" />
            </button>
          </div>
          {pending.kind !== "audio" ? (
            <input
              className="input h-9"
              aria-label="Caption"
              placeholder="Add a caption (optional)"
              maxLength={CAPTION_MAX}
              value={caption}
              disabled={progress !== null}
              onChange={(e) => setCaption(e.target.value)}
            />
          ) : null}
          {progress !== null ? (
            <div className="flex items-center gap-2">
              <progress className="h-1.5 flex-1 accent-current" max={1} value={progress} aria-label="Sending the file" />
              <span className="text-ink-3 w-10 text-right text-[11px] tabular-nums">{Math.round(progress * 100)}%</span>
            </div>
          ) : (
            <button type="button" className="btn btn-primary btn-sm self-end" onClick={() => void sendIt()}>
              <SendIcon className="size-3.5" /> Send {pending.kind === "document" ? "document" : pending.kind === "image" ? "photo" : pending.kind}
            </button>
          )}
        </div>
      ) : null}
    </>
  );
}
