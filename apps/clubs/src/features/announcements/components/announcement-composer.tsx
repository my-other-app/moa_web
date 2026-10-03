"use client";

import * as React from "react";
import { Loader2Icon } from "lucide-react";
import { SectionTitle } from "@moa/app-kit";
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
  Label,
  Textarea,
  buttonVariants,
  cn,
} from "@moa/ui";
import { pressable } from "@moa/ui/motion";

import { useSendAnnouncement } from "../queries";

const MAX_BODY = 1000;

/**
 * "Make Announcements" from the event screen (node 206:121): a label, one
 * textarea and a Send Message button.
 *
 * The endpoint takes a title and a body, but the design has no title field.
 * Rather than invent one, the event's name becomes the notification title and
 * the typed text becomes its body -- which is how the notification reads on a
 * phone anyway: the event name in bold, the message under it.
 *
 * Sending is confirmed first. This is a push notification to real devices with
 * no recall, so the recipient count goes in front of the organiser before it
 * leaves.
 */
export function AnnouncementComposer({
  eventId,
  eventName,
  recipientCount,
}: {
  eventId: number;
  eventName: string;
  recipientCount: number;
}) {
  const [body, setBody] = React.useState("");
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const send = useSendAnnouncement();

  const trimmed = body.trim();
  const tooShort = trimmed.length > 0 && trimmed.length < 5;
  const canSend = trimmed.length >= 5 && !send.isPending;

  async function onConfirm() {
    await send.mutateAsync({
      eventId,
      input: { title: eventName.slice(0, 120), body: trimmed },
    });
    setBody("");
    setConfirmOpen(false);
  }

  return (
    <section className="flex flex-col gap-1">
      <SectionTitle>Make Announcements</SectionTitle>

      <div className="flex flex-col gap-1">
        <Label
          htmlFor="announcement-body"
          className="text-xs font-normal text-[var(--swatch-ink)]"
        >
          Send message to the registered participants as notifications
        </Label>
        <Textarea
          id="announcement-body"
          variant="design"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={MAX_BODY}
          rows={7}
          placeholder="Enter the message send"
          disabled={send.isPending}
          aria-describedby="announcement-help"
          className="min-h-[186px]"
        />
        <p
          id="announcement-help"
          className="flex justify-between text-xs text-[var(--swatch-grey)]"
        >
          <span>
            {tooShort ? (
              <span className="text-destructive">Write at least 5 characters</span>
            ) : (
              `Sent as a notification titled “${eventName}”`
            )}
          </span>
          <span className="tabular-nums">
            {trimmed.length.toLocaleString("en-IN")} / {MAX_BODY.toLocaleString("en-IN")}
          </span>
        </p>
      </div>

      <div className="mt-4 flex justify-center xl:justify-end">
        <Button
          type="button"
          variant="outline"
          size="display"
          disabled={!canSend}
          onClick={() => setConfirmOpen(true)}
          className={cn(
            "bebas w-full border border-[var(--swatch-ink)] bg-white tracking-wide text-[var(--swatch-ink)] shadow-none hover:bg-[#f3f3f3] sm:w-[240px]",
            pressable
          )}
        >
          {send.isPending ? <Loader2Icon className="size-5 animate-spin" /> : null}
          {send.isPending ? "Sending…" : "Send Message"}
        </Button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Send this to{" "}
              {recipientCount === 1
                ? "1 person"
                : `${recipientCount.toLocaleString("en-IN")} people`}
              ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              It arrives as a phone notification titled “{eventName}” and cannot be
              recalled.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <p className="bg-muted rounded-md p-3 text-sm whitespace-pre-wrap">{trimmed}</p>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={send.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={cn(buttonVariants())}
              disabled={send.isPending}
              onClick={(e) => {
                // Keep the dialog up while the request is in flight so the
                // organiser cannot fire it twice.
                e.preventDefault();
                void onConfirm();
              }}
            >
              {send.isPending ? "Sending…" : "Send notification"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
