"use client";

import * as React from "react";
import { Button, InitialsAvatar, cn, toast } from "@moa/ui";
import { CheckIcon, GiftIcon, HourglassIcon, MapPinIcon } from "lucide-react";

import { useGateQuestGuest, useHandOverReward } from "../queries";
import type { DeskReward, GateQuestGuest } from "../schemas";
import { DoorSpinner } from "./door-kit";

const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

/** What a reward row says under its name. */
function statusLine(r: DeskReward): string {
  switch (r.status) {
    case "reserved":
      return r.needs_size ? "Held for them · no size picked yet" : ["Held for them", r.variant_label ? `size ${r.variant_label}` : null].filter(Boolean).join(" · ");
    case "collected":
      return ["Collected", r.collected_at ? clock(r.collected_at) : null, r.door, r.collected_by ? `by ${r.collected_by}` : null].filter(Boolean).join(" · ");
    case "waitlisted":
      return r.waitlist_position ? `On the waiting list · number ${r.waitlist_position}` : "On the waiting list";
    case "sold_out":
      return "Sold out when they unlocked it · not held";
    default:
      return "Not held";
  }
}

/**
 * A guest's quest rewards at the swag desk, each with what to do: hand it
 * over (picking the size first when none is chosen, or changing it), or why
 * not (collected already — when, where, by whom — on the waiting list, sold
 * out). A handover records the ordinary merch handover at this desk.
 */
