"use client";

import * as React from "react";
import { CheckIcon, Loader2Icon, XIcon } from "lucide-react";
import { formatNumber } from "@moa/app-kit";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Notice, ProgressBar, Switch } from "@moa/ui";

import { overCapacity, type BulkProgress } from "../bulk";
import { CHUNK_SIZE, NOTE_MAX, people } from "../schemas";

/**
 * The two questions a decision asks before it is sent: confirming says how
 * many places are left and warns before going past them; declining asks
 * whether to email them and takes a short note. While a large run goes, the
 * dialog stays open with its progress and can't be closed half-way.
 *
 * Mounted afresh for each opening, so nothing typed last time is left in it.
 */

function RunProgress({ progress, verb }: { progress: BulkProgress | null; verb: string }) {
  // Only for a run of more than one call: a small one is done before a bar could say anything.
  if (!progress || progress.total <= CHUNK_SIZE) return null;
  const label = `${verb} ${formatNumber(progress.done)} of ${formatNumber(progress.total)}`;
  return (
    <div className="grid gap-1.5" aria-live="polite">
      <ProgressBar value={progress.done} max={Math.max(1, progress.total)} tone="accent" height={8} label={label} />
      <p className="text-ink-3 font-mono text-[11.5px] tabular-nums">{label}…</p>
    </div>
  );
}

const who = (count: number, name?: string | null) => (count === 1 && name ? name : people(count));

export function ConfirmDialog({
  count,
  name,
  placesLeft,
  running,
  progress,
  onConfirm,
  onClose,
}: {
  count: number;
  /** One person: their name. */
  name?: string | null;
  /** Null: no cap on places. Undefined: not known yet. */
  placesLeft: number | null | undefined;
  running: boolean;
  progress: BulkProgress | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const warning = overCapacity(count, placesLeft);
  return (
    <Dialog open onOpenChange={(open) => !open && !running && onClose()}>
      <DialogContent className="sm:max-w-[520px]" showCloseButton={!running} onEscapeKeyDown={(e) => running && e.preventDefault()} onPointerDownOutside={(e) => running && e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Confirm {who(count, name)}?</DialogTitle>
          <DialogDescription>
            Oldest request first. A free ticket goes out by email as each is confirmed; for a paid ticket they&apos;re sent a link to pay, and the place is held for them until it runs out.
          </DialogDescription>
        </DialogHeader>
        <p className="text-ink-2 text-[13px]">
          {placesLeft === undefined ? null : placesLeft === null ? "No limit on places." : `${formatNumber(placesLeft)} ${placesLeft === 1 ? "place" : "places"} left.`}
        </p>
        {warning ? (
          <Notice tone={warning.full ? "refuse" : "caution"} tag={warning.full ? "Full" : "Places"}>
            {warning.text}
          </Notice>
        ) : null}
        <RunProgress progress={progress} verb="Confirming" />
        <DialogFooter>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={running}>
            Not now
          </button>
          <button type="button" className="btn btn-primary" onClick={onConfirm} disabled={running || Boolean(warning?.full)}>
            {running ? <Loader2Icon className="size-4 animate-spin" /> : <CheckIcon className="size-4" />}
            {running ? "Confirming…" : count === 1 ? "Confirm" : `Confirm ${formatNumber(count)}`}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DeclineDialog({
  count,
  name,
  running,
  progress,
  onDecline,
  onClose,
}: {
  count: number;
  name?: string | null;
  running: boolean;
  progress: BulkProgress | null;
  onDecline: (choice: { notify: boolean; note: string }) => void;
  onClose: () => void;
}) {
  const [notify, setNotify] = React.useState(true);
  const [note, setNote] = React.useState("");
  const left = NOTE_MAX - note.length;
  return (
    <Dialog open onOpenChange={(open) => !open && !running && onClose()}>
      <DialogContent className="sm:max-w-[520px]" showCloseButton={!running} onEscapeKeyDown={(e) => running && e.preventDefault()} onPointerDownOutside={(e) => running && e.preventDefault()}>
        <form
          noValidate
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!running) onDecline({ notify, note: note.trim() });
          }}
        >
          <DialogHeader>
            <DialogTitle>Decline {who(count, name)}?</DialogTitle>
            <DialogDescription>
              {count === 1 ? "They won't get a place, and can't ask again unless you reopen their request." : "They won't get a place, and can't ask again unless you reopen their requests."}
            </DialogDescription>
          </DialogHeader>
          <label className="flex items-start gap-3">
            <Switch checked={notify} onCheckedChange={setNotify} disabled={running} aria-label="Email them to say so" className="mt-0.5" />
            <span>
              <span className="text-ink block text-[13.5px] font-medium">Email them to say so</span>
              <span className="text-ink-3 block text-[12px]">
                {notify ? "They're told you couldn't offer them a place this time, with your note if you add one." : "Nothing is sent. Their request's page still says it was declined."}
              </span>
            </span>
          </label>
          <div>
            <label htmlFor="decline-note" className="eyebrow mb-1.5 block">
              A note for them (optional)
            </label>
            <textarea
              id="decline-note"
              className="input min-h-[72px] w-full py-2"
              maxLength={NOTE_MAX}
              value={note}
              disabled={running}
              onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))}
              placeholder="e.g. We had far more requests than seats. We'd love to see you at the next one."
            />
            <p className={left < 30 ? "text-caution mt-1 text-right font-mono text-[11px]" : "text-ink-3 mt-1 text-right font-mono text-[11px]"}>
              {note.length}/{NOTE_MAX}
            </p>
          </div>
          <RunProgress progress={progress} verb="Declining" />
          <DialogFooter>
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={running}>
              Keep {count === 1 ? "them" : "them all"} waiting
            </button>
            <button type="submit" className="btn btn-primary btn-danger" disabled={running}>
              {running ? <Loader2Icon className="size-4 animate-spin" /> : <XIcon className="size-4" />}
              {running ? "Declining…" : count === 1 ? "Decline" : `Decline ${formatNumber(count)}`}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
