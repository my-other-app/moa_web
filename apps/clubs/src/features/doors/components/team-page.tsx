"use client";

import * as React from "react";
import Link from "next/link";
import QRCode from "qrcode";
import { CopyIcon, DoorOpenIcon, LinkIcon, PlusIcon, ScanLineIcon, Trash2Icon } from "lucide-react";
import { PageHeader, formatDateTime } from "@moa/app-kit";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Skeleton,
  StatusBadge,
  Switch,
  cn,
  toast,
} from "@moa/ui";
import { pressable } from "@moa/ui/motion";

import { useEventDetail } from "@/features/events";
import { KiosksPanel } from "@/features/kiosk";
import { VolunteersPanel } from "@/features/volunteers";

import { useCreateDoor, useDeleteDoor, useIssueGateLink, useRevokeGateLink, useTeam, useUpdateDoor, useUpdateGateSettings, useUpdateTeamVolunteer } from "../queries";
import { DOOR_KINDS, DOOR_KIND_META, type Door, type DoorKind, type GateLink, type GateSettings, type Team, type TeamVolunteer } from "../schemas";

const panel = "rounded-2xl bg-card ring-1 ring-border/70 shadow-sm";
const heading = "font-mono text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted-foreground";
const note = "text-[12px] leading-[1.5] text-muted-foreground";
const control = "h-9 rounded-md border bg-muted/40 px-2.5 text-[13px]";

