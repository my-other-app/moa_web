"use client";

import * as React from "react";
import { Loader2Icon } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Label,
  Textarea,
  buttonVariants,
  cn,
} from "@moa/ui";

interface ReasonSpec {
  label: string;
  placeholder?: string;
  min?: number;
}

/** The reason box and the buttons: inside the dialog's content, so closing it starts the reason afresh. */
function ConfirmBody({
  confirmLabel,
  destructive,
  reason,
  pending,
  onConfirm,
}: {
  confirmLabel: string;
  destructive: boolean;
  reason?: ReasonSpec | undefined;
  pending: boolean;
  onConfirm: (reason: string) => void;
}) {
  const [text, setText] = React.useState("");
  const id = React.useId();
  const ready = !reason || text.trim().length >= (reason.min ?? 3);
  return (
    <>
      {reason ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={id}>{reason.label}</Label>
          <Textarea id={id} value={text} placeholder={reason.placeholder} rows={3} maxLength={1000} onChange={(e) => setText(e.target.value)} />
        </div>
      ) : null}
      <AlertDialogFooter>
        <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
        <AlertDialogAction
          className={cn(buttonVariants({ variant: destructive ? "destructive" : "primary" }))}
          disabled={pending || !ready}
          onClick={(event) => {
            event.preventDefault();
            onConfirm(text.trim());
          }}
        >
          {pending ? <Loader2Icon className="animate-spin" /> : null}
          {confirmLabel}
        </AlertDialogAction>
      </AlertDialogFooter>
    </>
  );
}

/**
 * A confirmation for an action that changes something for good: a title, what
 * it means, an optional reason to write (required when asked for), and a
 * button that stays enabled and keeps the dialog open when the server says no
 * -- the caller's mutation toasts why.
 */
export function ConfirmAction({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  destructive = false,
  reason,
  pending = false,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description: React.ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  /** Ask for a reason: its label, and the shortest it may be. */
  reason?: ReasonSpec;
  pending?: boolean;
  onConfirm: (reason: string) => void;
  children?: React.ReactNode;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {children}
        <ConfirmBody confirmLabel={confirmLabel} destructive={destructive} reason={reason} pending={pending} onConfirm={onConfirm} />
      </AlertDialogContent>
    </AlertDialog>
  );
}
