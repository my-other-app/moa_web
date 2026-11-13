"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2Icon } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { ApiError } from "@moa/api";
import { visibility, visibilityChange } from "@moa/questions";
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
} from "@moa/ui";

import { QUESTION_FIELD as FIELD, QUESTION_LABEL as LABEL, QuestionControl, RevealNotice, useRevealNotice } from "@/components/question-control";
import { answerForForm, answersPayload, invalidAnswers, isBlank, isMultiChoice, type AnswerValue } from "@/lib/answers";
import type { EventField } from "@/features/registrations/schemas";

import { useCorrectRequest } from "../queries";
import type { RegistrationRequest } from "../schemas";

const valuesSchema = z.object({
  full_name: z.string().trim().min(1, "A name is needed.").max(100),
  email: z.string().trim().email("That does not look like an email address.").max(100),
  phone: z.string().trim().max(15, "Too long for a phone number.").optional(),
  // A several-choices question holds the ticked options; every other, text.
  answers: z.record(z.union([z.string(), z.array(z.string())])),
});
type Values = z.infer<typeof valuesSchema>;

/** The API's 409 for an address another request or a registration of the event already uses. */
function conflictMessage(error: unknown): string | null {
  if (!(error instanceof ApiError) || error.status !== 409) return null;
  return error.message || "That email is already used on this event.";
}

/**
 * Correct someone whose registration is under review (or already decided):
 * the name, email, phone and answers they sent, e.g. after they wrote to
 * support. Nothing is decided and nothing is emailed. A confirmed one whose
 * registration is on the list is corrected there too (the server does it).
 *
 * Unlike the form, nothing is required here: the organiser is fixing what
 * was sent, not filling the form in for them. Only the questions shown are
 * sent, and a question that stops applying loses its answer (as on the form).
 */
export function RequestEditDialog({
  eventId,
  fields,
  request,
  open,
  onOpenChange,
}: {
  eventId: number;
  fields: EventField[];
  request: RegistrationRequest;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const correct = useCorrectRequest(eventId);
  const answersOf = React.useCallback(
    (r: RegistrationRequest): Record<string, AnswerValue> =>
      Object.fromEntries(fields.map((f) => [f.key, answerForForm(f, (r.answers as Record<string, unknown> | null | undefined)?.[f.key])])),
    [fields],
  );
  const form = useForm<Values>({
    resolver: zodResolver(valuesSchema),
    mode: "onBlur",
    defaultValues: { full_name: request.full_name, email: request.email ?? "", phone: request.phone ?? "", answers: answersOf(request) },
  });

  // Opened on another person: start from theirs.
  React.useEffect(() => {
    if (open) form.reset({ full_name: request.full_name, email: request.email ?? "", phone: request.phone ?? "", answers: answersOf(request) });
  }, [open, request, answersOf, form]);

  const watched = useWatch({ control: form.control, name: "answers" });
  const shown = React.useMemo(() => visibility(fields, watched ?? {}), [fields, watched]);
  const asked = fields.filter((f) => shown.get(f.key) === true);
  const notice = useRevealNotice(fields, shown);
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
    const dirty = form.formState.dirtyFields;
    // Only what changed goes: a correction never rewrites the rest.
    const patch: { full_name?: string; email?: string; phone?: string; answers?: Record<string, unknown> } = {};
    if (dirty.full_name) patch.full_name = v.full_name;
    if (dirty.email) patch.email = v.email;
    if (dirty.phone) patch.phone = v.phone ?? "";
    if (dirty.answers) {
      const sent = answersPayload(askedNow, v.answers);
      // A question cleared here is cleared on the server too (its key, blank).
      for (const f of askedNow) if (!(f.key in sent) && !isBlank(answersOf(request)[f.key])) sent[f.key] = "";
      patch.answers = sent;
    }
    if (!Object.keys(patch).length) {
      onOpenChange(false);
      return;
    }
    correct.mutate(
      { requestId: request.id, patch },
      {
        onSuccess: () => onOpenChange(false),
        onError: (error) => {
          const clash = conflictMessage(error);
          if (clash) {
            form.setError("email", { message: clash });
            return;
          }
          const problems = invalidAnswers(error);
          if (!problems) return;
          for (const [key, message] of Object.entries(problems)) {
            if (fields.some((f) => f.key === key)) form.setError(`answers.${key}`, { message });
            else form.setError("root.answers", { message });
          }
        },
      },
    );
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit {request.full_name}&apos;s details</DialogTitle>
          <DialogDescription>
            Fix what they sent: name, email, phone and answers. Nothing is decided and nothing is emailed.
            {request.registration_id ? " They're registered, so their registration is corrected too." : ""}
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
                    <input className={FIELD} autoFocus {...field} />
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
                      <input className={FIELD} type="email" {...field} />
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
            {asked.length ? (
              <div className="bg-sunken grid gap-3 rounded-xl p-3.5">
                <p className="text-ink-3 -mb-1 text-[12px]">Their answers</p>
                {asked.map((f) => (
                  <FormField
                    key={f.key}
                    control={form.control}
                    name={`answers.${f.key}` as const}
                    render={({ field }) => (
                      <FormItem className="motion-safe:animate-in motion-safe:fade-in-0">
                        <FormLabel className={LABEL}>{f.label ?? f.key}</FormLabel>
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
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={correct.isPending}>
                {correct.isPending ? <Loader2Icon className="animate-spin" /> : null}
                Save details
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
