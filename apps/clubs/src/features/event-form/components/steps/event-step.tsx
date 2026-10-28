"use client";

import * as React from "react";
import { useFormContext } from "react-hook-form";
import { ImagePlusIcon, XIcon } from "lucide-react";
import { Button, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Skeleton, Textarea, cn } from "@moa/ui";
import { useObjectUrl } from "@moa/ui/hooks";
import { PICTURE_SPECS, POSTER_SHAPE_NOTE, PosterFrame, hasShape } from "@moa/app-kit";

import { AiFilledTag, WriteWithAi, aiFilledClass, useAiFilled } from "@/features/ai";
import { IMAGE_ACCEPT } from "@/lib/images";

import { useEventCategories } from "../../queries";
import { spanLabel } from "../../readiness";
import type { EventFormValues } from "../../schemas";

/** What the form already says, for words written before the event is saved. */
function contextOf(v: Partial<EventFormValues>, kind: string | undefined): string {
  const when = v.event_datetime ? spanLabel(v.event_datetime, v.duration) : "";
  const where = v.is_online ? "online" : v.location_name?.trim();
  return [v.name?.trim(), kind, when, where ? `at ${where}` : "", v.has_fee && v.reg_fee ? `₹${v.reg_fee} entry` : ""].filter(Boolean).join(", ");
}

/**
 * The event: the four things people see first, together. The poster sits
 * beside the words because that is how the card is read — picture, name,
 * kind, a line — and an organiser writing one should see the other.
 */
export function EventStep({ posterUrl, eventId }: { posterUrl?: string | null; eventId?: number }) {
  const form = useFormContext<EventFormValues>();
  const categories = useEventCategories();
  const ai = useAiFilled();
  const posterFile = form.watch("posterFile");
  const preview = useObjectUrl(posterFile) ?? posterUrl ?? null;
  // The poster's own shape, once it has loaded: one that is not 4:5 still goes, with a word.
  const [shape, setShape] = React.useState<{ src: string; width: number; height: number } | null>(null);
  const onSize = React.useCallback(
    (width: number, height: number) => {
      if (preview) setShape({ src: preview, width, height });
    },
    [preview],
  );
  const offShape = shape && shape.src === preview && !hasShape(shape.width, shape.height, PICTURE_SPECS.poster.ratio);
  const about = form.watch("about") ?? "";
  const categoryId = form.watch("category_id");
  const kind = categories.data?.find((c) => c.id === Number(categoryId))?.name;

  return (
    <div className="grid gap-5 sm:grid-cols-[168px_1fr]">
      <FormField
        control={form.control}
        name="posterFile"
        render={({ field }) => (
          <FormItem className={aiFilledClass(ai.has("posterFile"))}>
            <FormLabel>
              Poster
              <AiFilledTag on={ai.has("posterFile")} />
            </FormLabel>
            <FormControl>
              <div className="grid gap-2">
                <label className={cn("border-line hover:border-brand hover:bg-sunken relative grid aspect-[4/5] w-full cursor-pointer place-items-center overflow-hidden rounded-xl border border-dashed transition-colors")}>
                  {preview ? (
                    // Never cropped: a poster of another shape shows whole, on a blurred copy of itself.
                    <PosterFrame src={preview} alt="Poster preview" width={168} onSize={onSize} className="absolute inset-0 w-full rounded-[inherit]" />
                  ) : (
                    <span className="text-ink-3 flex flex-col items-center gap-1.5 px-3 text-center text-[12px]">
                      <ImagePlusIcon className="size-5" />
                      Add a poster
                      <span className="text-[10.5px]">Portrait 4:5 · 1080×1350</span>
                    </span>
                  )}
                  <input type="file" accept={IMAGE_ACCEPT} className="sr-only" onChange={(e) => field.onChange(e.target.files?.[0])} />
                </label>
                {posterFile ? (
                  <Button type="button" variant="ghost" size="sm" onClick={() => field.onChange(undefined)}>
                    <XIcon /> Remove
                  </Button>
                ) : null}
              </div>
            </FormControl>
            <FormDescription>
              {PICTURE_SPECS.poster.label}. The card in the app and the top of the page.
            </FormDescription>
            {offShape ? (
              <p role="status" className="text-ink-2 bg-sunken rounded-lg px-2.5 py-2 text-[12px] leading-snug">
                {POSTER_SHAPE_NOTE}
              </p>
            ) : null}
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="grid content-start gap-5">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem className={aiFilledClass(ai.has("name"))}>
              <FormLabel>
                Name
                <AiFilledTag on={ai.has("name")} />
              </FormLabel>
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
            <FormItem className={aiFilledClass(ai.has("category_id"))}>
              <FormLabel>
                Kind of event
                <AiFilledTag on={ai.has("category_id")} />
              </FormLabel>
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
            <FormItem className={aiFilledClass(ai.has("about"))}>
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <FormLabel>
                  About <span className="text-ink-3 font-normal">· the first two lines are what the card shows</span>
                  <AiFilledTag on={ai.has("about")} />
                </FormLabel>
                <WriteWithAi
                  kind="event_description"
                  eventId={eventId}
                  value={field.value ?? ""}
                  onChange={(next) => form.setValue("about", next, { shouldDirty: true, shouldValidate: true })}
                  context={() => contextOf(form.getValues(), kind)}
                  maxLength={5000}
                />
              </div>
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
