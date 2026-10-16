"use client";

import * as React from "react";
import Link from "next/link";
import { DoorOpenIcon } from "lucide-react";
import { formatNumber, plural, type EventSummary } from "@moa/app-kit";
import {
  Button,
  EmptyState,
  Notice,
  Skeleton,
  StatTile,
} from "@moa/ui";

import { useEventSummary } from "@/features/console";
import { KiosksPanel } from "@/features/kiosk";

import { useTeam, useUpdateGateSettings } from "../queries";
import type { Team } from "../schemas";
import { DoorSettingsPanel } from "./door-settings";
import { DoorsPanel } from "./doors-panel";
import { PeoplePanel } from "./people-panel";
import { TabHead } from "./parts";

/**
 * Doors: the places guests are admitted, the people and devices that admit
 * them, and how the door behaves.
 *
 * Four figures say whether the door is ready — is it open, how many doors
 * and gate links, who is on check-in duty, how many came through — and one
 * notice says what stops it working. Then the doors with their gate links
 * beside the door's behaviour, the volunteers with their duties, and the
 * self check-in kiosks.
 */
function doorState(team: Team, s: EventSummary | undefined) {
  const mode = team.settings.door_mode;
  if (mode === "open")
    return { open: true, value: "Open", note: "anyone with a ticket, any time" };
  if (mode === "closed")
    return { open: false, value: "Shut", note: "every scan is refused" };
  if (!s)
    return { open: false, value: "Auto", note: "opens around the event" };
  if (s.door_open)
    return {
      open: true,
      value: "Open",
      note: `shuts ${team.settings.close_after_minutes} min after the end`,
    };
  return new Date(s.generated_at) < new Date(s.starts_at)
    ? { open: false, value: "Shut", note: "opens a day before the start" }
    : { open: false, value: "Shut", note: "shut since the end" };
}

function Ready({
  eventId,
  team,
  s,
}: {
  eventId: number;
  team: Team;
  s: EventSummary | undefined;
}) {
  const door = doorState(team, s);
  const open = team.doors.filter((d) => d.active);
  const linked = open.filter((d) => d.link && !d.link.expired).length;
  const retired = team.doors.length - open.length;
  const onDuty = team.volunteers.filter((v) => v.can_check_in).length;
  const pending = team.volunteers.filter((v) => !v.is_approved).length;
  const admitted =
    s?.checked_in ?? team.doors.reduce((n, d) => n + d.check_ins, 0);
  const busy = team.doors.filter((d) => d.check_ins > 0).length;
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatTile
        label="The door"
        value={door.value}
        note={door.note}
        scale={door.open ? "hero" : "sm"}
      />
      <StatTile
        label="Doors"
        value={formatNumber(open.length)}
        note={
          open.length
            ? `${linked} with a gate link${retired ? ` · ${retired} retired` : ""}`
            : "none named yet"
        }
      />
      <StatTile
        label="On check-in duty"
        value={formatNumber(onDuty)}
        note={
          team.volunteers.length
            ? `of ${plural(team.volunteers.length, "volunteer")}${pending ? ` · ${pending} not approved` : ""}`
            : "no volunteers yet"
        }
      />
      <StatTile
        label="Admitted"
        value={formatNumber(admitted)}
        note={busy ? `through ${plural(busy, "door")}` : "nobody yet"}
        action={{ label: "Check-in log", href: `/events/${eventId}/check-ins` }}
        linkAs={Link}
      />
    </div>
  );
}

/** The one thing that would stop the door working, if there is one. */
function Attention({ eventId, team }: { eventId: number; team: Team }) {
  const settings = useUpdateGateSettings(eventId);
  const onDuty = team.volunteers.filter((v) => v.can_check_in).length;
  const linked = team.doors.some((d) => d.active && d.link && !d.link.expired);
  if (team.settings.door_mode === "closed")
    return (
      <Notice
        tone="caution"
        tag="Shut"
        action={
          <Button
            variant="secondary"
            size="sm"
            disabled={settings.isPending}
            onClick={() => settings.mutate({ door_mode: "auto" })}
          >
            Open around the event
          </Button>
        }
      >
        The door is shut: every scan is refused, even a valid ticket.
      </Notice>
    );
  if (team.volunteers.length > 0 && onDuty === 0 && !linked)
    return (
      <Notice tone="caution" tag="Duty">
        Nobody can check guests in: no volunteer has Check-in switched on and
        no door has a gate link. Switch it on below for whoever will be at the
        door.
      </Notice>
    );
  if (team.volunteers.length === 0 && !linked)
    return (
      <Notice tone="neutral" tag="Staff">
        Nobody can scan yet. Add a volunteer, or make a gate link for a door
        and open it on a phone there.
      </Notice>
    );
  return null;
}

/** Who runs the door, which doors there are, and how the door behaves. */
export function TeamPage({ eventId }: { eventId: number }) {
  const team = useTeam(eventId);
  const summary = useEventSummary(eventId);
  const t = team.data;
  const open = t ? t.doors.filter((d) => d.active).length : 0;
  return (
    <div className="grid gap-5">
      <TabHead
        title="Doors"
        line={
          t
            ? `${plural(open, "door")} · ${plural(t.volunteers.length, "volunteer")} · the door is ${doorState(t, summary.data).value.toLowerCase()}`
            : "The places guests are admitted, the people and devices that admit them, and how the door behaves."
        }
        actions={
          <Link
            href={`/gate/${eventId}`}
            target="_blank"
            rel="noopener"
            className="btn btn-secondary"
          >
            <DoorOpenIcon /> Open the gate
          </Link>
        }
      />
      {team.isPending ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-[118px] rounded-2xl" />
            ))}
          </div>
          <div className="grid gap-3 lg:grid-cols-[1.6fr_1fr]">
            <Skeleton className="h-[320px] rounded-2xl" />
            <Skeleton className="h-[320px] rounded-2xl" />
          </div>
        </>
      ) : team.isError ? (
        <EmptyState
          tone="muted"
          title="Could not load the doors"
          description="Check the connection, then try again."
          action={
            <Button variant="secondary" onClick={() => void team.refetch()}>
              Try again
            </Button>
          }
        />
      ) : (
        <>
          <Ready eventId={eventId} team={team.data} s={summary.data} />
          <Attention eventId={eventId} team={team.data} />
          <div className="grid items-start gap-3 lg:grid-cols-[1.6fr_1fr]">
            <DoorsPanel eventId={eventId} doors={team.data.doors} />
            <DoorSettingsPanel
              eventId={eventId}
              settings={team.data.settings}
            />
          </div>
          <PeoplePanel eventId={eventId} team={team.data} />
          <KiosksPanel eventId={eventId} doors={team.data.doors} />
        </>
      )}
    </div>
  );
}
