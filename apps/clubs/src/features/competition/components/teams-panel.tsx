"use client";

import * as React from "react";
import { PlusIcon, Trash2Icon, XIcon } from "lucide-react";
import { formatNumber } from "@moa/app-kit";
import { Combobox, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, EmptyState, FigurePanel, IconButton, InitialsAvatar, NativeSelect, Notice, StatusBadge, Switch, cn } from "@moa/ui";

import { useRegistrations } from "@/features/registrations";

import { useAddMember, useCreateTeam, useDeleteTeam, usePatchSettings, usePatchTeam, useRemoveMember } from "../queries";
import { STAGE_LABEL, type Competition, type Team } from "../schemas";

/**
 * The teams: who is on which, on which track, with room for how many.
 * Attendees make and join teams from their ticket; here the organiser
 * rearranges — moves a person, changes a track, dissolves a team — and
 * puts the ones looking for a team onto one. Lock teams and the tickets
 * go read-only while this stays live.
 */
const STAGE_TONE = { entered: "default", shortlisted: "info", finalist: "success" } as const;

function TeamCard({ eventId, c, team }: { eventId: number; c: Competition; team: Team }) {
  const patch = usePatchTeam(eventId);
  const remove = useDeleteTeam(eventId);
  const drop = useRemoveMember(eventId);
  const add = useAddMember(eventId);
  const [name, setName] = React.useState(team.name);
  const [confirm, setConfirm] = React.useState(false);
  const [picking, setPicking] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const regs = useRegistrations({ eventId, search: search || undefined, offset: 0, limit: 20 });
  const onTeams = new Set(c.teams.flatMap((t) => t.members.map((m) => m.registration_id)));
  const candidates = (regs.data?.items ?? []).filter((r) => !onTeams.has(r.id)).map((r) => ({ value: r.id, label: r.full_name ?? r.name ?? "Guest", hint: r.email ?? undefined }));
  const full = team.open_spots === 0;
  return (
    <FigurePanel className="flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <input aria-label={`${team.name} name`} className="input flex-1 text-[14px] font-semibold" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name !== team.name && patch.mutate({ id: team.id, body: { name: name.trim() } })} maxLength={80} />
        <StatusBadge tone={full ? "default" : "success"} label={full ? "Full" : `Open · ${team.open_spots} ${team.open_spots === 1 ? "spot" : "spots"}`} />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {team.stage !== "entered" ? <StatusBadge tone={STAGE_TONE[team.stage]} label={STAGE_LABEL[team.stage]} /> : null}
        {team.submission.status === "complete" ? <StatusBadge tone="success" label="Submitted" /> : team.submission.status === "in_progress" ? <StatusBadge tone="warning" label="Submitting" /> : null}
        {team.score !== null ? <span className="text-ink-3 font-mono text-[11px]">{team.score} / 100</span> : null}
      </div>
      <ul className="grid gap-1.5">
        {team.members.map((m) => (
          <li key={m.registration_id} className="flex items-center gap-2 text-[13px]">
            <InitialsAvatar name={m.name} size={24} tone="muted" />
            <span className="text-ink min-w-0 flex-1 truncate">{m.name}</span>
            <IconButton label={`Take ${m.name} off ${team.name}`} variant="quiet" size="xs" onClick={() => drop.mutate({ teamId: team.id, registrationId: m.registration_id })}>
              <XIcon />
            </IconButton>
          </li>
        ))}
        {team.members.length === 0 ? <li className="text-ink-3 text-[12.5px]">Nobody on it yet.</li> : null}
      </ul>
      {picking ? (
        <div className="grid gap-1.5">
          <input className="input input-sm" placeholder="Type a name or email" aria-label={`Find a guest for ${team.name}`} value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
          <ul className="grid max-h-40 gap-0.5 overflow-y-auto">
            {candidates.length === 0 ? <li className="text-ink-3 px-1 py-1 text-[12px]">{regs.isPending ? "Looking…" : "Nobody free matches."}</li> : null}
            {candidates.map((r) => (
              <li key={r.value}>
                <button type="button" className="hover:bg-sunken flex w-full items-center justify-between rounded-md px-2 py-1 text-left text-[12.5px]" onClick={() => { add.mutate({ teamId: team.id, registrationId: r.value }); setPicking(false); setSearch(""); }}>
                  <span className="truncate">{r.label}</span>
                  <span className="text-ink-3 truncate text-[11px]">{r.hint}</span>
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="btn btn-ghost btn-xs self-start" onClick={() => setPicking(false)}>
            Cancel
          </button>
        </div>
      ) : !full ? (
        <button type="button" className="btn btn-secondary btn-sm self-start" onClick={() => setPicking(true)}>
          <PlusIcon /> Add a person
        </button>
      ) : null}
      <NativeSelect aria-label={`${team.name} track`} size="sm" value={team.track_id ?? ""} onChange={(e) => patch.mutate({ id: team.id, body: { track_id: e.target.value ? Number(e.target.value) : null } })}>
        <option value="">No track</option>
        {c.tracks.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </NativeSelect>
      <div className="flex items-center justify-end">
        {confirm ? (
          <button type="button" className="btn btn-secondary btn-xs btn-round btn-danger" onClick={() => remove.mutate(team.id)}>
            Dissolve team?
          </button>
        ) : (
          <IconButton label={`Dissolve ${team.name}`} variant="quiet" size="xs" danger onClick={() => setConfirm(true)}>
            <Trash2Icon />
          </IconButton>
        )}
      </div>
    </FigurePanel>
  );
}

function NewTeamDialog({ eventId, c, open, onOpenChange }: { eventId: number; c: Competition; open: boolean; onOpenChange: (o: boolean) => void }) {
  const create = useCreateTeam(eventId);
  const [name, setName] = React.useState("");
  const [track, setTrack] = React.useState<number | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await create.mutateAsync({ name: name.trim(), track_id: track });
    setName("");
    setTrack(null);
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>New team</DialogTitle>
            <DialogDescription>A team made by hand. Add people to it from its card, or let them join it from their ticket.</DialogDescription>
          </DialogHeader>
          <div>
            <label htmlFor="team-name" className="eyebrow mb-1.5 block">
              Team name
            </label>
            <input id="team-name" className="input w-full" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoFocus />
          </div>
          <div>
            <label htmlFor="team-track" className="eyebrow mb-1.5 block">
              Track
            </label>
            <Combobox id="team-track" label="Track" value={track} options={c.tracks.map((t) => ({ value: t.id, label: t.name }))} onChange={setTrack} placeholder="No track yet" />
          </div>
          <DialogFooter>
            <button type="button" className="btn btn-ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={create.isPending || !name.trim()}>
              Make the team
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function TeamsPanel({ eventId, c }: { eventId: number; c: Competition }) {
  const settings = usePatchSettings(eventId);
  const add = useAddMember(eventId);
  const [open, setOpen] = React.useState(false);
  const [picks, setPicks] = React.useState<Record<string, string>>({});
  const openTeams = c.teams.filter((t) => t.open_spots > 0);
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-ink text-[17px] font-semibold tracking-[-0.01em]">
            {c.figures.teams} {c.figures.teams === 1 ? "team" : "teams"} · {formatNumber(c.figures.people)} people
          </h2>
          <p className="text-ink-3 text-[12.5px]">
            Team size {c.settings.team_min}–{c.settings.team_max}. Attendees make or join teams from their ticket; you can rearrange here.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-[13px]">
            <Switch checked={c.settings.teams_locked} onCheckedChange={(on) => settings.mutate({ teams_locked: on })} aria-label="Lock teams" />
            <span className="text-ink-2">Lock teams</span>
          </label>
          <label className="flex items-center gap-1.5 text-[12.5px]">
            <span className="text-ink-3">Max</span>
            <NativeSelect aria-label="Largest team" size="sm" className="w-16" value={c.settings.team_max} onChange={(e) => settings.mutate({ team_max: Number(e.target.value) })}>
              {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </NativeSelect>
          </label>
          <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
            <PlusIcon /> New team
          </button>
        </div>
      </div>
      {c.settings.teams_locked ? (
        <Notice tone="caution" tag="Locked">
          Teams are locked: nobody joins, leaves or makes one from a ticket. You can still move people here.
        </Notice>
      ) : null}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,2.4fr)_minmax(0,1fr)]">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {c.teams.length === 0 ? (
            <div className="md:col-span-2 xl:col-span-3">
              <EmptyState title="No teams yet" description={c.settings.enabled ? "Teams form from tickets once the competition is on, or make one here." : "Turn the competition on and attendees can form teams from their ticket."} />
            </div>
          ) : (
            c.teams.map((t) => <TeamCard key={t.id} eventId={eventId} c={c} team={t} />)
          )}
        </div>
        <FigurePanel className="p-4">
          <h3 className="text-ink text-[15px] font-semibold">Looking for a team</h3>
          <p className="text-ink-3 text-[12px]">Solo attendees who ticked &ldquo;find me teammates&rdquo;.</p>
          {c.seekers.length === 0 ? (
            <p className="text-ink-3 mt-4 text-[12.5px]">Nobody right now.</p>
          ) : (
            <ul className="mt-3 grid gap-3">
              {c.seekers.map((s) => (
                <li key={s.registration_id} className="border-line-soft rounded-xl border p-3">
                  <p className="text-ink text-[13px] font-medium">{s.name}</p>
                  {s.skills.length ? (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {s.skills.map((k) => (
                        <span key={k} className="tag tag-neutral">
                          {k}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {s.note ? <p className="text-ink-3 mt-1 text-[12px]">{s.note}</p> : null}
                  <div className="mt-2 flex gap-1.5">
                    <NativeSelect aria-label={`A team for ${s.name}`} size="sm" className={cn("flex-1")} value={picks[s.registration_id] ?? ""} onChange={(e) => setPicks((p) => ({ ...p, [s.registration_id]: e.target.value }))}>
                      <option value="">Pick a team</option>
                      {openTeams.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({t.members.length}/{c.settings.team_max})
                        </option>
                      ))}
                    </NativeSelect>
                    <button type="button" className="btn btn-secondary btn-sm" disabled={!picks[s.registration_id] || add.isPending} onClick={() => add.mutate({ teamId: Number(picks[s.registration_id]), registrationId: s.registration_id })}>
                      Add
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </FigurePanel>
      </div>
      <NewTeamDialog eventId={eventId} c={c} open={open} onOpenChange={setOpen} />
    </div>
  );
}
