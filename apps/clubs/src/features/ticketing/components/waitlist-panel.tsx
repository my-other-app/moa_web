"use client";

import * as React from "react";
import { CopyIcon, DownloadIcon, LockIcon, SendIcon, UserMinusIcon, UsersRoundIcon } from "lucide-react";
import { formatDateTime } from "@moa/app-kit";
import {
  CardLabel,
  Chip,
  EmptyState,
  FigurePanel,
  IconButton,
  Notice,
  Skeleton,
  StatusBadge,
  Switch,
  toast,
  type StatusTone,
} from "@moa/ui";

import { useAccess } from "@/features/access";
// The query, not the feature's surface: events reaches this feature through the event form.
import { useEventDetail } from "@/features/events/queries";
import { openUpgrade, useEventPlan } from "@/features/plan";

import { waitlistExportUrl } from "../api";
import { useOfferWaitlistEntry, useRemoveWaitlistEntry, useWaitlist, useWaitlistSettings } from "../queries";
import { ENTRY_STATUS_LABEL, OFFER_HOURS, type EntryStatus, type WaitlistEntry } from "../schemas";

/**
 * The event's waiting list, for the club: switched on and off, how long an
 * offer holds a place, and the people in it.
 *
 * When a ticket type (or the event) is sold out and the list is on, people
 * join it. As a place frees up -- a cancellation, a refund, a cap raised --
 * the next in line is sent a claim link that holds it for the offer hours;
 * one that runs out moves to the next person within the minute. The club
 * can offer a place to someone by hand (only a free place: never over a
 * cap), take someone off, and export the list.
 */
const STATUS_TONE: Record<EntryStatus, StatusTone> = {
  waiting: "info",
  offered: "warning",
  claimed: "success",
  expired: "default",
  removed: "default",
  left: "default",
};

const FILTERS: { key: EntryStatus | null; label: string }[] = [
  { key: null, label: "Everyone" },
  { key: "waiting", label: "Waiting" },
  { key: "offered", label: "Offered" },
  { key: "claimed", label: "Claimed" },
];

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Claim link copied");
  } catch {
    toast.error("Could not copy: select the link and copy it by hand.");
  }
}

