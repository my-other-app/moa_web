"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2Icon, PlusIcon, ScanLineIcon, Trash2Icon, UserPlusIcon } from "lucide-react";
import { initials } from "@moa/app-kit";
import {
  Avatar,
  AvatarFallback,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Skeleton,
  cn,
} from "@moa/ui";
import { pressable, stagger } from "@moa/ui/motion";

import { useAddVolunteer, useRemoveVolunteer, useVolunteers } from "../queries";
import { addVolunteerSchema, type AddVolunteerInput, type Volunteer } from "../schemas";

function emailOf(v: Volunteer): string {
  return v.email_id ?? v.email ?? "";
}

export function VolunteersPanel({ eventId }: { eventId: number }) {
  const { data, isPending, isError } = useVolunteers(eventId);
  const add = useAddVolunteer(eventId);
  const remove = useRemoveVolunteer(eventId);

  const form = useForm<AddVolunteerInput>({
    resolver: zodResolver(addVolunteerSchema),
    defaultValues: { full_name: "", email_id: "", phone: "" },
  });

  async function onSubmit(values: AddVolunteerInput) {
    await add.mutateAsync(values);
    form.reset();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Volunteers</CardTitle>
          <CardDescription className="flex items-center gap-1.5">
            <ScanLineIcon className="size-3.5" />
            Volunteers can scan tickets to check people in from the mobile app.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isPending ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : isError ? (
            <p className="text-muted-foreground text-sm">Could not load volunteers.</p>
          ) : !data || data.length === 0 ? (
            <EmptyState
              icon={<UserPlusIcon />}
              title="No volunteers yet"
              description="Add someone so they can check attendees in on the day."
              size="sm"
            />
          ) : (
            <ul className="divide-y">
              {data.map((v, i) => (
                <li
                  key={emailOf(v) || v.id}
                  style={stagger(i, 40, 200)}
                  className="animate-in fade-in-0 flex items-center gap-3 py-3 motion-reduce:animate-none"
                >
                  <Avatar className="size-8">
                    <AvatarFallback className="text-[11px]">
                      {initials(v.full_name ?? v.name ?? emailOf(v))}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {v.full_name || v.name || "Unnamed"}
                    </p>
                    <p className="text-muted-foreground truncate text-xs">{emailOf(v)}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className={cn("text-destructive hover:text-destructive", pressable)}
                    aria-label={`Remove ${v.full_name ?? emailOf(v)}`}
                    disabled={remove.isPending || !emailOf(v)}
                    onClick={() => remove.mutate(emailOf(v))}
                  >
                    {remove.isPending ? (
                      <Loader2Icon className="animate-spin" />
                    ) : (
                      <Trash2Icon />
                    )}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="text-base">Add a volunteer</CardTitle>
          <CardDescription>
            They will get check-in access for this event.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
              <FormField
                control={form.control}
                name="full_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Asha K" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input {...field} type="email" placeholder="asha@example.com" />
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
                    <FormLabel>
                      Phone{" "}
                      <span className="text-muted-foreground font-normal">(optional)</span>
                    </FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} inputMode="tel" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                className={cn("w-full", pressable)}
                disabled={add.isPending}
              >
                {add.isPending ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
                {add.isPending ? "Adding…" : "Add volunteer"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
