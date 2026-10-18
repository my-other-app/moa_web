"use client";

import * as React from "react";
import { CheckIcon, Loader2Icon } from "lucide-react";
import { TopicDot, topicTint } from "@moa/app-kit";
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Notice, cn } from "@moa/ui";

import { useCreateTopic, useUpdateTopic } from "../queries";
import { TOPIC_COLORS, editableEmoji, isMissingEndpoint, slugify, topicFormSchema, type Topic, type TopicFormInput } from "../schemas";
import { Field, fieldAria } from "./fields";

type Errors = Partial<Record<keyof TopicFormInput, string>>;

const HEX6 = /^#[0-9a-fA-F]{6}$/;

/**
 * A topic's name, address (slug), emoji, colour and description.
 *
 * Before the topics release the server reads only a new topic's name and
 * emoji, so then only those are asked for, and a note says the rest comes
 * with the update. Editing one needs the update outright; the page does not
 * offer it before.
 */
function TopicDialogBody({ existing, ready, onClose, onMissing }: { existing?: Topic | undefined; ready: boolean; onClose: () => void; onMissing: () => void }) {
  const create = useCreateTopic();
  const update = useUpdateTopic();
  const mutation = existing ? update : create;
  const [values, setValues] = React.useState<Required<TopicFormInput>>({
    name: existing?.name ?? "",
    slug: existing?.slug ?? "",
    icon: editableEmoji(existing?.icon),
    color: existing?.color ?? "",
    description: existing?.description ?? "",
  });
  const [errors, setErrors] = React.useState<Errors>({});
  const set = (key: keyof TopicFormInput, value: string) => {
    setValues((v) => ({ ...v, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
    if (mutation.isError) mutation.reset();
  };
  const missing = mutation.isError && isMissingEndpoint(mutation.error);
  const refused = mutation.isError && !missing ? mutation.error.message || "That did not go through." : null;
  const suggested = slugify(values.name);
  const pending = mutation.isPending;
  const color = HEX6.test(values.color) ? values.color : null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = topicFormSchema.safeParse(ready ? values : { name: values.name, icon: values.icon });
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) next[issue.path[0] as keyof TopicFormInput] ??= issue.message;
      setErrors(next);
      return;
    }
    const onError = (error: Error) => {
      if (isMissingEndpoint(error)) onMissing();
    };
    if (existing) update.mutate({ id: existing.id, input: parsed.data }, { onSuccess: onClose, onError });
    else create.mutate(parsed.data, { onSuccess: onClose, onError });
  };

  return (
    <DialogContent className="sm:max-w-[520px]">
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <DialogHeader>
          <DialogTitle>{existing ? `Edit ${existing.name}` : "New topic"}</DialogTitle>
          <DialogDescription>
            A topic groups interests: people and clubs pick the interests, and the topic is how they are browsed. Renaming one updates it everywhere.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-[1fr_88px]">
          <Field id="topic-name" label="Name" error={errors.name}>
            <input id="topic-name" className="input" value={values.name} maxLength={50} disabled={pending} placeholder="Deep Tech" onChange={(e) => set("name", e.target.value)} {...fieldAria("topic-name", errors.name)} />
          </Field>
          <Field id="topic-icon" label="Emoji" error={errors.icon}>
            <input id="topic-icon" className="input" value={values.icon} maxLength={10} disabled={pending} placeholder="🧠" onChange={(e) => set("icon", e.target.value)} {...fieldAria("topic-icon", errors.icon)} />
          </Field>
        </div>

        {ready ? (
          <>
            <Field
              id="topic-slug"
              label="Address"
              error={errors.slug}
              hint={
                <>
                  {values.slug ? `Its page: /topics/${values.slug}.` : `Left empty, it is made from the name${suggested ? `: ${suggested}` : ""}.`} Changing it breaks links already shared.
                </>
              }
            >
              <input
                id="topic-slug"
                className="input font-mono"
                value={values.slug}
                maxLength={60}
                disabled={pending}
                placeholder={suggested || "deep-tech"}
                onChange={(e) => set("slug", e.target.value.toLowerCase())}
                {...fieldAria("topic-slug", errors.slug, true)}
              />
            </Field>

            <fieldset className="m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0">
              <legend className="eyebrow mb-1.5 p-0">Colour</legend>
              <div className="flex flex-wrap items-center gap-2">
                {TOPIC_COLORS.map((hex) => {
                  const on = values.color.toLowerCase() === hex.toLowerCase();
                  return (
                    <button
                      key={hex}
                      type="button"
                      aria-label={`Colour ${hex}`}
                      aria-pressed={on}
                      disabled={pending}
                      onClick={() => set("color", hex)}
                      className={cn("ring-offset-surface grid size-7 place-items-center rounded-full ring-offset-2 transition-shadow", on && "ring-ink ring-2")}
                      style={{ background: hex }}
                    >
                      {on ? <CheckIcon aria-hidden="true" className="size-3.5 text-white" /> : null}
                    </button>
                  );
                })}
                <input
                  type="color"
                  aria-label="Pick any colour"
                  value={(color ?? "#17a58f").toLowerCase()}
                  disabled={pending}
                  onChange={(e) => set("color", e.target.value.toUpperCase())}
                  className="border-line size-7 cursor-pointer rounded-full border bg-transparent p-0"
                />
                <input
                  id="topic-color"
                  className="input input-sm w-[110px] font-mono"
                  aria-label="Colour as hex"
                  value={values.color}
                  maxLength={7}
                  disabled={pending}
                  placeholder="#2563EB"
                  onChange={(e) => set("color", e.target.value)}
                  {...fieldAria("topic-color", errors.color)}
                />
                {values.color ? (
                  <button type="button" className="text-ink-3 hover:text-ink text-[12px]" disabled={pending} onClick={() => set("color", "")}>
                    No colour
                  </button>
                ) : null}
              </div>
              {errors.color ? (
                <p id="topic-color-error" className="text-refuse m-0 text-[12px]">
                  {errors.color}
                </p>
              ) : null}
              <span aria-hidden="true" className="text-ink mt-1 inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[12px] font-medium" style={topicTint(color ?? "var(--brand)")}>
                <TopicDot color={color ?? "var(--brand)"} />
                {values.icon ? <span>{values.icon}</span> : null}
                {values.name.trim() || "Preview"}
              </span>
            </fieldset>

            <Field id="topic-description" label="Description (optional)" error={errors.description}>
              <textarea
                id="topic-description"
                className="input min-h-[64px] py-2"
                value={values.description}
                maxLength={200}
                disabled={pending}
                placeholder="AI, robots, hardware and what comes after."
                onChange={(e) => set("description", e.target.value)}
                {...fieldAria("topic-description", errors.description)}
              />
            </Field>
          </>
        ) : (
          <Notice tone="neutral" tag="Backend update">
            A topic&apos;s address, colour and description arrive with the backend update. Until then a new topic is saved with its name and emoji.
          </Notice>
        )}

        {missing ? <Notice tone="neutral">This needs the backend update, which is not live yet. Nothing was changed.</Notice> : null}
        {refused ? <Notice tone="refuse">{refused.replace(/\.$/, "")}. Nothing was changed.</Notice> : null}

        <DialogFooter>
          <Button type="button" variant="secondary" disabled={pending} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2Icon className="size-4 animate-spin" /> : null} {existing ? "Save topic" : "Add topic"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

/** Open while `open`; the body remounts per topic so its fields start from the right one. */
export function TopicDialog({ open, existing, ready, onClose, onMissing }: { open: boolean; existing?: Topic | undefined; ready: boolean; onClose: () => void; onMissing: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      {open ? <TopicDialogBody key={existing?.id ?? "new"} existing={existing} ready={ready} onClose={onClose} onMissing={onMissing} /> : null}
    </Dialog>
  );
}
