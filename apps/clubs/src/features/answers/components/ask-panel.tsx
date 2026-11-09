"use client";

import * as React from "react";
import Link from "next/link";
import { BellIcon, Loader2Icon, MailIcon, MessageCircleIcon, SendIcon } from "lucide-react";
import { formatNumber } from "@moa/app-kit";
import {
  Button,
  Checkbox,
  EmptyState,
  Notice,
  Segmented,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Skeleton,
  Switch,
  cn,
} from "@moa/ui";

// The query modules, not the features' surfaces: the console and the event list reach this one.
import { useEventSummary } from "@/features/console/queries";
import { useEventDetail } from "@/features/events/queries";

import { useAnswersSummary, useAskPreview, useCreateAsk } from "../queries";
import {
  ASK_MESSAGE_MAX,
  ASK_QUESTIONS_MAX,
  CHANNEL_LABEL,
  REMIND_AFTER_HOURS,
  askPreviewTexts,
  deadlineProblem,
  deadlineToIso,
  defaultAskMessage,
  peopleWord,
  whatsappReason,
  type AnswerAsk,
  type AskChannel,
  type AskPreviewBody,
  type AnswersSummary,
} from "../schemas";

/** Who the Ask panel opens on: which questions are ticked, and whether it is for some people only. */
export interface AskTarget {
  /** Ticked when the panel opens. Default: every question someone is missing. */
  preselect?: string[];
  /** Only these people ("Ask again"): registration uuids, or "q" and a request's uuid. Null: everyone askable. */
  refs?: string[] | null;
  /** Who those people are, in words, for the title: "Haritha". */
  who?: string | null;
}

const label = "eyebrow mb-1.5 block";
const note = "text-ink-3 text-[11.5px] leading-[1.5]";

/** A value that settles a moment after it stops changing: ticking five boxes asks for one preview, not five. */
function useSettled<T>(value: T, ms = 250): T {
  const [settled, setSettled] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return settled;
}

const newRef = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);

/**
 * Ask people for answers (missing-answers contract §2.1, §3 item 4): the
 * questions to ask (ticked as the caller opened it), how many people that
 * reaches and on which channel, the message (written for them, editable),
 * a deadline and a reminder, a preview of each channel, and Send. The first
 * send is free; a reminder counts like any message. WhatsApp goes through the
 * club's own number, behind its approved template, and is greyed out with the
 * reason when the club can't send it. A double click is one ask
 * (`client_ref`).
 */
