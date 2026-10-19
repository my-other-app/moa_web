"use client";

import { useFormContext, useFormState, useWatch } from "react-hook-form";
import { GlobeIcon, MapPinIcon } from "lucide-react";
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage, Input, cn } from "@moa/ui";

import { AiFilledTag, aiFilledClass, useAiFilled } from "@/features/ai";
import { PinPreview, VenuePicker, pinAt, pinFieldsOf, pinOf, type PinState } from "@/features/venue";
import { PUBLIC_SITE_HOST } from "@/lib/public-site";

import type { EventFormValues } from "../../schemas";

/** Writes a pin into the form's four flat fields, as one change. */
function usePinSetter() {
  const form = useFormContext<EventFormValues>();
  return (pin: PinState) => {
    const v = pinFieldsOf(pin);
    form.setValue("lat", v.lat, { shouldDirty: true });
    form.setValue("lng", v.lng, { shouldDirty: true });
    form.setValue("geo_source", v.geo_source, { shouldDirty: true });
    form.setValue("clear_point", v.clear_point, { shouldDirty: true });
  };
}

/** The map under the venue: the pin, where it came from, and the map link. */
function VenuePin() {
  const form = useFormContext<EventFormValues>();
  const setPin = usePinSetter();
  const [lat, lng, geoSource, clearPoint, mapLink, venue] = useWatch({ control: form.control, name: ["lat", "lng", "geo_source", "clear_point", "location_link", "location_name"] });
  const { errors } = useFormState({ control: form.control, name: "location_link" });
  return (
    <PinPreview
      pin={pinOf({ lat, lng, geo_source: geoSource, clear_point: clearPoint })}
      onChange={setPin}
      mapLink={mapLink ?? ""}
      // Checked as it was as a field of its own: once left, then on every change while wrong.
      onMapLinkChange={(link) => form.setValue("location_link", link, { shouldDirty: true, shouldValidate: Boolean(errors.location_link) })}
      onMapLinkBlur={() => void form.trigger("location_link")}
      linkError={errors.location_link?.message}
      venue={venue ?? ""}
    />
  );
}

/** Where: one choice, then the one field it needs. */
export function WhereStep() {
  const form = useFormContext<EventFormValues>();
  const ai = useAiFilled();
  const setPin = usePinSetter();
  const isOnline = form.watch("is_online");
  const pick = (online: boolean) => form.setValue("is_online", online, { shouldDirty: true, shouldValidate: true });
  return (
    <div className="grid gap-5">
      <FormField
        control={form.control}
        name="is_online"
        render={() => (
          <FormItem className={aiFilledClass(ai.has("is_online"))}>
            {ai.has("is_online") ? (
              <p className="text-ink-3 m-0 text-[12px]">
                {isOnline ? "Online" : "In person"}, as AI read it
                <AiFilledTag on />
              </p>
            ) : null}
            <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="In person or online">
              <button type="button" onClick={() => pick(false)} aria-pressed={!isOnline} className={cn("flex items-start gap-3 rounded-xl border p-3 text-left transition-colors", !isOnline ? "border-brand-line bg-brand-soft" : "border-line hover:bg-sunken")}>
                <MapPinIcon className={cn("mt-0.5 size-4 shrink-0", !isOnline ? "text-brand" : "text-ink-3")} />
                <span>
                  <span className="text-ink block text-[13px] font-medium">In person</span>
                  <span className="text-ink-3 block text-[12px]">People come to a place. The gate and check-ins apply.</span>
                </span>
              </button>
              <button type="button" onClick={() => pick(true)} aria-pressed={isOnline} className={cn("flex items-start gap-3 rounded-xl border p-3 text-left transition-colors", isOnline ? "border-brand-line bg-brand-soft" : "border-line hover:bg-sunken")}>
                <GlobeIcon className={cn("mt-0.5 size-4 shrink-0", isOnline ? "text-brand" : "text-ink-3")} />
                <span>
                  <span className="text-ink block text-[13px] font-medium">Online</span>
                  <span className="text-ink-3 block text-[12px]">People join with a link, shown on their ticket.</span>
                </span>
              </button>
            </div>
          </FormItem>
        )}
      />
      {isOnline ? (
        <FormField
          control={form.control}
          name="url"
          render={({ field }) => (
            <FormItem className={aiFilledClass(ai.has("url"))}>
              <FormLabel>
                Joining link
                <AiFilledTag on={ai.has("url")} />
              </FormLabel>
              <FormControl>
                <Input {...field} value={field.value ?? ""} type="url" inputMode="url" placeholder="https://meet.google.com/…" />
              </FormControl>
              <FormDescription>Only people who registered see it.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      ) : (
        <div className="grid gap-3">
          <FormField
            control={form.control}
            name="location_name"
            render={({ field }) => (
              <FormItem className={aiFilledClass(ai.has("location_name"))}>
                <FormLabel>
                  Venue
                  <AiFilledTag on={ai.has("location_name")} />
                </FormLabel>
                <FormControl>
                  <VenuePicker {...field} value={field.value ?? ""} onPick={(place) => setPin(pinAt(place.point))} placeholder="Search for the venue, or type it" />
                </FormControl>
                <FormDescription>Pick it from the suggestions to pin it on the map, so people nearby find it on {PUBLIC_SITE_HOST}. Then say it as you would to a friend: the block and the room help more than the full address.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <VenuePin />
        </div>
      )}
    </div>
  );
}
