"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, cn } from "@moa/ui";

import { useDuplicateEvent } from "@/features/event-form";

const control = "h-9 w-full rounded-md border bg-muted/40 px-2.5 text-[13px]";

const toLocalInput = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** A new event from this one's setup, on a new date. What is a judgement call is asked for. */
export function DuplicateDialog({ event, onClose }: { event: { id: number; name: string }; onClose: () => void }) {
  const router = useRouter();
  const duplicate = useDuplicateEvent(event.id);
  const [name, setName] = React.useState(`${event.name} (copy)`);
  const [when, setWhen] = React.useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    d.setMinutes(0, 0, 0);
    return toLocalInput(d);
  });
  const [copies, setCopies] = React.useState({ copy_merch: true, copy_doors: true, copy_team: false, copy_agenda: false });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !when) return;
    duplicate.mutate(
      { name: name.trim(), event_datetime: new Date(when).toISOString(), ...copies },
      {
        onSuccess: (made) => {
          onClose();
          router.push(`/events/${made.id}`);
        },
      }
    );
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Duplicate {event.name}</DialogTitle>
          <DialogDescription>Its fields, door and card rules, designs, email journey and settings come across. The venue, the guest list and every record of the day stay behind. The copy starts as a draft.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <label className="block space-y-1 text-[12px]">
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} className={control} />
          </label>
          <label className="block space-y-1 text-[12px]">
            Starts
            <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={cn(control, "font-mono")} required />
          </label>
          <fieldset className="space-y-1.5">
            <legend className="text-[12px]">Also copy</legend>
            {(
              [
                ["copy_merch", "Merchandise", "Items and sizes, with their stock; nothing handed out."],
                ["copy_doors", "Doors", "Names and kinds; no gate links."],
                ["copy_team", "Team", "Volunteers and their duties."],
                ["copy_agenda", "Agenda", "Every block, moved to the new date."],
              ] as const
            ).map(([key, label, hint]) => (
              <label key={key} className="flex cursor-pointer items-start gap-2.5">
                <input type="checkbox" checked={copies[key]} onChange={(e) => setCopies((c) => ({ ...c, [key]: e.target.checked }))} className="mt-0.5 size-4 accent-primary" />
                <span>
                  <span className="block text-[13px]">{label}</span>
                  <span className="block text-[12px] text-muted-foreground">{hint}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <div className="flex gap-2">
            <Button type="submit" disabled={duplicate.isPending || !name.trim()} className="flex-1">
              {duplicate.isPending ? "Copying…" : "Create the copy"}
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
