"use client";

import * as React from "react";
import { Button, FigurePanel, Segmented, Skeleton } from "@moa/ui";

import {
  CHANNEL_HELP,
  channelOptions,
  useDeliveryChannels,
  useSaveDeliveryChannels,
  type ChannelKind,
  type ChannelMode,
  type DeliveryChannels,
} from "@/features/deliveries";

const ROWS: { kind: ChannelKind; label: string }[] = [
  { kind: "ticket", label: "Ticket" },
  { kind: "reminder", label: "Day-before reminder" },
  { kind: "certificate", label: "Certificate" },
];

/** "How guests get these": email, WhatsApp or both for each automatic send. */
export function DeliveryChannelsCard({ eventId }: { eventId: number }) {
  const state = useDeliveryChannels(eventId);
  const save = useSaveDeliveryChannels(eventId);
  const [draft, setDraft] = React.useState<DeliveryChannels | null>(null);

  if (state.isError) return null;
  const saved: DeliveryChannels | null = state.data
    ? { ticket: state.data.ticket, reminder: state.data.reminder, certificate: state.data.certificate }
    : null;
  const value = draft ?? saved;
  const available = state.data?.whatsapp_available ?? false;
  const changed = Boolean(draft && saved && ROWS.some((r) => draft[r.kind] !== saved[r.kind]));

  return (
    <section aria-labelledby="delivery-channels">
      <h3 id="delivery-channels" className="eyebrow mb-2">
        How guests get these
      </h3>
      <FigurePanel className="p-4">
        {!value ? (
          <Skeleton className="h-[132px] w-full rounded-xl" />
        ) : (
          <div className="grid gap-3">
            {ROWS.map((r) => (
              <div key={r.kind} className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-ink text-[13px] font-medium">{r.label}</span>
                <Segmented
                  label={`${r.label}: send by`}
                  className="w-full sm:w-[280px]"
                  value={value[r.kind]}
                  options={channelOptions(available)}
                  onChange={(v: ChannelMode) => setDraft({ ...value, [r.kind]: v })}
                />
              </div>
            ))}
            <p className="text-ink-3 m-0 text-[12px]">
              {available
                ? CHANNEL_HELP
                : `${state.data?.whatsapp_note || "WhatsApp isn't available for this event."} ${CHANNEL_HELP}`}
            </p>
            {changed ? (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={save.isPending}
                  onClick={() => save.mutate(draft!, { onSuccess: () => setDraft(null) })}
                >
                  Save
                </Button>
                <Button size="sm" variant="ghost" disabled={save.isPending} onClick={() => setDraft(null)}>
                  Cancel
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </FigurePanel>
    </section>
  );
}
