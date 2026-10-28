"use client";

import Link from "next/link";
import {
  COHOST_STATUS_LABEL,
  COHOST_STATUS_TONE,
  LogoTile,
  SectionTitle,
  formatDateTime,
  hostedByText,
  isLiveCohost,
  logoSizes,
  pickImage,
  type CohostInvite,
  type CohostListing,
  type CohostStatus,
  type CohostRef,
} from "@moa/app-kit";
import { Badge, Card, CardContent, StatusBadge } from "@moa/ui";

import { useEventCohosts } from "../queries";

function Club({ club, size = 36 }: { club: CohostRef; size?: number }) {
  return (
    <span aria-hidden="true" className="inline-grid shrink-0" style={{ width: size, height: size }}>
      <LogoTile src={pickImage(club.logo, logoSizes(size))} name={club.name} className="size-full rounded-lg text-xs" />
    </span>
  );
}

/** What happened after the invite, as the line says it. */
const SINCE: Record<CohostStatus, string> = {
  invited: "expires",
  accepted: "accepted",
  declined: "declined",
  left: "left",
  removed: "removed",
  cancelled: "cancelled",
  expired: "expired",
};

/** What happened to an invite, and when: "Invited 29 Oct 2026, 10:00 by Asha (admin) · accepted 30 Oct 2026, 09:12". */
export function inviteLine(i: CohostInvite): string {
  const parts: string[] = [];
  if (i.invited_at) parts.push(`Invited ${formatDateTime(i.invited_at)}${i.invited_by ? ` by ${i.invited_by}` : ""}`);
  const when = i.status === "invited" ? i.expires_at : (i.ended_at ?? i.responded_at);
  if (when) parts.push(`${SINCE[i.status]} ${formatDateTime(when)}`);
  return parts.join(" · ");
}

function Row({ invite }: { invite: CohostInvite }) {
  return (
    <li className="flex items-start gap-3 py-3 first:pt-0 last:pb-0" data-testid={`admin-cohost-${invite.id}`}>
      <Club club={invite.club} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/clubs/${invite.club.club_id}`} className="truncate text-sm font-medium hover:underline">
            {invite.club.name}
          </Link>
          <StatusBadge tone={COHOST_STATUS_TONE[invite.status]} label={COHOST_STATUS_LABEL[invite.status]} />
        </div>
        <p className="text-muted-foreground text-xs">
          {invite.club.slug ? `@${invite.club.slug} · ` : ""}
          {inviteLine(invite)}
        </p>
        {invite.note ? <p className="text-muted-foreground mt-1 border-l-2 pl-2 text-xs italic">“{invite.note}”</p> : null}
      </div>
    </li>
  );
}

/** The listing as the card shows it: the live invites (co-hosting, then invited), then the rest. */
export function cohostCardRows(l: CohostListing): { cohosts: CohostRef[]; rows: CohostInvite[] } {
  const live = l.items.filter((i) => isLiveCohost(i.status));
  live.sort((a, b) => (a.status === b.status ? 0 : a.status === "accepted" ? -1 : 1));
  return {
    cohosts: l.items.filter((i) => i.status === "accepted").map((i) => i.club),
    rows: [...live, ...l.items.filter((i) => !isLiveCohost(i.status))],
  };
}

/**
 * The event's host and the clubs invited to co-host it, in every status
 * (contract §11): who co-hosts, who was asked and when, who declined, left
 * or was removed. Read-only. Nothing when no club was ever invited, and
 * nothing on a server without co-hosts (the route 404s).
 */
export function EventCohostsCard({ eventId }: { eventId: number }) {
  const q = useEventCohosts(eventId);
  const l = q.data;
  if (!l || l.items.length === 0) return null;
  const { cohosts, rows } = cohostCardRows(l);
  return (
    <section className="space-y-3" aria-label="Host and co-hosts">
      <SectionTitle>Host &amp; co-hosts</SectionTitle>
      <Card>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Club club={l.host} size={40} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/clubs/${l.host.club_id}`} className="truncate text-sm font-semibold hover:underline">
                  {l.host.name}
                </Link>
                <Badge variant="secondary">Host</Badge>
              </div>
              <p className="text-muted-foreground text-xs">
                {hostedByText(l.host, cohosts)} · {l.slots_left} of {l.limit} places left
              </p>
            </div>
          </div>
          <ul className="divide-y border-t pt-3" aria-label="Invited clubs">
            {rows.map((i) => (
              <Row key={i.id} invite={i} />
            ))}
          </ul>
        </CardContent>
      </Card>
    </section>
  );
}
