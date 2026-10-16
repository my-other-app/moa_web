"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowDownIcon, ArrowUpIcon, CheckIcon, Loader2Icon, UsersIcon } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError, qk } from "@moa/api";
import { pickImage, plural } from "@moa/app-kit";
import {
  Button,
  CardLabel,
  Checkbox,
  EmptyState,
  FigurePanel,
  IconButton,
  InitialsAvatar,
  Skeleton,
  cn,
} from "@moa/ui";

import { useAccess } from "@/features/access";
import { useMyClub, type ClubTeamMember } from "@/features/club";

import { useOrganisers, useSaveOrganisers } from "../queries";
import {
  MAX_ORGANISERS,
  ROLE_MAX,
  draftFrom,
  moveItem,
  sameOrganisers,
  toOrganiserInput,
  type Organiser,
  type OrganiserDraft,
} from "../schemas";

/**
 * On the event page: which of the club's team the event's public page
 * lists as its organising team, in what order, and as what. Tick people,
 * give them a role for this event if it differs from their club role, put
 * them in order, save. Nobody ticked and the page shows the whole club team.
 */
const COLS = "sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,220px)_auto]";

function Avatar({ member }: { member: ClubTeamMember }) {
  const photo = pickImage(member.photo, ["thumbnail", "medium", "original", "large"]);
  return photo ? (
    <span className="border-line relative size-8 shrink-0 overflow-hidden rounded-full border">
      <Image src={photo} alt="" fill sizes="32px" className="object-cover" unoptimized />
    </span>
  ) : (
    <InitialsAvatar name={member.name} size={32} tone="muted" />
  );
}

function Row({
  member,
  on,
  role,
  position,
  count,
  canPick,
  readOnly,
  onToggle,
  onRole,
  onMove,
}: {
  member: ClubTeamMember;
  on: boolean;
  role: string;
  /** Where they sit among the picked, from 0; null when not picked. */
  position: number | null;
  count: number;
  canPick: boolean;
  readOnly: boolean;
  onToggle: (on: boolean) => void;
  onRole: (role: string) => void;
  onMove: (by: -1 | 1) => void;
}) {
  const id = React.useId();
  return (
    <li className={cn("border-line-soft grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border-t px-4 py-2.5", COLS)}>
      <Checkbox
        id={id}
        checked={on}
        disabled={readOnly || (!on && !canPick)}
        onCheckedChange={(v) => onToggle(v === true)}
        aria-label={`Show ${member.name} on the event page`}
      />
      <label htmlFor={id} className={cn("flex min-w-0 items-center gap-3", !readOnly && "cursor-pointer")}>
        <Avatar member={member} />
        <span className="min-w-0">
          <span className="text-ink block truncate text-[13.5px] font-medium">{member.name}</span>
          <span className="text-ink-3 block truncate text-[11.5px]">{member.role || "No club role"}</span>
        </span>
      </label>
      <span className="col-span-3 sm:col-span-1 sm:col-start-3 sm:row-start-1">
        <input
          aria-label={`${member.name}'s role at this event`}
          className="input input-sm w-full"
          value={role}
          onChange={(e) => onRole(e.target.value)}
          placeholder={member.role || "Role at this event"}
          maxLength={ROLE_MAX}
          disabled={readOnly || !on}
        />
      </span>
      <span className="col-start-3 row-start-1 flex items-center justify-end gap-1 sm:col-start-4">
        <span className="text-ink-3 w-5 text-right font-mono text-[11px] tabular-nums" title={position !== null ? `Number ${position + 1} on the page` : undefined}>
          {position !== null ? position + 1 : ""}
        </span>
        {readOnly ? null : (
          <>
            <IconButton label={`Move ${member.name} up`} size="xs" variant="quiet" disabled={position === null || position === 0} onClick={() => onMove(-1)}>
              <ArrowUpIcon />
            </IconButton>
            <IconButton label={`Move ${member.name} down`} size="xs" variant="quiet" disabled={position === null || position === count - 1} onClick={() => onMove(1)}>
              <ArrowDownIcon />
            </IconButton>
          </>
        )}
      </span>
    </li>
  );
}

