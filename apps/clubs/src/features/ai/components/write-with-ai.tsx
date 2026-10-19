"use client";

import * as React from "react";
import Link from "next/link";
import { Loader2Icon, RefreshCwIcon, SparklesIcon } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, NativeSelect, Notice, Segmented, cn } from "@moa/ui";

import { LockBadge } from "@/features/plan";

import { useAiGate, useAiWrite } from "../queries";
import {
  AI_KEY_PATH,
  LANGUAGES,
  TONES,
  WRITE_KINDS,
  WRITE_KIND_HINT,
  WRITE_KIND_LABEL,
  WRITE_PROMPT_MAX,
  aiProblem,
  promptWithContext,
  type AiProblem,
  type AiStatus,
  type Language,
  type Tone,
  type WriteKind,
  type WriteResult,
} from "../schemas";
import { AiUsageMeter } from "./ai-usage";

/**
 * "Write with AI", beside a text editor: say what it should say, in which
 * language and tone, and get words to look at before they go anywhere.
 * Insert adds them after what is there; Replace swaps it out; Try again
 * asks for another go. With an email it fills the subject too (always on
 * Replace, only when empty on Insert). Nothing is saved: the editor's own
 * Save or Send still does that.
 */
export interface WriteWithAiProps {
  /** What it writes; preset by where it was opened, and changeable in the dialog. */
  kind: WriteKind;
  /** The saved event the words are about, so the server can read it. */
  eventId?: number | null;
  /** The editor's text now. */
  value: string;
  onChange: (next: string) => void;
  /** An email's (or an announcement's title) line, filled from the reply's `subject`. */
  subject?: { value: string; onChange: (next: string) => void };
  /** What the page already knows about an event not saved yet: added to the prompt when there is no `eventId`. Read when the words are asked for. */
  context?: string | (() => string);
  /** The editor's own limit; longer words are cut to it. */
  maxLength?: number;
  className?: string;
}

export function WriteWithAi(props: WriteWithAiProps) {
  const gate = useAiGate();
  const [open, setOpen] = React.useState(false);
  if (!gate.visible) return null;

  const trigger = (
    <button type="button" className={cn("btn btn-ghost btn-xs text-brand shrink-0", props.className)} onClick={gate.locked ? gate.prompt : undefined}>
      <SparklesIcon className="size-3.5" aria-hidden="true" /> Write with AI
      {gate.locked ? <LockBadge lock={gate.lock} /> : null}
    </button>
  );
  if (gate.locked) return trigger;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      {/* Mounted only while open, so each opening starts clean and a closed dialog's request is stopped. */}
      {open ? <WriteDialog {...props} status={gate.status} onDone={() => setOpen(false)} /> : null}
    </Dialog>
  );
}

const label = "eyebrow mb-1.5 block";

