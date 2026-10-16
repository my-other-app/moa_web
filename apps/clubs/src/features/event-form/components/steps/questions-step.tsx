"use client";

import { useFieldArray, useFormContext } from "react-hook-form";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { Button, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Switch } from "@moa/ui";

import { ANSWER_TYPES } from "../../readiness";
import type { EventFormValues } from "../../schemas";

/** Turns a label into a stable snake_case key so organisers never type one. */
function toKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

const NEEDS_OPTIONS = new Set(["radio", "checkbox"]);
const STARTERS = [
  { label: "College", field_type: "text" },
  { label: "Year of study", field_type: "number" },
  { label: "T-shirt size", field_type: "radio", options: ["S", "M", "L", "XL"] },
  { label: "Team name", field_type: "text" },
] as const;

/**
 * Sign-up questions, beyond a name and an email. The answer types are in
 * words; a few common questions are one click; the key is derived from the
 * label and kept once answers exist under it.
 */
export function QuestionsStep() {
  const form = useFormContext<EventFormValues>();
  const questions = useFieldArray({ control: form.control, name: "additional_details" });
  const add = (q: { label: string; field_type: string; options?: readonly string[] }) =>
    questions.append({ key: toKey(q.label), label: q.label, field_type: q.field_type as "text", required: true, ...(q.options ? { options: [...q.options] } : {}) });

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-ink-3 text-[12px]">Add one:</span>
        {STARTERS.map((s) => (
          <Button key={s.label} type="button" variant="outline" size="xs" onClick={() => add(s)} disabled={(form.getValues("additional_details") ?? []).some((q) => q.label === s.label)}>
            {s.label}
          </Button>
        ))}
        <Button type="button" variant="outline" size="xs" onClick={() => questions.append({ key: "", label: "", field_type: "text", required: true })}>
          <PlusIcon className="size-3.5" /> Your own
        </Button>
      </div>

      {questions.fields.length === 0 ? <p className="text-ink-3 border-line rounded-xl border border-dashed px-4 py-8 text-center text-[13px]">Only a name and an email are asked. Every question you add is one more reason to stop halfway, so keep it to what you will use.</p> : null}

      <ul className="grid gap-3">
        {questions.fields.map((item, index) => {
          const fieldType = form.watch(`additional_details.${index}.field_type`);
          return (
            <li key={item.id} className="border-line-soft bg-sunken grid gap-3 rounded-xl border p-3">
              <div className="grid gap-3 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
                <FormField
                  control={form.control}
                  name={`additional_details.${index}.label`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Question {index + 1}</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="T-shirt size"
                          onChange={(e) => {
                            field.onChange(e);
                            const current = form.getValues(`additional_details.${index}.key`);
                            const previous = toKey(field.value ?? "");
                            if (!current || current === previous) form.setValue(`additional_details.${index}.key`, toKey(e.target.value), { shouldValidate: true });
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
                      <Select value={field.value} onValueChange={field.onChange}>
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
                <Button type="button" variant="ghost" size="icon" className="text-refuse" onClick={() => questions.remove(index)} aria-label={`Remove question ${index + 1}`}>
                  <Trash2Icon />
                </Button>
              </div>
              {NEEDS_OPTIONS.has(fieldType ?? "") ? (
                <FormField
                  control={form.control}
                  name={`additional_details.${index}.options`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Choices</FormLabel>
                      <FormControl>
                        <Input value={(field.value ?? []).join(", ")} onChange={(e) => field.onChange(e.target.value.split(",").map((s) => s.trim()).filter(Boolean))} placeholder="Small, Medium, Large" />
                      </FormControl>
                      <FormDescription>Separated by commas.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : null}
              <FormField
                control={form.control}
                name={`additional_details.${index}.required`}
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2">
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} aria-label={`Question ${index + 1} is required`} />
                    </FormControl>
                    <FormLabel className="font-normal">Must be answered</FormLabel>
                  </FormItem>
                )}
              />
            </li>
          );
        })}
      </ul>

      <FormField control={form.control} name="additional_details" render={() => <FormItem><FormMessage /></FormItem>} />
    </div>
  );
}
