"use client";

import * as React from "react";
import Link from "next/link";
import { Loader2Icon, LockIcon, SendIcon } from "lucide-react";
import { formatNumber } from "@moa/app-kit";
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
  CardLabel,
  FigurePanel,
  Segmented,
  buttonVariants,
} from "@moa/ui";

import { usePushAudience, useSendAnnouncement } from "@/features/announcements";
import { useLimitGate } from "@/features/plan";

const MAX_BODY = 1000;

const AUDIENCE = [
  { value: "all", label: "Everyone" },
  { value: "attendees", label: "Checked in" },
  { value: "non_attendees", label: "Not yet in" },
] as const;
type Audience = (typeof AUDIENCE)[number]["value"];
const WHO: Record<Audience, string> = {
  all: "Everyone on the list",
  attendees: "Guests already checked in",
  non_attendees: "Guests not yet checked in",
};

const phones = (n: number) => `${formatNumber(n)} ${n === 1 ? "phone" : "phones"}`;

/**
 * A push notification to this event's guests, written where the organiser
 * already is. Who gets it is chosen first — everyone, those already in, those
 * not yet in — with how many of them have the app on a phone, because a push
 * reaches nobody else. The event's name is the notification's title, which
 * is how it reads on a locked phone anyway. Sending is confirmed: there is
 * no recall.
 */
export function NotifyGuestsPanel({
  eventId,
  eventName,
  recipientCount,
}: {
  eventId: number;
  eventName: string;
  /** Everyone registered, for the confirmation before the audience figures load. */
  recipientCount: number;
}) {
  const id = React.useId();
  const [body, setBody] = React.useState("");
  const [audience, setAudience] = React.useState<Audience>("all");
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const send = useSendAnnouncement();
  const monthly = useLimitGate("announcements_per_month");
  const reach = usePushAudience(eventId);
  const r = reach.data?.by_audience[audience];

  const trimmed = body.trim();
  const tooShort = trimmed.length > 0 && trimmed.length < 5;
  const nobody = !!r && r.people > 0 && r.reachable === 0;
  const canSend = trimmed.length >= 5 && !send.isPending && !nobody;
  // The endpoint wants a title of three characters or more; a two-letter event name is padded, not refused.
  const title = (eventName.trim().length >= 3 ? eventName.trim() : `${eventName.trim()} update`).slice(0, 120);
  const people = r ? r.people : recipientCount;

  async function onConfirm() {
    await send.mutateAsync({ eventId, input: { title, body: trimmed, audience } });
    setBody("");
    setConfirmOpen(false);
  }

  return (
    <FigurePanel className="flex flex-col">
      <CardLabel
        right={
          <Link href="/announcements" className="text-brand hover:text-ink text-[12px] font-medium">
            Sent before →
          </Link>
        }
      >
        Notify guests
      </CardLabel>
      <p className="text-ink-3 mt-1 mb-3 text-[12px] leading-[1.5]">A push notification to their phones, titled “{title}”. It cannot be recalled.</p>

      <Segmented label="Who gets it" value={audience} options={AUDIENCE} onChange={setAudience} className="mb-2.5" />

      <label htmlFor={`${id}-body`} className="sr-only">
        Message
      </label>
      <textarea
        id={`${id}-body`}
        className="input min-h-[104px] w-full flex-1 py-2"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={MAX_BODY}
        rows={4}
        placeholder="We've moved to Hall B — same time."
        disabled={send.isPending}
        aria-describedby={`${id}-help`}
      />
      <div id={`${id}-help`} className="mt-1.5 flex items-start justify-between gap-3 text-[11.5px] leading-[1.45]">
        <span className={tooShort ? "text-refuse" : nobody ? "text-caution" : "text-ink-3"}>
          {tooShort
            ? "Write at least 5 characters."
            : nobody
              ? "Nobody in this audience is signed in to the app on a phone, so the push would reach no one. An email from Messages would."
              : r
                ? `${formatNumber(r.reachable)} of ${formatNumber(r.people)} reachable on a phone. The first line is what shows on a locked screen.`
                : "The first line is what shows on a locked screen."}
        </span>
        <span className="text-ink-3 shrink-0 font-mono tabular-nums">
          {trimmed.length.toLocaleString("en-IN")} / {MAX_BODY.toLocaleString("en-IN")}
        </span>
      </div>
      <div className="mt-3 flex justify-end">
        <Button variant="secondary" size="sm" disabled={!canSend} onClick={monthly.guard(() => setConfirmOpen(true))}>
          {send.isPending ? <Loader2Icon className="animate-spin" /> : monthly.locked ? <LockIcon /> : <SendIcon />}
          {send.isPending ? "Sending…" : r ? `Send to ${phones(r.reachable)}` : "Send"}
        </Button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Send this to {r ? phones(r.reachable) : people === 1 ? "1 person" : `${formatNumber(people)} people`}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {WHO[audience]} for {eventName}. It arrives as a notification titled “{title}” and cannot be recalled.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <p className="bg-sunken text-ink rounded-xl p-3 text-[13px] whitespace-pre-wrap">{trimmed}</p>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={send.isPending}>Keep writing</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants()}
              disabled={send.isPending}
              onClick={(e) => {
                // Held open while the request is in flight, so it cannot go twice.
                e.preventDefault();
                void onConfirm().catch(() => undefined);
              }}
            >
              {send.isPending ? "Sending…" : "Send notification"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </FigurePanel>
  );
}