function EntryRow({ e, eventId, canEdit }: { e: WaitlistEntry; eventId: number; canEdit: boolean }) {
  const offer = useOfferWaitlistEntry(eventId);
  const remove = useRemoveWaitlistEntry(eventId);
  const open = e.status === "waiting" || e.status === "offered";
  return (
    <li className="border-line-soft grid gap-2 border-t px-4 py-3 sm:grid-cols-[40px_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center">
      <span className="text-ink-3 font-mono text-[12px] tabular-nums">{e.position ? `#${e.position}` : "—"}</span>
      <div className="min-w-0">
        <p className="text-ink truncate text-[13px] font-medium">{e.full_name}</p>
        <p className="text-ink-3 truncate text-[12px]">
          {[e.email, e.phone].filter(Boolean).join(" · ")}
          {e.whatsapp_opt_in ? " · WhatsApp" : ""}
        </p>
      </div>
      <div className="min-w-0">
        <p className="text-ink-2 truncate text-[12.5px]">{e.ticket_type_name ?? "Ticket"}</p>
        <StatusBadge label={ENTRY_STATUS_LABEL[e.status]} tone={STATUS_TONE[e.status]} />
      </div>
      <p className="text-ink-3 text-[12px]">
        {e.status === "offered" && e.offer_expires_at ? `Held until ${formatDateTime(e.offer_expires_at)}` : `Joined ${formatDateTime(e.created_at)}`}
      </p>
      {canEdit ? (
        <div className="flex items-center gap-1">
          {e.offer_url ? (
            <IconButton label={`Copy ${e.full_name}'s claim link`} variant="ghost" size="sm" onClick={() => void copy(e.offer_url!)}>
              <CopyIcon />
            </IconButton>
          ) : null}
          {e.status === "waiting" || e.status === "expired" || e.status === "offered" ? (
            <IconButton label={e.status === "offered" ? `Send ${e.full_name} the link again` : `Offer ${e.full_name} a place`} variant="ghost" size="sm" disabled={offer.isPending} onClick={() => offer.mutate(e.id)}>
              <SendIcon />
            </IconButton>
          ) : null}
          {open ? (
            <IconButton label={`Take ${e.full_name} off the list`} variant="ghost" size="sm" disabled={remove.isPending} onClick={() => remove.mutate({ id: e.id, name: e.full_name })}>
              <UserMinusIcon />
            </IconButton>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function HoursField({ value, onSave, disabled }: { value: number; onSave: (hours: number) => void; disabled: boolean }) {
  // Keyed by the saved value (the caller), so a save elsewhere starts it again.
  const [hours, setHours] = React.useState(String(value));
  const n = Number(hours);
  const valid = Number.isInteger(n) && n >= OFFER_HOURS.min && n <= OFFER_HOURS.max;
  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(ev) => {
        ev.preventDefault();
        if (valid && n !== value) onSave(n);
      }}
    >
      <label className="grid gap-1">
        <span className="eyebrow">An offer holds a place for</span>
        <span className="flex items-center gap-2">
          <input aria-label="Hours an offer holds a place" className="input h-8 w-20" type="number" min={OFFER_HOURS.min} max={OFFER_HOURS.max} step="1" value={hours} disabled={disabled} onChange={(ev) => setHours(ev.target.value)} />
          <span className="text-ink-2 text-[12.5px]">hours</span>
        </span>
      </label>
      <button type="submit" className="btn btn-secondary btn-sm" disabled={disabled || !valid || n === value}>
        Save
      </button>
      {!valid ? <span className="text-refuse text-[12px]">1 to 168 hours</span> : null}
    </form>
  );
}

export function WaitlistPanel({ eventId }: { eventId: number }) {
  const [filter, setFilter] = React.useState<EntryStatus | null>(null);
  const list = useWaitlist(eventId, filter);
  const settings = useWaitlistSettings(eventId);
  const { can } = useAccess();
  const plan = useEventPlan(eventId);
  const lock = plan.featureLock("waitlist");
  const canEdit = Boolean(can.edit_events);
  // Confirm each registration: no waiting list, new people ask instead (the server refuses joining).
  const confirmsEach = useEventDetail(eventId).data?.requires_approval === true;

  if (list.data === null) return null;
  const s = list.data?.settings;
  const counts = list.data?.counts ?? {};
  const notAllowed = s ? !s.allowed : false;

  const toggle = (enabled: boolean) => {
    if (enabled && (lock || notAllowed)) {
      if (lock) openUpgrade(lock);
      else openUpgrade(plan.lockFor("waitlist"));
      return;
    }
    settings.mutate({ enabled });
  };

  return (
    <FigurePanel className="p-0">
      <div className="grid gap-3 px-4 pt-4 pb-3">
        <CardLabel
          right={
            <a href={waitlistExportUrl(eventId)} className="btn btn-secondary btn-sm" download>
              <DownloadIcon className="size-4" /> Export
            </a>
          }
        >
          Waiting list
        </CardLabel>
        {s ? (
          <div className="flex flex-wrap items-end justify-between gap-4">
            <label className="flex items-center gap-3">
              <Switch checked={s.enabled} disabled={!canEdit || settings.isPending} onCheckedChange={toggle} aria-label="Waiting list on" />
              <span>
                <span className="text-ink flex items-center gap-1.5 text-[13.5px] font-medium">
                  {s.enabled ? "On: people can join when tickets sell out" : "Off"}
                  {lock && !s.enabled ? <LockIcon role="img" aria-label="Locked" className="text-ink-3 size-3.5" /> : null}
                </span>
                <span className="text-ink-3 block text-[12px]">The next in line is sent a claim link as a place frees up, by email, the app and WhatsApp where they asked.</span>
              </span>
            </label>
            <HoursField key={s.offer_hours} value={s.offer_hours} disabled={!canEdit || settings.isPending} onSave={(offer_hours) => settings.mutate({ offer_hours })} />
          </div>
        ) : (
          <Skeleton className="h-10 w-full" />
        )}
        {confirmsEach ? (
          <Notice tone="neutral" tag="Requests">
            This event confirms each registration, so it has no waiting list: new people send a request and wait for you to confirm them under Requests.
          </Notice>
        ) : null}
        {s && notAllowed && s.enabled ? <Notice tone="caution" tag="Plan">Your plan no longer includes waiting lists, so nobody new can join. The people already in line still get their offers.</Notice> : null}
        <div className="flex flex-wrap gap-2" role="group" aria-label="Show">
          {FILTERS.map((f) => (
            <Chip key={f.key ?? "all"} active={filter === f.key} onClick={() => setFilter(f.key)}>
              {f.label}
              {f.key ? <span className="font-mono tabular-nums">{counts[f.key] ?? 0}</span> : null}
            </Chip>
          ))}
        </div>
      </div>
      {list.isPending ? (
        <div className="grid gap-2 px-4 pb-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : list.isError ? (
        <p className="text-ink-3 px-4 pb-4 text-[12.5px]">The waiting list could not load. Try again in a moment.</p>
      ) : list.data && list.data.entries.length === 0 ? (
        <div className="px-4 pb-5">
          <EmptyState size="sm" icon={<UsersRoundIcon />} title={filter ? "Nobody here" : "Nobody is waiting"} description={s?.enabled ? "When a ticket type sells out, people can join here instead of going away." : "Turn the list on, and people can join it once a ticket type sells out."} />
        </div>
      ) : (
        <ul aria-label="People on the waiting list">
          {(list.data?.entries ?? []).map((e) => (
            <EntryRow key={e.id} e={e} eventId={eventId} canEdit={canEdit} />
          ))}
        </ul>
      )}
    </FigurePanel>
  );
}
