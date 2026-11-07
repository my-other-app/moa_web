"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2Icon } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { requiredWhenShown, visibility, visibilityChange } from "@moa/questions";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  NativeSelect,
} from "@moa/ui";

import { QUESTION_FIELD as FIELD, QUESTION_LABEL as LABEL, QuestionControl, RevealNotice, useRevealNotice } from "@/components/question-control";
import { answerForForm, answersPayload, invalidAnswers, isBlank, isMultiChoice, type AnswerValue } from "@/lib/answers";

import { useAddAttendee, useUpdateRegistration } from "../queries";
import {
  REGISTRATION_ROLES,
  type EventField,
  type RegistrationDetail,
  type RegistrationRole,
} from "../schemas";

const ROLE_LABELS: Record<RegistrationRole, string> = {
  attendee: "Attendee",
  speaker: "Speaker",
  staff: "Staff",
};

const valuesSchema = z.object({
  full_name: z.string().trim().min(1, "A name is needed.").max(100),
  email: z.string().trim().email("That does not look like an email address."),
  phone: z.string().trim().max(15, "Too long for a phone number.").optional(),
  role: z.enum(REGISTRATION_ROLES),
  // A several-choices question holds the ticked options; every other, text.
  answers: z.record(z.union([z.string(), z.array(z.string())])),
});
type Values = z.infer<typeof valuesSchema>;

/**
 * Add by hand (a spot registration) or correct an existing guest. The
 * event's own questions are asked too, so a guest added here is as complete
 * as one who used the form. Nothing is emailed from here.
 *
 * Conditional questions behave as on the attendee's form (contract §8):
 * only the questions their answers reveal are asked, in the form's order; a
 * question that stops applying is hidden and its answer cleared at once;
 * "required" is the club's required-when-shown; and only the questions
 * shown are sent (the server drops the rest anyway).
 */
