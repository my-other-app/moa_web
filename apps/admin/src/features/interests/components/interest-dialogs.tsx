"use client";

import * as React from "react";
import { Loader2Icon } from "lucide-react";
import { topicLabel } from "@moa/app-kit";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  NativeSelect,
  Notice,
  buttonVariants,
  cn,
} from "@moa/ui";

import { useCreateInterest, useDeleteInterest, useMoveInterest, useUpdateInterest } from "../queries";
import { editableEmoji, interestFormSchema, isMissingEndpoint, slugify, type InterestFormInput, type Topic, type TopicInterest } from "../schemas";
import { Field, fieldAria } from "./fields";

type Errors = Partial<Record<keyof InterestFormInput, string>>;

/**
 * An interest's name, address, emoji and topic. Changing the topic moves
 * it there; every club, event and person that picked it keeps it. The
 * address (slug) is asked for only once the server has the topics release.
 */
function InterestDialogBody({ topics, existing, topicId, ready, onClose }: { topics: Topic[]; existing?: TopicInterest | undefined; topicId: number | undefined; ready: boolean; onClose: () => void }) {
  const create = useCreateInterest();
  const update = useUpdateInterest();
  const mutation = existing ? update : create;
  const [name, setName] = React.useState(existing?.name ?? "");
  const [slug, setSlug] = React.useState(existing?.slug ?? "");
  const [icon, setIcon] = React.useState(editableEmoji(existing?.icon));
  const [categoryId, setCategoryId] = React.useState<number | undefined>(topicId ?? topics[0]?.id);
  const [errors, setErrors] = React.useState<Errors>({});
  const pending = mutation.isPending;
  const refused = mutation.isError ? mutation.error.message || "That did not go through." : null;
  const suggested = slugify(name);
  const touched = () => mutation.isError && mutation.reset();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = interestFormSchema.safeParse({ name, category_id: categoryId, icon, ...(ready ? { slug } : {}) });
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) next[issue.path[0] as keyof InterestFormInput] ??= issue.message;
      setErrors(next);
      return;
    }
    if (existing) update.mutate({ id: existing.id, input: parsed.data }, { onSuccess: onClose });
    else create.mutate(parsed.data, { onSuccess: onClose });
  };

  return (
    <DialogContent className="sm:max-w-[480px]">
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <DialogHeader>
          <DialogTitle>{existing ? `Edit ${existing.name}` : "New interest"}</DialogTitle>
          <DialogDescription>Interests are what clubs, events and people pick. Renaming one updates it everywhere.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-[1fr_88px]">
          <Field id="interest-name" label="Name" error={errors.name}>
            <input
              id="interest-name"
              className="input"
              value={name}
              maxLength={50}
              disabled={pending}
              placeholder="Robotics"
              onChange={(e) => {
                setName(e.target.value);
                setErrors((x) => ({ ...x, name: undefined }));
                touched();
              }}
              {...fieldAria("interest-name", errors.name)}
            />
          </Field>
          <Field id="interest-icon" label="Emoji" error={errors.icon}>
            <input id="interest-icon" className="input" value={icon} maxLength={10} disabled={pending} placeholder="🤖" onChange={(e) => setIcon(e.target.value)} {...fieldAria("interest-icon", errors.icon)} />
          </Field>
        </div>

        {ready ? (
          <Field id="interest-slug" label="Address" error={errors.slug} hint={slug ? "Changing it breaks links already shared." : `Left empty, it is made from the name${suggested ? `: ${suggested}` : ""}.`}>
            <input
              id="interest-slug"
              className="input font-mono"
              value={slug}
              maxLength={60}
              disabled={pending}
              placeholder={suggested || "robotics"}
              onChange={(e) => {
                setSlug(e.target.value.toLowerCase());
                setErrors((x) => ({ ...x, slug: undefined }));
                touched();
              }}
              {...fieldAria("interest-slug", errors.slug, true)}
            />
          </Field>
        ) : null}

        <Field id="interest-topic" label="Topic" hint={existing ? "Moving it keeps it on every club, event and profile that picked it." : undefined}>
          <NativeSelect
            id="interest-topic"
            value={categoryId ?? ""}
            disabled={pending}
            onChange={(e) => {
              setCategoryId(Number(e.target.value));
              touched();
            }}
            aria-describedby={existing ? "interest-topic-hint" : undefined}
          >
            {topics.map((t) => (
              <option key={t.id} value={t.id}>
                {topicLabel(t.name)}
              </option>
            ))}
          </NativeSelect>
        </Field>

        {refused ? <Notice tone="refuse">{refused.replace(/\.$/, "")}. Nothing was changed.</Notice> : null}

        <DialogFooter>
          <Button type="button" variant="secondary" disabled={pending} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2Icon className="size-4 animate-spin" /> : null} {existing ? "Save interest" : "Add interest"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

export function InterestDialog(props: { open: boolean; topics: Topic[]; existing?: TopicInterest | undefined; topicId: number | undefined; ready: boolean; onClose: () => void }) {
  const { open, onClose } = props;
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      {open ? <InterestDialogBody key={`${props.existing?.id ?? "new"}-${props.topicId ?? ""}`} {...props} /> : null}
    </Dialog>
  );
}

