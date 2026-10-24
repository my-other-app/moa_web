"use client";

import * as React from "react";
import Link from "next/link";
import { CopyIcon, Loader2Icon, SendIcon } from "lucide-react";
import { NativeSelect, Notice, Textarea, cn } from "@moa/ui";

import { isPlanLockError } from "@/features/plan";

import { sendErrorMessage, useSendMessage, useTemplates } from "../queries";
import { type Conversation, type Template, windowText } from "../schemas";
import { copy } from "./shared";

/** The template's text with the values in, as they will see it. */
export function fillTemplate(text: string, values: string[]): string {
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
}) {
  const send = useSendMessage(conversation.id);
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
      const m = await send.mutateAsync({ type: "text", text: body });
      if (m.status !== "failed") onDraft("");
      else onProblem(m.error?.title ?? "WhatsApp refused it.");
    } catch (error) {
      // The draft stays: on WINDOW_CLOSED it is shown above the template picker, to copy.
      fail(error);
    }
  };

  const sendTemplate: typeof send.mutateAsync = (body, options) => {
    onSending?.();
    return send.mutateAsync(body, options);
  };

  return (
    // Never taller than about half the conversation: a long template form scrolls inside it.
    <div className="border-line-soft flex max-h-[60%] shrink-0 flex-col gap-2 overflow-y-auto border-t p-3" aria-label="Reply">
      <p className={cn("m-0 text-[12px]", windowOpen ? "text-admit" : "text-caution")} data-testid="window-indicator">
        {windowText(conversation, now)}
      </p>
      {usingTemplate ? (
        <TemplatePicker conversation={conversation} onProblem={onProblem} onFail={fail} sending={send.isPending} send={sendTemplate} />
      ) : (
        <form onSubmit={sendText} className="flex flex-col gap-1">
          <div className="flex items-end gap-2">
            <Textarea
              aria-label="Message"
              aria-describedby={hint}
              placeholder="Write a reply"
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
            <kbd className="font-mono">Enter</kbd> on a Mac)
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
              aria-label={`Value {{${i + 1}}}`}
              placeholder={`{{${i + 1}}}`}
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
            {fillTemplate(chosen.body, values.body)}
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
