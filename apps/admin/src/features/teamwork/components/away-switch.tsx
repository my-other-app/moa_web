"use client";

import * as React from "react";
import { formatDate } from "@moa/app-kit";
import { Input, Label, Switch } from "@moa/ui";

import { useSetAway, useTeamRights, useTeams } from "../queries";

/**
 * "I'm away": new cases skip the person (round robin and named rules alike)
 * until the date, or until they switch it off. Shown to team members only.
 */
export function AwaySwitch() {
  const rights = useTeamRights();
  const teams = useTeams();
  const setAway = useSetAway();
  const id = React.useId();
  const me = teams.data?.flatMap((t) => t.members).find((m) => m.user_id === rights.meId);
  const [until, setUntil] = React.useState("");
  if (!me) return null;
  return (
    <div className="border-line-soft bg-surface flex flex-wrap items-center gap-3 rounded-xl border px-3.5 py-3">
      <Switch id={id} checked={me.away} disabled={setAway.isPending} onCheckedChange={(on) => setAway.mutate({ away: on, until: on && until ? until : null })} />
      <Label htmlFor={id} className="flex-1">
        {me.away ? `You're away${me.away_until ? ` until ${formatDate(me.away_until)}` : ""}: new cases skip you` : "I'm away"}
      </Label>
      {!me.away ? (
        <div className="flex items-center gap-2">
          <Label htmlFor={`${id}-until`} className="text-ink-3 text-[12px]">
            Until (optional)
          </Label>
          <Input id={`${id}-until`} type="date" className="w-[160px]" value={until} onChange={(e) => setUntil(e.target.value)} />
        </div>
      ) : null}
    </div>
  );
}
