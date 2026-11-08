"use client";

import { ClipboardListIcon } from "lucide-react";
import { Button, cn } from "@moa/ui";

/** One of the event's questions, enough to name it. */
export interface NamedQuestion {
  key: string;
  label?: string | null;
}

/** Keys named by their questions' labels, in the order given; a key the form no longer has is named as itself. */
export function labelsOf(keys: readonly string[], questions: readonly NamedQuestion[]): string[] {
  return keys.map((k) => questions.find((q) => q.key === k)?.label?.trim() || k.replace(/_/g, " "));
}

/** The per-row marker on Attendees and Review: how many answers this person is missing, named on hover and to a screen reader. */
export function MissingMarker({ keys, questions, className }: { keys: readonly string[]; questions: readonly NamedQuestion[]; className?: string }) {
  if (!keys.length) return null;
  const names = labelsOf(keys, questions).join(", ");
  return (
    <span
      title={`Missing: ${names}`}
      className={cn("bg-caution-soft text-caution border-caution-line inline-flex items-center gap-1 rounded-full border px-1.5 text-[10.5px] leading-[16px] font-medium", className)}
    >
      <ClipboardListIcon aria-hidden="true" className="size-3" />
      {keys.length} missing
      <span className="sr-only">: {names}</span>
    </span>
  );
}

/**
 * In a person's detail: what they haven't answered, and Ask again (an ask
 * for them alone, §2.1 `refs`). Without the permission to write to guests,
 * the list is shown and the button is not.
 */
export function MissingAnswersNote({ keys, questions, onAskAgain }: { keys: readonly string[]; questions: readonly NamedQuestion[]; onAskAgain?: () => void }) {
  if (!keys.length) return null;
  return (
    <div className="bg-caution-soft border-caution-line flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-3.5 py-2.5" role="group" aria-label="Missing answers">
      <p className="text-ink m-0 min-w-0 flex-1 text-[12.5px]">
        <span className="font-semibold">Missing:</span> {labelsOf(keys, questions).join(", ")}
      </p>
      {onAskAgain ? (
        <Button size="xs" variant="secondary" onClick={onAskAgain}>
          <ClipboardListIcon /> Ask again
        </Button>
      ) : null}
    </div>
  );
}
