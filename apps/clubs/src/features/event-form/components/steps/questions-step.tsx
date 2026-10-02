"use client";

import { useFieldArray, useFormContext } from "react-hook-form";
import { GripVerticalIcon, PlusIcon, Trash2Icon } from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  cn,
} from "@moa/ui";
import { pressable } from "@moa/ui/motion";

import { FIELD_TYPES, type EventFormValues } from "../../schemas";

/** Turns a label into a stable snake_case key so organisers never type one. */
function toKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

const NEEDS_OPTIONS = new Set(["radio", "checkbox"]);

export function QuestionsStep() {
  const form = useFormContext<EventFormValues>();
  const questions = useFieldArray({ control: form.control, name: "additional_details" });

  return (
    <div className="grid gap-4">
      <div className="flex items-start justify-between gap-4">
        {/* Intro copy, not a field description — see details-step. */}
        <p className="text-muted-foreground max-w-prose text-xs">
          Asked when someone registers, in addition to their name and email. Answers
          appear in the attendee export.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn("shrink-0", pressable)}
          onClick={() =>
            questions.append({
              key: "",
              label: "",
              field_type: "text",
              required: true,
            })
          }
        >
          <PlusIcon /> Add question
        </Button>
      </div>

      {questions.fields.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-10 text-center text-sm">
          No extra questions. Registrants will only be asked for the basics.
        </p>
      ) : null}

      <div className="grid gap-3">
        {questions.fields.map((item, index) => {
          const fieldType = form.watch(`additional_details.${index}.field_type`);
          return (
            <Card
              key={item.id}
              className="animate-in fade-in-0 slide-in-from-top-1 motion-reduce:animate-none"
            >
              <CardContent className="grid gap-4">
                <div className="flex items-start gap-3">
                  <GripVerticalIcon className="text-muted-foreground mt-8 size-4 shrink-0" aria-hidden="true" />
                  <div className="grid flex-1 gap-4 sm:grid-cols-[2fr_1fr]">
                    <FormField
                      control={form.control}
                      name={`additional_details.${index}.label`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Question</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              placeholder="T-shirt size"
                              onChange={(e) => {
                                field.onChange(e);
                                // Derive the key only while it is still
                                // untouched, so editing a label later cannot
                                // silently orphan answers already collected
                                // under the old key.
                                const current = form.getValues(`additional_details.${index}.key`);
                                const previous = toKey(field.value ?? "");
                                if (!current || current === previous) {
                                  form.setValue(
                                    `additional_details.${index}.key`,
                                    toKey(e.target.value),
                                    { shouldValidate: true }
                                  );
                                }
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
                          <FormLabel>Answer type</FormLabel>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger className="w-full">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {FIELD_TYPES.map((t) => (
                                <SelectItem key={t} value={t}>
                                  {t}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className={cn("text-destructive hover:text-destructive mt-6", pressable)}
                    onClick={() => questions.remove(index)}
                    aria-label={`Remove question ${index + 1}`}
                  >
                    <Trash2Icon />
                  </Button>
                </div>

                {NEEDS_OPTIONS.has(fieldType ?? "") ? (
                  <FormField
                    control={form.control}
                    name={`additional_details.${index}.options`}
                    render={({ field }) => (
                      <FormItem className="animate-in fade-in-0 pl-7 motion-reduce:animate-none">
                        <FormLabel>Options</FormLabel>
                        <FormControl>
                          <Input
                            value={(field.value ?? []).join(", ")}
                            onChange={(e) =>
                              field.onChange(
                                e.target.value
                                  .split(",")
                                  .map((s) => s.trim())
                                  .filter(Boolean)
                              )
                            }
                            placeholder="Small, Medium, Large"
                          />
                        </FormControl>
                        <FormDescription>Separate options with commas.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ) : null}

                <FormField
                  control={form.control}
                  name={`additional_details.${index}.required`}
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-3 pl-7">
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                      <FormLabel className="font-normal">Required</FormLabel>
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>
          );
        })}
      </div>

      <FormField
        control={form.control}
        name="additional_details"
        render={() => (
          <FormItem>
            {/* Surfaces the duplicate-key error raised by the schema. */}
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
