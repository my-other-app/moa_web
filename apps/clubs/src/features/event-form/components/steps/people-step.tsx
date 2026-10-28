"use client";

import { useFieldArray, useFormContext } from "react-hook-form";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { Button, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage, Input, InitialsAvatar, Textarea, cn } from "@moa/ui";
import { useObjectUrl } from "@moa/ui/hooks";
import { PICTURE_SPECS, cropToShape } from "@moa/app-kit";

import { AiFilledTag, aiFilledClass, useAiFilled } from "@/features/ai";
import { IMAGE_ACCEPT } from "@/lib/images";

import { SPEAKER_BIO_MAX, type EventFormValues } from "../../schemas";

/** A speaker's photo: the one just picked, else the one saved, else their initials. */
function SpeakerPhoto({ file, url, name }: { file?: File | null; url?: string | null; name: string }) {
  const picked = useObjectUrl(file ?? null);
  const src = picked ?? url;
  // eslint-disable-next-line @next/next/no-img-element -- a local preview or the API's own small photo
  return src ? <img src={src} alt="" className="size-10 rounded-full object-cover" /> : <InitialsAvatar name={name} size={40} />;
}

/**
 * People: who is speaking, and who to ask. The contact is prefilled from
 * the club so it is rarely typed; a speaker is a name and a line, with a
 * photo, a few lines on who they are and a link to read more if there are.
 */
export function PeopleStep() {
  const form = useFormContext<EventFormValues>();
  const speakers = useFieldArray({ control: form.control, name: "speakers" });
  const ai = useAiFilled();
  // A speaker's photo is square, as the event page shows it: placed in one first when it is not.
  const pickPhoto = async (index: number, input: HTMLInputElement) => {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    const shaped = await cropToShape(file, "photo", "photo");
    if (shaped) form.setValue(`speakers.${index}.photoFile`, shaped, { shouldDirty: true });
  };
  return (
    <div className="grid gap-6">
      <div className={aiFilledClass(ai.has("speakers"))}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-ink text-[13.5px] font-medium">
              Speakers and mentors
              <AiFilledTag on={ai.has("speakers")} />
            </p>
            <p className="text-ink-3 text-[12px]">Shown on the event page with their photo ({PICTURE_SPECS.photo.label}). Skip it for a members-only night.</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => speakers.append({ name: "", designation: "", bio: "", link: "" })}>
            <PlusIcon /> Add a speaker
          </Button>
        </div>
        {speakers.fields.length > 0 ? (
          <ul className="mt-3 grid gap-2">
            {speakers.fields.map((item, index) => {
              const name = form.watch(`speakers.${index}.name`) || "?";
              const photoUrl = form.watch(`speakers.${index}.photo_url`);
              const photoFile = form.watch(`speakers.${index}.photoFile`);
              const bio = form.watch(`speakers.${index}.bio`) ?? "";
              return (
                <li key={item.id} className="border-line-soft bg-sunken grid items-end gap-3 rounded-xl border p-3 sm:grid-cols-[auto_1fr_1fr_auto]">
                  <label className="grid place-items-center" title={`Photo · ${PICTURE_SPECS.photo.label}`}>
                    <SpeakerPhoto file={photoFile} url={photoUrl} name={name} />
                    <input type="file" accept={IMAGE_ACCEPT} className="sr-only" onChange={(e) => void pickPhoto(index, e.currentTarget)} aria-label={`Photo for speaker ${index + 1}`} />
                  </label>
                  <FormField
                    control={form.control}
                    name={`speakers.${index}.name`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Name</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Dr. A. Kumar" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name={`speakers.${index}.designation`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>One line</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value ?? ""} placeholder="Head of Research, IIT-M" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="button" variant="ghost" size="icon" className="text-refuse" onClick={() => speakers.remove(index)} aria-label={`Remove speaker ${index + 1}`}>
                    <Trash2Icon />
                  </Button>
                  <FormField
                    control={form.control}
                    name={`speakers.${index}.bio`}
                    render={({ field }) => (
                      <FormItem className="self-start sm:col-start-2">
                        <FormLabel>Short bio · optional</FormLabel>
                        <FormControl>
                          <Textarea {...field} value={field.value ?? ""} rows={3} maxLength={SPEAKER_BIO_MAX} placeholder="Leads the robotics lab at IIT-M; twelve years building rovers." />
                        </FormControl>
                        <FormDescription className="flex justify-between gap-3">
                          <span>Under their name on the event page.</span>
                          <span className={cn("font-mono tabular-nums", bio.length > SPEAKER_BIO_MAX - 40 && "text-caution")}>
                            {bio.length}/{SPEAKER_BIO_MAX}
                          </span>
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name={`speakers.${index}.link`}
                    render={({ field }) => (
                      <FormItem className="self-start">
                        <FormLabel>Link · optional</FormLabel>
                        <FormControl>
                          <Input {...field} value={field.value ?? ""} type="url" inputMode="url" placeholder="https://linkedin.com/in/…" />
                        </FormControl>
                        <FormDescription>Their profile or site, for people who want to know more.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>

      <div>
        <p className="text-ink text-[13.5px] font-medium">Who to ask</p>
        <p className="text-ink-3 text-[12px]">The Call organiser button on the event page. Filled from the club profile; change it for this event if someone else is running it.</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <FormField
            control={form.control}
            name="contact_name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Name</FormLabel>
                <FormControl>
                  <Input {...field} value={field.value ?? ""} />
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
                <FormLabel>Phone</FormLabel>
                <FormControl>
                  <Input {...field} value={field.value ?? ""} inputMode="tel" />
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
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input {...field} value={field.value ?? ""} type="email" />
                </FormControl>
                <FormDescription className="sr-only">Replies to event emails come here.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </div>
    </div>
  );
}
