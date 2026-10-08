"use client";

import * as React from "react";
import { CheckIcon, CopyIcon, KeyRoundIcon, Loader2Icon } from "lucide-react";
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

import { generatePassword } from "../password";
import { useResetUserPassword } from "../queries";

/**
 * Set another user's password.
 *
 * This is the only way to issue credentials: the API has no unauthenticated
 * forgot-password flow, so without it a lost password means editing the
 * database. It is owner-only for the obvious reason -- it is account takeover
 * with a friendlier name -- and the dialog says so rather than pretending
 * otherwise.
 */

export function ResetPasswordDialog({
  open,
  onOpenChange,
  emailOrUsername,
  label,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-filled and read-only when opened against a known account. */
  emailOrUsername: string;
  label: string;
}) {
  const reset = useResetUserPassword();
  /*
   * Generated once on mount, not in an effect. Callers render this
   * conditionally or with a key, so it mounts fresh per opening -- and an
   * effect would paint one frame with an empty field before filling it.
   */
  const [password, setPassword] = React.useState(generatePassword);
  const [done, setDone] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  async function submit() {
    await reset.mutateAsync({ emailOrUsername, newPassword: password });
    setDone(true);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRoundIcon className="size-4" /> Set a password
          </DialogTitle>
          <DialogDescription>
            For <strong>{label}</strong>. They are signed out everywhere, and
            anyone who had the old password loses access.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="new-password">New password</Label>
          <div className="flex gap-2">
            <Input
              id="new-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setCopied(false);
              }}
              className="font-mono"
              disabled={reset.isPending || done}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Copy password"
              className={pressable}
              onClick={() => {
                void navigator.clipboard.writeText(password);
                setCopied(true);
              }}
            >
              {copied ? <CheckIcon /> : <CopyIcon />}
            </Button>
          </div>
          {password.length < 6 ? (
            <p className="text-destructive text-xs">
              The API requires at least 6 characters.
            </p>
          ) : null}
        </div>

        {done ? (
          <InlineAlert tone="success" title="Password set">
            Copy it now — it is not stored anywhere you can read it back, and
            this dialog is the only place it appears.
          </InlineAlert>
        ) : (
          <InlineAlert tone="warning">
            Send it over something you trust. It is recorded in the activity
            log that you did this, but not what you set.
          </InlineAlert>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {done ? "Done" : "Cancel"}
          </Button>
          {done ? null : (
            <Button disabled={password.length < 6 || reset.isPending} onClick={submit}>
              {reset.isPending ? <Loader2Icon className="animate-spin" /> : null}
              Set password
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