function WriteDialog({ kind: preset, eventId, value, onChange, subject, context, maxLength, status, onDone }: WriteWithAiProps & { status: AiStatus | undefined; onDone: () => void }) {
  const write = useAiWrite();
  const [kind, setKind] = React.useState<WriteKind>(preset);
  const [language, setLanguage] = React.useState<Language>("en");
  const [tone, setTone] = React.useState<Tone>("friendly");
  const [prompt, setPrompt] = React.useState("");
  const [result, setResult] = React.useState<WriteResult | null>(null);
  const [problem, setProblem] = React.useState<AiProblem | null>(null);
  const abort = React.useRef<AbortController | null>(null);
  const resultHeading = React.useRef<HTMLHeadingElement>(null);
  const ids = React.useId();

  // Closing the dialog stops a request still on its way.
  React.useEffect(() => () => abort.current?.abort(), []);

  const busy = write.isPending;
  const known = () => (typeof context === "function" ? context() : (context ?? ""));
  const hasContext = Boolean(eventId) || Boolean(known().trim());
  const canWrite = !busy && (prompt.trim().length > 0 || hasContext);

  const run = async () => {
    setProblem(null);
    const ctl = new AbortController();
    abort.current = ctl;
    try {
      const r = await write.mutateAsync({
        input: { kind, language, tone, prompt: promptWithContext(prompt, eventId ? null : known()), event_id: eventId ?? null },
        signal: ctl.signal,
      });
      setResult(r);
      // The words are what the organiser came for: take focus there, so a screen reader reads them next.
      requestAnimationFrame(() => resultHeading.current?.focus());
    } catch (error) {
      if (!ctl.signal.aborted) setProblem(aiProblem(error, status));
    }
  };

  const apply = (how: "insert" | "replace") => {
    if (!result) return;
    const words = result.text.trim();
    const next = how === "replace" || !value.trim() ? words : `${value.trimEnd()}\n\n${words}`;
    onChange(maxLength ? next.slice(0, maxLength) : next);
    if (subject && result.subject && (how === "replace" || !subject.value.trim())) subject.onChange(result.subject);
    onDone();
  };

  const live = busy ? "Writing…" : problem ? problem.text : result ? "The words are ready. Insert them, replace what is there, or try again." : "";

  return (
    <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[560px]">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <SparklesIcon className="text-brand size-4" aria-hidden="true" /> Write with AI
        </DialogTitle>
        <DialogDescription>
          Say what it should say. You see the words before they go into {kind === "email" ? "the email" : "the editor"}, and nothing is sent or saved until you do it.
        </DialogDescription>
      </DialogHeader>

      <form
        className="grid gap-3.5"
        noValidate
        aria-busy={busy}
        onSubmit={(e) => {
          e.preventDefault();
          // React carries a submit up through the portal: the editor's own form (an announcement's Send) must not hear it.
          e.stopPropagation();
          if (canWrite) void run();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr]">
          <div className="sm:col-span-2">
            <label htmlFor={`${ids}-kind`} className={label}>
              What it&apos;s for
            </label>
            <NativeSelect id={`${ids}-kind`} className="w-full" value={kind} onChange={(e) => setKind(e.target.value as WriteKind)} disabled={busy}>
              {WRITE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {WRITE_KIND_LABEL[k]}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div>
            <span className={label}>Language</span>
            <Segmented label="Language" value={language} options={LANGUAGES} onChange={setLanguage} />
          </div>
          <div>
            <span className={label}>Tone</span>
            <Segmented label="Tone" value={tone} options={TONES} onChange={setTone} />
          </div>
        </div>
        <div>
          <label htmlFor={`${ids}-prompt`} className={label}>
            What should it say?
          </label>
          <textarea
            id={`${ids}-prompt`}
            className="input min-h-[96px] w-full py-2 text-[14px] sm:text-[13px]"
            rows={4}
            value={prompt}
            maxLength={WRITE_PROMPT_MAX}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={WRITE_KIND_HINT[kind]}
            disabled={busy}
            aria-describedby={`${ids}-prompt-help`}
          />
          <div id={`${ids}-prompt-help`} className="text-ink-3 mt-1 flex items-baseline justify-between gap-3 text-[11.5px]">
            <span>
              {eventId ? "It reads the event's details too; add what they don't say." : hasContext ? "It knows the name, day and place you've entered." : "The facts it should use, in your own words."}
            </span>
            <span className="font-mono tabular-nums">
              {prompt.length}/{WRITE_PROMPT_MAX.toLocaleString("en-IN")}
            </span>
          </div>
        </div>

        {problem ? (
          <Notice
            tone={problem.quota || problem.plan ? "caution" : "refuse"}
            tag="AI"
            action={
              problem.keyLink ? (
                <Link href={AI_KEY_PATH} className="btn btn-secondary btn-sm" onClick={onDone}>
                  Your AI key
                </Link>
              ) : null
            }
          >
            {problem.text}
          </Notice>
        ) : null}

        {result ? (
          <section aria-labelledby={`${ids}-result`} className="bg-sunken grid gap-1.5 rounded-xl p-3">
            <h3 id={`${ids}-result`} ref={resultHeading} tabIndex={-1} className="eyebrow m-0 outline-none">
              AI&apos;s draft
            </h3>
            {result.subject ? (
              <p className="text-ink m-0 text-[13px]">
                <span className="text-ink-3">Subject: </span>
                <span className="font-medium">{result.subject}</span>
              </p>
            ) : null}
            <div data-testid="ai-write-result" className="text-ink-2 max-h-64 overflow-y-auto text-[13px] leading-[1.55] whitespace-pre-wrap">
              {result.text}
            </div>
          </section>
        ) : null}

        <p className="sr-only" role="status" aria-live="polite">
          {live}
        </p>

        <AiUsageMeter status={status} />

        <DialogFooter className="gap-2">
          {result ? (
            <>
              <button type="submit" className="btn btn-ghost" disabled={!canWrite}>
                {busy ? <Loader2Icon className="size-4 animate-spin" /> : <RefreshCwIcon className="size-4" />} {busy ? "Writing…" : "Try again"}
              </button>
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => apply("replace")}>
                Replace
              </button>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => apply("insert")}>
                Insert
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn btn-ghost" onClick={() => (busy ? abort.current?.abort() : onDone())}>
                {busy ? "Stop" : "Cancel"}
              </button>
              <button type="submit" className="btn btn-primary" disabled={!canWrite}>
                {busy ? <Loader2Icon className="size-4 animate-spin" /> : <SparklesIcon className="size-4" />} {busy ? "Writing…" : "Write it"}
              </button>
            </>
          )}
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
