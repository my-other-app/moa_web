"use client";

import * as React from "react";
import { Loader2Icon } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@moa/ui";

/**
 * The v2 confirmation dialog.
 *
 * Three parts, in the order the design puts them: what will happen, then a
 * reason box where the action is recorded against a person, then a note
 * saying whether it can be undone. The note is the reason this is a component
 * rather than a `confirm()` -- "reversible, prefer this to deleting" is the
 * sentence that stops the wrong button being pressed.
 *
 * Built on the shared Dialog for focus trapping and Escape, then styled to
 * the system rather than restyled per use.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  note,
  cta,
  busy,
  reason,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  body: string;
  note: string;
  cta: string;
  busy?: boolean;
  /** Present only where the action is logged with a stated reason. */
  reason?: {
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
    required?: boolean;
  };
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  const [error, setError] = React.useState<string | null>(null);

  /*
   * Cleared on each opening so a previous refusal is not sitting there when
   * the dialog comes back. Adjusted during render rather than in an effect:
   * an effect would paint one frame showing the stale error, and React's own
   * guidance is that state derived from a changing prop belongs here.
   */
  const [wasOpen, setWasOpen] = React.useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open && error !== null) setError(null);
  }

  async function confirm() {
    if (reason?.required && !reason.value.trim()) {
      setError("Add a reason — it goes on the record.");
      return;
    }
    try {
      await onConfirm();
    } catch {
      /*
       * Refused. The action's own onError has already said why; staying open
       * keeps the reason that was typed. Without this catch the rejection
       * escaped as an unhandled promise rejection on every refusal.
       */
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onCancel();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="flex w-[min(440px,100%)] flex-col gap-2.5 rounded-[var(--radius-card)] border-0 bg-surface p-3.5 shadow-[var(--shadow-lg)] sm:max-w-[440px]"
      >
        <DialogTitle className="text-[20px] font-medium">{title}</DialogTitle>
        <p className="m-0 text-[14px] text-pretty opacity-85">{body}</p>

        {reason ? (
          <div className="flex flex-col gap-1">
            <textarea
              className="input"
              aria-label={reason.placeholder}
              placeholder={reason.placeholder}
              value={reason.value}
              disabled={busy}
              onChange={(event) => {
                reason.onChange(event.target.value);
                setError(null);
              }}
            />
            {error ? (
              <span role="alert" className="text-[12px] text-[var(--destructive)]">
                {error}
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="rounded-[var(--radius-md)] bg-sunken px-3 py-2.5 text-[12px] text-ink-2">
          {note}
        </div>

        <div className="mt-1.5 flex justify-end gap-1.5">
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => void confirm()}
          >
            {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
            {cta}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
