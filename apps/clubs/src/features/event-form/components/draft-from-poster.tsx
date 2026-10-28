"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useFormContext, useFormState } from "react-hook-form";
import { FileTextIcon, ImagePlusIcon, Loader2Icon, SparklesIcon, XIcon } from "lucide-react";
import { useObjectUrl } from "@moa/ui/hooks";
import { Checkbox, ChoiceCard, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, Notice, cn } from "@moa/ui";

import { AI_KEY_PATH, AiUsageMeter, DRAFT_FILE_ACCEPT, DRAFT_TEXT_MAX, aiProblem, draftFileProblem, shrinkForUpload, useAiGate, useEventDraft, type AiProblem, type AiStatus } from "@/features/ai";
import { isPicture } from "@/lib/images";
import { LockBadge, useFeatureGate } from "@/features/plan";
import { useTopicTree } from "@/features/topics";

import { draftToFormValues } from "../mapper";
import { useEventCategories } from "../queries";
import type { EventFormValues } from "../schemas";

/**
 * "Create from poster or message", at the top of a new event: drop the
 * poster (or a PDF), paste the WhatsApp message, or both, and AI fills in
 * the form. What the organiser already typed stays unless they choose
 * Replace; the fields AI filled are marked until they are changed; what AI
 * could not find comes back as warnings over the form. Nothing is saved:
 * Save as draft and Publish still do that.
 */
export interface DraftApplied {
  patch: Partial<EventFormValues>;
  /** The server's warnings ("No date found in the poster. Please set it."). */
  warnings: string[];
  /** What the dashboard could not place (a fee on a plan without paid entry, an unknown kind of event). */
  notes: string[];
}

export function DraftFromPoster({ onApplied, onDone }: { onApplied: (result: DraftApplied) => void; onDone?: () => void }) {
  const gate = useAiGate();
  const [open, setOpen] = React.useState(false);
  const applied = React.useRef(false);
  if (!gate.visible) return null;

  const button = (
    <button type="button" className="btn btn-primary w-full shrink-0 sm:w-auto" onClick={gate.locked ? gate.prompt : undefined}>
      <SparklesIcon className="size-4" aria-hidden="true" /> Create from poster or message
      {gate.locked ? <LockBadge lock={gate.lock} className="bg-surface/90" /> : null}
    </button>
  );

  return (
    <section aria-labelledby="ai-draft-title" className="border-brand-line bg-brand-soft/60 flex flex-col gap-3 rounded-[var(--radius-card)] border p-4 sm:flex-row sm:items-center">
      <span className="bg-surface text-brand shadow-card hidden size-10 shrink-0 place-items-center rounded-xl sm:grid" aria-hidden="true">
        <SparklesIcon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 id="ai-draft-title" className="text-ink m-0 text-[15px] font-semibold tracking-[-0.01em]">
          Start from your poster or message
        </h2>
        <p className="text-ink-2 m-0 mt-0.5 text-[12.5px] leading-[1.5]">
          Drop the poster or paste the WhatsApp message. AI fills in the form below for you to check, and nothing is saved until you save.
        </p>
      </div>
      {gate.locked ? (
        button
      ) : (
        <Dialog
          open={open}
          onOpenChange={(next) => {
            if (next) applied.current = false;
            setOpen(next);
          }}
        >
          <DialogTrigger asChild>{button}</DialogTrigger>
          {open ? (
            <DraftDialog
              status={gate.status}
              onApplied={(result) => {
                applied.current = true;
                onApplied(result);
                setOpen(false);
              }}
              onCancel={() => setOpen(false)}
              // After a fill, focus goes to what AI did (and what to check), not back to this button.
              onCloseAutoFocus={(e) => {
                if (!applied.current || !onDone) return;
                e.preventDefault();
                onDone();
              }}
            />
          ) : null}
        </Dialog>
      )}
    </section>
  );
}

const STEPS_IMAGE = ["Reading your poster…", "Finding the date, the venue and the fee…", "Filling in the form…"];
const STEPS_PDF = ["Reading your PDF…", "Finding the date, the venue and the fee…", "Filling in the form…"];
const STEPS_TEXT = ["Reading your message…", "Finding the date, the venue and the fee…", "Filling in the form…"];

const size = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

