"use client";

import * as React from "react";
import { GiftIcon, Loader2Icon, SquareCheckIcon, SquareIcon } from "lucide-react";
import { formatDate, formatNumber } from "@moa/app-kit";
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Notice, Skeleton, cn } from "@moa/ui";

import { useApplyTrialGift, useTrialGiftPreview } from "../queries";
import { allowancesLine, type TrialGiftResult } from "../schemas";

/**
 * "Give existing clubs the 14-day Pro trial": one button for the clubs that
 * were approved before the free trial existed.
 *
 * The server decides who is eligible (approved, real, never had a trial, on
 * Free: not paying, not on a complimentary plan, an Enterprise trial or a
 * deal of its own) and the card only shows its answer: how many, the first
 * few, and why the others are left out. Starting it asks once more, says
 * whether the owners are mailed, and the result stays on the card. Pressing
 * it twice starts nothing the second time: a club gets one trial.
 */
export function TrialGiftCard() {
  const preview = useTrialGiftPreview();
  const apply = useApplyTrialGift();
  const [email, setEmail] = React.useState(true);
  const [confirming, setConfirming] = React.useState(false);
  const [result, setResult] = React.useState<TrialGiftResult | null>(null);
  const refused = apply.error instanceof Error ? apply.error.message : null;

  const data = preview.data;
  const days = data?.days ?? 14;
  const planName = data?.plan_name ?? "Pro";
  const count = data?.eligible ?? 0;
  const allowed = data ? allowancesLine(data.allowances) : null;

  const start = () =>
    apply.mutate(email, {
      onSuccess: (done) => {
        setResult(done);
        setConfirming(false);
      },
    });

  return (
    <section
      aria-labelledby="trial-gift-title"
      className="flex flex-col gap-3 rounded-[var(--radius-card)] bg-surface px-5 py-[18px] shadow-card"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 basis-[320px] items-start gap-3">
          <span className="grid size-[30px] shrink-0 place-items-center rounded-[9px] bg-brand-soft text-brand">
            <GiftIcon className="size-4" />
          </span>
          <div className="min-w-0">
            <h3 id="trial-gift-title" className="m-0 text-[15px]">
              Give existing clubs the {days}-day {planName} trial
            </h3>
            <p className="m-0 mt-0.5 text-[12.5px] text-ink-3">
              For clubs approved before the free trial existed: real clubs on Free that never had one. It starts now, exactly as a new
              club&apos;s does, with no card; when it ends they are back on Free.
            </p>
          </div>
        </div>
        {preview.isPending ? (
          <Skeleton className="h-9 w-[180px] rounded-[var(--radius-md)]" />
        ) : data ? (
          <span className="text-[24px] leading-none tracking-[-0.02em]" aria-label={`${count} eligible clubs`}>
            {formatNumber(count)}
            <span className="ml-1.5 text-[12px] text-ink-3">eligible</span>
          </span>
        ) : null}
      </div>

      {preview.isError ? <Notice tone="refuse">Couldn&apos;t work out which clubs are eligible. Try again in a moment.</Notice> : null}
      {data && !data.available ? <Notice tone="caution">There is no {planName} plan to give, so there is no trial to start.</Notice> : null}

      {result ? (
        <Notice tone="admit" tag="Done">
          <strong>
            {result.started
              ? `${formatNumber(result.started)} club${result.started === 1 ? "" : "s"} started the ${planName} trial`
              : "No club needed the trial"}
          </strong>
          {result.started && result.ends_at ? `, until ${formatDate(result.ends_at)}` : ""}.{" "}
          {result.started ? (result.emailed ? `${formatNumber(result.emailed)} owner${result.emailed === 1 ? "" : "s"} mailed.` : "No mail was sent.") : "Nothing was changed."}
          {result.remaining ? ` ${formatNumber(result.remaining)} more are left for another run.` : ""}
          {result.clubs.length ? <span className="mt-1 block text-[12px] text-ink-3">{result.clubs.map((c) => c.name).join(", ")}{result.started > result.clubs.length ? ", …" : ""}</span> : null}
        </Notice>
      ) : null}

      {data && data.available ? (
        <>
          {data.sample.length ? (
            <div className="flex flex-col gap-1">
              <span className="micro">First {Math.min(data.sample.length, count)} of {formatNumber(count)}</span>
              <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
                {data.sample.map((club) => (
                  <li key={club.id} className="tag tag-neutral">
                    {club.name}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="m-0 text-[13px] text-ink-2">Every club has had its trial, or has a plan of its own. Nothing to give.</p>
          )}

          {data.excluded.length ? (
            <p className="m-0 text-[12px] text-ink-3">
              Left out: {data.excluded.map((e) => `${e.label.toLowerCase()} (${formatNumber(e.count)})`).join(", ")}.
            </p>
          ) : null}

          {allowed || data.unlocks.length ? (
            <p className="m-0 text-[12px] text-ink-3">
              {data.unlocks.length ? `It unlocks ${data.unlocks.slice(0, 5).join(", ")}${data.unlocks.length > 5 ? " and more" : ""}. ` : ""}
              {allowed ? `During it a club can send ${allowed}.` : ""}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <button
              type="button"
              aria-pressed={email}
              onClick={() => setEmail((v) => !v)}
              className={cn("flex items-start gap-2 text-left", email ? "text-brand" : "text-ink-2")}
            >
              {email ? <SquareCheckIcon className="mt-px size-4 shrink-0" /> : <SquareIcon className="mt-px size-4 shrink-0" />}
              <span className="flex flex-col">
                <span className="text-[13px]">Email each club&apos;s owner</span>
                <span className="text-[11.5px] text-ink-3">&ldquo;Your club has {days} days of MyOtherApp {planName}, free&rdquo;, once</span>
              </span>
            </button>
            <Button type="button" disabled={count === 0 || apply.isPending} onClick={() => setConfirming(true)}>
              <GiftIcon className="size-4" />
              {count === 0 ? "Nothing to give" : `Give ${formatNumber(count)} club${count === 1 ? "" : "s"} the trial`}
            </Button>
          </div>
        </>
      ) : null}

      {confirming && data ? (
        <Dialog open onOpenChange={(open) => !open && setConfirming(false)}>
          <DialogContent className="sm:max-w-[460px]">
            <DialogHeader>
              <DialogTitle>
                Start the {planName} trial for {formatNumber(count)} club{count === 1 ? "" : "s"}?
              </DialogTitle>
              <DialogDescription>
                Each gets {days} days of {planName} from now, with no card. When it ends the club is back on Free, unless it picks a plan.{" "}
                {email ? "Each owner is emailed once." : "No one is emailed."} A club gets one trial, so this cannot be undone for them.
              </DialogDescription>
            </DialogHeader>
            {refused ? <Notice tone="refuse">{refused.replace(/\.$/, "")}. Nothing was changed.</Notice> : null}
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setConfirming(false)}>
                Not now
              </Button>
              <Button type="button" disabled={apply.isPending} onClick={start}>
                {apply.isPending ? <Loader2Icon className="size-4 animate-spin" /> : null} Start {count === 1 ? "the trial" : `${formatNumber(count)} trials`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </section>
  );
}
