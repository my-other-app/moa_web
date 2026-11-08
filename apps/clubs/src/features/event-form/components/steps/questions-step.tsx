"use client";

import * as React from "react";
import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { ArrowDownIcon, ArrowUpIcon, CornerDownRightIcon, EyeIcon, GitBranchIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react";
import {
  canBeParent,
  canMove,
  checkOptionChange,
  checkTypeChange,
  conditionText,
  depthOf,
  descendantKeys,
  moveQuestion,
  nameOf,
  relabel,
  removeQuestion,
  setCondition,
  subtreeIndices,
  uniqueKey,
  type Question,
} from "@moa/questions";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Chip,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  NativeSelect,
  Notice,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  cn,
} from "@moa/ui";

import { AiFilledTag, aiFilledClass, useAiFilled } from "@/features/ai";
import { useAnswersSummary } from "@/features/answers";

import { ANSWER_TYPES } from "../../readiness";
import { CHOICE_TYPES as NEEDS_OPTIONS, type EventFormValues } from "../../schemas";
import { QuestionsPreview } from "../questions-preview";

const STARTERS = [
  { label: "College", field_type: "text" },
  { label: "Year of study", field_type: "number" },
  { label: "T-shirt size", field_type: "radio", options: ["S", "M", "L", "XL"] },
  { label: "Team name", field_type: "text" },
] as const;

type Draft = NonNullable<EventFormValues["additional_details"]>[number];

/** How far in a nested question sits, per level. Capped so a deep branch still fits a phone. */
const INDENT_PX = 20;

/**
 * Sign-up questions, beyond a name and an email. The answer types are in
 * words; a few common questions are one click.
 *
 * Every answer is stored under its question's key, so the key is made from
 * the label when the question is created and then stays (missing-answers
 * contract §1.1): a question read from the event keeps the key it was
 * loaded with, whatever its label becomes, so rewording "Collage" to
 * "College" keeps every answer given to it. Until it is first saved a new
 * question's key follows its label (nobody can have answered it yet), and a
 * clash gets `_2`, `_3`, … On a live event, a question people answered
 * says how many ("Answered by 120").
 *
 * A question can be asked only on certain answers to an earlier choice
 * question ("Only show this if…", conditional-questions contract §7). The
 * list is the form's order; a conditional question sits indented under its
 * parent with the condition in words, nested to any depth. Moving a
 * question takes everything under it along and never lifts a child above
 * its parent; deleting a parent asks what becomes of its children; an
 * option a child depends on can't be removed or renamed until the child's
 * condition changes. R1–R6 are checked before save (schemas.ts), in the
 * server's words. Preview fills it as an attendee would.
 */
