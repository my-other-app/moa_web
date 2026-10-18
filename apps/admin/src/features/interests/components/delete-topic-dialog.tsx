"use client";

import * as React from "react";
import { Loader2Icon } from "lucide-react";
import { topicLabel } from "@moa/app-kit";
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, NativeSelect, Notice } from "@moa/ui";

import { useDeleteTopic } from "../queries";
import { isMissingEndpoint, isTopicNotEmpty, type Topic } from "../schemas";
import { Field } from "./fields";

const count = (n: number) => `${n} ${n === 1 ? "interest" : "interests"}`;

/**
 * Deleting a topic. One with interests asks where they go first -- the
 * server moves them there and then deletes the topic, so no club, event or
 * person loses an interest. Asked without a destination, the server refuses
 * a topic that has interests (409 TOPIC_NOT_EMPTY): that happens when one
 * was added after this page loaded, and the dialog then asks where they go.
 */
export function DeleteTopicDialog({ topic, topics, onClose, onMissing }: { topic: Topic; topics: Topic[]; onClose: () => void; onMissing: () => void }) {
  const remove = useDeleteTopic();
  const others = topics.filter((t) => t.id !== topic.id);
  const [moveTo, setMoveTo] = React.useState<number | undefined>(others[0]?.id);
  // Read from the live list: if the topic gained interests since the page loaded, this says so.
  const n = topic.interests.length;
  const target = others.find((t) => t.id === moveTo);
  const notEmpty = remove.isError && isTopicNotEmpty(remove.error);
  const missing = remove.isError && isMissingEndpoint(remove.error);
  const refused = remove.isError && !notEmpty && !missing ? remove.error.message || "That did not go through." : null;
  const stranded = n > 0 && others.length === 0;
  const name = topicLabel(topic.name);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (stranded) return;
    remove.mutate(
      { id: topic.id, moveTo: n > 0 ? target?.id : undefined },
      {
        onSuccess: onClose,
        onError: (error) => {
          if (isMissingEndpoint(error)) onMissing();
        },
      },
    );
  };

  return (
    <Dialog open onOpenChange={(next) => !next && !remove.isPending && onClose()}>
      <DialogContent className="sm:max-w-[460px]">
        <form noValidate onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Delete {name}?</DialogTitle>
            <DialogDescription>
              {n > 0
                ? `Its ${count(n)} move to another topic first, so every club, event and person that picked them keeps them. Then the topic goes.`
                : "Nothing is under it, so nothing else changes."}
            </DialogDescription>
          </DialogHeader>

          {n > 0 && !stranded ? (
            <Field id="delete-move-to" label={`Move its ${count(n)} to`}>
              <NativeSelect
                id="delete-move-to"
                value={moveTo ?? ""}
                disabled={remove.isPending}
                onChange={(e) => {
                  setMoveTo(Number(e.target.value));
                  if (remove.isError) remove.reset();
                }}
              >
                {others.map((t) => (
                  <option key={t.id} value={t.id}>
                    {topicLabel(t.name)}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          ) : null}

          {stranded ? <Notice tone="caution">Add another topic first: its {count(n)} need somewhere to go.</Notice> : null}
          {notEmpty ? (
            <Notice tone="caution" tag="Not empty">
              {name} has interests now that it did not have when this page loaded. Choose where they go, then delete it again.
            </Notice>
          ) : null}
          {missing ? <Notice tone="neutral">Deleting a topic needs the backend update, which is not live yet. Nothing was changed.</Notice> : null}
          {refused ? <Notice tone="refuse">{refused.replace(/\.$/, "")}. Nothing was changed.</Notice> : null}

          <DialogFooter>
            <Button type="button" variant="secondary" disabled={remove.isPending} onClick={onClose}>
              Keep it
            </Button>
            <Button type="submit" variant="destructive" disabled={remove.isPending || stranded || missing || (n > 0 && !target)}>
              {remove.isPending ? <Loader2Icon className="size-4 animate-spin" /> : null} {n > 0 && target ? `Move to ${topicLabel(target.name)} and delete` : "Delete topic"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