export function AttendeeFormDialog({
  eventId,
  fields,
  existing,
  open,
  onOpenChange,
}: {
  eventId: number;
  fields: EventField[];
  existing: RegistrationDetail | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const add = useAddAttendee(eventId);
  const update = useUpdateRegistration(eventId);
  const answersOf = (r: RegistrationDetail | null): Record<string, AnswerValue> =>
    Object.fromEntries(
      fields.map((f) => [
        f.key,
        answerForForm(
          f,
          (r?.additional_details as Record<string, unknown> | null | undefined)?.[f.key],
        ),
      ]),
    );
  const form = useForm<Values>({
    resolver: zodResolver(valuesSchema),
    mode: "onBlur",
    defaultValues: existing
      ? {
          full_name: existing.full_name ?? "",
          email: existing.email ?? "",
          phone: existing.phone ?? "",
          role: existing.role,
          answers: answersOf(existing),
        }
      : {
          full_name: "",
          email: "",
          phone: "",
          role: "attendee",
          answers: answersOf(null),
        },
  });
  const busy = add.isPending || update.isPending;

  const watched = useWatch({ control: form.control, name: "answers" });
  const shown = React.useMemo(() => visibility(fields, watched ?? {}), [fields, watched]);
  const asked = fields.filter((f) => shown.get(f.key) === true);
  const notice = useRevealNotice(fields, shown);
  // A question that stops applying loses its answer the moment it is hidden,
  // so what is on screen is what is sent. Only one that was showing: a
  // stored answer to a question already hidden when the dialog opened (the
  // form changed after they registered) is left alone until a save.
  const lastShown = React.useRef(shown);
  React.useEffect(() => {
    const { hidden } = visibilityChange(fields, lastShown.current, shown);
    lastShown.current = shown;
    for (const f of hidden) {
      if (!isBlank(form.getValues(`answers.${f.key}`))) form.setValue(`answers.${f.key}`, isMultiChoice(f) ? [] : "");
      form.clearErrors(`answers.${f.key}`);
    }
  }, [fields, shown, form]);

  const submit = form.handleSubmit((v) => {
    const askedNow = fields.filter((f) => visibility(fields, v.answers).get(f.key) === true);
    // A required question left blank is refused here, the way the server refuses it.
    for (const f of askedNow) {
      if (requiredWhenShown(f) && isBlank(v.answers[f.key])) {
        form.setError(`answers.${f.key}`, { message: "This is required." });
        return;
      }
    }
    // A blank answer is left out; several ticks go as a list, one as itself;
    // a question the answers hide is not sent at all.
    const answers = answersPayload(askedNow, v.answers);
    const done = () => {
      onOpenChange(false);
      form.reset();
    };
    // The API's word on an answer it refused (INVALID_ANSWERS: a number
    // that is not one, an option no longer offered), under that question.
    const refused = (error: unknown) => {
      const problems = invalidAnswers(error);
      if (!problems) return;
      for (const [key, message] of Object.entries(problems)) {
        if (fields.some((f) => f.key === key)) form.setError(`answers.${key}`, { message });
        else form.setError("root.answers", { message });
      }
    };
    if (existing) {
      update.mutate(
        {
          registrationId: existing.id,
          patch: {
            full_name: v.full_name,
            email: v.email,
            phone: v.phone || null,
            role: v.role,
            additional_details: answers,
          },
        },
        { onSuccess: done, onError: refused },
      );
    } else {
      add.mutate(
        {
          full_name: v.full_name,
          email: v.email,
          phone: v.phone || null,
          role: v.role,
          additional_details: answers,
        },
        { onSuccess: done, onError: refused },
      );
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {existing
              ? `Correct ${existing.full_name ?? "this guest"}`
              : "Add a guest"}
          </DialogTitle>
          <DialogDescription>
            {existing
              ? "Name, contact, role and answers. Their account is left alone — this is the registration."
              : "A spot registration. Nothing is emailed from here; Send tickets delivers theirs, and records it."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={submit} noValidate className="grid gap-3.5">
            <FormField
              control={form.control}
              name="full_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className={LABEL}>Name</FormLabel>
                  <FormControl>
                    <input className={FIELD} placeholder="Ananya Iyer" autoFocus {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid gap-3.5 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className={LABEL}>Email</FormLabel>
                    <FormControl>
                      <input
                        className={FIELD}
                        type="email"
                        placeholder="ananya@example.com"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className={LABEL}>Phone</FormLabel>
                    <FormControl>
                      <input className={FIELD} type="tel" placeholder="optional" {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className={LABEL}>Attending as</FormLabel>
                  <FormControl>
                    <NativeSelect className="w-full" {...field}>
                      {REGISTRATION_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </option>
                      ))}
                    </NativeSelect>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {fields.length ? (
              <div className="bg-sunken grid gap-3 rounded-xl p-3.5">
                <p className="text-ink-3 -mb-1 text-[12px]">This event&apos;s own questions</p>
                {asked.map((f) => (
                  <FormField
                    key={f.key}
                    control={form.control}
                    name={`answers.${f.key}` as const}
                    render={({ field }) => (
                      <FormItem className="motion-safe:animate-in motion-safe:fade-in-0">
                        <FormLabel className={LABEL}>
                          {f.label ?? f.key}
                          {requiredWhenShown(f) ? "" : " · optional"}
                        </FormLabel>
                        {isMultiChoice(f) ? (
                          <QuestionControl field={f} value={field.value} onChange={field.onChange} />
                        ) : (
                          <FormControl>
                            <QuestionControl field={f} value={field.value} onChange={field.onChange} name={field.name} onBlur={field.onBlur} ref={field.ref} />
                          </FormControl>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ))}
                <RevealNotice notice={notice} />
                {form.formState.errors.root?.answers ? (
                  <p className="text-refuse text-[12px]">{form.formState.errors.root.answers.message}</p>
                ) : null}
              </div>
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? <Loader2Icon className="animate-spin" /> : null}
                {existing ? "Save details" : "Add to the list"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
