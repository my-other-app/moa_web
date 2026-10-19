"use client";

import * as React from "react";
import Link from "next/link";
import { HeartIcon, Loader2Icon, RefreshCwIcon, SparklesIcon, ThumbsDownIcon, WrenchIcon } from "lucide-react";
import { relativeTime } from "@moa/app-kit";
import { Button, CardLabel, FigurePanel, Notice, Skeleton, StatusBadge, type StatusTone } from "@moa/ui";

import { LockBadge } from "@/features/plan";

import { useAiGate, useFeedbackSummary, useRefreshFeedbackSummary } from "../queries";
import { AI_KEY_PATH, FEEDBACK_MIN_RESPONSES, SENTIMENT_LABEL, aiProblem, type FeedbackSummary, type Sentiment } from "../schemas";
import { AiUsageMeter } from "./ai-usage";

/**
 * What the replies add up to: what people loved, what they complained
 * about, what to fix next time, the overall mood and a few of their own
 * words. Made from the survey's comments, so it waits for five of them;
 * Refresh makes it again from every reply so far, and costs one AI action.
 */
const SENTIMENT_TONE: Record<Sentiment, StatusTone> = { positive: "success", mixed: "warning", negative: "destructive" };

function Section({ title, icon, items }: { title: string; icon: React.ReactNode; items: string[] }) {
  return (
    <section className="min-w-0">
      <h3 className="text-ink m-0 flex items-center gap-1.5 text-[13px] font-semibold">
        <span className="text-ink-3" aria-hidden="true">
          {icon}
        </span>
        {title}
      </h3>
      {items.length ? (
        <ul className="text-ink-2 m-0 mt-1.5 grid list-disc gap-1 pl-5 text-[12.5px] leading-[1.5]">
          {items.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      ) : (
        <p className="text-ink-3 m-0 mt-1.5 text-[12.5px]">Nothing stood out.</p>
      )}
    </section>
  );
}

function Summary({ data }: { data: FeedbackSummary & { summary: NonNullable<FeedbackSummary["summary"]> } }) {
  const s = data.summary;
  const quotes = s.quotes.slice(0, 3);
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Section title="What people loved" icon={<HeartIcon className="size-3.5" />} items={s.loved} />
        <Section title="Complaints" icon={<ThumbsDownIcon className="size-3.5" />} items={s.complaints} />
        <Section title="Fix next time" icon={<WrenchIcon className="size-3.5" />} items={s.fix_next} />
      </div>
      {quotes.length ? (
        <figure className="m-0">
          <figcaption className="eyebrow mb-1.5">In their words</figcaption>
          <ul className="m-0 grid list-none gap-2 p-0">
            {quotes.map((q) => (
              <li key={q}>
                <blockquote className="bg-sunken text-ink-2 border-brand-line m-0 rounded-lg border-l-2 px-3 py-2 text-[12.5px] leading-[1.5]">&ldquo;{q}&rdquo;</blockquote>
              </li>
            ))}
          </ul>
        </figure>
      ) : null}
    </div>
  );
}

export function FeedbackSummaryCard({ eventId }: { eventId: number }) {
  const gate = useAiGate();
  const q = useFeedbackSummary(eventId, gate.visible && !gate.locked);
  const refresh = useRefreshFeedbackSummary(eventId);
  const [now] = React.useState(() => new Date());
  if (!gate.visible) return null;

  const data = q.data;
  const problem = refresh.isError ? aiProblem(refresh.error, gate.status) : null;
  const sentiment = data?.summary?.sentiment;
  const live = refresh.isPending ? "Summarising the replies…" : q.isPending && !gate.locked ? "Loading the summary…" : refresh.isSuccess ? "Summary updated." : "";

  const refreshButton = (label: string) => (
    <Button size="sm" variant="secondary" onClick={() => refresh.mutate()} disabled={refresh.isPending}>
      {refresh.isPending ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />} {refresh.isPending ? "Summarising…" : label}
    </Button>
  );

  return (
    <FigurePanel className="flex flex-col gap-3 p-5" role="region" aria-label="AI summary of the feedback" aria-busy={q.isFetching || refresh.isPending}>
      <CardLabel right={gate.locked ? <LockBadge lock={gate.lock} /> : sentiment ? <StatusBadge label={SENTIMENT_LABEL[sentiment]} tone={SENTIMENT_TONE[sentiment]} /> : null}>
        <span className="inline-flex items-center gap-1.5">
          <SparklesIcon className="text-brand size-3" aria-hidden="true" /> AI summary
        </span>
      </CardLabel>

      <p className="sr-only" role="status" aria-live="polite">
        {live}
      </p>

      {gate.locked ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-ink-2 m-0 max-w-[48ch] text-[12.5px] leading-[1.55]">AI reads every comment and tells you what people loved, what they didn&apos;t, and what to fix next time.</p>
          <button type="button" className="btn btn-primary btn-sm" onClick={gate.prompt}>
            Upgrade
          </button>
        </div>
      ) : q.isPending ? (
        <div className="grid gap-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-16" />
          <Skeleton className="h-10" />
        </div>
      ) : q.isError ? (
        <Notice
          tone="refuse"
          tag="AI"
          action={
            <Button size="sm" variant="secondary" onClick={() => void q.refetch()}>
              Try again
            </Button>
          }
        >
          {aiProblem(q.error, gate.status).text}
        </Notice>
      ) : !data ? null : data.summary ? (
        <>
          <Summary data={data as Parameters<typeof Summary>[0]["data"]} />
          <div className="border-line-soft flex flex-wrap items-center justify-between gap-3 border-t pt-3">
            <p className="text-ink-3 m-0 text-[12px]">
              From {data.responses.toLocaleString("en-IN")} {data.responses === 1 ? "reply" : "replies"}
              {data.generated_at ? (
                <>
                  {" · made "}
                  <time dateTime={data.generated_at}>{relativeTime(data.generated_at, now)}</time>
                </>
              ) : null}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-ink-3 text-[11.5px]">Uses one AI action</span>
              {refreshButton("Refresh")}
            </div>
          </div>
        </>
      ) : data.responses < FEEDBACK_MIN_RESPONSES ? (
        <div>
          <p className="text-ink m-0 text-[13.5px] font-medium">Needs at least {FEEDBACK_MIN_RESPONSES} responses with comments</p>
          <p className="text-ink-3 m-0 mt-1 text-[12.5px]">{data.responses === 0 ? "None yet." : `${data.responses} so far.`} The summary can be made once there are enough to say something.</p>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-ink-2 m-0 text-[12.5px] leading-[1.55]">
            {data.responses.toLocaleString("en-IN")} replies with comments. Summarise them: what people loved, what they didn&apos;t, and what to fix.
          </p>
          <div className="flex items-center gap-2">
            <span className="text-ink-3 text-[11.5px]">Uses one AI action</span>
            {refreshButton("Summarise")}
          </div>
        </div>
      )}

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

      {!gate.locked ? <AiUsageMeter status={gate.status} /> : null}
    </FigurePanel>
  );
}
