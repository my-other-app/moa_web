"use client";

import * as React from "react";
import { Loader2Icon } from "lucide-react";
import { ApiError } from "@moa/api";
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@moa/ui";

import type { PersonPatch } from "../api";
import { useCorrectPerson } from "../queries";

export interface PersonToCorrect {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
}

/**
 * Correct someone's name, email or phone on an event from a support case,
 * without signing in as the club: a guest on the list, or a registration
 * under review. Only what changed is sent; nothing is decided or emailed.
 */
export function CorrectPersonDialog({
  eventId,
  kind,
  person,
  onClose,
}: {
  eventId: number;
  kind: "registration" | "review";
  person: PersonToCorrect;
  onClose: () => void;
}) {
  const correct = useCorrectPerson(eventId, kind);
  const [name, setName] = React.useState(person.full_name ?? "");
  const [email, setEmail] = React.useState(person.email ?? "");
  const [phone, setPhone] = React.useState(person.phone ?? "");
  const [error, setError] = React.useState<string | null>(null);

  const save = (ev: React.FormEvent) => {
    ev.preventDefault();
    setError(null);
    if (!name.trim()) return setError("A name is needed.");
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError("That does not look like an email address.");
    const patch: PersonPatch = {};
    if (name.trim() !== (person.full_name ?? "")) patch.full_name = name.trim();
    if (email.trim() !== (person.email ?? "")) patch.email = email.trim();
    if (phone.trim() !== (person.phone ?? "")) patch.phone = phone.trim();
    if (!Object.keys(patch).length) return onClose();
    correct.mutate(
      { id: person.id, patch },
      {
        onSuccess: onClose,
        onError: (e) => setError(e instanceof ApiError ? e.message : "Could not save. Try again in a moment."),
      },
    );
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {person.full_name ?? "this person"}&apos;s details</DialogTitle>
          <DialogDescription>
            {kind === "review"
              ? "Their registration stays under review: nothing is decided or emailed."
              : "Their ticket and check-in stay as they are; nothing is emailed."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={save} noValidate className="grid gap-3">
          <label className="grid gap-1 text-sm">
            <span className="text-ink-2 text-xs font-medium">Name</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">
              <span className="text-ink-2 text-xs font-medium">Email</span>
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-ink-2 text-xs font-medium">Phone</span>
              <input className="input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </label>
          </div>
          {error ? (
            <p role="alert" className="text-destructive text-xs">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={correct.isPending}>
              {correct.isPending ? <Loader2Icon className="animate-spin" /> : null}
              Save details
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
