"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2Icon, SaveIcon } from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Skeleton,
  Textarea,
  cn,
} from "@moa/ui";
import { pressable } from "@moa/ui/motion";

import { useMyClub, useUpdateMyClub } from "../queries";
import { clubProfileFormSchema, type ClubProfileForm as Values } from "../schemas";

export function ClubProfileForm() {
  const { data: club, isPending } = useMyClub();
  const update = useUpdateMyClub();

  const form = useForm<Values>({
    resolver: zodResolver(clubProfileFormSchema),
    values: club
      ? {
          // `values` (not defaultValues) so the form repopulates once the
          // query resolves -- defaultValues are captured once and would leave
          // every field blank on first paint.
          name: club.name ?? "",
          about: club.about ?? "",
          location_name: club.location_name ?? "",
          contact_email: club.contact_email ?? "",
          contact_phone: club.contact_phone ?? "",
          instagram: club.socials?.instagram ?? "",
          youtube: club.socials?.youtube ?? "",
          linkedin: club.socials?.linkedin ?? "",
          website: club.socials?.website ?? "",
        }
      : undefined,
  });

  if (isPending) return <Skeleton className="h-[32rem] w-full" />;

  const isSaving = update.isPending || form.formState.isSubmitting;
  const isDirty = form.formState.isDirty;

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((values) => update.mutate(values))}
        className="space-y-6"
        noValidate
      >
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Club details</CardTitle>
            <CardDescription>
              Shown to students browsing clubs in the app.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Club name</FormLabel>
                  <FormControl>
                    <Input {...field} disabled={isSaving} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="about"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>About</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      rows={4}
                      disabled={isSaving}
                      placeholder="What your club does, who it's for…"
                    />
                  </FormControl>
                  <FormDescription>
                    {(field.value?.length ?? 0).toLocaleString("en-IN")} / 2000
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="location_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Location</FormLabel>
                  <FormControl>
                    <Input {...field} disabled={isSaving} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="contact_email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Contact email</FormLabel>
                  <FormControl>
                    <Input {...field} type="email" disabled={isSaving} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="contact_phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Contact phone</FormLabel>
                  <FormControl>
                    <Input {...field} inputMode="tel" disabled={isSaving} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Social links</CardTitle>
            <CardDescription>Optional. Full URLs, including https://</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5 sm:grid-cols-2">
            {(["instagram", "youtube", "linkedin", "website"] as const).map((key) => (
              <FormField
                key={key}
                control={form.control}
                name={key}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="capitalize">{key}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="url"
                        inputMode="url"
                        placeholder="https://"
                        disabled={isSaving}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ))}
          </CardContent>
        </Card>

        {/* Sticky so the save control stays reachable on a long form on mobile. */}
        <div className="bg-background/80 sticky bottom-0 flex items-center justify-end gap-3 border-t py-3 backdrop-blur-sm">
          {isDirty ? (
            <p className="text-muted-foreground animate-in fade-in-0 mr-auto text-xs motion-reduce:animate-none">
              Unsaved changes
            </p>
          ) : null}
          <Button type="submit" disabled={isSaving || !isDirty} className={cn(pressable)}>
            {isSaving ? <Loader2Icon className="animate-spin" /> : <SaveIcon />}
            {isSaving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
