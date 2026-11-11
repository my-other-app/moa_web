"use client";

import * as React from "react";
import { Loader2Icon } from "lucide-react";
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Label, NativeSelect } from "@moa/ui";

import { useCreateFollowUp } from "../queries";
import { FOLLOW_UP_KINDS, FOLLOW_UP_LABEL, localToIso, memberLabel, tomorrowAtTen, type FollowUpKind, type TeamMember } from "../schemas";

/** The fields, inside the dialog's content: each opening starts afresh. */
function FollowUpForm({
  leadId,
  caseId,
  owners,
  defaultOwnerId,
  onDone,
  onSkip,
  skipLabel,
}: {
  leadId?: number | undefined;
  caseId?: number | undefined;
  owners?: readonly TeamMember[] | undefined;
  defaultOwnerId?: number | null | undefined;
  onDone: () => void;
  onSkip: () => void;
  skipLabel: string;
}) {
  const create = useCreateFollowUp();
  const id = React.useId();
  const [kind, setKind] = React.useState<FollowUpKind>("call");
  const [title, setTitle] = React.useState("");
  const [due, setDue] = React.useState(tomorrowAtTen());
  const [ownerId, setOwnerId] = React.useState<string>(defaultOwnerId ? String(defaultOwnerId) : "");
  const ready = title.trim().length > 0 && due.length > 0;
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ready) return;
        create.mutate(
          {
            ...(leadId ? { lead_id: leadId } : {}),
            ...(caseId ? { case_id: caseId } : {}),
            kind,
            title: title.trim(),
            due_at: localToIso(due),
            ...(ownerId ? { owner_id: Number(ownerId) } : {}),
          },
          { onSuccess: onDone }
        );
      }}
    >
      <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-kind`}>What</Label>
          <NativeSelect id={`${id}-kind`} value={kind} onChange={(e) => setKind(e.target.value as FollowUpKind)}>
            {FOLLOW_UP_KINDS.map((k) => (
              <option key={k} value={k}>
                {FOLLOW_UP_LABEL[k]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-title`}>Next step</Label>
          <Input id={`${id}-title`} value={title} maxLength={200} placeholder="Send the proposal, call about the venue…" onChange={(e) => setTitle(e.target.value)} />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-due`}>When</Label>
          <Input id={`${id}-due`} type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
        </div>
        {owners && owners.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-owner`}>Who</Label>
            <NativeSelect id={`${id}-owner`} value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
              <option value="">Me</option>
              {owners.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {memberLabel(m)}
                </option>
              ))}
            </NativeSelect>
          </div>
        ) : null}
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onSkip} disabled={create.isPending}>
          {skipLabel}
        </Button>
        <Button type="submit" disabled={!ready || create.isPending}>
          {create.isPending ? <Loader2Icon className="animate-spin" /> : null}
          Set follow-up
        </Button>
      </DialogFooter>
    </form>
  );
}

/**
 * "What's next, and when?" A lead keeps one open follow-up, so this opens
 * after a stage move or a finished follow-up leaves it with none (the API's
 * `needs_follow_up` / `needs_next`), and from "Add follow-up" anywhere.
 */
export function FollowUpDialog({
  open,
  onOpenChange,
  leadId,
  caseId,
  title = "Add a follow-up",
  description = "What happens next, when, and who does it.",
  owners,
  defaultOwnerId,
  skipLabel = "Cancel",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId?: number | undefined;
  caseId?: number | undefined;
  title?: string;
  description?: string;
  owners?: readonly TeamMember[] | undefined;
  defaultOwnerId?: number | null | undefined;
  skipLabel?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {open ? <FollowUpForm leadId={leadId} caseId={caseId} owners={owners} defaultOwnerId={defaultOwnerId} skipLabel={skipLabel} onDone={() => onOpenChange(false)} onSkip={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

/** The dialog that asks for the next follow-up after a stage move or a finished one. */
export function NextFollowUpDialog(props: Omit<React.ComponentProps<typeof FollowUpDialog>, "title" | "description" | "skipLabel">) {
  return <FollowUpDialog {...props} title="What's the next step?" description="Every open lead keeps a next step on a date. Set it now, or skip and come back to it." skipLabel="Not now" />;
}