function Editor({
  eventId,
  team,
  saved,
  readOnly,
}: {
  eventId: number;
  team: ClubTeamMember[];
  saved: Organiser[];
  readOnly: boolean;
}) {
  const save = useSaveOrganisers(eventId);
  const qc = useQueryClient();
  const teamIds = team.map((m) => m.id);
  const [base, setBase] = React.useState<OrganiserDraft>(() => draftFrom(saved, teamIds));
  const [draft, setDraft] = React.useState<OrganiserDraft>(base);
  const [error, setError] = React.useState<string | null>(null);

  const byId = new Map(team.map((m) => [m.id, m]));
  // Someone taken off the club team since is dropped: the server would refuse them.
  const pickedIds = draft.picked.filter((id) => byId.has(id));
  const current: OrganiserDraft = { picked: pickedIds, roles: draft.roles };
  const picked = pickedIds.map((id) => byId.get(id)!);
  const rest = team.filter((m) => !pickedIds.includes(m.id));
  const dirty = !sameOrganisers(current, base);
  const full = pickedIds.length >= MAX_ORGANISERS;

  const edit = (next: (d: OrganiserDraft) => OrganiserDraft) => {
    setError(null);
    setDraft((d) => next({ picked: d.picked.filter((id) => byId.has(id)), roles: d.roles }));
  };
  const toggle = (id: number, on: boolean) =>
    edit((d) => ({ ...d, picked: on ? (d.picked.includes(id) ? d.picked : [...d.picked, id]) : d.picked.filter((p) => p !== id) }));
  const setRole = (id: number, role: string) => edit((d) => ({ ...d, roles: { ...d.roles, [id]: role } }));
  const move = (index: number, by: -1 | 1) => edit((d) => ({ ...d, picked: moveItem(d.picked, index, index + by) }));

  const submit = () => {
    setError(null);
    save.mutate(toOrganiserInput(current), {
      onSuccess: () => setBase(current),
      onError: (e: Error) => {
        setError(e.message);
        // "Not in the club" means the list here is behind the club team; bring it up to date.
        if (e instanceof ApiError && e.status === 422) void qc.invalidateQueries({ queryKey: qk.clubs.self() });
      },
    });
  };

  const rowFor = (m: ClubTeamMember, position: number | null) => (
    <Row
      key={m.id}
      member={m}
      on={position !== null}
      role={draft.roles[m.id] ?? ""}
      position={position}
      count={picked.length}
      canPick={!full}
      readOnly={readOnly}
      onToggle={(on) => toggle(m.id, on)}
      onRole={(role) => setRole(m.id, role)}
      onMove={(by) => {
        if (position !== null) move(position, by);
      }}
    />
  );

  return (
    <>
      <ul aria-label="The club team">
        {picked.map((m, i) => rowFor(m, i))}
        {picked.length && rest.length ? (
          <li className="border-line-soft bg-sunken/60 border-t px-4 py-1.5" aria-hidden="true">
            <span className="eyebrow">Not on the event page</span>
          </li>
        ) : null}
        {rest.map((m) => rowFor(m, null))}
      </ul>
      {error ? (
        <p role="alert" className="text-refuse border-line-soft border-t px-4 pt-3 text-[12.5px]">
          {error}
        </p>
      ) : null}
      <div className="border-line-soft flex flex-wrap items-center gap-3 border-t px-4 py-3">
        <span className="text-ink-3 text-[12px]">
          {pickedIds.length
            ? `The event page lists ${pickedIds.length} of ${plural(team.length, "person", "people")}, in this order.${full ? ` That is the most it shows.` : ""}`
            : `Nobody ticked: the event page shows the whole club team (${plural(team.length, "person", "people")}).`}
        </span>
        <span className="flex-1" />
        {readOnly ? (
          <span className="text-ink-3 text-[12px]">Your role can see this, not change it.</span>
        ) : (
          <>
            {pickedIds.length ? (
              <Button variant="ghost" size="sm" onClick={() => edit((d) => ({ ...d, picked: [] }))} disabled={save.isPending}>
                Untick everyone
              </Button>
            ) : null}
            {dirty ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setError(null);
                  setDraft(base);
                }}
                disabled={save.isPending}
              >
                Discard
              </Button>
            ) : null}
            <Button size="sm" onClick={submit} disabled={!dirty || save.isPending}>
              {save.isPending ? <Loader2Icon className="animate-spin" /> : <CheckIcon />}
              {save.isPending ? "Saving…" : dirty ? "Save" : "Saved"}
            </Button>
          </>
        )}
      </div>
    </>
  );
}

/** Which of the club's team the event's public page lists, in what order, and as what. */
export function OrganisersPanel({ eventId }: { eventId: number }) {
  const club = useMyClub();
  const saved = useOrganisers(eventId);
  const { can } = useAccess();
  const team = club.data?.team ?? [];
  // A new server answer (a save, or someone else's) starts the editor over from it.
  const savedKey = saved.data ? saved.data.map((o) => `${o.member_id}:${o.role ?? ""}`).join("|") : "";

  return (
    <FigurePanel className="overflow-hidden p-0">
      <div className="px-4 pt-4 pb-3">
        <CardLabel
          right={
            saved.data && club.data && team.length ? (
              <span className="text-ink-3 text-[11px]">
                {saved.data.length ? `${plural(saved.data.length, "organiser")} listed` : "whole club team"}
              </span>
            ) : null
          }
        >
          On the event page
        </CardLabel>
        <p className="text-ink-3 mt-1 max-w-[72ch] text-[12px] leading-[1.5]">
          Who the event&apos;s public page lists as its organising team, and in what order. With nobody ticked, it shows the club&apos;s whole team.
        </p>
      </div>
      {club.isPending || saved.isPending ? (
        <div className="border-line-soft grid gap-2 border-t px-4 py-3" aria-busy="true">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-10 rounded-xl" />
          ))}
        </div>
      ) : club.isError || saved.isError ? (
        <EmptyState
          size="sm"
          tone="muted"
          title="Could not load the organising team"
          description={(saved.error ?? club.error)?.message || "Check the connection, then try again."}
          action={
            <Button
              variant="secondary"
              onClick={() => {
                if (club.isError) void club.refetch();
                if (saved.isError) void saved.refetch();
              }}
            >
              Try again
            </Button>
          }
        />
      ) : team.length === 0 ? (
        <EmptyState
          size="sm"
          icon={<UsersIcon />}
          title="Your club has no team yet"
          description="Add the people who run the club on the club profile, then pick who runs this event here."
          action={
            <Link href="/profile#team" className="btn btn-secondary btn-sm">
              Add the team
            </Link>
          }
        />
      ) : (
        <Editor key={savedKey} eventId={eventId} team={team} saved={saved.data} readOnly={!can.edit_events} />
      )}
    </FigurePanel>
  );
}
