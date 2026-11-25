"use client";

import * as React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Segmented,
} from "@moa/ui";

import type { ChannelKind, ChannelMode } from "../api";
import { useDeliveryChannels } from "../queries";

export const CHANNEL_HELP = "Guests who didn't opt in to WhatsApp still get the email.";

/** The three choices, with WhatsApp and Both off when WhatsApp can't send. */
export function channelOptions(whatsappAvailable: boolean) {
  return [
    { value: "email" as const, label: "Email" },
    { value: "whatsapp" as const, label: "WhatsApp", disabled: !whatsappAvailable },
    { value: "both" as const, label: "Both", disabled: !whatsappAvailable },
  ];
}

/** What a send picks when it opens: the event's setting, or email when WhatsApp can't send. */
export function useDefaultChannel(eventId: number, kind: ChannelKind) {
  const channels = useDeliveryChannels(eventId);
  const available = channels.data?.whatsapp_available ?? false;
  const saved = channels.data?.[kind] ?? "both";
  return { mode: (available ? saved : "email") as ChannelMode, available, note: channels.data?.whatsapp_note ?? null };
}

/** "Send by: Email / WhatsApp / Both", for inside a dialog that already asks something. */
export function SendByField({
  value,
  onChange,
  available,
  note,
}: {
  value: ChannelMode;
  onChange: (v: ChannelMode) => void;
  available: boolean;
  note: string | null;
}) {
  return (
    <div className="grid gap-1.5">
      <span className="text-ink-2 text-[12.5px] font-medium">Send by</span>
      <Segmented label="Send by" value={value} options={channelOptions(available)} onChange={onChange} />
      <p className="text-ink-3 m-0 text-[12px]">{available ? CHANNEL_HELP : note || "WhatsApp isn't available for this event."}</p>
    </div>
  );
}

/**
 * Asks "Send by" before a send, pre-picked from the event's setting.
 * `ask(what, run)` opens it; `run(channels)` is called on Send. Render `dialog` once.
 */
export function useSendBy(eventId: number, kind: ChannelKind) {
  const { mode, available, note } = useDefaultChannel(eventId, kind);
  const [pending, setPending] = React.useState<{ what: string; run: (c: ChannelMode) => void } | null>(null);
  const [value, setValue] = React.useState<ChannelMode>(mode);

  const ask = React.useCallback(
    (what: string, run: (c: ChannelMode) => void) => {
      setValue(mode);
      setPending({ what, run });
    },
    [mode],
  );

  const dialog = (
    <AlertDialog open={pending !== null} onOpenChange={(open) => (open ? null : setPending(null))}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{pending?.what ?? "Send"}</AlertDialogTitle>
          <AlertDialogDescription>Choose how it goes out.</AlertDialogDescription>
        </AlertDialogHeader>
        <SendByField value={value} onChange={setValue} available={available} note={note} />
        <AlertDialogFooter>
          <AlertDialogCancel variant="secondary">Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="primary"
            onClick={() => {
              pending?.run(value);
              setPending(null);
            }}
          >
            Send
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { ask, dialog };
}
