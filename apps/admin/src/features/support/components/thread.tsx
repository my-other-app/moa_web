"use client";

import * as React from "react";
import { LockIcon, PaperclipIcon } from "lucide-react";
import { formatDateTime } from "@moa/app-kit";
import { cn } from "@moa/ui";

import { FRAME_SANDBOX, safePath, srcdocFor, type CaseMessage } from "../schemas";

/** An inbound email's own HTML, in a sandbox with no remote images; the plain text is the default. */
function MailFrame({ html }: { html: string }) {
  const doc = React.useMemo(() => srcdocFor(html), [html]);
  return <iframe title="The email as sent" sandbox={FRAME_SANDBOX} referrerPolicy="no-referrer" srcDoc={doc} className="border-line-soft h-[360px] w-full rounded-lg border bg-white" />;
}

const SIDE: Record<string, { wrap: string; who: string }> = {
  reply_in: { wrap: "border-line-soft bg-sunken mr-8", who: "" },
  reply_out: { wrap: "border-brand-line bg-brand-soft ml-8", who: "MyOtherApp · " },
  note: { wrap: "border-caution-line bg-caution-soft", who: "Note · " },
};

function Message({ m }: { m: CaseMessage }) {
  const [formatted, setFormatted] = React.useState(false);
  if (m.kind === "system") {
    return (
      <li className="text-ink-3 py-1 text-center text-[12px]">
        {m.body_text ?? "—"} · {formatDateTime(m.created_at)}
      </li>
    );
  }
  const side = SIDE[m.kind] ?? SIDE.reply_in!;
  return (
    <li className={cn("flex flex-col gap-2 rounded-xl border px-3.5 py-3", side.wrap)} data-kind={m.kind}>
      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        {m.kind === "note" ? <LockIcon aria-hidden="true" className="text-caution size-3.5" /> : null}
        <span className="font-semibold">
          {side.who}
          {m.author_name ?? (m.kind === "reply_in" ? "Them" : "The team")}
        </span>
        <span className="text-ink-3">{formatDateTime(m.created_at)}</span>
        {m.delivery === "bounced" || m.delivery === "not_delivered" ? <span className="text-refuse font-medium">Not delivered</span> : null}
        {m.body_html && m.body_text !== null && m.body_text !== undefined ? (
          <button type="button" className="text-brand ml-auto text-[12px]" onClick={() => setFormatted((f) => !f)}>
            {formatted ? "Plain text" : "As sent"}
          </button>
        ) : null}
      </div>
      {m.body_text === null || m.body_text === undefined ? (
        <p className="text-ink-3 m-0 text-[13px] italic">Only the Support and Sales teams read what was written.</p>
      ) : formatted && m.body_html ? (
        <MailFrame html={m.body_html} />
      ) : (
        <p className="m-0 text-[13.5px] leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]">{m.body_text}</p>
      )}
      {m.attachments.length > 0 ? (
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
          {m.attachments.map((a, i) => {
            const href = a.url && (a.url.startsWith("https://") || safePath(a.url)) ? a.url : null;
            return (
              <li key={`${a.name}-${i}`}>
                {href ? (
                  <a href={href} target="_blank" rel="noreferrer" className="border-line bg-surface inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[12px] hover:underline">
                    <PaperclipIcon className="size-3.5" aria-hidden="true" />
                    {a.name}
                  </a>
                ) : (
                  <span className="text-ink-3 inline-flex items-center gap-1.5 text-[12px]">
                    <PaperclipIcon className="size-3.5" aria-hidden="true" />
                    {a.name}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
    </li>
  );
}

/** The case's conversation, oldest first: what they wrote, what we replied, the team's notes, and what happened. */
export function Thread({ messages }: { messages: CaseMessage[] }) {
  if (messages.length === 0) return <p className="text-ink-3 m-0 text-sm">No messages yet.</p>;
  return (
    <ol className="m-0 flex list-none flex-col gap-2.5 p-0" aria-label="Conversation">
      {messages.map((m) => (
        <Message key={m.id} m={m} />
      ))}
    </ol>
  );
}