function DraftDialog({
  status,
  onApplied,
  onCancel,
  onCloseAutoFocus,
}: {
  status: AiStatus | undefined;
  onApplied: (result: DraftApplied) => void;
  onCancel: () => void;
  onCloseAutoFocus: (e: Event) => void;
}) {
  const form = useFormContext<EventFormValues>();
  const { dirtyFields } = useFormState({ control: form.control });
  const categories = useEventCategories();
  const tree = useTopicTree();
  const tickets = useFeatureGate("tickets");
  const draft = useEventDraft();
  const ids = React.useId();
  const [file, setFile] = React.useState<File | null>(null);
  const [fileProblem, setFileProblem] = React.useState<string | null>(null);
  const [text, setText] = React.useState("");
  const [usePoster, setUsePoster] = React.useState(true);
  const [mode, setMode] = React.useState<"keep" | "replace">("keep");
  const [problem, setProblem] = React.useState<AiProblem | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const [step, setStep] = React.useState(0);
  const abort = React.useRef<AbortController | null>(null);
  const isImage = Boolean(file && isPicture(file));
  const preview = useObjectUrl(isImage ? (file ?? undefined) : undefined);
  // Anything the organiser has changed: the contact filled from the club is not counted.
  const typed = Object.keys(dirtyFields).length > 0;
  const busy = draft.isPending;
  const ready = !busy && (Boolean(file) || text.trim().length > 0);
  const copy = file ? (isImage ? STEPS_IMAGE : STEPS_PDF) : STEPS_TEXT;

  // The progress line moves on while the request is out; it says what is happening, not how far.
  React.useEffect(() => {
    if (!busy) return;
    const t = window.setInterval(() => setStep((s) => Math.min(s + 1, 2)), 2500);
    return () => window.clearInterval(t);
  }, [busy]);
  // Closing the dialog stops a request still on its way.
  React.useEffect(() => () => abort.current?.abort(), []);

  const pick = (f: File | null | undefined) => {
    if (!f) return;
    const why = draftFileProblem(f);
    setFileProblem(why);
    setProblem(null);
    setFile(why ? null : f);
  };

  const run = async () => {
    setProblem(null);
    setStep(0);
    const ctl = new AbortController();
    abort.current = ctl;
    try {
      const upload = file ? await shrinkForUpload(file) : null;
      const res = await draft.mutateAsync({ text, file: upload, signal: ctl.signal });
      const fill = draftToFormValues(res.draft, {
        current: form.getValues(),
        dirty: new Set(Object.keys(form.formState.dirtyFields)),
        mode: typed ? mode : "replace",
        categories: categories.data ?? [],
        tree: tree.data,
        feeLocked: tickets.locked,
        // The picture as sent: a HEIC or an SVG is already a JPEG or a PNG here.
        poster: isImage && usePoster ? (upload ?? file) : null,
      });
      onApplied({ patch: fill.patch, warnings: res.warnings, notes: fill.notes });
    } catch (error) {
      if (!ctl.signal.aborted) setProblem(aiProblem(error, status));
    }
  };

  return (
    <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[600px]" onCloseAutoFocus={onCloseAutoFocus}>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <SparklesIcon className="text-brand size-4" aria-hidden="true" /> Create from poster or message
        </DialogTitle>
        <DialogDescription>AI reads it and fills in the form. You check every field before anything is saved.</DialogDescription>
      </DialogHeader>

      <form
        className="grid gap-4"
        noValidate
        aria-busy={busy}
        onSubmit={(e) => {
          e.preventDefault();
          // React carries a submit up through the portal; the event form must not hear it.
          e.stopPropagation();
          if (ready) void run();
        }}
      >
        <div>
          <span className="eyebrow mb-1.5 block" id={`${ids}-file-label`}>
            Poster or PDF
          </span>
          {file ? (
            <div className="border-line-soft bg-sunken flex items-center gap-3 rounded-xl border p-2.5">
              {isImage && preview ? (
                <span className="bg-surface relative block h-28 w-24 shrink-0 overflow-hidden rounded-lg">
                  <Image src={preview} alt="The poster you chose" fill sizes="96px" className="object-contain" unoptimized />
                </span>
              ) : (
                <span className="bg-surface text-ink-2 grid size-14 shrink-0 place-items-center rounded-lg" aria-hidden="true">
                  <FileTextIcon className="size-6" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-ink m-0 truncate text-[13px] font-medium">{file.name}</p>
                <p className="text-ink-3 m-0 text-[12px]">
                  {isImage ? "Image" : "PDF"} · {size(file.size)}
                </p>
                {isImage ? (
                  <label className="text-ink-2 mt-2 flex items-center gap-2 text-[12.5px]">
                    <Checkbox checked={usePoster} onCheckedChange={(v) => setUsePoster(v === true)} disabled={busy} aria-describedby={`${ids}-poster-hint`} />
                    Use it as the event&apos;s poster
                  </label>
                ) : null}
                <span id={`${ids}-poster-hint`} className="sr-only">
                  The picture on the event card and at the top of its page.
                </span>
              </div>
              <button type="button" className="btn btn-ghost btn-icon btn-sm shrink-0" onClick={() => setFile(null)} disabled={busy} aria-label={`Remove ${file.name}`}>
                <XIcon className="size-4" />
              </button>
            </div>
          ) : (
            <label
              className={cn(
                "border-line hover:border-brand hover:bg-sunken has-[input:focus-visible]:ring-brand flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border border-dashed px-4 py-7 text-center transition-colors has-[input:focus-visible]:ring-2",
                dragging && "border-brand bg-brand-soft",
              )}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                pick(e.dataTransfer.files?.[0]);
              }}
            >
              <ImagePlusIcon className="text-ink-3 size-6" aria-hidden="true" />
              <span className="text-ink text-[13px] font-medium">Drop the poster here, or choose a file</span>
              <span className="text-ink-3 text-[11.5px]">A picture (JPG, PNG, HEIC…) or a PDF, up to 10 MB</span>
              <input
                type="file"
                accept={DRAFT_FILE_ACCEPT}
                className="sr-only"
                aria-labelledby={`${ids}-file-label`}
                aria-describedby={fileProblem ? `${ids}-file-problem` : undefined}
                disabled={busy}
                onChange={(e) => {
                  pick(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
          )}
          {fileProblem ? (
            <p id={`${ids}-file-problem`} role="alert" className="text-refuse mt-1.5 text-[12px]">
              {fileProblem}
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor={`${ids}-text`} className="eyebrow mb-1.5 block">
            {file ? "Anything to add? · optional" : "Or paste the message"}
          </label>
          <textarea
            id={`${ids}-text`}
            className="input min-h-[120px] w-full py-2 text-[14px] sm:text-[13px]"
            rows={5}
            value={text}
            maxLength={DRAFT_TEXT_MAX}
            onChange={(e) => setText(e.target.value)}
            disabled={busy}
            placeholder={"🚀 Hack Night 05: Edge AI\n📅 Sat 8 Nov, 6 pm to 10 pm\n📍 Seminar Hall, CET\n🎟️ ₹100 · 60 seats · register at the link"}
          />
          <p className="text-ink-3 m-0 mt-1 text-right font-mono text-[11px] tabular-nums">
            {text.length.toLocaleString("en-IN")}/{DRAFT_TEXT_MAX.toLocaleString("en-IN")}
          </p>
        </div>

        {typed ? (
          <div>
            <span className="eyebrow mb-1.5 block">You&apos;ve started the form</span>
            <div className="grid gap-1.5 sm:grid-cols-2" role="radiogroup" aria-label="What happens to what you typed">
              <ChoiceCard checked={mode === "keep"} onClick={() => setMode("keep")} disabled={busy} title="Keep what I typed" hint="AI fills only the empty fields" />
              <ChoiceCard checked={mode === "replace"} onClick={() => setMode("replace")} disabled={busy} title="Replace" hint="AI's version wins where it found something" tone="caution" />
            </div>
          </div>
        ) : null}

        {busy ? (
          <div className="bg-sunken flex items-center gap-2.5 rounded-xl px-3 py-2.5">
            <Loader2Icon className="text-brand size-4 shrink-0 animate-spin" aria-hidden="true" />
            <span className="text-ink text-[13px]">{copy[step]}</span>
          </div>
        ) : null}
        <p className="sr-only" role="status" aria-live="polite">
          {busy ? copy[step] : problem ? problem.text : ""}
        </p>

        {problem && !problem.plan ? (
          <Notice
            tone={problem.quota ? "caution" : "refuse"}
            tag="AI"
            action={
              problem.keyLink ? (
                <Link href={AI_KEY_PATH} className="btn btn-secondary btn-sm">
                  Your AI key
                </Link>
              ) : null
            }
          >
            {problem.text}
          </Notice>
        ) : null}

        <AiUsageMeter status={status} />

        <DialogFooter className="gap-2">
          <button type="button" className="btn btn-ghost" onClick={() => (busy ? abort.current?.abort() : onCancel())}>
            {busy ? "Stop" : "Cancel"}
          </button>
          <button type="submit" className="btn btn-primary" disabled={!ready}>
            {busy ? <Loader2Icon className="size-4 animate-spin" /> : <SparklesIcon className="size-4" />} {busy ? "Drafting…" : "Draft my event"}
          </button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
