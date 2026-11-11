"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRightIcon } from "lucide-react";
import { relativeTime } from "@moa/app-kit";
import { EmptyState, SearchField, Skeleton, StatusBadge, TabRail } from "@moa/ui";

import { useHelpAnswers, useHelpTopics, useRequests } from "../queries";
import { STATUS_TONE, statusLabel, type HelpAnswer } from "../schemas";
import { HelpForm } from "./help-form";

type Tab = "answers" | "ask" | "requests";

function Answers({ answers, topicLabel, onAsk }: { answers: HelpAnswer[]; topicLabel: (k: string | null | undefined) => string; onAsk: () => void }) {
  const [q, setQ] = React.useState("");
  const needle = q.trim().toLowerCase();
  const shown = needle ? answers.filter((a) => `${a.question} ${a.answer}`.toLowerCase().includes(needle)) : answers;
  const groups = new Map<string, HelpAnswer[]>();
  for (const a of shown) {
    const k = topicLabel(a.topic);
    groups.set(k, [...(groups.get(k) ?? []), a]);
  }
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <SearchField label="Search the answers" placeholder="Search the answers" value={q} onChange={setQ} className="max-w-md" />
      {shown.length === 0 ? <p className="text-ink-3 m-0 text-sm">{answers.length ? "No answer matches that." : "No answers yet."}</p> : null}
      {[...groups.entries()].map(([label, list]) => (
        <section key={label} className="flex flex-col gap-2">
          <h3 className="text-ink-3 m-0 font-mono text-[11px] tracking-[0.08em] uppercase">{label}</h3>
          {list.map((a) => (
            <details key={a.id} className="border-line-soft bg-surface group rounded-xl border px-4 py-3">
              <summary className="flex cursor-pointer list-none items-center gap-2 text-[14px] font-medium">
                <ChevronRightIcon className="text-ink-3 size-4 transition-transform group-open:rotate-90" aria-hidden="true" />
                {a.question}
              </summary>
              <p className="text-ink-2 m-0 mt-2 pl-6 text-[13.5px] leading-relaxed whitespace-pre-wrap">{a.answer}</p>
            </details>
          ))}
        </section>
      ))}
      <p className="text-ink-3 m-0 text-[13px]">
        Still stuck?{" "}
        <button type="button" className="text-brand font-medium" onClick={onAsk}>
          Ask the MyOtherApp team
        </button>
      </p>
    </div>
  );
}

function Requests() {
  const { data, isPending, isError } = useRequests();
  if (isPending) return <Skeleton className="h-48 w-full" />;
  if (isError) return <EmptyState tone="muted" title="Your requests could not be read" description="Try again in a moment." />;
  if (!data || data.length === 0) return <EmptyState tone="muted" title="No requests yet" description="Anything your team asks MyOtherApp shows here, with our replies." />;
  return (
    <ul className="m-0 flex max-w-3xl list-none flex-col gap-2 p-0">
      {data.map((r) => (
        <li key={r.id}>
          <Link href={`/help/requests/${r.id}`} className="border-line-soft bg-surface hover:bg-sunken flex items-center gap-3 rounded-xl border px-4 py-3">
            {r.unread ? <span className="bg-brand size-2 shrink-0 rounded-full" aria-label="New reply" /> : <span className="size-2 shrink-0" aria-hidden="true" />}
            <span className="text-ink-3 font-mono text-[12px]">#{r.number}</span>
            <span className={r.unread ? "min-w-0 flex-1 truncate font-semibold" : "min-w-0 flex-1 truncate"}>{r.subject || "(no subject)"}</span>
            <StatusBadge tone={STATUS_TONE[r.status] ?? "default"} label={statusLabel(r.status)} />
            <span className="text-ink-3 hidden text-[12px] sm:inline">{relativeTime(r.updated_at)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * Help: MyOtherApp's answers to common questions, the request form (the
 * page the club came from and the club go with it), and the club's own
 * requests with our replies. On every plan.
 */
export function HelpPage() {
  const router = useRouter();
  const answers = useHelpAnswers();
  const topics = useHelpTopics();
  const requests = useRequests();
  const [tab, setTab] = React.useState<Tab>("answers");
  const unread = requests.data?.filter((r) => r.unread).length ?? 0;
  const topicLabel = (k: string | null | undefined) => (k ? (topics.data?.find((t) => t.key === k)?.label ?? k) : "General");
  return (
    <div className="flex flex-col gap-5">
      <TabRail
        label="Help"
        items={[
          { key: "answers", label: "Answers" },
          { key: "ask", label: "Ask for help" },
          { key: "requests", label: "Our requests", count: unread ? `${unread} new` : null },
        ]}
        value={tab}
        onChange={(k) => setTab(k as Tab)}
      />
      {tab === "answers" ? answers.isPending ? <Skeleton className="h-48 w-full" /> : <Answers answers={answers.data ?? []} topicLabel={topicLabel} onAsk={() => setTab("ask")} /> : null}
      {tab === "ask" ? <HelpForm onSent={(id) => router.push(`/help/requests/${id}`)} /> : null}
      {tab === "requests" ? <Requests /> : null}
    </div>
  );
}