/** Moving one interest under another topic, said plainly: nobody who picked it loses it. */
export function MoveInterestDialog({ interest, from, topics, onClose }: { interest: TopicInterest; from: Topic; topics: Topic[]; onClose: () => void }) {
  const move = useMoveInterest();
  const others = topics.filter((t) => t.id !== from.id);
  const [to, setTo] = React.useState<number | undefined>(others[0]?.id);
  const target = others.find((t) => t.id === to);
  const refused = move.isError ? move.error.message || "That did not go through." : null;

  return (
    <Dialog open onOpenChange={(next) => !next && !move.isPending && onClose()}>
      <DialogContent className="sm:max-w-[440px]">
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!target) return;
            move.mutate({ interest, toTopicId: target.id, toName: topicLabel(target.name) }, { onSuccess: onClose });
          }}
        >
          <DialogHeader>
            <DialogTitle>Move {interest.name}</DialogTitle>
            <DialogDescription>
              From {topicLabel(from.name)} to another topic. Clubs, events and people that picked it keep it; they are listed under the new topic from now on.
            </DialogDescription>
          </DialogHeader>
          <Field id="move-to" label="Move to">
            <NativeSelect
              id="move-to"
              value={to ?? ""}
              disabled={move.isPending}
              onChange={(e) => {
                setTo(Number(e.target.value));
                if (move.isError) move.reset();
              }}
            >
              {others.map((t) => (
                <option key={t.id} value={t.id}>
                  {topicLabel(t.name)}
                </option>
              ))}
            </NativeSelect>
          </Field>
          {refused ? <Notice tone="refuse">{refused.replace(/\.$/, "")}. Nothing was changed.</Notice> : null}
          <DialogFooter>
            <Button type="button" variant="secondary" disabled={move.isPending} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={move.isPending || !target}>
              {move.isPending ? <Loader2Icon className="size-4 animate-spin" /> : null} Move
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Deleting an interest takes it off everything that picked it; said before, and how many after. */
export function DeleteInterestDialog({ interest, onClose, onMissing }: { interest: TopicInterest; onClose: () => void; onMissing: () => void }) {
  const remove = useDeleteInterest();
  return (
    <AlertDialog open onOpenChange={(next) => !next && !remove.isPending && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{interest.name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            It is removed from every club, event and person that picked it. They keep their other interests. This cannot be undone. To keep it on them, move it to another topic instead.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={remove.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className={cn(buttonVariants({ variant: "destructive" }))}
            disabled={remove.isPending}
            onClick={(event) => {
              event.preventDefault();
              remove.mutate(interest.id, {
                onSuccess: onClose,
                onError: (error) => {
                  if (isMissingEndpoint(error)) onMissing();
                  onClose();
                },
              });
            }}
          >
            Delete interest
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