function LinkDialog({ link, door, onClose }: { link: GateLink | null; door: Door | null; onClose: () => void }) {
  const [png, setPng] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!link) return;
    let alive = true;
    QRCode.toDataURL(link.url, { margin: 1, width: 240 })
      .then((data) => alive && setPng(data))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [link]);
  return (
    <Dialog open={link !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Gate link for {door?.name}</DialogTitle>
          <DialogDescription>
            Shown once. A phone that opens it runs the console on {door?.name} with no account{link?.can_walkup ? ", and may register walk-ups" : ""}.
            {link?.expires_at ? ` It stops working ${formatDateTime(link.expires_at)}.` : ""} Making a new link switches this one off.
          </DialogDescription>
        </DialogHeader>
        {/* A data URL made on the client; next/image has nothing to optimise here. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {png ? <img src={png} alt="QR code for the gate link" className="mx-auto size-60 rounded-md bg-white p-2" /> : null}
        <div className="flex gap-1.5">
          <input readOnly value={link?.url ?? ""} className={cn(control, "min-w-0 flex-1 font-mono text-[11px]")} onFocus={(e) => e.currentTarget.select()} />
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (!link) return;
              void navigator.clipboard?.writeText(link.url).then(() => toast.success("Link copied"));
            }}
          >
            <CopyIcon /> Copy
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DoorRow({ eventId, door, onLink }: { eventId: number; door: Door; onLink: (l: GateLink, d: Door) => void }) {
  const update = useUpdateDoor(eventId);
  const remove = useDeleteDoor(eventId);
  const issue = useIssueGateLink(eventId);
  const revoke = useRevokeGateLink(eventId);
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(door.name);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [walkup, setWalkup] = React.useState(door.link?.can_walkup ?? false);
  const rename = () => {
    setEditing(false);
    const next = draft.trim();
    if (!next || next === door.name) return;
    update.mutate({ doorId: door.id, name: next }, { onSuccess: () => toast.success(`Renamed to ${next}`) });
  };
  return (
    <div className={cn("border-t border-border/60 px-4 py-3", !door.active && "opacity-60")}>
      <div className="flex flex-wrap items-center gap-2">
        {editing ? (
          <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={rename} onKeyDown={(e) => (e.key === "Enter" ? rename() : e.key === "Escape" ? setEditing(false) : undefined)} aria-label={`Rename ${door.name}`} className={cn(control, "h-8 max-w-[220px]")} />
        ) : (
          <button type="button" onClick={() => (setEditing(true), setDraft(door.name))} className="text-left text-[14px] font-medium" title="Rename">
            {door.name}
          </button>
        )}
        <select aria-label="Kind" value={door.kind} onChange={(e) => update.mutate({ doorId: door.id, kind: e.target.value as DoorKind })} className={cn(control, "h-8 text-[12px]")}>
          {DOOR_KINDS.map((k) => (
            <option key={k} value={k}>
              {DOOR_KIND_META[k].label}
            </option>
          ))}
        </select>
        {!door.active ? <StatusBadge tone="default" label="Retired" /> : null}
        <span className="flex-1" />
        <span className="font-mono text-[11px] text-muted-foreground tabular-nums">{door.check_ins} admitted</span>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
        <span>
          <span className="font-mono text-[10px] uppercase tracking-[0.08em]">Team </span>
          {door.volunteers.length ? door.volunteers.map((v) => v.name).join(", ") : "nobody assigned"}
        </span>
        <span>
          <span className="font-mono text-[10px] uppercase tracking-[0.08em]">Gate link </span>
          {door.link ? (door.link.expired ? "expired" : `active (…${door.link.prefix})${door.link.can_walkup ? ", walk-ups allowed" : ""}`) : "none"}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
          <input type="checkbox" checked={walkup} onChange={(e) => setWalkup(e.target.checked)} className="size-3.5 accent-primary" /> link may register walk-ups
        </label>
        <Button type="button" size="xs" variant="outline" disabled={issue.isPending} onClick={() => issue.mutate({ doorId: door.id, can_walkup: walkup }, { onSuccess: (l) => onLink(l, door) })}>
          <LinkIcon /> {door.link ? "New gate link" : "Make gate link"}
        </Button>
        {door.link ? (
          <Button type="button" size="xs" variant="ghost" disabled={revoke.isPending} onClick={() => revoke.mutate(door.id)}>
            Switch link off
          </Button>
        ) : null}
        <span className="flex-1" />
        <Button type="button" size="xs" variant="ghost" onClick={() => update.mutate({ doorId: door.id, active: !door.active })}>
          {door.active ? "Retire" : "Reopen"}
        </Button>
        {door.check_ins === 0 ? (
          <Button type="button" size="xs" variant="ghost" className="text-destructive" onClick={() => setConfirmDelete(true)} aria-label={`Delete ${door.name}`}>
            <Trash2Icon />
          </Button>
        ) : null}
      </div>
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {door.name}?</AlertDialogTitle>
            <AlertDialogDescription>Nobody was admitted here, so nothing is lost. Volunteers assigned to it are unassigned.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={(e) => (e.preventDefault(), remove.mutate(door.id, { onSuccess: () => setConfirmDelete(false) }))}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function DoorsPanel({ eventId, doors }: { eventId: number; doors: Door[] }) {
  const create = useCreateDoor(eventId);
  const [name, setName] = React.useState("");
  const [kind, setKind] = React.useState<DoorKind>("door");
  const [link, setLink] = React.useState<{ link: GateLink; door: Door } | null>(null);
  const open = doors.filter((d) => d.active);
  const retired = doors.filter((d) => !d.active);
  return (
    <section className={cn(panel, "overflow-hidden")}>
      <div className="bg-muted/40 px-4 py-3">
        <p className={heading}>Doors</p>
        <p className={note}>Every place people are admitted. Volunteers pick one on the console; each scan is attributed to it, so the check-in log shows who came through where. A gate link opens the console on a phone with no account.</p>
      </div>
      {!doors.length ? <p className="px-4 py-4 text-[12.5px] text-muted-foreground">No doors yet. The first scan makes one from whatever the volunteer typed; or name them here first.</p> : null}
      {[...open, ...retired].map((d) => (
        <DoorRow key={d.id} eventId={eventId} door={d} onLink={(l, door) => setLink({ link: l, door })} />
      ))}
      <form
        className="flex flex-wrap items-end gap-2 border-t border-border/60 px-4 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          create.mutate({ name: name.trim(), kind }, { onSuccess: () => setName("") });
        }}
      >
        <div className="min-w-0 flex-1">
          <label htmlFor="door-name" className="mb-1 block font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
            Add a door
          </label>
          <input id="door-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Gate A, Loading bay, Front desk" className={cn(control, "w-full")} />
        </div>
        <div>
          <label htmlFor="door-kind" className="mb-1 block font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
            Kind
          </label>
          <select id="door-kind" value={kind} onChange={(e) => setKind(e.target.value as DoorKind)} className={control}>
            {DOOR_KINDS.map((k) => (
              <option key={k} value={k}>
                {DOOR_KIND_META[k].label}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" variant="outline" disabled={!name.trim() || create.isPending}>
          <PlusIcon /> Add
        </Button>
        <p className={cn(note, "basis-full")}>{DOOR_KIND_META[kind].note}</p>
      </form>
      <LinkDialog key={link?.link.key ?? "none"} link={link?.link ?? null} door={link?.door ?? null} onClose={() => setLink(null)} />
    </section>
  );
}

const SWITCHES: { key: "can_check_in" | "can_walkup" | "can_merch"; label: string }[] = [
  { key: "can_check_in", label: "Check-in" },
  { key: "can_walkup", label: "Walk-up" },
  { key: "can_merch", label: "Hands out merch" },
];

function DutiesPanel({ eventId, team }: { eventId: number; team: Team }) {
  const update = useUpdateTeamVolunteer(eventId);
  const doors = team.doors.filter((d) => d.active);
  const row = (v: TeamVolunteer) => (
    <tr key={v.id} className="border-t border-border/60">
      <td className="px-4 py-2.5">
        <div className="text-[13.5px] font-medium">{v.name ?? v.email}</div>
        <div className="font-mono text-[10.5px] text-muted-foreground">
          {v.email}
          {v.scope === "club" ? " · every event of the club" : ""}
          {!v.is_approved ? " · not yet approved" : ""}
        </div>
      </td>
      {SWITCHES.map((s) => (
        <td key={s.key} className="px-4 py-2.5">
          <Switch checked={v[s.key]} aria-label={`${s.label} for ${v.name ?? v.email}`} onCheckedChange={(on) => update.mutate({ volunteerId: v.id, [s.key]: on })} />
        </td>
      ))}
      <td className="px-4 py-2.5">
        <select aria-label={`Door for ${v.name ?? v.email}`} value={v.door_id ?? ""} onChange={(e) => update.mutate({ volunteerId: v.id, ...(e.target.value ? { door_id: e.target.value } : { clear_door: true }) })} className={cn(control, "h-8 text-[12px]")}>
          <option value="">Any door</option>
          {doors.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </td>
      <td className="px-4 py-2.5 text-right font-mono text-[11px] text-muted-foreground tabular-nums">{v.check_ins}</td>
    </tr>
  );
  return (
    <section className={cn(panel, "overflow-hidden")}>
      <div className="bg-muted/40 px-4 py-3">
        <p className={heading}>Door duties</p>
        <p className={note}>What each volunteer may do on the console, and the door they are expected on. Switches off, they can still sign in but the console shows them nothing. The club account always has everything.</p>
      </div>
      {team.volunteers.length ? (
        <table className="w-full text-sm">
          <thead className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Volunteer</th>
              {SWITCHES.map((s) => (
                <th key={s.key} className="px-4 py-2 text-left font-medium">
                  {s.label}
                </th>
              ))}
              <th className="px-4 py-2 text-left font-medium">Expected at</th>
              <th className="px-4 py-2 text-right font-medium">Admitted</th>
            </tr>
          </thead>
          <tbody>{team.volunteers.map(row)}</tbody>
        </table>
      ) : (
        <p className="px-4 py-4 text-[12.5px] text-muted-foreground">No volunteers yet. Add them below; they sign into the app or the gate with that email.</p>
      )}
    </section>
  );
}

const MODES: { value: GateSettings["door_mode"]; label: string; note: string }[] = [
  { value: "open", label: "Open", note: "Anyone with a valid ticket is admitted, any time." },
  { value: "auto", label: "Around the event", note: "Opens a day before the start and closes after the end." },
  { value: "closed", label: "Closed", note: "Nobody is admitted. For before the doors open, or after." },
];

function SettingsPanel({ eventId, settings }: { eventId: number; settings: GateSettings }) {
  const update = useUpdateGateSettings(eventId);
  const [minutes, setMinutes] = React.useState(settings.close_after_minutes);
  return (
    <section className={cn(panel, "space-y-3 p-4")}>
      <div>
        <p className={heading}>The door</p>
        <p className={note}>How the gate behaves. Changes apply to the next scan.</p>
      </div>
      <div className="grid gap-2 md:grid-cols-3" role="radiogroup" aria-label="Door mode">
        {MODES.map((m) => (
          <button key={m.value} type="button" role="radio" aria-checked={settings.door_mode === m.value} onClick={() => update.mutate({ door_mode: m.value })} className={cn("rounded-md border px-3 py-2.5 text-left", settings.door_mode === m.value ? "border-primary bg-primary/10" : "hover:bg-muted")}>
            <span className={cn("block text-sm font-medium", settings.door_mode === m.value && "text-primary")}>{m.label}</span>
            <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{m.note}</span>
          </button>
        ))}
      </div>
      {settings.door_mode === "auto" ? (
        <label className="flex items-center gap-2 text-[13px]">
          Closes
          <input type="number" min={0} max={10080} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} onBlur={() => minutes !== settings.close_after_minutes && update.mutate({ close_after_minutes: minutes })} className={cn(control, "w-24 tabular-nums")} />
          minutes after the end
        </label>
      ) : null}
      <div className="grid gap-2 md:grid-cols-3">
        {(
          [
            ["spot_registration_checks_in", "A desk registration is admitted by the same stroke", "Off: the organiser registers them, and they are checked in when they reach a door."],
            ["capture_contact_at_gate", "Ask for a mobile number at the door", "After a check-in with no number on record. Skipping is one tap."],
            ["require_contact_at_gate", "The number is required", "The sheet says so; the check-in is still recorded either way."],
          ] as const
        ).map(([key, label, hint]) => (
          <label key={key} className="flex cursor-pointer items-start gap-2.5 rounded-md border px-2.5 py-2 hover:bg-muted/40">
            <input type="checkbox" checked={settings[key]} onChange={(e) => update.mutate({ [key]: e.target.checked })} className="mt-0.5 size-4 accent-primary" />
            <span>
              <span className="block text-[13px]">{label}</span>
              <span className={note}>{hint}</span>
            </span>
          </label>
        ))}
      </div>
    </section>
  );
}

/** Who runs the door, which doors there are, and how the door behaves. */
export function TeamPage({ eventId }: { eventId: number }) {
  const event = useEventDetail(eventId);
  const team = useTeam(eventId);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Team & doors"
        description="The people and places that admit guests. Every scan is recorded with its door and who made it."
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild className={pressable}>
              <Link href={`/events/${eventId}/check-ins`}>
                <ScanLineIcon /> Check-in log
              </Link>
            </Button>
            <Button asChild className={pressable}>
              <Link href={`/gate/${eventId}`} target="_blank" rel="noopener">
                <DoorOpenIcon /> Open the gate
              </Link>
            </Button>
          </div>
        }
      />
      {team.isPending ? (
        <Skeleton className="h-96 w-full" />
      ) : team.isError ? (
        <EmptyState tone="muted" title="Could not load the team" description={team.error.message} />
      ) : (
        <>
          <SettingsPanel eventId={eventId} settings={team.data.settings} />
          <DoorsPanel eventId={eventId} doors={team.data.doors} />
          <DutiesPanel eventId={eventId} team={team.data} />
          <KiosksPanel eventId={eventId} doors={team.data.doors} />
        </>
      )}
      <VolunteersPanel eventId={eventId} />
    </div>
  );
}