export function DeskRewards({
  gateKey,
  eventId,
  door,
  guest,
  rewards: given,
  canHandOver,
  onChange,
}: {
  gateKey: string | null;
  eventId: number;
  door: string;
  guest: string;
  rewards: DeskReward[];
  canHandOver: boolean;
  /** After a handover: the card above may want to say so. */
  onChange?: (rewards: DeskReward[]) => void;
}) {
  // Fresh rewards from the server come with a new key (the parent's), so this starts from them again.
  const [rewards, setRewards] = React.useState(given);
  const [picking, setPicking] = React.useState<string | null>(null);
  const hand = useHandOverReward(gateKey, eventId);

  const replace = (claimId: string, next: Partial<DeskReward> | DeskReward | null | undefined) => {
    if (!next) return;
    const out = rewards.map((r) => (r.claim_id === claimId ? { ...r, ...next } : r));
    setRewards(out);
    onChange?.(out);
  };

  const handOver = async (r: DeskReward, size: string | null) => {
    try {
      const res = await hand.mutateAsync({ claimId: r.claim_id, variantLabel: size, door });
      switch (res.result) {
        case "HANDED_OVER": {
          const label = res.claim?.variant_label ?? size ?? r.variant_label;
          toast.success(`${r.name}${label ? ` — ${label}` : ""} handed to ${guest}`, {
            description: res.remaining != null ? `${res.remaining} left` : undefined,
          });
          replace(r.claim_id, res.claim ?? { status: "collected", collected_at: new Date().toISOString(), door, variant_label: label });
          setPicking(null);
          break;
        }
        case "ALREADY_COLLECTED":
          toast.warning("Already collected", { description: res.claim?.collected_at ? `At ${clock(res.claim.collected_at)}${res.claim.door ? `, ${res.claim.door}` : ""}.` : undefined });
          replace(r.claim_id, res.claim ?? { status: "collected" });
          setPicking(null);
          break;
        case "NEEDS_SIZE":
          replace(r.claim_id, res.claim ?? { needs_size: true });
          setPicking(r.claim_id);
          toast.warning("Pick their size first");
          break;
        case "SIZE_GONE":
          replace(r.claim_id, res.claim);
          setPicking(r.claim_id);
          toast.warning("That size just went", { description: "Pick another from what is left." });
          break;
        case "NOT_RESERVED":
          replace(r.claim_id, res.claim);
          setPicking(null);
          toast.warning("Nothing is held for them", { description: "It is sold out or on the waiting list." });
          break;
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not hand it over");
    }
  };

  if (rewards.length === 0)
    return <p className="text-ink-3 border-line-soft border-t px-4 py-3.5 text-[13.5px]">No rewards unlocked yet.</p>;

  return (
    <ul aria-label={`${guest}'s rewards`} className="border-line-soft divide-line-soft divide-y border-t">
      {rewards.map((r) => {
        const held = r.status === "reserved";
        const open = picking === r.claim_id;
        const busy = hand.isPending && hand.variables?.claimId === r.claim_id;
        return (
          <li key={r.claim_id}>
            <div className="flex items-center gap-3 px-4 py-3">
              {r.photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.photo_url} alt="" className="border-line-soft size-11 shrink-0 rounded-[var(--radius-md)] border object-cover" />
              ) : (
                <span aria-hidden="true" className="bg-brand-soft text-brand grid size-11 shrink-0 place-items-center rounded-[var(--radius-md)]">
                  <GiftIcon className="size-5" />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="text-ink block text-[15px] font-medium">{r.name}</span>
                {r.milestone ? <span className="text-ink-3 block text-[12px]">{r.milestone}</span> : null}
                <span className={cn("mt-0.5 flex items-center gap-1 text-[12.5px]", r.status === "collected" ? "text-admit" : held ? "text-ink-2" : "text-caution")}>
                  {r.status === "collected" ? <CheckIcon aria-hidden="true" className="size-3.5" /> : r.status === "waitlisted" ? <HourglassIcon aria-hidden="true" className="size-3.5" /> : null}
                  {statusLine(r)}
                </span>
              </span>
              {held && canHandOver ? (
                r.needs_size ? (
                  <Button size="lg" variant="secondary" aria-expanded={open} onClick={() => setPicking(open ? null : r.claim_id)}>
                    {open ? "Cancel" : "Pick size"}
                  </Button>
                ) : (
                  <Button size="lg" disabled={busy} onClick={() => void handOver(r, null)}>
                    {busy ? "Handing over…" : "Handed over"}
                  </Button>
                )
              ) : r.status === "collected" ? (
                <span className="tag bg-admit-soft text-admit shrink-0">Collected</span>
              ) : r.status === "waitlisted" ? (
                <span className="tag tag-neutral shrink-0">Waiting</span>
              ) : r.status === "sold_out" ? (
                <span className="tag tag-neutral shrink-0">Sold out</span>
              ) : null}
            </div>
            {held && canHandOver && !r.needs_size && r.choices.length > 0 && !open ? (
              <div className="-mt-1.5 px-4 pb-3">
                <button type="button" className="text-ink-2 hover:text-ink text-[12.5px] underline underline-offset-2" onClick={() => setPicking(r.claim_id)}>
                  They want another size
                </button>
              </div>
            ) : null}
            {open && held ? (
              <div className="bg-sunken flex flex-wrap gap-2 px-4 py-3" role="group" aria-label={`Sizes of ${r.name}`}>
                <p className="text-ink-2 basis-full text-[13px]">Tap the size they take: it is written to their record and handed over.</p>
                {r.choices.length ? (
                  r.choices.map((c) => (
                    <Button key={c.label} size="lg" variant="secondary" disabled={busy || (c.free != null && c.free <= 0)} onClick={() => void handOver(r, c.label)}>
                      {c.label}
                      {c.free != null ? <span className="text-ink-3 font-mono text-[11px]">{c.free}</span> : null}
                    </Button>
                  ))
                ) : (
                  <p className="text-caution text-[13px]">No size has a free one left.</p>
                )}
              </div>
            ) : null}
          </li>
        );
      })}
      {!canHandOver && rewards.some((r) => r.status === "reserved") ? (
        <li className="text-ink-3 px-4 py-3 text-[12.5px] leading-[1.5]">Handing rewards over is for staff with the merch switch on, or a swag desk&apos;s own gate link.</li>
      ) : null}
    </ul>
  );
}

/** At a swag desk, a guest found by name: their rewards, and the stations they visited. */
export function DeskGuest({
  gateKey,
  eventId,
  door,
  registrationId,
  canHandOver,
  onClose,
}: {
  gateKey: string | null;
  eventId: number;
  door: string;
  registrationId: string;
  canHandOver: boolean;
  onClose: () => void;
}) {
  const q = useGateQuestGuest(gateKey, eventId, registrationId);
  const g: GateQuestGuest | undefined = q.data;
  const name = g?.attendee?.name ?? "This guest";
  return (
    <section aria-label="Their rewards" className="bg-surface border-line-soft shadow-card overflow-hidden rounded-[var(--radius-card)] border">
      <div className="bg-sunken flex items-center gap-3 px-4 py-3">
        <InitialsAvatar name={name} size={36} />
        <span className="min-w-0 flex-1">
          <span className="text-ink block truncate text-[16px] font-semibold">{name}</span>
          {g ? (
            <span className="text-ink-3 block font-mono text-[11px]">
              {g.tasks_done} {g.tasks_done === 1 ? "task" : "tasks"} done{g.points ? ` · ${g.points} points` : ""}
            </span>
          ) : null}
        </span>
        <Button size="lg" variant="secondary" onClick={onClose}>
          Change
        </Button>
      </div>
      {g ? (
        <>
          <DeskRewards key={q.dataUpdatedAt} gateKey={gateKey} eventId={eventId} door={door} guest={name} rewards={g.rewards} canHandOver={canHandOver} />
          {g.stations.length ? (
            <p className="text-ink-3 border-line-soft flex items-start gap-1.5 border-t px-4 py-3 text-[12.5px] leading-[1.5]">
              <MapPinIcon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
              Visited {g.stations.map((s) => s.name).join(", ")}
            </p>
          ) : null}
        </>
      ) : q.isError ? (
        <p role="alert" className="text-refuse px-4 py-4 text-[13.5px]">
          {q.error instanceof Error ? q.error.message : "Could not look them up"}
        </p>
      ) : (
        <p className="text-ink-2 flex items-center gap-2 px-4 py-4 text-[13.5px]">
          <DoorSpinner className="size-3.5" /> Looking up their rewards…
        </p>
      )}
    </section>
  );
}
