"use client";

import * as React from "react";
import { formatDateTime, formatNumber } from "@moa/app-kit";
import {
  CardLabel,
  Checkbox,
  ChoiceCard,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  FigurePanel,
  Notice,
  Skeleton,
  cn,
  toast,
} from "@moa/ui";

import {
  useRetention,
  useRunRetention,
  useUpdateCloseoutSettings,
} from "../queries";
import {
  PREVIEW_LABEL,
  type CloseoutSettings,
  type RetentionStatus,
} from "../schemas";

const label = "eyebrow mb-1.5 block";

const STATE_LABEL: Record<RetentionStatus["state"], string> = {
  pending: "Pending",
  report_sent: "Report kept",
  deleted: "Scrubbed",
  failed: "Failed",
};
const STEPS: RetentionStatus["state"][] = ["pending", "report_sent", "deleted"];

function RetentionDialog({
  eventId,
  slug,
  status,
  onClose,
}: {
  eventId: number;
  slug: string;
  status: RetentionStatus;
  onClose: () => void;
}) {
  const run = useRunRetention(eventId);
  const [typed, setTyped] = React.useState("");
  const matches = typed.trim() === slug;
  const go = () =>
    run.mutate(typed.trim(), {
      onSuccess: (r) => {
        if (r.state === "deleted")
          toast.success("Guest data scrubbed", {
            description:
              "The report is kept; the registrations stay with the guests' accounts.",
          });
        else toast.warning(r.error ?? r.refusal ?? "Retention did not finish");
        onClose();
      },
      onError: (e: Error) => toast.error(e.message),
    });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {status.mode === "keep"
              ? "Scrub the guest data now?"
              : "Run retention now?"}
          </DialogTitle>
          <DialogDescription>
            The report is generated first
            {status.recipients.length
              ? ` and emailed to ${status.recipients.join(", ")}`
              : ""}
            . Only once it is kept does the scrub run. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <ul className="bg-sunken grid gap-1 rounded-xl px-3 py-2.5 text-[12.5px]">
          {Object.entries(status.preview).map(([k, n]) => (
            <li key={k} className="flex justify-between gap-3">
              <span className="text-ink-2">{PREVIEW_LABEL[k] ?? k}</span>
              <span className="text-ink font-mono tabular-nums">
                {formatNumber(n)}
              </span>
            </li>
          ))}
        </ul>
        <div>
          <label htmlFor="retention-confirm" className={label}>
            Type the event slug to confirm
          </label>
          <input
            id="retention-confirm"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={slug}
            className="input font-mono"
            autoComplete="off"
          />
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="btn btn-destructive flex-1"
            disabled={!matches || run.isPending}
            onClick={go}
          >
            {run.isPending ? "Running…" : "Scrub guest data"}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * What happens to the guest data once the event is over. Registrations
 * belong to the guests and stay; what the event gathered beyond them is
 * scrubbed on a schedule or by hand, after the report is kept.
 */
export function RetentionPanel({
  eventId,
  slug,
  s,
}: {
  eventId: number;
  slug: string;
  s: CloseoutSettings;
}) {
  const retention = useRetention(eventId);
  const update = useUpdateCloseoutSettings(eventId);
  const [hours, setHours] = React.useState(String(s.retention_hours));
  const [recipients, setRecipients] = React.useState(
    s.report_recipients.join(", "),
  );
  const [confirm, setConfirm] = React.useState(false);
  const r = retention.data;
  const deleted = r?.state === "deleted";
  const reached = (i: number) =>
    r
      ? r.state === "deleted"
        ? true
        : r.state === "report_sent"
          ? i < 2
          : i === 0
      : false;

  return (
    <FigurePanel id="guest-data" className="scroll-mt-4 p-4">
      <CardLabel
        right={
          r ? (
            <ol
              className="flex flex-wrap items-center gap-1.5 text-[11.5px]"
              aria-label="Retention progress"
            >
              {STEPS.map((st, i) => (
                <li key={st} className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      "rounded-full border px-2 py-0.5",
                      reached(i)
                        ? "border-brand-line bg-brand-soft text-brand"
                        : "border-line text-ink-3",
                    )}
                    aria-current={
                      reached(i) && !reached(i + 1) ? "step" : undefined
                    }
                  >
                    {STATE_LABEL[st]}
                  </span>
                  {i < STEPS.length - 1 ? (
                    <span className="text-ink-3" aria-hidden="true">
                      →
                    </span>
                  ) : null}
                </li>
              ))}
              {r.state === "failed" ? (
                <li className="border-refuse-line bg-refuse-soft text-refuse rounded-full border px-2 py-0.5">
                  Failed
                </li>
              ) : null}
            </ol>
          ) : null
        }
      >
        Guest data
      </CardLabel>
      <p className="text-ink-3 mt-1 max-w-[80ch] text-[12.5px] leading-[1.5]">
        Registrations belong to the guests&apos; own accounts and stay, so
        tickets and certificates keep working in the app. Retention scrubs what
        the event gathered beyond that: phones captured at the door, answers to
        its own fields, delivery logs, phone check-in sessions, and walk-up
        records made at the gate. Contacts can be kept for the club first.
      </p>

      {retention.isPending ? (
        <Skeleton className="mt-3 h-24 rounded-xl" />
      ) : null}

      <div className="mt-3 grid gap-2.5">
        {r?.state === "failed" && r.last_error ? (
          <Notice tone="refuse" tag="Failed">
            {r.last_error} Nothing was scrubbed. Fix the recipients and run
            again.
          </Notice>
        ) : null}
        {r?.refusal === "NOT_ENDED" && !deleted ? (
          <Notice tone="neutral" tag="Waiting">
            The scheduled run looked and found the event still on. It tries
            again each minute after {formatDateTime(r.ends_at)}.
          </Notice>
        ) : null}
        {deleted && r?.deleted ? (
          <Notice
            tone="admit"
            tag={`Scrubbed${r.completed_at ? ` ${formatDateTime(r.completed_at)}` : ""}`}
          >
            {Object.entries(r.deleted)
              .map(([k, n]) => `${n} ${PREVIEW_LABEL[k] ?? k}`)
              .join(" · ")}
          </Notice>
        ) : null}
      </div>

      {!deleted ? (
        <>
          <div
            className="mt-1 grid gap-2 md:grid-cols-2"
            role="radiogroup"
            aria-label="Retention mode"
          >
            <ChoiceCard
              checked={s.retention_mode === "keep"}
              onClick={() => update.mutate({ retention_mode: "keep" })}
              title="Keep the guest data"
              hint="Nothing is scrubbed unless you run it by hand. Closed events are archived a month after they end."
            />
            <ChoiceCard
              checked={s.retention_mode === "delete"}
              onClick={() => update.mutate({ retention_mode: "delete" })}
              title="Scrub after the event"
              hint={`The report is generated and emailed, then the data is scrubbed, ${s.retention_hours} hours after the end.`}
            />
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-[160px_minmax(0,1fr)]">
            <div>
              <label htmlFor="retention-hours" className={label}>
                Hours after the end
              </label>
              <input
                id="retention-hours"
                value={hours}
                inputMode="numeric"
                onChange={(e) => setHours(e.target.value.replace(/\D/g, ""))}
                onBlur={() =>
                  Number(hours) >= 1 &&
                  Number(hours) !== s.retention_hours &&
                  update.mutate({ retention_hours: Number(hours) })
                }
                className="input font-mono"
              />
            </div>
            <div>
              <label htmlFor="retention-recipients" className={label}>
                Report recipients
              </label>
              <input
                id="retention-recipients"
                value={recipients}
                onChange={(e) => setRecipients(e.target.value)}
                onBlur={() =>
                  update.mutate({
                    report_recipients: recipients
                      .split(",")
                      .map((x) => x.trim())
                      .filter(Boolean),
                  })
                }
                placeholder="ops@example.com, chair@example.com"
                aria-describedby="retention-recipients-hint"
                className="input"
              />
              <p
                id="retention-recipients-hint"
                className="text-ink-3 mt-1 text-[11.5px]"
              >
                Optional. Separate addresses with commas; each gets the report
                when retention runs.
              </p>
            </div>
          </div>
          <div className="mt-3 flex items-start gap-2.5">
            <Checkbox
              id="retention-keep-contacts"
              checked={s.keep_contacts}
              onCheckedChange={(v) => update.mutate({ keep_contacts: v === true })}
              className="mt-0.5"
            />
            <label htmlFor="retention-keep-contacts" className="cursor-pointer">
              <span className="text-ink block text-[13px]">
                Keep contacts for the club
              </span>
              <span className="text-ink-3 block text-[12px]">
                Name, email, phone, role and whether they attended are copied
                out as the list is scrubbed
                {r ? ` (${r.contacts_kept} kept so far)` : ""}.
              </span>
            </label>
          </div>
          <div className="border-line-soft mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-3">
            <span className="text-ink-3 text-[12px]">
              {r
                ? `${s.retention_mode === "delete" ? `Scheduled for ${formatDateTime(r.run_at)}` : "Not scheduled"}${r.attempts ? ` · ${r.attempts} ${r.attempts === 1 ? "attempt" : "attempts"}` : ""}`
                : ""}
            </span>
            <button
              type="button"
              className="btn btn-secondary btn-danger"
              onClick={() => setConfirm(true)}
              disabled={!r}
            >
              {s.retention_mode === "keep"
                ? "Scrub the guest data now"
                : "Run retention now"}
            </button>
          </div>
        </>
      ) : null}
      {confirm && r ? (
        <RetentionDialog
          eventId={eventId}
          slug={slug}
          status={r}
          onClose={() => setConfirm(false)}
        />
      ) : null}
    </FigurePanel>
  );
}
