"use client";

import * as React from "react";
import { Loader2Icon, PlusIcon } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  InlineAlert,
  Input,
  Label,
} from "@moa/ui";
import { pressable } from "@moa/ui/motion";

import { useCan } from "@/hooks/use-can";
import { ResetPasswordDialog } from "@/features/users";
import { useCreateClub } from "../queries";

/**
 * Create a club without waiting for one to apply.
 *
 * The endpoint existed with no UI, so the only route in was a club applying
 * and an admin approving. Onboarding a club you already have an agreement
 * with meant a database insert.
 *
 * The service generates a random password and deliberately does not return
 * it, so a club created here cannot sign in. That is why this hands straight
 * over to the password dialog rather than reporting success and leaving an
 * account nobody can use -- the two halves are one job.
 */
export function CreateClubButton() {
  const allowed = useCan("manage_content");
  const create = useCreateClub();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [created, setCreated] = React.useState<{ name: string; email: string } | null>(
    null
  );

  if (!allowed) return null;

  const valid = name.trim().length >= 2 && /\S+@\S+\.\S+/.test(email.trim());

  function close() {
    setOpen(false);
    setName("");
    setEmail("");
  }

  return (
    <>
      <Button size="sm" className={pressable} onClick={() => setOpen(true)}>
        <PlusIcon /> New club
      </Button>

      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New club</DialogTitle>
            <DialogDescription>
              Creates the club already approved. It cannot sign in until you set
              a password, which is the next step.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="club-name">Club name</Label>
            <Input
              id="club-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={create.isPending}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="club-email">Email</Label>
            <Input
              id="club-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={create.isPending}
            />
            <p className="text-muted-foreground text-xs">
              This is also the username they sign in with.
            </p>
          </div>

          <InlineAlert tone="info">
            The club is created verified, so its events can be published
            immediately. Reject it afterwards if that was not the intent.
          </InlineAlert>

          <DialogFooter>
            <Button variant="ghost" onClick={close} disabled={create.isPending}>
              Cancel
            </Button>
            <Button
              disabled={!valid || create.isPending}
              onClick={async () => {
                const club = await create.mutateAsync({ name, email });
                setCreated({ name: club.name ?? name, email: club.email ?? email });
                close();
              }}
            >
              {create.isPending ? <Loader2Icon className="animate-spin" /> : null}
              Create and set password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {created ? (
        <ResetPasswordDialog
          key={created.email}
          open
          onOpenChange={(next) => !next && setCreated(null)}
          emailOrUsername={created.email}
          label={created.name}
        />
      ) : null}
    </>
  );
}
