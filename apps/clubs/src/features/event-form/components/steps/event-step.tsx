"use client";

import Image from "next/image";
import { useFormContext } from "react-hook-form";
import { ImagePlusIcon, XIcon } from "lucide-react";
import { Button, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Skeleton, Textarea, cn } from "@moa/ui";
import { useObjectUrl } from "@moa/ui/hooks";

import { useEventCategories } from "../../queries";
import type { EventFormValues } from "../../schemas";

/**
 * The event: the four things people see first, together. The poster sits
 * beside the words because that is how the card is read — picture, name,
 * kind, a line — and an organiser writing one should see the other.
 */
export function EventStep({ posterUrl }: { posterUrl?: string | null }) {
  const form = useFormContext<EventFormValues>();
  const categories = useEventCategories();
  const posterFile = form.watch("posterFile");
  const preview = useObjectUrl(posterFile) ?? posterUrl ?? null;
  const about = form.watch("about") ?? "";

  return (
    <div className="grid gap-5 sm:grid-cols-[168px_1fr]">
      <FormField
        control={form.control}
        name="posterFile"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Poster</FormLabel>
            <FormControl>
              <div className="grid gap-2">
                <label className={cn("border-line hover:border-brand hover:bg-sunken relative grid aspect-[4/5] w-full cursor-pointer place-items-center overflow-hidden rounded-xl border border-dashed transition-colors")}>
                  {preview ? (
                    <Image src={preview} alt="Poster preview" fill sizes="168px" className="object-cover" unoptimized />
                  ) : (
                    <span className="text-ink-3 flex flex-col items-center gap-1.5 px-3 text-center text-[12px]">
                      <ImagePlusIcon className="size-5" />
                      Add a poster
                      <span className="text-[10.5px]">Portrait, 4:5</span>
                    </span>
                  )}
                  <input type="file" accept="image/*" className="sr-only" onChange={(e) => field.onChange(e.target.files?.[0])} />
                </label>
                {posterFile ? (
                  <Button type="button" variant="ghost" size="sm" onClick={() => field.onChange(undefined)}>
                    <XIcon /> Remove
                  </Button>
                ) : null}
              </div>
            </FormControl>
            <FormDescription>The card in the app and the top of the page.</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="grid content-start gap-5">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input {...field} placeholder="Hack Night 05: Edge AI" autoFocus className="text-[16px] font-semibold" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="category_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Kind of event</FormLabel>
              {categories.isPending ? (
                <Skeleton className="h-9 w-full" />
              ) : (
                <Select value={field.value ? String(field.value) : undefined} onValueChange={(v) => field.onChange(Number(v))}>
                  <FormControl>
                    <SelectTrigger className="w-full sm:max-w-[320px]">
                      <SelectValue placeholder="Choose one" />
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
          name="about"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                About <span className="text-ink-3 font-normal">· the first two lines are what the card shows</span>
              </FormLabel>
              <FormControl>
                <Textarea {...field} value={field.value ?? ""} rows={5} placeholder="What happens, who it is for, what to bring. Short paragraphs read best on a phone." />
              </FormControl>
              <FormDescription className="flex justify-between">
                <span>Shown on the event page in the app and on the web.</span>
                <span className={cn("font-mono tabular-nums", about.length > 4800 && "text-caution")}>{about.length}/5000</span>
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </div>
  );
}
