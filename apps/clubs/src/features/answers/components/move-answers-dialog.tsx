"use client";

import * as React from "react";
import { Loader2Icon } from "lucide-react";
import { formatNumber } from "@moa/app-kit";
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, NativeSelect } from "@moa/ui";

import { useMoveAnswers } from "../queries";
import type { SummaryQuestion } from "../schemas";

/**
 * "Answers under an old question: Collage (180) → Move to …" (§1.5, owner
 * and admin): the answers stored under a key the form no longer has, copied
 * to a current question for everyone who hasn't answered it, then the old
 * key dropped. Someone who answered both keeps both as they were.
 */
export function MoveAnswersDialog({ eventId, stray, questions, onClose }: { eventId: number; stray: { key: string; count: number }; questions: readonly SummaryQuestion[]; onClose: () => void }) {
  const id = React.useId();
  const move = useMoveAnswers(eventId);
  const [to, setTo] = React.useState("");
  const target = questions.find((q) => q.key === to);

  return (
    <Dialog open onOpenChange={(o) => !o && !move.isPending && onClose()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Move the answers under “{stray.key.replace(/_/g, " ")}”</DialogTitle>
          <DialogDescription>
            {formatNumber(stray.count)} {stray.count === 1 ? "person answered" : "people answered"} a question the form no longer has. Move their answers to the question that replaced it, and they count as answered there.
          </DialogDescription>
        </DialogHeader>
        <div>
          <label htmlFor={`${id}-to`} className="eyebrow mb-1.5 block">
            Move to
          </label>
          <NativeSelect id={`${id}-to`} className="w-full" value={to} onChange={(e) => setTo(e.target.value)}>
            <option value="" disabled>
              Choose a question
            </option>
            {questions.map((q) => (
              <option key={q.key} value={q.key}>
                {q.label?.trim() || q.key}
              </option>
            ))}
          </NativeSelect>
          <p className="text-ink-3 mt-1.5 text-[11.5px] leading-[1.5]">
            {target
              ? `Anyone who has already answered “${target.label?.trim() || target.key}” keeps that answer; theirs under the old question stays too. Everyone else's moves.`
              : "Only people who haven't answered the question you choose get the old answer."}
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={move.isPending}>
            Cancel
          </Button>
          <Button disabled={!to || move.isPending} onClick={() => move.mutate({ from: stray.key, to }, { onSuccess: onClose })}>
            {move.isPending ? <Loader2Icon className="animate-spin" /> : null}
            Move the answers
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