export function AskPanel({ eventId, target, onOpenChange, onSent }: { eventId: number; target: AskTarget | null; onOpenChange: (open: boolean) => void; onSent?: (ask: AnswerAsk) => void }) {
  const open = target !== null;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="bg-surface w-full gap-0 p-0 sm:max-w-[560px]">
        {target ? <AskForm eventId={eventId} target={target} onClose={() => onOpenChange(false)} onSent={onSent} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function AskForm({ eventId, target, onClose, onSent }: { eventId: number; target: AskTarget; onClose: () => void; onSent?: (ask: AnswerAsk) => void }) {
  const summary = useAnswersSummary(eventId);
  const s = summary.data;
  const title = target.refs?.length ? `Ask ${target.who?.trim() || peopleWord(target.refs.length)} again` : "Ask for missing answers";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SheetHeader className="border-line-soft border-b px-5 py-4">
        <SheetTitle className="text-ink text-[16px]">{title}</SheetTitle>
        <SheetDescription className="text-ink-3 text-[12.5px]">
          One message with a personal link: they add only what you ask for, no sign-in needed, and their ticket stays as it is. The first send is free; a reminder counts as a message.
        </SheetDescription>
      </SheetHeader>
      {summary.isPending ? (
        <div className="grid gap-3 px-5 py-4" aria-busy="true">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
        </div>
      ) : summary.isError || !s ? (
        <div className="px-5 py-6">
          <EmptyState
            size="sm"
            title={s === null ? "Asking for answers isn't available yet" : "The questions could not load"}
            description={s === null ? "It arrives with the next update of MyOtherApp. Nothing here needs you." : "Close this and try again in a moment."}
          />
        </div>
      ) : s.questions.length === 0 ? (
        <div className="px-5 py-6">
          <EmptyState size="sm" title="This event asks no questions" description="Add questions under Settings first, then ask the people already signed up to answer them." />
        </div>
      ) : (
        <AskFields eventId={eventId} target={target} summary={s} onClose={onClose} onSent={onSent} />
      )}
    </div>
  );
}

function AskFields({ eventId, target, summary, onClose, onSent }: { eventId: number; target: AskTarget; summary: AnswersSummary; onClose: () => void; onSent?: (ask: AnswerAsk) => void }) {
  const id = React.useId();
  const event = useEventDetail(eventId);
  const eventSummary = useEventSummary(eventId);
  const eventName = event.data?.name ?? "Your event";
  const create = useCreateAsk(eventId);
  const [now] = React.useState(() => new Date());
  const refs = target.refs?.length ? target.refs : null;

  const formKeys = summary.questions.map((q) => q.key);
  const [picked, setPicked] = React.useState<ReadonlySet<string>>(() => {
    const wanted = target.preselect?.filter((k) => formKeys.includes(k));
    if (wanted?.length) return new Set(wanted.slice(0, ASK_QUESTIONS_MAX));
    return new Set(summary.questions.filter((q) => q.missing > 0).map((q) => q.key).slice(0, ASK_QUESTIONS_MAX));
  });
  const questions = summary.questions.filter((q) => picked.has(q.key));
  const keys = questions.map((q) => q.key);
  const [includeRequests, setIncludeRequests] = React.useState(true);
  const [push, setPush] = React.useState(true);
  const [email, setEmail] = React.useState(true);
  // Null until the club chooses: then it follows whether the club's WhatsApp can send it.
  const [whatsappChoice, setWhatsappChoice] = React.useState<boolean | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [deadline, setDeadline] = React.useState("");
  const [remind, setRemind] = React.useState(true);
  const [preview, setPreview] = React.useState<AskChannel>("email");
  const [clientRef] = React.useState(newRef);

  // Settled as a string: an object made afresh each render would never settle.
  const signature = JSON.stringify({ questions: keys, include_requests: refs ? true : includeRequests, refs });
  const settled = useSettled(signature);
  const body = React.useMemo(() => JSON.parse(settled) as AskPreviewBody, [settled]);
  const reach = useAskPreview(eventId, body, true);
  const r = reach.data;
  const whatsappOn = r?.whatsapp.available ?? false;
  const whatsapp = whatsappOn && (whatsappChoice ?? true);
  const channels: AskChannel[] = [...(push ? (["push"] as const) : []), ...(email ? (["email"] as const) : []), ...(whatsapp ? (["whatsapp"] as const) : [])];
  // The message follows the number of questions until the club writes its own.
  const text = message ?? defaultAskMessage(eventName, keys.length);
  const trimmed = text.trim();
  const deadlineIssue = deadlineProblem(deadline, now, eventSummary.data?.ends_at);
  const settling = reach.isFetching || settled !== signature;
  const nobody = !!r && !settling && r.people === 0;
  const problem = !keys.length
    ? "Tick at least one question."
    : !channels.length
      ? "Pick at least one way to reach them."
      : !trimmed
        ? "Write a message."
        : trimmed.length > ASK_MESSAGE_MAX
          ? `Keep the message to ${ASK_MESSAGE_MAX} characters.`
          : deadlineIssue;
  const canSend = !problem && !nobody && !!r && !create.isPending;
  const texts = askPreviewTexts({ eventName, questions: questions.map((q) => q.label?.trim() || q.key), message: trimmed, deadline: deadlineToIso(deadline) });
  const hasRequests = summary.people.requests > 0;

  const toggle = (key: string, on: boolean) =>
    setPicked((cur) => {
      const next = new Set(cur);
      if (on && next.size < ASK_QUESTIONS_MAX) next.add(key);
      else next.delete(key);
      return next;
    });

  // A second press before the first has said it is pending sends nothing more (the server dedupes on client_ref too).
  const sending = React.useRef(false);
  const send = () => {
    if (!canSend || sending.current) return;
    sending.current = true;
    create.mutate(
      {
        questions: keys,
        channels,
        message: trimmed,
        deadline: deadlineToIso(deadline),
        remind_after_hours: remind ? REMIND_AFTER_HOURS : null,
        include_requests: refs ? true : includeRequests,
        refs,
        client_ref: clientRef,
      },
      {
        onSuccess: (ask) => {
          onSent?.(ask);
          onClose();
        },
        onSettled: () => {
          sending.current = false;
        },
      },
    );
  };

  const reachLine = (c: AskChannel) => (r ? `${formatNumber(r.reach[c])} can get it` : "Counting…");

  return (
    <>
      <div className="grid min-h-0 flex-1 content-start gap-5 overflow-y-auto px-5 py-4">
        <fieldset className="grid gap-1.5">
          <legend className={label}>What to ask</legend>
          <ul className="border-line-soft divide-line-soft divide-y rounded-xl border">
            {summary.questions.map((q) => {
              const on = picked.has(q.key);
              const boxId = `${id}-q-${q.key}`;
              return (
                <li key={q.key} className="flex items-start gap-2.5 px-3 py-2.5">
                  <Checkbox id={boxId} checked={on} onCheckedChange={(v) => toggle(q.key, v === true)} disabled={!on && picked.size >= ASK_QUESTIONS_MAX} className="mt-0.5" />
                  <label htmlFor={boxId} className="min-w-0 flex-1 cursor-pointer">
                    <span className="text-ink block text-[13px] font-medium [overflow-wrap:anywhere]">{q.label?.trim() || q.key}</span>
                    <span className="text-ink-3 block text-[11.5px]">
                      {q.missing > 0 ? `${peopleWord(q.missing)} missing` : q.blank + q.invalid > 0 ? `${peopleWord(q.blank + q.invalid)} left it blank` : "everyone has answered"}
                      {q.required ? " · must be answered" : " · optional"}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          <p className={note}>Only people who haven&apos;t answered a ticked question are asked, and only for what they haven&apos;t answered.</p>
        </fieldset>

        <section aria-labelledby={`${id}-who`} className="grid gap-2">
          <span id={`${id}-who`} className={label}>
            Who it reaches
          </span>
          <p className="text-ink m-0 text-[14px] font-semibold" aria-live="polite">
            {!keys.length ? "Tick a question" : !r ? (reach.isError ? "Couldn't count who this reaches" : "Counting…") : peopleWord(r.people)}
            {r && settling ? <Loader2Icon aria-hidden="true" className="text-ink-3 ml-1.5 inline size-3.5 animate-spin" /> : null}
          </p>
          {!r && reach.isError ? (
            <p className={cn(note, "flex flex-wrap items-center gap-2")}>
              Nothing is sent until it&apos;s counted.
              <Button type="button" size="xs" variant="secondary" onClick={() => void reach.refetch()}>
                Try again
              </Button>
            </p>
          ) : null}
          {refs ? (
            <p className={note}>Only {target.who?.trim() || peopleWord(refs.length)}, if they still haven&apos;t answered.</p>
          ) : hasRequests ? (
            <label className="flex items-center gap-2 text-[12.5px]">
              <Switch checked={includeRequests} onCheckedChange={setIncludeRequests} aria-label="Include registrations under review" />
              <span className="text-ink-2">Include registrations under review ({formatNumber(summary.people.requests)})</span>
            </label>
          ) : null}
          {nobody ? (
            <Notice tone="neutral" tag="Nobody">
              Everyone has answered {keys.length === 1 ? "this question" : "these questions"}. Tick another, or there&apos;s nothing to ask.
            </Notice>
          ) : null}
        </section>

        <fieldset className="grid gap-2">
          <legend className={label}>How</legend>
          <ChannelRow id={`${id}-push`} icon={<BellIcon />} name={CHANNEL_LABEL.push} line={reachLine("push")} checked={push} onChange={setPush} />
          <ChannelRow id={`${id}-email`} icon={<MailIcon />} name={CHANNEL_LABEL.email} line={reachLine("email")} checked={email} onChange={setEmail} />
          <ChannelRow
            id={`${id}-whatsapp`}
            icon={<MessageCircleIcon />}
            name={CHANNEL_LABEL.whatsapp}
            line={!r ? "Checking your club's WhatsApp…" : whatsappOn ? `${formatNumber(r.reach.whatsapp)} can get it · from your club's number` : whatsappReason(r.whatsapp.reason)}
            checked={whatsapp}
            disabled={!whatsappOn}
            onChange={(v) => setWhatsappChoice(v)}
            extra={
              r && !whatsappOn && r.whatsapp.reason && r.whatsapp.reason !== "NO_FEATURE" ? (
                <Link href={r.whatsapp.reason === "NOT_CONNECTED" ? "/whatsapp/settings" : "/whatsapp/templates"} className="text-brand hover:underline">
                  {r.whatsapp.reason === "NOT_CONNECTED" ? "Connect WhatsApp" : "WhatsApp templates"}
                </Link>
              ) : null
            }
          />
        </fieldset>

        <div>
          <label htmlFor={`${id}-message`} className={label}>
            Message
          </label>
          <textarea
            id={`${id}-message`}
            className="input min-h-[92px] w-full py-2"
            value={text}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            aria-describedby={`${id}-message-help`}
          />
          <div id={`${id}-message-help`} className={cn(note, "mt-1 flex justify-between gap-3")}>
            <span>Plain text. The questions and the link are added under it.</span>
            <span className={cn("shrink-0 font-mono tabular-nums", trimmed.length > ASK_MESSAGE_MAX && "text-refuse")}>
              {trimmed.length} / {ASK_MESSAGE_MAX}
            </span>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={`${id}-deadline`} className={label}>
              Deadline <span className="text-ink-3 font-normal normal-case">— optional</span>
            </label>
            <input id={`${id}-deadline`} type="datetime-local" className="input h-9 w-full" value={deadline} onChange={(e) => setDeadline(e.target.value)} aria-invalid={!!deadlineIssue} aria-describedby={`${id}-deadline-help`} />
            <p id={`${id}-deadline-help`} className={cn(note, "mt-1", deadlineIssue && "text-refuse")}>
              {deadlineIssue ?? "The link closes then. Without one, it stays open until the event."}
            </p>
          </div>
          <div>
            <span className={label}>Reminder</span>
            <label className="flex items-center gap-2 text-[12.5px]">
              <Switch checked={remind} onCheckedChange={setRemind} aria-label={`Remind them after ${REMIND_AFTER_HOURS} hours`} />
              <span className="text-ink-2">Remind them after {REMIND_AFTER_HOURS} hours</span>
            </label>
            <p className={cn(note, "mt-1")}>Only those who still haven&apos;t answered. A reminder counts as a message.</p>
          </div>
        </div>

        <section aria-labelledby={`${id}-preview`} className="grid gap-2">
          <span id={`${id}-preview`} className={label}>
            Preview
          </span>
          <Segmented
            label="Preview"
            value={preview}
            onChange={setPreview}
            options={[
              { value: "email", label: "Email" },
              { value: "push", label: "App" },
              { value: "whatsapp", label: "WhatsApp" },
            ]}
          />
          <div className="bg-sunken text-ink-2 rounded-xl px-3.5 py-3 text-[12.5px] leading-[1.55]" data-testid="ask-preview">
            {preview === "email" ? (
              <>
                <p className="text-ink m-0 font-semibold">{texts.email.subject}</p>
                <p className="mt-2 mb-0 whitespace-pre-wrap">{texts.email.body || "…"}</p>
                <ul className="mt-2 mb-0 list-disc pl-5">
                  {texts.email.items.map((q) => (
                    <li key={q}>{q}</li>
                  ))}
                </ul>
                {texts.email.deadline ? <p className="mt-2 mb-0">{texts.email.deadline}</p> : null}
                <span className="bg-brand mt-3 inline-block rounded-lg px-3 py-1.5 text-[12px] font-medium text-brand-foreground">{texts.email.button}</span>
              </>
            ) : preview === "push" ? (
              <>
                <p className="text-ink m-0 font-semibold">{texts.push.title}</p>
                <p className="mt-1 mb-0 whitespace-pre-wrap">{texts.push.body || "…"}</p>
                <p className={cn(note, "mt-2 mb-0")}>Opens their personal link in the app.</p>
              </>
            ) : (
              <>
                <p className="m-0">{texts.whatsapp.body}</p>
                <span className="border-line text-brand mt-2 inline-block rounded-lg border px-3 py-1 text-[12px] font-medium">{texts.whatsapp.button}</span>
                <p className={cn(note, "mt-2 mb-0")}>Your approved “details_needed” template; your message isn&apos;t part of it.{whatsappOn ? "" : " Not sent until your club's WhatsApp can send it."}</p>
              </>
            )}
          </div>
        </section>
      </div>

      <SheetFooter className="border-line-soft flex-row flex-wrap items-center gap-2 border-t px-5 py-3">
        <span className={cn(note, "min-w-0 flex-1", problem && keys.length ? "text-caution" : null)} role="status">
          {problem ?? (r && !settling ? `${peopleWord(r.people)} · ${channels.map((c) => CHANNEL_LABEL[c].toLowerCase()).join(", ")}` : "")}
        </span>
        <Button type="button" variant="ghost" onClick={onClose} disabled={create.isPending}>
          Cancel
        </Button>
        <Button type="button" onClick={send} disabled={!canSend}>
          {create.isPending ? <Loader2Icon className="animate-spin" /> : <SendIcon />}
          {create.isPending ? "Sending…" : r && !settling && r.people > 0 ? `Send to ${peopleWord(r.people)}` : "Send"}
        </Button>
      </SheetFooter>
    </>
  );
}

function ChannelRow({ id, icon, name, line, checked, disabled, onChange, extra }: { id: string; icon: React.ReactNode; name: string; line: string; checked: boolean; disabled?: boolean; onChange: (on: boolean) => void; extra?: React.ReactNode }) {
  return (
    <div className={cn("border-line-soft flex items-start gap-2.5 rounded-xl border px-3 py-2.5", disabled && "opacity-70")}>
      <Checkbox id={id} checked={checked} disabled={disabled} onCheckedChange={(v) => onChange(v === true)} className="mt-0.5" aria-describedby={`${id}-line`} />
      <span aria-hidden="true" className="text-ink-3 mt-0.5 [&>svg]:size-4">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <label htmlFor={id} className={cn("text-ink block text-[13px] font-medium", !disabled && "cursor-pointer")}>
          {name}
        </label>
        <span id={`${id}-line`} className="text-ink-3 block text-[11.5px]">
          {line}
          {extra ? <> {extra}</> : null}
        </span>
      </span>
    </div>
  );
}
