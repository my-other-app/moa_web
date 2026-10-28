"use client";

import * as React from "react";
import Link from "next/link";
import { HandshakeIcon } from "lucide-react";
import { formatDateTime } from "@moa/app-kit";
import { CardLabel, FigurePanel } from "@moa/ui";

import { useInvitations } from "../queries";
import { expiresText, splitInvitations } from "../schemas";
import { ClubLogo } from "./club-marks";

/** How many invitations the card names before "and N more". */
const SHOWN = 3;

/**
 * On the dashboard's home, while another club waits for an answer: who asked,
 * for which event, and the one place to answer. Nothing at all otherwise, and
 * nothing on a server without co-hosts.
 */
export function InvitationsCard() {
  const q = useInvitations("pending");
  const [now] = React.useState(() => new Date());
  const data = q.data;
  if (!data || data.pending <= 0) return null;
  const { pending } = splitInvitations(data.items);
  const shown = pending.slice(0, SHOWN);
  const more = Math.max(0, data.pending - shown.length);
  return (
    <FigurePanel className="border-brand-line p-0 ring-0 border" aria-label="Co-host invitations" role="region">
      <div className="border-line-soft flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <CardLabel>
          <span className="inline-flex items-center gap-1.5">
            <HandshakeIcon aria-hidden="true" className="text-brand size-3.5" />
            {data.pending === 1 ? "A club invited you to co-host" : `${data.pending} clubs invited you to co-host`}
          </span>
        </CardLabel>
        <Link href="/invitations" className="btn btn-primary btn-sm">
          Review {data.pending === 1 ? "invitation" : "invitations"}
        </Link>
      </div>
      <ul className="divide-line-soft divide-y">
        {shown.map((i) => (
          <li key={i.id} className="flex items-center gap-3 px-4 py-2.5">
            <ClubLogo club={i.host} size={30} />
            <div className="min-w-0 flex-1">
              <div className="text-ink truncate text-[13px]">
                <span className="font-semibold">{i.host.name}</span> · {i.event.name}
              </div>
              <div className="text-ink-3 truncate text-[11.5px]">
                {i.event.event_datetime ? formatDateTime(i.event.event_datetime) : "Date to be set"}
                {i.expires_at ? ` · ${expiresText(i.expires_at, now)}` : ""}
              </div>
            </div>
          </li>
        ))}
      </ul>
      {more > 0 ? <p className="text-ink-3 border-line-soft m-0 border-t px-4 py-2.5 text-[11.5px]">and {more} more on the Invitations page.</p> : null}
    </FigurePanel>
  );
}
