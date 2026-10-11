"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2Icon } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
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
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@moa/ui";

import { useAddAttendee, useUpdateRegistration } from "../queries";
import { REGISTRATION_ROLES, type EventField, type RegistrationDetail, type RegistrationRole } from "../schemas";

const ROLE_LABELS: Record<RegistrationRole, string> = { attendee: "Attendee", speaker: "Speaker", staff: "Staff" };

const valuesSchema = z.object({
  full_name: z.string().trim().min(1, "A name is needed.").max(100),
  email: z.string().trim().email("That does not look like an email address."),
  phone: z.string().trim().max(15, "Too long for a phone number.").optional(),
  role: z.enum(REGISTRATION_ROLES),
  answers: z.record(z.string()),
});
type Values = z.infer<typeof valuesSchema>;

/**
 * Add by hand (a spot registration) or correct an existing guest. The
 * event's own questions are asked too, so a guest added here is as complete
 * as one who used the form. Nothing is emailed from here.
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
  const answersOf = (r: RegistrationDetail | null) =>
    Object.fromEntries(fields.map((f) => [f.key, String((r?.additional_details as Record<string, unknown> | null | undefined)?.[f.key] ?? "")]));
  const form = useForm<Values>({
    resolver: zodResolver(valuesSchema),
    mode: "onBlur",
    defaultValues: existing
      ? { full_name: existing.full_name ?? "", email: existing.email ?? "", phone: existing.phone ?? "", role: existing.role, answers: answersOf(existing) }
      : { full_name: "", email: "", phone: "", role: "attendee", answers: answersOf(null) },
  });
  const busy = add.isPending || update.isPending;

  const submit = form.handleSubmit((v) => {
    // A required question left blank is refused here, the way the server refuses it.
    for (const f of fields) {
      if (f.required !== false && !v.answers[f.key]?.trim()) {
        form.setError(`answers.${f.key}`, { message: "This is required." });
        return;
      }
    }
    const answers = Object.fromEntries(Object.entries(v.answers).filter(([, value]) => value.trim() !== ""));
    const done = () => {
      onOpenChange(false);
      form.reset();
    };
    if (existing) {
      update.mutate(
        { registrationId: existing.id, patch: { full_name: v.full_name, email: v.email, phone: v.phone || null, role: v.role, additional_details: answers } },
        { onSuccess: done }
      );
    } else {
      add.mutate({ full_name: v.full_name, email: v.email, phone: v.phone || null, role: v.role, additional_details: answers }, { onSuccess: done });
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{existing ? `Correct ${existing.full_name ?? "this guest"}` : "Add a guest"}</DialogTitle>
          <DialogDescription>
            {existing
              ? "Name, contact, role and answers. Their account is left alone — this is the registration."
              : "A spot registration. Nothing is emailed from here; Send tickets delivers theirs, and records it."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={submit} noValidate className="space-y-3">
            <FormField
              control={form.control}
              name="full_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Ananya Iyer" autoFocus {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="ananya@example.com" {...field} />
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
                    <FormLabel>Phone</FormLabel>
                    <FormControl>
                      <Input type="tel" placeholder="optional" {...field} />
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
                  <FormLabel>Attending as</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {REGISTRATION_ROLES.map((r) => (
                        <SelectItem key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            {fields.length ? (
              <div className="bg-muted/40 space-y-3 rounded-md border p-3">
                {fields.map((f) => (
                  <FormField
                    key={f.key}
                    control={form.control}
                    name={`answers.${f.key}` as const}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          {f.label ?? f.key}
                          {f.required === false ? <span className="text-muted-foreground"> — optional</span> : null}
                        </FormLabel>
                        {f.options?.length ? (
                          <Select value={field.value || ""} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Choose" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {f.options.map((o) => (
                                <SelectItem key={o} value={o}>
                                  {o}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <FormControl>
                            <Input {...field} value={field.value ?? ""} />
                          </FormControl>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ))}
              </div>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
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
