"use client";

import * as React from "react";
import { Checkbox, NativeSelect } from "@moa/ui";
import type { Question } from "@moa/questions";

import { inputTypeOf, isMultiChoice, isSingleChoice, type AnswerField, type AnswerValue } from "@/lib/answers";

/** The field's label and the field, in the dialog vocabulary the rebuilt screens share. */
export const QUESTION_LABEL = "eyebrow mb-1.5 block";
export const QUESTION_FIELD = "input h-9 w-full";

/**
 * The answer control for one of an event's own questions, as an attendee
 * fills it: ticks for several choices, a dropdown for one, else the typed
 * input. Shared by the club's add-a-guest dialog and the builder's preview,
 * so the preview is the form. Every other prop (an id, aria-*, name, ref,
 * onBlur -- what FormControl and react-hook-form hand down) goes to the
 * input itself.
 */
export function QuestionControl({
  field: f,
  value,
  onChange,
  idPrefix = "answer",
  ...rest
}: {
  field: AnswerField;
  value: AnswerValue | undefined;
  onChange: (value: AnswerValue) => void;
  /** Ties each tick's label to its box: `${idPrefix}-${key}-${option}`. */
  idPrefix?: string;
} & Omit<React.ComponentProps<"input">, "value" | "onChange" | "type">) {
  if (isMultiChoice(f)) {
    const ticked = Array.isArray(value) ? value : [];
    return (
      <div role="group" aria-label={f.label ?? f.key} className="flex flex-wrap gap-x-4 gap-y-2 pt-0.5" id={rest.id}>
        {(f.options ?? []).map((o) => {
          const id = `${idPrefix}-${f.key}-${o}`;
          return (
            <span key={o} className="flex items-center gap-2">
              <Checkbox id={id} checked={ticked.includes(o)} onCheckedChange={(on) => onChange(on === true ? [...ticked.filter((t) => t !== o), o] : ticked.filter((t) => t !== o))} />
              <label htmlFor={id} className="text-ink cursor-pointer text-[13px]">
                {o}
              </label>
            </span>
          );
        })}
      </div>
    );
  }
  if (isSingleChoice(f)) {
    const { size: _size, ...selectProps } = rest as unknown as React.ComponentProps<"select">;
    return (
      <NativeSelect className="w-full" {...selectProps} value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)}>
        <option value="" disabled>
          Choose
        </option>
        {(f.options ?? []).map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </NativeSelect>
    );
  }
  return <input className={QUESTION_FIELD} {...rest} type={inputTypeOf(f)} value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)} />;
}

/**
 * What a screen reader is told as a parent's answer changes which questions
 * apply (§8): the questions that appeared, by name, without moving focus to
 * them; or that some no longer apply. Kept as the previous render's visible
 * keys in state, the way React derives from a change of props.
 */
export function useRevealNotice(questions: readonly Question[], shown: ReadonlyMap<string, boolean>): string {
  const visible = questions.filter((q) => shown.get(q.key) === true).map((q) => q.key);
  const signature = visible.join("\u0000");
  const [previous, setPrevious] = React.useState(signature);
  const [notice, setNotice] = React.useState("");
  if (signature !== previous) {
    const before = new Set(previous ? previous.split("\u0000") : []);
    const now = new Set(visible);
    const appeared = questions.filter((q) => now.has(q.key) && !before.has(q.key));
    const went = [...before].filter((k) => !now.has(k)).length;
    setPrevious(signature);
    setNotice(
      appeared.length
        ? `${appeared.length === 1 ? "A question was added below" : `${appeared.length} questions were added below`}: ${appeared.map((q) => q.label?.trim() || q.key).join(", ")}.`
        : went
          ? `${went === 1 ? "A question no longer applies and was" : `${went} questions no longer apply and were`} removed, with ${went === 1 ? "its answer" : "their answers"}.`
          : "",
    );
  }
  return notice;
}

/** The polite live region a form keeps mounted for useRevealNotice's words. */
export function RevealNotice({ notice }: { notice: string }) {
  return (
    <p aria-live="polite" role="status" className="sr-only">
      {notice}
    </p>
  );
}