export function QuestionsStep({ eventId, newEvent = false }: { /** The event being edited: its questions say how many answered them. */ eventId?: number; /** Nothing is saved yet, so every key may still follow its label. */ newEvent?: boolean } = {}) {
  const form = useFormContext<EventFormValues>();
  const questions = useFieldArray({ control: form.control, name: "additional_details" });
  const live = (useWatch({ control: form.control, name: "additional_details" }) ?? []) as Draft[];
  const ai = useAiFilled();
  const [announce, setAnnounce] = React.useState("");
  const [focusNext, setFocusNext] = React.useState<{ index: number; target: string } | null>(null);
  const [deleting, setDeleting] = React.useState<number | null>(null);
  const [previewing, setPreviewing] = React.useState(false);
  const summary = useAnswersSummary(eventId, !newEvent);
  const answeredBy = React.useMemo(() => new Map((summary.data?.questions ?? []).map((q) => [q.key, q.answered])), [summary.data]);

  const add = (q: { label: string; field_type: string; options?: readonly string[] }) =>
    questions.append({ key: uniqueKey(q.label, current().map((x) => x.key)), label: q.label, field_type: q.field_type as "text", required: true, fresh: true, ...(q.options ? { options: [...q.options] } : {}) });

  /** Puts a restructured list in place, then focus where the club was working and say what happened. */
  const restructure = (next: Draft[] | null, focus: { key: string; target: string } | null, said: string) => {
    if (!next) return;
    questions.replace(next);
    setAnnounce(said);
    if (focus) setFocusNext({ index: next.findIndex((q) => q.key === focus.key), target: focus.target });
  };

  // After a restructure the cards remount; put focus back on the control the club used.
  React.useEffect(() => {
    if (!focusNext || focusNext.index < 0) return;
    const el = document.querySelector<HTMLElement>(`[data-question-index="${focusNext.index}"] [data-focus="${focusNext.target}"]`);
    el?.focus();
  }, [focusNext, questions.fields]);

  const current = () => (form.getValues("additional_details") ?? []) as Draft[];
  const confirmDelete = (index: number, children: "delete" | "keep") => {
    const list = current();
    const me = list[index];
    if (!me) return;
    const under = subtreeIndices(list, index).length - 1;
    restructure(
      removeQuestion(list, index, children),
      null,
      children === "delete" ? `Deleted ${nameOf(me)} and the ${under === 1 ? "question" : `${under} questions`} under it.` : `Deleted ${nameOf(me)}. The questions under it are now always shown.`,
    );
    setDeleting(null);
  };
  const deletingQ = deleting !== null ? live[deleting] : undefined;
  const deletingUnder = deletingQ ? live.filter((q) => descendantKeys(live, deletingQ.key).has(q.key)) : [];
  const one = deletingUnder.length === 1;
  const direct = deletingQ ? live.filter((q) => q.show_if?.key === deletingQ.key).length : 0;

  return (
    <div className={cn("grid gap-4", aiFilledClass(ai.has("additional_details")))}>
      {ai.has("additional_details") ? (
        <p className="text-ink-3 m-0 text-[12px]">
          Questions from the draft
          <AiFilledTag on />
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-ink-3 text-[12px]">Add one:</span>
        {STARTERS.map((s) => (
          <Button key={s.label} type="button" variant="outline" size="xs" onClick={() => add(s)} disabled={(form.getValues("additional_details") ?? []).some((q) => q.label === s.label)}>
            {s.label}
          </Button>
        ))}
        <Button type="button" variant="outline" size="xs" onClick={() => questions.append({ key: "", label: "", field_type: "text", required: true, fresh: true })}>
          <PlusIcon className="size-3.5" /> Your own
        </Button>
        {questions.fields.length ? (
          <Button type="button" variant="ghost" size="xs" className="ml-auto" onClick={() => setPreviewing(true)}>
            <EyeIcon className="size-3.5" /> Preview the form
          </Button>
        ) : null}
      </div>

      {questions.fields.length === 0 ? <p className="text-ink-3 border-line rounded-xl border border-dashed px-4 py-8 text-center text-[13px]">Only a name and an email are asked. Every question you add is one more reason to stop halfway, so keep it to what you will use.</p> : null}

      <ul className="grid gap-3" aria-label="Sign-up questions, in the order they are asked">
        {questions.fields.map((item, index) => (
          <QuestionCard
            key={item.id}
            index={index}
            list={live}
            followsLabel={newEvent || live[index]?.fresh === true}
            answered={live[index]?.fresh ? 0 : (answeredBy.get(live[index]?.key ?? "") ?? 0)}
            onMove={(direction) => {
              const list = current();
              const me = list[index];
              if (!me) return;
              const under = subtreeIndices(list, index).length - 1;
              restructure(moveQuestion(list, index, direction), { key: me.key, target: `move-${direction}` }, `Moved ${nameOf(me)} ${direction}${under ? `, with the ${under === 1 ? "question" : `${under} questions`} under it` : ""}.`);
            }}
            onCondition={(showIf) => {
              const list = current();
              const me = list[index];
              if (!me) return;
              const parent = showIf ? list.find((q) => q.key === showIf.key) : undefined;
              restructure(
                setCondition(list, index, showIf),
                { key: me.key, target: showIf ? "condition-parent" : "condition-start" },
                showIf ? `${nameOf(me)} is now asked only on certain answers to ${nameOf(parent)}, and sits under it. Pick the answers that show it.` : `${nameOf(me)} is now always shown.`,
              );
            }}
            onDelete={() => {
              const list = current();
              const me = list[index];
              if (!me) return;
              if (descendantKeys(list, me.key).size) setDeleting(index);
              else {
                questions.remove(index);
                setAnnounce(`Deleted ${nameOf(me)}.`);
              }
            }}
          />
        ))}
      </ul>

      <p aria-live="polite" role="status" className="sr-only">
        {announce}
      </p>

      <FormField control={form.control} name="additional_details" render={() => <FormItem><FormMessage /></FormItem>} />

      <AlertDialog open={deleting !== null} onOpenChange={(open) => (open ? null : setDeleting(null))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {nameOf(deletingQ)}?</AlertDialogTitle>
            <AlertDialogDescription>
              {one ? "One question is" : `${deletingUnder.length} questions are`} asked only on its answers: {deletingUnder.map((q) => q.label?.trim() || q.key).join(", ")}. Delete {one ? "it" : "them"} too, or keep {one ? "it" : "them"}: {direct === 1 ? "the one" : "those"} directly under it {direct === 1 ? "is" : "are"} then asked of everyone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:justify-between">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={() => deleting !== null && confirmDelete(deleting, "keep")}>
                Keep {one ? "it" : "them"}, always shown
              </Button>
              <Button type="button" variant="destructive" onClick={() => deleting !== null && confirmDelete(deleting, "delete")}>
                Delete {one ? "it" : "them"} too
              </Button>
            </div>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {previewing ? <QuestionsPreview questions={current() as Question[]} open={previewing} onOpenChange={setPreviewing} /> : null}
    </div>
  );
}

function QuestionCard({
  index,
  list,
  followsLabel,
  answered,
  onMove,
  onCondition,
  onDelete,
}: {
  index: number;
  /** The questions as they are now, for the tree and the rules. */
  list: Draft[];
  /** Not saved yet: its key may still follow its label. A saved question's key never does. */
  followsLabel: boolean;
  /** How many people have answered it (the event's summary); 0 for a new one. */
  answered: number;
  onMove: (direction: "up" | "down") => void;
  onCondition: (showIf: { key: string; any_of: string[] } | null) => void;
  onDelete: () => void;
}) {
  const form = useFormContext<EventFormValues>();
  const [refused, setRefused] = React.useState<string | null>(null);
  const q = list[index];
  if (!q) return null;
  const number = index + 1;
  const depth = depthOf(list, q.key);
  const condition = conditionText(list as Question[], q as Question);
  const parent = q.show_if ? list.find((p) => p.key === q.show_if?.key) : undefined;
  const under = descendantKeys(list, q.key);
  // Earlier choice questions with options, not under this one: what it may depend on (R1, R2).
  const eligible = list.slice(0, index).filter((p) => p.key && canBeParent(p as Question) && !under.has(p.key) && p.key !== q.key);
  const parentChoices = parent && !eligible.includes(parent) ? [parent, ...eligible] : eligible;
  const hintId = `question-${index}-condition-hint`;

  return (
    <li
      data-question-index={index}
      aria-label={`Question ${number}${q.label ? `, ${q.label}` : ""}${condition ? `, ${condition.toLowerCase()}` : ""}`}
      className={cn("grid gap-3 rounded-xl border p-3", depth > 0 ? "border-brand-line bg-surface border-l-[3px]" : "border-line-soft bg-sunken")}
      style={depth > 0 ? { marginInlineStart: `${Math.min(depth, 5) * INDENT_PX}px` } : undefined}
    >
      {condition || answered > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {condition ? (
            <span className="bg-brand-soft text-brand inline-flex items-center gap-1 rounded-[var(--radius-chip)] px-2 py-0.5 text-[11.5px] font-medium">
              <CornerDownRightIcon aria-hidden="true" className="size-3" />
              {condition}
            </span>
          ) : null}
          {answered > 0 ? (
            <span className="text-ink-3 ml-auto text-[11.5px]" title="Rewording it keeps their answers.">
              Answered by {answered.toLocaleString("en-IN")}
            </span>
          ) : null}
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
        <FormField
          control={form.control}
          name={`additional_details.${index}.label`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Question {number}</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  placeholder="T-shirt size"
                  onChange={(e) => {
                    field.onChange(e);
                    // The shared rule (@moa/questions relabel): a saved question keeps its key; a new one's
                    // follows its label, unique, with its children's conditions; a cleared label keeps it.
                    // Set field by field, not by replacing the list, so the card keeps its focus.
                    const all = form.getValues("additional_details") ?? [];
                    const next = relabel(all, index, e.target.value, followsLabel);
                    const key = next[index]?.key ?? "";
                    if (key === (all[index]?.key ?? "")) return;
                    form.setValue(`additional_details.${index}.key`, key, { shouldValidate: true });
                    next.forEach((c, j) => {
                      if (j !== index && c.show_if && c.show_if.key !== all[j]?.show_if?.key) form.setValue(`additional_details.${j}.show_if.key`, c.show_if.key);
                    });
                  }}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name={`additional_details.${index}.field_type`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Answer</FormLabel>
              <Select
                value={field.value}
                onValueChange={(next) => {
                  // R2 before the fact: a parent stays a choice question while others depend on it.
                  const problem = checkTypeChange(list as Question[], index, next);
                  if (problem) {
                    setRefused(problem.message);
                    return;
                  }
                  setRefused(null);
                  field.onChange(next);
                }}
              >
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {ANSWER_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex items-center gap-0.5 sm:pb-0.5">
          <Button type="button" variant="ghost" size="icon-sm" data-focus="move-up" disabled={!canMove(list, index, "up")} onClick={() => onMove("up")} aria-label={`Move question ${number} up`}>
            <ArrowUpIcon />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" data-focus="move-down" disabled={!canMove(list, index, "down")} onClick={() => onMove("down")} aria-label={`Move question ${number} down`}>
            <ArrowDownIcon />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" className="text-refuse" onClick={onDelete} aria-label={`Remove question ${number}`}>
            <Trash2Icon />
          </Button>
        </div>
      </div>

      {NEEDS_OPTIONS.has(q.field_type ?? "") ? <OptionsEditor index={index} list={list} onRefused={setRefused} /> : null}

      {refused ? (
        <Notice
          tone="caution"
          tag="Kept"
          action={
            <Button type="button" variant="ghost" size="icon-xs" onClick={() => setRefused(null)} aria-label="Dismiss">
              <XIcon />
            </Button>
          }
        >
          {refused}
        </Notice>
      ) : null}

      {q.show_if ? (
        <div role="group" aria-label={`When question ${number} is asked`} className="border-line-soft bg-sunken/60 grid gap-2.5 rounded-lg border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <GitBranchIcon aria-hidden="true" className="text-brand size-3.5" />
            <label htmlFor={`question-${index}-parent`} className="text-ink-2 text-[12.5px] font-medium">
              Only show this if
            </label>
            <NativeSelect id={`question-${index}-parent`} data-focus="condition-parent" size="sm" className="w-auto max-w-full min-w-[10rem]" value={q.show_if.key} onChange={(e) => onCondition({ key: e.target.value, any_of: [] })}>
              {parentChoices.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label?.trim() || p.key}
                </option>
              ))}
            </NativeSelect>
            <span className="text-ink-2 text-[12.5px]">{parent?.field_type === "checkbox" ? "includes any of" : "is"}</span>
          </div>
          <div role="group" aria-label={`Answers to ${parent?.label?.trim() || "it"} that show question ${number}`} className="flex flex-wrap gap-1.5">
            {(parent?.options ?? []).filter((o) => o.trim()).map((o) => {
              const on = q.show_if?.any_of.includes(o) ?? false;
              return (
                <Chip
                  key={o}
                  active={on}
                  onClick={() => {
                    const anyOf = on ? (q.show_if?.any_of ?? []).filter((v) => v !== o) : [...(q.show_if?.any_of ?? []), o];
                    // In the parent's own order, each once.
                    form.setValue(`additional_details.${index}.show_if.any_of`, (parent?.options ?? []).filter((v) => anyOf.includes(v)), { shouldDirty: true, shouldValidate: form.formState.isSubmitted });
                  }}
                >
                  {o}
                </Chip>
              );
            })}
          </div>
          <FormField control={form.control} name={`additional_details.${index}.show_if`} render={() => <FormItem><FormMessage /></FormItem>} />
          <div>
            <Button type="button" variant="ghost" size="xs" data-focus="condition-clear" onClick={() => onCondition(null)}>
              Always show this question
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            data-focus="condition-start"
            disabled={!eligible.length}
            aria-describedby={eligible.length ? undefined : hintId}
            onClick={() => {
              const nearest = eligible[eligible.length - 1];
              if (nearest) onCondition({ key: nearest.key, any_of: [] });
            }}
          >
            <GitBranchIcon className="size-3.5" /> Only show this if…
          </Button>
          {!eligible.length ? (
            <span id={hintId} className="text-ink-3 text-[11.5px]">
              {index === 0 ? "The first question is always asked." : "To ask this only on some answers, put a choice question with options above it."}
            </span>
          ) : null}
        </div>
      )}

      <FormField
        control={form.control}
        name={`additional_details.${index}.required`}
        render={({ field }) => (
          <FormItem className="flex items-center gap-2">
            <FormControl>
              <Switch checked={field.value} onCheckedChange={field.onChange} aria-label={`Question ${number} is required${q.show_if ? " when shown" : ""}`} />
            </FormControl>
            <FormLabel className="font-normal">{q.show_if ? "Must be answered when shown" : "Must be answered"}</FormLabel>
          </FormItem>
        )}
      />
    </li>
  );
}

/**
 * A choice question's options, one a row. An option a later question's
 * condition uses can't be removed or renamed (R6): the change is refused
 * and said, naming that question.
 */
function OptionsEditor({ index, list, onRefused }: { index: number; list: Draft[]; onRefused: (message: string | null) => void }) {
  const form = useFormContext<EventFormValues>();
  const q = list[index];
  const options = q?.options ?? [];
  const label = q?.label?.trim() || `question ${index + 1}`;
  const groupRef = React.useRef<HTMLDivElement>(null);
  const change = (next: string[], focus?: number) => {
    const problem = checkOptionChange(list as Question[], index, next);
    if (problem) {
      onRefused(problem.message);
      return;
    }
    onRefused(null);
    form.setValue(`additional_details.${index}.options`, next, { shouldDirty: true, shouldValidate: form.formState.isSubmitted });
    if (focus !== undefined) requestAnimationFrame(() => groupRef.current?.querySelectorAll<HTMLInputElement>("input")[focus]?.focus());
  };
  const usedBy = (o: string) => list.filter((c) => c.show_if?.key === q?.key && c.show_if?.any_of.includes(o));

  return (
    <FormField
      control={form.control}
      name={`additional_details.${index}.options`}
      render={() => (
        <FormItem>
          <span className="text-ink-2 text-[12.5px] font-medium">Choices</span>
          <div ref={groupRef} role="group" aria-label={`Choices for ${label}`} className="grid gap-1.5">
            {options.map((o, i) => {
              const users = usedBy(o);
              return (
                <div key={i} className="flex items-center gap-1.5">
                  <Input
                    value={o}
                    aria-label={`Choice ${i + 1} of ${label}`}
                    placeholder={`Choice ${i + 1}`}
                    className="h-8"
                    onChange={(e) => change(options.map((v, j) => (j === i ? e.target.value : v)))}
                    onKeyDown={(e) => {
                      // Enter adds the next choice rather than saving the event.
                      if (e.key === "Enter") {
                        e.preventDefault();
                        change([...options.slice(0, i + 1), "", ...options.slice(i + 1)], i + 1);
                      }
                    }}
                  />
                  {users.length ? (
                    <span className="text-ink-3 hidden shrink-0 text-[11px] whitespace-nowrap sm:inline" title={users.map((u) => u.label?.trim() || u.key).join(", ")}>
                      shows {users.length === 1 ? users[0]!.label?.trim() || "1 question" : `${users.length} questions`}
                    </span>
                  ) : null}
                  <Button type="button" variant="ghost" size="icon-xs" aria-label={`Remove choice ${o || i + 1}`} onClick={() => change(options.filter((_, j) => j !== i), Math.max(0, i - 1))}>
                    <XIcon />
                  </Button>
                </div>
              );
            })}
            <div>
              <Button type="button" variant="ghost" size="xs" onClick={() => change([...options, ""], options.length)}>
                <PlusIcon className="size-3.5" /> Add a choice
              </Button>
            </div>
          </div>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
