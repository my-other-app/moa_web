"use client";

import * as React from "react";
import { CameraIcon, Loader2Icon } from "lucide-react";
import { Button, Chip, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Label, Notice, Textarea, cn, toast } from "@moa/ui";
import { COLUMN_IMAGE_MAX, IMAGE_ACCEPT, IMAGE_FORMATS_LABEL, fitImage, isPicture } from "@moa/ui/images";

import { useTopicTree } from "@/features/interests";

import { useSpeakerPhoto, useUpdateSpeaker } from "../queries";
import { LINK_KINDS, LINK_LABEL, PROFILE_MAX, draftOf, draftProblems, speakerPatch, type ProfileDraft, type SpeakerDetail } from "../schemas";

function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string | undefined; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-refuse m-0 text-[12px]">
          {error}
        </p>
      ) : hint ? (
        <p className="text-ink-3 m-0 text-[12px]">{hint}</p>
      ) : null}
    </div>
  );
}

/**
 * Edit a speaker's profile: name, headline, city, bio, links and topics.
 * Only what changed is sent; an emptied field is cleared (never the name).
 * The events keep the copy each club published: a club copies the profile
 * onto its upcoming events itself.
 */
export function EditSpeakerDialog({ speaker, onOpenChange }: { speaker: SpeakerDetail; onOpenChange: (open: boolean) => void }) {
  const update = useUpdateSpeaker();
  const topics = useTopicTree();
  const before = React.useMemo(() => draftOf(speaker), [speaker]);
  const [draft, setDraft] = React.useState<ProfileDraft>(before);
  const problems = draftProblems(draft);
  const patch = speakerPatch(before, draft);
  const changed = Object.keys(patch).length > 0;
  const ok = Object.keys(problems).length === 0;
  const set = <K extends keyof ProfileDraft>(key: K, value: ProfileDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const setLink = (kind: (typeof LINK_KINDS)[number], value: string) => setDraft((d) => ({ ...d, links: { ...d.links, [kind]: value } }));
  const toggleTopic = (id: number) => setDraft((d) => ({ ...d, topics: d.topics.includes(id) ? d.topics.filter((t) => t !== id) : [...d.topics, id] }));

  // The tree's topics, and any the profile has that the tree no longer lists (so they can be taken off).
  const known = topics.data ?? [];
  const extra = speaker.topics.filter((t) => !known.some((k) => k.id === t.id));
  const topicOptions = [...known.map((t) => ({ id: t.id, name: t.name })), ...extra.map((t) => ({ id: t.id, name: t.name }))];
  const full = draft.topics.length >= PROFILE_MAX.topics;

  const describedBy = (id: string, error?: string) => (error ? `${id}-error` : undefined);

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit {speaker.name}</DialogTitle>
          <DialogDescription>Changes the profile and its public page. Event pages keep what each club published; a club copies the profile onto its upcoming events itself.</DialogDescription>
        </DialogHeader>
        {speaker.claimed ? (
          <Notice tone="caution" tag="Claimed">
            The speaker keeps this profile up to date themselves. Change it only to correct something.
          </Notice>
        ) : null}
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (ok && changed) update.mutate({ id: speaker.id, patch }, { onSuccess: () => onOpenChange(false) });
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="speaker-name" label="Name" error={problems.name}>
              <Input id="speaker-name" value={draft.name} maxLength={PROFILE_MAX.name} aria-invalid={problems.name ? true : undefined} aria-describedby={describedBy("speaker-name", problems.name)} onChange={(e) => set("name", e.target.value)} />
            </Field>
            <Field id="speaker-city" label="City" error={problems.city}>
              <Input id="speaker-city" value={draft.city} maxLength={PROFILE_MAX.city} onChange={(e) => set("city", e.target.value)} />
            </Field>
          </div>
          <Field id="speaker-headline" label="Headline" hint="What they do and where: “Head of Research · IIT-M”." error={problems.headline}>
            <Input id="speaker-headline" value={draft.headline} maxLength={PROFILE_MAX.headline} onChange={(e) => set("headline", e.target.value)} />
          </Field>
          <Field id="speaker-bio" label="Bio" hint={`${draft.bio.trim().length} of ${PROFILE_MAX.bio} characters`} error={problems.bio}>
            <Textarea id="speaker-bio" rows={4} value={draft.bio} maxLength={PROFILE_MAX.bio} onChange={(e) => set("bio", e.target.value)} />
          </Field>
          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="mb-1 text-[13px] font-medium">Links</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {LINK_KINDS.map((kind) => {
                const id = `speaker-link-${kind}`;
                return (
                  <Field key={kind} id={id} label={kind === "other" ? "Other link" : (LINK_LABEL[kind] ?? kind)} error={problems[kind]}>
                    <Input
                      id={id}
                      type="url"
                      inputMode="url"
                      placeholder="https://"
                      value={draft.links[kind]}
                      maxLength={PROFILE_MAX.link}
                      aria-invalid={problems[kind] ? true : undefined}
                      aria-describedby={describedBy(id, problems[kind])}
                      onChange={(e) => setLink(kind, e.target.value)}
                    />
                  </Field>
                );
              })}
            </div>
          </fieldset>
          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="mb-1 text-[13px] font-medium">Topics</legend>
            {topicOptions.length === 0 ? (
              <p className="text-ink-3 m-0 text-[12.5px]">{topics.isPending ? "Loading the topics…" : "No topics to pick from."}</p>
            ) : (
              <div role="group" aria-label="Topics" className="flex flex-wrap gap-1.5">
                {topicOptions.map((t) => {
                  const on = draft.topics.includes(t.id);
                  return (
                    <Chip key={t.id} active={on} disabled={!on && full} onClick={() => toggleTopic(t.id)}>
                      {t.name}
                    </Chip>
                  );
                })}
              </div>
            )}
            <p className={cn("m-0 text-[12px]", problems.topics ? "text-refuse" : "text-ink-3")}>{problems.topics ?? `Up to ${PROFILE_MAX.topics}. Clubs find past speakers by topic.`}</p>
          </fieldset>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!ok || !changed || update.isPending}>
              {update.isPending ? <Loader2Icon className="animate-spin" /> : null}
              Save profile
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Add or replace the profile's photo: saved as soon as it is picked. A large
 * picture is redrawn smaller here first; the API makes its sizes.
 */
export function SpeakerPhotoButton({ speaker }: { speaker: Pick<SpeakerDetail, "id" | "name" | "photo"> }) {
  const change = useSpeakerPhoto();
  const [preparing, setPreparing] = React.useState(false);
  const busy = preparing || change.isPending;
  const has = Boolean(speaker.photo?.medium || speaker.photo?.thumbnail);

  async function pick(file: File | null) {
    if (!file) return;
    if (!isPicture(file)) {
      toast.error(`Choose a picture: ${IMAGE_FORMATS_LABEL}.`);
      return;
    }
    setPreparing(true);
    let ready: File;
    try {
      ready = await fitImage(file, "photo", { limit: COLUMN_IMAGE_MAX });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That picture is too big to send.");
      return;
    } finally {
      setPreparing(false);
    }
    change.mutate({ id: speaker.id, photo: ready });
  }

  return (
    <label className={cn("btn btn-ghost btn-sm cursor-pointer", busy && "pointer-events-none opacity-60")}>
      {busy ? <Loader2Icon className="size-4 animate-spin" /> : <CameraIcon className="size-4" aria-hidden="true" />}
      {has ? "Replace photo" : "Add photo"}
      <input
        type="file"
        className="sr-only"
        accept={IMAGE_ACCEPT}
        disabled={busy}
        aria-label={has ? `Replace ${speaker.name}'s photo` : `Add a photo of ${speaker.name}`}
        onChange={(e) => {
          const file = e.currentTarget.files?.[0] ?? null;
          e.currentTarget.value = "";
          void pick(file);
        }}
      />
    </label>
  );
}
