"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeftIcon, Loader2Icon, PaperclipIcon, SendIcon, ThumbsDownIcon, ThumbsUpIcon } from "lucide-react";
import { formatDateTime } from "@moa/app-kit";
import { Button, EmptyState, Label, Notice, Skeleton, StatusBadge, Textarea, cn } from "@moa/ui";

import { useReply, useRequest, useSurvey } from "../queries";
import { MESSAGE_MAX, STATUS_TONE, attachmentHref, statusLabel, type RequestDetail, type RequestMessage } from "../schemas";
import { FilePicker } from "./help-form";

function Message({ m }: { m: RequestMessage }) {
  const ours = m.kind === "reply_out";
  return (
    <li className={cn("flex flex-col gap-1.5 rounded-xl border px-4 py-3", ours ? "border-brand-line bg-brand-soft mr-8" : "border-line-soft bg-surface ml-8")}>
      <p className="m-0 text-[12px]">
        <span className="font-semibold">{m.author_name ?? (ours ? "MyOtherApp" : "You")}</span>
        <span className="text-ink-3"> · {formatDateTime(m.created_at)}</span>
      </p>
      <p className="m-0 text-[13.5px] leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]">{m.body_text}</p>
      {m.attachments.length > 0 ? (
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
          {m.attachments.map((a, i) => {
            const href = attachmentHref(a.url);
            return (
              <li key={`${a.name}-${i}`} className="text-[12px]">
                <PaperclipIcon className="mr-1 inline size-3.5" aria-hidden="true" />
                {href ? (
                  <a href={href} target="_blank" rel="noreferrer" className="hover:underline">
                    {a.name}
                  </a>
                ) : (
                  a.name
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
    </li>
  );
}

function ReplyBox({ request }: { request: RequestDetail }) {
  const reply = useReply(request.id);
  const [message, setMessage] = React.useState("");
  const [files, setFiles] = React.useState<File[]>([]);
  const closed = request.status === "closed";
  return (
    <form
      className="border-line-soft bg-surface flex flex-col gap-3 rounded-2xl border p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!message.trim()) return;
        reply.mutate(
          { message: message.trim(), files },
          {
            onSuccess: () => {
              setMessage("");
              setFiles([]);
            },
          }
        );
      }}
    >
      <Label htmlFor="help-reply">{closed ? "Write again (it opens a new request)" : "Reply"}</Label>
      <Textarea id="help-reply" rows={4} maxLength={MESSAGE_MAX} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Never send passwords, OTPs or card numbers." />
      <FilePicker files={files} onChange={setFiles} disabled={reply.isPending} />
      <Button type="submit" className="self-end" disabled={!message.trim() || reply.isPending}>
        {reply.isPending ? <Loader2Icon className="animate-spin" /> : <SendIcon />}
        Send
      </Button>
    </form>
  );
}

/** "Did we solve it?": once, after the team marks the request solved. No sets it going again. */
function Survey({ request }: { request: RequestDetail }) {
  const survey = useSurvey(request.id);
  const [comment, setComment] = React.useState("");
  if (request.survey && request.survey.solved !== null && request.survey.solved !== undefined) {
    return <p className="text-ink-3 m-0 text-[12.5px]">You said {request.survey.solved ? "it's solved" : "it isn't solved"}. Thank you.</p>;
  }
  const open = request.can_survey ?? (request.status === "resolved" || request.status === "closed");
  if (!open) return null;
  return (
    <section className="border-line-soft bg-surface flex flex-col gap-3 rounded-2xl border p-4" aria-label="Did we solve it?">
      <p className="m-0 text-[14px] font-medium">Did we solve it?</p>
      <Textarea aria-label="Anything to add (optional)" rows={2} maxLength={500} value={comment} placeholder="Anything to add (optional)" onChange={(e) => setComment(e.target.value)} />
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={survey.isPending} onClick={() => survey.mutate({ solved: true, comment })}>
          <ThumbsUpIcon /> Yes
        </Button>
        <Button size="sm" variant="outline" disabled={survey.isPending} onClick={() => survey.mutate({ solved: false, comment })}>
          <ThumbsDownIcon /> No
        </Button>
      </div>
    </section>
  );
}

/** One of the club's requests: the conversation with MyOtherApp, and a reply. */
export function RequestPage({ requestId }: { requestId: number }) {
  const { data, isPending, isError, error } = useRequest(requestId);
  if (isPending) return <Skeleton className="h-96 w-full" />;
  if (isError || !data) return <EmptyState tone="muted" title="This request could not be opened" description={error instanceof Error ? error.message : undefined} />;
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <Link href="/help" className="text-ink-3 hover:text-ink inline-flex items-center gap-1 text-[12.5px]">
        <ArrowLeftIcon className="size-3.5" /> Help
      </Link>
      <header className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="m-0 text-[26px] leading-tight tracking-[-0.01em]">
            <span className="text-ink-3 mr-2 font-mono text-[18px]">#{data.number}</span>
            {data.subject || "Your request"}
          </h1>
          <p className="text-ink-3 m-0 mt-1 text-[13px]">Sent {formatDateTime(data.created_at)}. Replies come here and by email.</p>
        </div>
        <StatusBadge tone={STATUS_TONE[data.status] ?? "default"} label={statusLabel(data.status)} />
      </header>
      {data.status === "waiting" ? (
        <Notice tone="accent" tag="Your turn">
          We&apos;ve answered and are waiting to hear back. If we don&apos;t hear from you in a week, the request closes.
        </Notice>
      ) : null}
      <ol className="m-0 flex list-none flex-col gap-2.5 p-0" aria-label="Conversation">
        {data.messages.map((m) => (
          <Message key={m.id} m={m} />
        ))}
      </ol>
      <Survey request={data} />
      {data.can_reply ? <ReplyBox request={data} /> : <p className="text-ink-3 m-0 text-[12.5px]">This request is too old to answer. Send a new one from Help.</p>}
    </div>
  );
}
