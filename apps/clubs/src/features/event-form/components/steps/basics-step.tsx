"use client";

import * as React from "react";
import Image from "next/image";
import { useFormContext } from "react-hook-form";
import { ImagePlusIcon, XIcon } from "lucide-react";
import {
  Badge,
  Button,
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
  Skeleton,
  Textarea,
  cn,
} from "@moa/ui";
import { pressable } from "@moa/ui/motion";

import { useEventCategories, useInterests } from "../../queries";
import type { EventFormValues } from "../../schemas";

export function BasicsStep() {
  const form = useFormContext<EventFormValues>();
  const categories = useEventCategories();
  const interests = useInterests();
  const [preview, setPreview] = React.useState<string | null>(null);

  const posterFile = form.watch("posterFile");

  React.useEffect(() => {
    if (!posterFile) {
      setPreview(null);
      return;
    }
    // Object URLs must be revoked or each re-pick leaks a blob for the life of
    // the page.
    const url = URL.createObjectURL(posterFile);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [posterFile]);

  const selectedInterests = form.watch("interest_ids") ?? [];

  return (
    <div className="grid gap-6">
      <FormField
        control={form.control}
        name="name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Event name</FormLabel>
            <FormControl>
              <Input {...field} placeholder="Hackathon 2026" autoFocus />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="grid gap-6 sm:grid-cols-2">
        <FormField
          control={form.control}
          name="category_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Category</FormLabel>
              {categories.isPending ? (
                <Skeleton className="h-9 w-full" />
              ) : (
                <Select
                  value={field.value ? String(field.value) : undefined}
                  onValueChange={(v) => field.onChange(Number(v))}
                >
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Choose a category" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {categories.data?.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="event_tag"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Tag <span className="text-muted-foreground font-normal">(optional)</span>
              </FormLabel>
              <FormControl>
                <Input {...field} value={field.value ?? ""} placeholder="Flagship, Beginner-friendly…" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <FormField
        control={form.control}
        name="about"
        render={({ field }) => (
          <FormItem>
            <FormLabel>About</FormLabel>
            <FormControl>
              <Textarea
                {...field}
                value={field.value ?? ""}
                rows={5}
                placeholder="What happens, who it's for, what to bring…"
              />
            </FormControl>
            <FormDescription>Shown on the event page in the app.</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="posterFile"
        render={({ field }) => (
          <FormItem>
            <FormLabel>
              Poster <span className="text-muted-foreground font-normal">(optional)</span>
            </FormLabel>
            <FormControl>
              <div className="flex items-start gap-4">
                <label
                  className={cn(
                    "border-input hover:border-ring hover:bg-accent/40 grid size-28 shrink-0 cursor-pointer place-items-center rounded-lg border border-dashed transition-colors",
                    pressable
                  )}
                >
                  {preview ? (
                    <Image
                      src={preview}
                      alt="Poster preview"
                      width={112}
                      height={112}
                      className="size-28 rounded-lg object-cover"
                      unoptimized
                    />
                  ) : (
                    <span className="text-muted-foreground flex flex-col items-center gap-1 text-xs">
                      <ImagePlusIcon className="size-5" />
                      Upload
                    </span>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(e) => field.onChange(e.target.files?.[0])}
                  />
                </label>
                {posterFile ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => field.onChange(undefined)}
                  >
                    <XIcon /> Remove
                  </Button>
                ) : null}
              </div>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="interest_ids"
        render={({ field }) => (
          <FormItem>
            <FormLabel>
              Interests <span className="text-muted-foreground font-normal">(optional)</span>
            </FormLabel>
            <FormDescription>
              Used to surface this event to students who follow these topics.
            </FormDescription>
            <FormControl>
              <div className="flex flex-wrap gap-2 pt-1">
                {interests.isPending
                  ? Array.from({ length: 8 }).map((_, i) => (
                      <Skeleton key={i} className="h-7 w-24 rounded-full" />
                    ))
                  : interests.data?.map((interest) => {
                      const active = selectedInterests.includes(interest.id);
                      return (
                        <button
                          key={interest.id}
                          type="button"
                          onClick={() =>
                            field.onChange(
                              active
                                ? selectedInterests.filter((id) => id !== interest.id)
                                : [...selectedInterests, interest.id]
                            )
                          }
                          aria-pressed={active}
                          className={pressable}
                        >
                          <Badge
                            variant={active ? "default" : "outline"}
                            className="cursor-pointer px-3 py-1 transition-colors"
                          >
                            {interest.name}
                          </Badge>
                        </button>
                      );
                    })}
              </div>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
