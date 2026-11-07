"use client";

import * as React from "react";
import { RotateCcwIcon } from "lucide-react";
import { missingRequired, requiredWhenShown, setAnswer, visibility, type Question } from "@moa/questions";
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Notice } from "@moa/ui";

import { QUESTION_LABEL, QuestionControl, RevealNotice, useRevealNotice } from "@/components/question-control";
import type { AnswerValue } from "@/lib/answers";

/**
 * The sign-up questions as an attendee will meet them, from what is in the
 * builder now (saved or not): only the questions their answers reveal, in
 * the form's order, a branch's answers cleared the moment it stops
 * applying, "required" as required when shown. Walk each branch by
 * answering; "Check my answers" says what the form would refuse. Nothing is
 * sent anywhere.
 */
export function QuestionsPreview({ questions: all, open, onOpenChange }: { questions: Question[]; open: boolean; onOpenChange: (open: boolean) => void }) {
  // A question still being written (no label yet) is not part of the form.
  const questions = React.useMemo(() => all.filter((q) => q.key && q.label?.trim()), [all]);
  const [answers, setAnswers] = React.useState<Record<string, AnswerValue>>({});
  const [checked, setChecked] = React.useState(false);
  const shown = React.useMemo(() => visibility(questions, answers), [questions, answers]);
  const asked = questions.filter((q) => shown.get(q.key) === true);
  const notice = useRevealNotice(questions, shown);
  const missing = checked ? new Set(missingRequired(questions, answers)) : new Set<string>();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Preview the sign-up form</DialogTitle>
          <DialogDescription>Answer as an attendee would: questions appear and go as their answers change. Nothing here is saved or sent.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-ink-3 m-0 text-[12px]" aria-live="off">
            Asking {asked.length} of {questions.length} {questions.length === 1 ? "question" : "questions"}, after a name and an email
          </p>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => {
              setAnswers({});
              setChecked(false);
            }}
          >
            <RotateCcwIcon className="size-3.5" /> Start again
          </Button>
        </div>
        <form
          noValidate
          className="bg-sunken grid gap-3 rounded-xl p-3.5"
          onSubmit={(e) => {
            e.preventDefault();
            setChecked(true);
          }}
        >
          {asked.map((q) => {
            const id = `preview-${q.key}`;
            const isMissing = missing.has(q.key);
            return (
              <div key={q.key} className="motion-safe:animate-in motion-safe:fade-in-0">
                <label htmlFor={id} className={QUESTION_LABEL}>
                  {q.label}
                  {requiredWhenShown(q) ? "" : " · optional"}
                </label>
                <QuestionControl
                  field={q}
                  value={answers[q.key]}
                  onChange={(v) => setAnswers((a) => setAnswer(questions, a, q.key, v) as Record<string, AnswerValue>)}
                  idPrefix="preview"
                  id={id}
                  aria-invalid={isMissing || undefined}
                  aria-describedby={isMissing ? `${id}-error` : undefined}
                />
                {isMissing ? (
                  <p id={`${id}-error`} className="text-refuse mt-1 text-[12px]">
                    This field is required
                  </p>
                ) : null}
              </div>
            );
          })}
          <RevealNotice notice={notice} />
          {checked && missing.size === 0 ? (
            <Notice tone="admit" tag="Ready">
              The form would take these answers{asked.length < questions.length ? `; the ${questions.length - asked.length} hidden ${questions.length - asked.length === 1 ? "question is" : "questions are"} not sent` : ""}.
            </Notice>
          ) : null}
          <div>
            <Button type="submit" size="sm">
              Check my answers
            </Button>
          </div>
        </form>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
