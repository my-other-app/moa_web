"use client";

import * as React from "react";
import { Loader2Icon, SendIcon } from "lucide-react";
import { Button, Checkbox, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Textarea, toast } from "@moa/ui";

import { sendAnnouncement } from "@/features/announcements/api";
import { sendMessage } from "@/features/emails/api";

/**
 * Write to one guest: an email (through Messages, so it is logged and its
 * delivery tracked like any other send) and/or an app notification (only
 * when they are signed in to the app on a phone). Nothing goes to anyone else.
 */
export function MessageGuestDialog(props: {
  eventId: number;
  registrationId: string;
  name: string;
  email: string | null | undefined;
  onApp: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSent?: () => void;
}) {
  // The composer mounts each time the dialog opens, so it always starts blank.
  return <Dialog open={props.open} onOpenChange={props.onOpenChange}>{props.open ? <Composer {...props} /> : null}</Dialog>;
}

function Composer({
  eventId,
  registrationId,
  name,
  email,
  onApp,
  onOpenChange,
  onSent,
}: {
  eventId: number;
  registrationId: string;
  name: string;
  email: string | null | undefined;
  onApp: boolean;
  onOpenChange: (open: boolean) => void;
  onSent?: () => void;
}) {
  const canEmail = Boolean(email);
  const [byEmail, setByEmail] = React.useState(canEmail);
  const [byApp, setByApp] = React.useState(!canEmail && onApp);
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const first = name.split(/\s+/)[0] || name;
  const titleOk = title.trim().length >= 3;
  const bodyOk = body.trim().length >= 5;
  const ready = (byEmail || byApp) && titleOk && bodyOk && !sending;

  const send = async () => {
    setSending(true);
    setError(null);
    const done: string[] = [];
    const failed: string[] = [];
    if (byEmail) {
      try {
        await sendMessage(eventId, {
          subject: title.trim(),
          body: body.trim(),
          attachments: { ticketPdf: false, certificatePdf: false },
          audience: { who: "ALL", roles: [], registrationIds: [registrationId] },
          clientRef: crypto.randomUUID(),
        });
        done.push("email");
      } catch (e) {
        failed.push(`Email: ${(e as Error).message}`);
      }
    }
    if (byApp) {
      try {
        await sendAnnouncement(eventId, { title: title.trim(), body: body.trim(), audience: "all", registration_ids: [registrationId] });
        done.push("app notification");
      } catch (e) {
        failed.push(`App notification: ${(e as Error).message}`);
      }
    }
    setSending(false);
    if (done.length) {
      toast.success(`Sent to ${first}`, { description: `By ${done.join(" and ")}.` });
      onSent?.();
    }
    if (failed.length) {
      setError(failed.join(" "));
      return;
    }
    onOpenChange(false);
  };

  return (
      <DialogContent className="max-w-lg" onInteractOutside={(e) => (sending ? e.preventDefault() : undefined)}>
        <DialogHeader>
          <DialogTitle>Message {name}</DialogTitle>
          <DialogDescription>Only {first} gets this. Nobody else on the list is sent anything.</DialogDescription>
        </DialogHeader>

        <fieldset className="grid gap-2">
          <legend className="text-ink-2 mb-1 text-[12.5px] font-medium">Send by</legend>
          <label className="flex items-start gap-2.5 text-[13px]">
            <Checkbox checked={byEmail} disabled={!canEmail || sending} onCheckedChange={(v) => setByEmail(v === true)} aria-label="Send by email" />
            <span>
              Email
              <span className="text-ink-3 block text-[12px]">{canEmail ? email : "No email address on their registration."}</span>
            </span>
          </label>
          <label className="flex items-start gap-2.5 text-[13px]">
            <Checkbox checked={byApp} disabled={!onApp || sending} onCheckedChange={(v) => setByApp(v === true)} aria-label="Send as an app notification" />
            <span>
              App notification
              <span className="text-ink-3 block text-[12px]">
                {onApp ? "They are signed in to the MyOtherApp app, so it pops up on their phone." : "Not signed in to the MyOtherApp app on a phone, so a notification would not reach them."}
              </span>
            </span>
          </label>
        </fieldset>

        <label className="grid gap-1 text-[12.5px]">
          <span className="text-ink-2 font-medium">{byEmail && !byApp ? "Subject" : byApp && !byEmail ? "Title" : "Subject and title"}</span>
          <input
            className="input"
            value={title}
            maxLength={120}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Your table number"
            disabled={sending}
          />
        </label>
        <label className="grid gap-1 text-[12.5px]">
          <span className="text-ink-2 font-medium">Message</span>
          <Textarea
            value={body}
            maxLength={1000}
            rows={5}
            onChange={(e) => setBody(e.target.value)}
            placeholder={`Hi ${first}, …`}
            disabled={sending}
          />
          <span className="text-ink-3 text-[11.5px]">
            {byEmail ? "The email uses your event's email design. " : ""}
            {byApp ? "A notification shows the first lines only." : ""}
          </span>
        </label>

        {error ? (
          <p role="alert" className="text-refuse text-[12.5px]">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void send()} disabled={!ready}>
            {sending ? <Loader2Icon className="animate-spin" /> : <SendIcon />}
            {sending ? "Sending…" : `Send to ${first}`}
          </Button>
        </DialogFooter>
      </DialogContent>
  );
}
