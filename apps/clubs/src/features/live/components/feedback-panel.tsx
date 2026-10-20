"use client";

import * as React from "react";
import {
  MessageSquareTextIcon,
  SendIcon,
  StarIcon,
  ThermometerIcon,
  XIcon,
} from "lucide-react";
import { formatDateTime } from "@moa/app-kit";
import {
  Button,
  CardLabel,
  EmptyState,
  FigurePanel,
  ProgressBar,
  Skeleton,
  Switch,
  cn,
} from "@moa/ui";

import { FeedbackSummaryCard } from "@/features/ai";

import { useFeedback, useFeedbackMutations } from "../queries";
import {
  DELAYS,
  KIND_LABEL,
  type SurveyQuestion,
  type SurveyResults,
} from "../schemas";

/**
 * The feedback survey: what it asks and when it goes out, beside what came
 * back — this event once replies arrive, last time's until then.
 */
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 32) || "q";

function Results({
  title,
  r,
  note,
}: {
  title: string;
  r: SurveyResults;
  note?: string;
}) {
  return (
    <FigurePanel className="p-5">
      <CardLabel
        right={
          <span className="text-ink-3 font-mono text-[11px]">
            {r.responses} of {r.invited} replied
          </span>
        }
      >
        {title}
      </CardLabel>
      {note ? <p className="text-ink-3 mt-1 text-[12px]">{note}</p> : null}
      {r.nps ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-[auto_1fr] sm:items-center">
          <div>
            <p
              className={cn(
                "font-mono text-[40px] leading-none font-semibold tracking-[-0.02em]",
                r.nps.score >= 30
                  ? "text-admit"
                  : r.nps.score >= 0
                    ? "text-caution"
                    : "text-refuse",
              )}
            >
              {r.nps.score > 0 ? "+" : ""}
              {r.nps.score}
            </p>
            <p className="text-ink-3 mt-1 text-[11.5px]">Recommend score</p>
          </div>
          <div>
            <div className="bg-sunken flex h-2 overflow-hidden rounded-full">
              <span
                className="bg-admit"
                style={{ width: `${r.nps.promoters}%` }}
              />
              <span
                className="bg-caution"
                style={{ width: `${r.nps.passives}%` }}
              />
              <span
                className="bg-refuse"
                style={{ width: `${r.nps.detractors}%` }}
              />
            </div>
            <div className="text-ink-3 mt-1.5 flex justify-between font-mono text-[10.5px]">
              <span>{r.nps.promoters}% would recommend</span>
              <span>{r.nps.passives}% neutral</span>
              <span>{r.nps.detractors}% wouldn&apos;t</span>
            </div>
          </div>
        </div>
      ) : null}
      {r.averages.length > 0 ? (
        <div className="mt-4 grid gap-2">
          {r.averages.map((a) => (
            <div
              key={a.key}
              className="grid grid-cols-[1fr_120px_32px] items-center gap-3 text-[12.5px]"
            >
              <span className="text-ink truncate">{a.label}</span>
              <ProgressBar value={a.average ?? 0} max={5} tone="accent" />
              <span className="text-ink-2 text-right font-mono text-[12px] tabular-nums">
                {a.average ?? "–"}
              </span>
            </div>
          ))}
        </div>
      ) : null}
      {r.texts.length > 0 ? (
        <ul className="mt-4 grid gap-2">
          {r.texts
            .slice(-6)
            .reverse()
            .map((t, i) => (
              <li
                key={i}
                className="bg-sunken text-ink-2 rounded-lg px-3 py-2 text-[12.5px] leading-[1.5]"
              >
                &ldquo;{t}&rdquo;
              </li>
            ))}
        </ul>
      ) : null}
      {r.responses === 0 ? (
        <p className="text-ink-3 mt-3 text-[12.5px]">Nothing back yet.</p>
      ) : null}
    </FigurePanel>
  );
}

const ICON: Record<SurveyQuestion["kind"], React.ReactNode> = {
  rating: <StarIcon className="size-3.5" />,
  nps: <ThermometerIcon className="size-3.5" />,
  text: <MessageSquareTextIcon className="size-3.5" />,
};
const NEW_LABEL: Record<SurveyQuestion["kind"], string> = {
  rating: "How was …?",
  nps: "How likely are you to recommend us to a friend?",
  text: "What should we change next time?",
};

