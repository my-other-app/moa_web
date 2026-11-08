"use client";

import * as React from "react";
import { ClipboardListIcon } from "lucide-react";
import { Button, toast } from "@moa/ui";

import { answersPayload, invalidAnswers, type AnswerField, type AnswerValue } from "@/lib/answers";

import { useGateAnswers } from "../queries";
import type { GateContext, MissingAnswer } from "../schemas";
import { DoorQuestionField } from "./door-question";

/** The missing questions as the door asks them: the event's own definition where the door has it, else a plain answer. */
export function missingFields(ctx: Pick<GateContext, "guest_fields">, missing: readonly MissingAnswer[]): AnswerField[] {
  return missing.map((m) => {
    const f = ctx.guest_fields.find((g) => g.key === m.key);
    return { key: m.key, label: m.label ?? f?.label ?? m.key, field_type: f?.field_type ?? "text", options: f?.options ?? null };
  });
}

/** "T-shirt size and College": what a guest is missing, in a line. */
export const missingLine = (missing: readonly MissingAnswer[]) => {
  const names = missing.map((m) => m.label?.trim() || m.key.replace(/_/g, " "));
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
};

/**
 * What a guest hasn't answered, on their card at the door (missing-answers
 * contract §2.5): said always, since the door sees it; filled by a volunteer
 * with check-in permission. Soft: their admission never waits on it, nothing
 * is required, and Skip is one tap. Saving counts as answered for any open
 * ask; whatever is still missing after (a question their new answer
 * revealed, one left blank) stays listed.
 */
export function MissingAnswersStrip({
  gateKey,
  ctx,
  registrationId,
  name,
  missing,
  startOpen = false,
  onOpen,
  onChange,
}: {
  gateKey: string | null;
  ctx: GateContext;
  registrationId: string;
  name: string;
  missing: readonly MissingAnswer[];
  /** Opened on the fields at once (Find, where the volunteer asked for them). */
  startOpen?: boolean;
  /** The volunteer started filling: the card must not dismiss itself under them. */
  onOpen?: () => void;
  /** What is still missing after a save. */
  onChange?: (missing: MissingAnswer[]) => void;
}) {
  const [open, setOpen] = React.useState(startOpen && ctx.permissions.check_in);
  const [left, setLeft] = React.useState<readonly MissingAnswer[]>(missing);
  const [values, setValues] = React.useState<Record<string, AnswerValue>>({});
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const save = useGateAnswers(gateKey, ctx.event.id);
  const mayFill = ctx.permissions.check_in;
  const fields = missingFields(ctx, left);
  const payload = answersPayload(fields, values);
  const filled = Object.keys(payload).length;

  if (!left.length) return null;

  const submit = async () => {
    setErrors({});
    try {
      const res = await save.mutateAsync({ registrationId, answers: payload });
      setLeft(res.missing_answers);
      setValues({});
      onChange?.(res.missing_answers);
      if (res.missing_answers.length) {
        toast.success("Saved", { description: `Still missing: ${missingLine(res.missing_answers)}.` });
      } else {
        toast.success(`${name}'s answers are in`);
        setOpen(false);
      }
    } catch (err) {
      const byKey = invalidAnswers(err);
      if (byKey && Object.keys(byKey).length) setErrors(byKey);
      else toast.error(err instanceof Error && err.message ? err.message : "Could not save their answers");
    }
  };

  return (
    <div className="border-line-soft bg-sunken text-ink border-t px-4 py-3.5" role="group" aria-label={`Answers ${name} hasn't given`}>
      <p className="text-caution flex items-start gap-2 text-[13.5px] font-semibold">
        <ClipboardListIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <span>
          {left.length === 1 ? "1 answer missing" : `${left.length} answers missing`}: <span className="text-ink font-normal">{missingLine(left)}</span>
        </span>
      </p>
      {!open ? (
        mayFill ? (
          <Button
            type="button"
            size="lg"
            variant="secondary"
            className="mt-2.5 w-full"
            onClick={() => {
              setOpen(true);
              onOpen?.();
            }}
          >
            Add {left.length === 1 ? "it" : "them"} now
          </Button>
        ) : (
          <p className="text-ink-3 mt-1.5 text-[12.5px] leading-[1.5]">Nothing about their admission depends on it.</p>
        )
      ) : (
        <form
          className="mt-3 flex flex-col gap-3"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {fields.map((f) => (
            <DoorQuestionField key={f.key} field={f} idPrefix={`fill-${registrationId}`} note="" value={values[f.key]} error={errors[f.key]} onChange={(v) => setValues((cur) => ({ ...cur, [f.key]: v }))} />
          ))}
          <div className="flex gap-2">
            <Button size="lg" type="submit" className="flex-1" disabled={!filled || save.isPending}>
              {save.isPending ? "Saving…" : "Save"}
            </Button>
            <Button size="lg" type="button" variant="secondary" className="basis-[110px]" onClick={() => setOpen(false)} disabled={save.isPending}>
              Skip
            </Button>
          </div>
          <p className="text-ink-3 text-[12.5px] leading-[1.5]">Ask what you can; leave the rest blank. Nothing about their admission depends on it.</p>
        </form>
      )}
    </div>
  );
}
