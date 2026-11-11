"use client";

import * as React from "react";
import { Loader2Icon, PaperclipIcon, SendIcon, XIcon } from "lucide-react";
import { Button, Input, Label, NativeSelect, Notice, Textarea, cn } from "@moa/ui";

import { useMyClub } from "@/features/club";

import { lastPage } from "../last-page";
import { useHelpTopics, useSendRequest } from "../queries";
import { FILE_ACCEPT, MAX_FILES, MESSAGE_MAX, fileProblem, requestContext } from "../schemas";

/** Up to three screenshots or PDFs, each checked as it is picked. */
export function FilePicker({ files, onChange, disabled }: { files: File[]; onChange: (files: File[]) => void; disabled?: boolean }) {
  const [problem, setProblem] = React.useState<string | null>(null);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        {files.map((f, i) => (
          <span key={`${f.name}-${i}`} className="border-line bg-sunken inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[12px]">
            <PaperclipIcon className="size-3.5" aria-hidden="true" />
            {f.name}
            <button type="button" aria-label={`Remove ${f.name}`} className="text-ink-3 hover:text-ink" onClick={() => onChange(files.filter((_, j) => j !== i))}>
              <XIcon className="size-3" />
            </button>
          </span>
        ))}
        {files.length < MAX_FILES ? (
          <label className={cn("btn btn-ghost btn-sm cursor-pointer", disabled && "pointer-events-none opacity-50")}>
            <PaperclipIcon className="size-4" aria-hidden="true" />
            Add a screenshot
            <input
              type="file"
              multiple
              accept={FILE_ACCEPT}
              className="sr-only"
              aria-label="Add screenshots"
              disabled={disabled}
              onChange={(e) => {
                const picked = Array.from(e.currentTarget.files ?? []);
                e.currentTarget.value = "";
                const bad = picked.map(fileProblem).find(Boolean) ?? null;
                const ok = picked.filter((f) => !fileProblem(f));
                const room = MAX_FILES - files.length;
                setProblem(bad ?? (ok.length > room ? `Three files at most: the first ${room} were added.` : null));
                onChange([...files, ...ok.slice(0, room)]);
              }}
            />
          </label>
        ) : null}
      </div>
      <p className={cn("m-0 text-[12px]", problem ? "text-refuse" : "text-ink-3")} role={problem ? "alert" : undefined}>
        {problem ?? "Up to 3 pictures (PNG, JPG, WebP) or PDFs, 5 MB each."}
      </p>
    </div>
  );
}

/**
 * Ask MyOtherApp for help: a topic, a line, what happened, screenshots. The
 * page the club came from and the club go with it, so nobody has to ask
 * "where were you?". Card-like numbers are masked by the server too, but the
 * form says first: never send passwords, OTPs or card numbers.
 */
export function HelpForm({ onSent }: { onSent: (id: number) => void }) {
  const topics = useHelpTopics();
  const club = useMyClub();
  const send = useSendRequest();
  const [topic, setTopic] = React.useState("");
  const [subject, setSubject] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [files, setFiles] = React.useState<File[]>([]);
  const [from] = React.useState(() => lastPage());
  const ready = topic && message.trim().length > 0;
  return (
    <form
      className="flex max-w-2xl flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ready) return;
        send.mutate(
          {
            topic,
            ...(subject.trim() ? { subject: subject.trim() } : {}),
            message: message.trim(),
            files,
            context: requestContext(from, window.location.origin, club.data?.id),
          },
          { onSuccess: (created) => onSent(created.id) }
        );
      }}
    >
      <Notice tone="caution" tag="Keep it safe">
        Never send passwords, OTPs or card numbers. We will never ask for them.
      </Notice>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="help-topic">What it&apos;s about</Label>
          <NativeSelect id="help-topic" value={topic} onChange={(e) => setTopic(e.target.value)}>
            <option value="">Pick a topic</option>
            {(topics.data ?? []).map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="help-subject">In a line (optional)</Label>
          <Input id="help-subject" value={subject} maxLength={200} placeholder="Ticket emails not arriving" onChange={(e) => setSubject(e.target.value)} />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="help-message">What happened</Label>
        <Textarea id="help-message" rows={7} value={message} maxLength={MESSAGE_MAX} placeholder="What you did, what you expected, and what happened instead." onChange={(e) => setMessage(e.target.value)} />
        <p className="text-ink-3 m-0 flex justify-between text-[12px]">
          <span>{from ? `We'll attach the page you were on (${from}) and your club.` : "We'll attach your club."}</span>
          <span className="font-mono tabular-nums">
            {message.length}/{MESSAGE_MAX}
          </span>
        </p>
      </div>
      <FilePicker files={files} onChange={setFiles} disabled={send.isPending} />
      <Button type="submit" className="self-start" disabled={!ready || send.isPending}>
        {send.isPending ? <Loader2Icon className="animate-spin" /> : <SendIcon />}
        Send to MyOtherApp
      </Button>
    </form>
  );
}
