"use client";

import * as React from "react";
import { Loader2Icon } from "lucide-react";
import { toast, Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Label, NativeSelect, Textarea } from "@moa/ui";

import { NextFollowUpDialog, membersOf, useLostReasons, useTeamRights, useTeams } from "@/features/teamwork";

import { useUpdateLead } from "../queries";
import { stageLabel, stageMove } from "../schemas";

interface Target {
  id: number;
  name: string;
  stage: string;
  ownerId: number | null | undefined;
}

function LostForm({ name, onCancel, onConfirm, pending }: { name: string; onCancel: () => void; onConfirm: (reason: string, note: string, retryOn: string) => void; pending: boolean }) {
  const reasons = useLostReasons();
  const [reason, setReason] = React.useState("");
  const [note, setNote] = React.useState("");
  const [retry, setRetry] = React.useState("");
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (reason) onConfirm(reason, note.trim(), retry);
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="lost-reason">Why</Label>
        <NativeSelect id="lost-reason" value={reason} onChange={(e) => setReason(e.target.value)}>
          <option value="">Pick a reason</option>
          {(reasons.data ?? []).filter((r) => r.active).map((r) => (
            <option key={r.id} value={r.key ?? r.label}>
              {r.label}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="lost-note">A line on it (optional)</Label>
        <Textarea id="lost-note" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="lost-retry">Try again on (optional)</Label>
        <Input id="lost-retry" type="date" className="w-[180px]" value={retry} onChange={(e) => setRetry(e.target.value)} />
        <p className="text-ink-3 m-0 text-[12px]">A follow-up on that day, months ahead, so {name} comes back round.</p>
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" variant="destructive" disabled={!reason || pending}>
          {pending ? <Loader2Icon className="animate-spin" /> : null}
          Mark lost
        </Button>
      </DialogFooter>
    </form>
  );
}

/**
 * Moving a lead between stages, from the board or the lead page: Lost asks
 * why (a reason is required, with an optional try-again date), and a move
 * that leaves the lead with no open follow-up asks for the next one.
 */
export function useStageMover() {
  const update = useUpdateLead();
  const rights = useTeamRights();
  const teams = useTeams();
  const [lost, setLost] = React.useState<Target | null>(null);
  const [ask, setAsk] = React.useState<Target | null>(null);

  const send = (t: Target, to: string, extra: Record<string, string> = {}) =>
    update.mutate(
      { id: t.id, patch: { stage: to, ...extra } },
      {
        onSuccess: (r) => {
          toast.success(`${t.name}: ${stageLabel(to)}`);
          setLost(null);
          if (r.needsFollowUp && to !== "lost") setAsk(t);
        },
      }
    );

  const request = (t: Target, to: string) => {
    const move = stageMove(t.stage, to, rights.workLead(t.ownerId));
    if (move === "denied") toast.info("Only its owner (or an admin owner) moves this lead.");
    if (move === "needs_reason") setLost(t);
    if (move === "move") send(t, to);
    return move;
  };

  const element = (
    <>
      <Dialog open={lost !== null} onOpenChange={(open) => (open ? null : setLost(null))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Mark {lost?.name} lost</DialogTitle>
            <DialogDescription>Lost needs a reason: it is what the reports count.</DialogDescription>
          </DialogHeader>
          {lost ? (
            <LostForm
              name={lost.name}
              pending={update.isPending}
              onCancel={() => setLost(null)}
              onConfirm={(reason, note, retry) => send(lost, "lost", { lost_reason: reason, ...(note ? { lost_note: note } : {}), ...(retry ? { retry_on: retry } : {}) })}
            />
          ) : null}
        </DialogContent>
      </Dialog>
      <NextFollowUpDialog open={ask !== null} onOpenChange={(open) => (open ? null : setAsk(null))} leadId={ask?.id} owners={rights.owner ? membersOf(teams.data, "sales") : undefined} defaultOwnerId={ask?.ownerId} />
    </>
  );

  return { request, element, pending: update.isPending };
}