export function FeedbackPanel({ eventId }: { eventId: number }) {
  const fb = useFeedback(eventId);
  const { save, send } = useFeedbackMutations(eventId);
  const [draft, setDraft] = React.useState<SurveyQuestion[] | null>(null);
  const [confirm, setConfirm] = React.useState(false);
  if (fb.isPending) return <Skeleton className="h-72" />;
  if (fb.isError || !fb.data)
    return (
      <EmptyState
        tone="muted"
        title="The survey could not load"
        description="Try again in a moment."
      />
    );
  const f = fb.data;
  const questions = draft ?? f.questions;
  const commit = (qs: SurveyQuestion[]) => {
    setDraft(qs);
    if (qs.every((q) => q.label.trim()))
      save.mutate(
        { questions: qs.map((q) => ({ ...q, label: q.label.trim() })) },
        { onSuccess: () => setDraft(null) },
      );
  };
  const add = (kind: SurveyQuestion["kind"]) => {
    const label = NEW_LABEL[kind];
    const key = `${slug(label)}_${questions.length + 1}`;
    commit([...questions, { key, kind, label }]);
  };
  const sentLine = f.sent_at
    ? `Sent to ${f.sent_count} on ${formatDateTime(f.sent_at)}`
    : f.sends_at
      ? `Goes out ${formatDateTime(f.sends_at)} to everyone checked in`
      : "Not scheduled — send it by hand when you are ready";
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
      <FigurePanel className="p-5">
        <h2 className="text-ink text-[16px] font-semibold">Feedback survey</h2>
        <label className="mt-3 flex items-start gap-3">
          <Switch
            checked={f.auto_send}
            onCheckedChange={(v) => save.mutate({ auto_send: v })}
            aria-label="Send automatically"
            className="mt-0.5"
          />
          <span>
            <span className="text-ink block text-[13px] font-medium">
              Send automatically
            </span>
            <span className="text-ink-3 block text-[12px]">
              To everyone checked in,{" "}
              <select
                className="text-ink bg-transparent underline decoration-dotted underline-offset-2 outline-none"
                value={f.delay_minutes}
                aria-label="When the survey goes out"
                onChange={(e) =>
                  save.mutate({ delay_minutes: Number(e.target.value) })
                }
              >
                {DELAYS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label.toLowerCase()}
                  </option>
                ))}
                {!DELAYS.some((d) => d.value === f.delay_minutes) ? (
                  <option value={f.delay_minutes}>
                    {f.delay_minutes} minutes after the event ends
                  </option>
                ) : null}
              </select>
            </span>
          </span>
        </label>
        <ul className="mt-4 grid gap-2">
          {questions.map((q, i) => (
            <li key={q.key} className="flex items-center gap-2">
              <span className="bg-sunken text-ink-2 inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 font-mono text-[10.5px]">
                {ICON[q.kind]} {KIND_LABEL[q.kind]}
              </span>
              <input
                className="input h-9 flex-1"
                value={q.label}
                aria-label={`Question ${i + 1}`}
                maxLength={200}
                onChange={(e) =>
                  setDraft(
                    questions.map((x, j) =>
                      j === i ? { ...x, label: e.target.value } : x,
                    ),
                  )
                }
                onBlur={() => (draft ? commit(draft) : null)}
              />
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label={`Remove question ${i + 1}`}
                onClick={() => commit(questions.filter((_, j) => j !== i))}
                disabled={questions.length === 1}
              >
                <XIcon className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Button size="xs" variant="ghost" onClick={() => add("rating")}>
            <StarIcon className="size-3.5" /> Rating
          </Button>
          <Button size="xs" variant="ghost" onClick={() => add("text")}>
            <MessageSquareTextIcon className="size-3.5" /> Open text
          </Button>
          <Button
            size="xs"
            variant="ghost"
            onClick={() => add("nps")}
            disabled={questions.some((q) => q.kind === "nps")}
          >
            <ThermometerIcon className="size-3.5" /> Recommend 0–10
          </Button>
        </div>
        <div className="border-line-soft mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <p className="text-ink-3 text-[12px]">{sentLine}</p>
          {confirm ? (
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => (send.mutate(), setConfirm(false))}
                disabled={send.isPending}
              >
                Send to {f.checked_in} now
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setConfirm(false)}
              >
                Not yet
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setConfirm(true)}
              disabled={f.checked_in === 0}
            >
              <SendIcon className="size-3.5" />{" "}
              {f.sent_at ? "Send again" : "Send now"}
            </Button>
          )}
        </div>
      </FigurePanel>
      <div className="flex min-w-0 flex-col gap-4">
        {/* What the comments add up to, by AI; nothing at all while AI is off. */}
        <FeedbackSummaryCard eventId={eventId} />
        {f.results.responses > 0 ? (
          <Results title="Results so far" r={f.results} />
        ) : f.previous ? (
          <Results
            title={`Results from ${f.previous.event_name}`}
            r={f.previous}
            note="Last time, for the shape of things. This event's replies take over as they come."
          />
        ) : (
          <Results
            title="Results"
            r={f.results}
            note="Replies land here within minutes of the survey going out."
          />
        )}
      </div>
    </div>
  );
}
