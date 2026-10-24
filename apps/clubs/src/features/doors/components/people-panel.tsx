"use client";

import * as React from "react";
import { Trash2Icon, UserPlusIcon, UsersIcon } from "lucide-react";
import { PersonAvatar, formatNumber } from "@moa/app-kit";
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
  CardLabel,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  EmptyState,
  FigurePanel,
  IconButton,
  InitialsAvatar,
  NativeSelect,
  StatusBadge,
  Switch,
} from "@moa/ui";

import {
  AddVolunteerForm,
  useRemoveVolunteer,
  useVolunteers,
} from "@/features/volunteers";

import { useRefreshTeam, useUpdateTeamVolunteer } from "../queries";
import type { Team, TeamVolunteer } from "../schemas";

const DUTIES = [
  { key: "can_check_in", label: "Check-in" },
  { key: "can_walkup", label: "Walk-up" },
  { key: "can_merch", label: "Merch" },
] as const;

const COLS =
  "sm:grid-cols-[minmax(0,1.6fr)_72px_72px_72px_minmax(0,160px)_72px_40px]";

/**
 * The people who run the door, in one list: who they are, what each may do
 * on the console, the door they are expected at, and how many they have
 * let in. Adding someone is a dialog; taking them off asks first.
 */
export function PeoplePanel({
  eventId,
  team,
}: {
  eventId: number;
  team: Team;
}) {
  const update = useUpdateTeamVolunteer(eventId);
  const remove = useRemoveVolunteer(eventId);
  const list = useVolunteers(eventId);
  const refresh = useRefreshTeam(eventId);
  const [adding, setAdding] = React.useState(false);
  const [removing, setRemoving] = React.useState<TeamVolunteer | null>(null);
  // The team carries the account's name once they have signed in; before
  // that, the name the organiser typed is on the volunteer list.
  const typed = new Map(
    (list.data ?? []).map((v) => [
      (v.email_id ?? v.email ?? "").toLowerCase(),
      v.full_name || v.name || null,
    ]),
  );
  const nameOf = (v: TeamVolunteer) =>
    v.name || typed.get(v.email.toLowerCase()) || v.email;
  const doors = team.doors.filter((d) => d.active);
  const people = team.volunteers;

  return (
    <FigurePanel className="overflow-hidden p-0">
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-4">
        <div className="min-w-0">
          <CardLabel>Volunteers</CardLabel>
          <p className="text-ink-3 mt-1 max-w-[72ch] text-[12px] leading-[1.5]">
            What each one may do on the console, and the door they are
            expected at. With every switch off they can sign in, but the
            console shows them nothing.
          </p>
        </div>
        {people.length ? (
          <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>
            <UserPlusIcon /> Add a volunteer
          </Button>
        ) : null}
      </div>

      <ul className="mt-2">
        <li className="border-line-soft flex items-center gap-3 border-t px-4 py-2.5">
          <InitialsAvatar
            name={team.owner.name || "Club"}
            size={32}
            tone="muted"
          />
          <span className="min-w-0 flex-1">
            <span className="text-ink block truncate text-[13.5px] font-medium">
              {team.owner.name || "The club account"}
            </span>
            <span className="text-ink-3 block truncate text-[11.5px]">
              The club account · every duty, always
            </span>
          </span>
        </li>
      </ul>

      {people.length === 0 ? (
        <EmptyState
          size="sm"
          icon={<UsersIcon />}
          title="No volunteers yet"
          description="Add the people who will scan tickets. They sign in to the app or the gate with the email you add here."
          action={
            <Button onClick={() => setAdding(true)}>
              <UserPlusIcon /> Add a volunteer
            </Button>
          }
        />
      ) : (
        <>
          <div
            className={cn(
              "border-line-soft hidden gap-3 border-t px-4 py-2 sm:grid",
              COLS,
            )}
          >
            <span className="eyebrow">Volunteer</span>
            {DUTIES.map((d) => (
              <span key={d.key} className="eyebrow">
                {d.label}
              </span>
            ))}
            <span className="eyebrow">Expected at</span>
            <span className="eyebrow text-right">Admitted</span>
            <span />
          </div>
          <ul>
            {people.map((v) => {
              const name = nameOf(v);
              return (
                <li
                  key={v.id}
                  className={cn(
                    "border-line-soft grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border-t px-4 py-2.5",
                    COLS,
                  )}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <PersonAvatar
                      name={name}
                      avatar={v.avatar}
                      className="size-8"
                      // Green for someone who can admit, as the initials always were.
                      fallbackClassName={cn(
                        "font-mono text-[12px] font-semibold",
                        v.can_check_in
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                          : "bg-brand/10 text-brand",
                      )}
                    />
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="text-ink truncate text-[13.5px] font-medium">
                          {name}
                        </span>
                        {v.scope === "club" ? (
                          <StatusBadge label="Club-wide" />
                        ) : null}
                        {!v.is_approved ? (
                          <StatusBadge tone="warning" label="Not approved yet" />
                        ) : null}
                      </span>
                      <span className="text-ink-3 block truncate text-[11.5px]">
                        {v.email}
                        {v.scope === "club" ? " · on every event of the club" : ""}
                      </span>
                    </span>
                  </span>
                  <span className="col-span-2 flex flex-wrap items-center gap-x-5 gap-y-2 sm:contents">
                    {DUTIES.map((d) => (
                      <label key={d.key} className="flex items-center gap-2">
                        <Switch
                          checked={v[d.key]}
                          aria-label={`${d.label} for ${name}`}
                          onCheckedChange={(on) =>
                            update.mutate({ volunteerId: v.id, [d.key]: on })
                          }
                        />
                        <span className="text-ink-2 text-[12px] sm:hidden">
                          {d.label}
                        </span>
                      </label>
                    ))}
                    <NativeSelect
                      size="sm"
                      aria-label={`Door for ${name}`}
                      value={v.door_id ?? ""}
                      onChange={(e) =>
                        update.mutate({
                          volunteerId: v.id,
                          ...(e.target.value
                            ? { door_id: e.target.value }
                            : { clear_door: true }),
                        })
                      }
                      className="w-auto min-w-0 sm:w-full"
                    >
                      <option value="">Any door</option>
                      {doors.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </NativeSelect>
                    <span className="text-ink-2 font-mono text-[12.5px] tabular-nums sm:text-right">
                      {formatNumber(v.check_ins)}
                      <span className="text-ink-3 sm:hidden"> admitted</span>
                    </span>
                    <span className="ml-auto flex justify-end sm:ml-0">
                      {v.scope === "event" ? (
                        <IconButton
                          label={`Remove ${name}`}
                          danger
                          onClick={() => setRemoving(v)}
                        >
                          <Trash2Icon />
                        </IconButton>
                      ) : null}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Add a volunteer</DialogTitle>
            <DialogDescription>
              They sign in to the app or the gate with this email and get this
              event&apos;s console. Set what they may do once they are on the
              list.
            </DialogDescription>
          </DialogHeader>
          {adding ? (
            <AddVolunteerForm
              eventId={eventId}
              onAdded={() => {
                refresh();
                setAdding(false);
              }}
              onCancel={() => setAdding(false)}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={removing !== null}
        onOpenChange={(o) => (o ? undefined : setRemoving(null))}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Take {removing ? nameOf(removing) : "them"} off the team?
            </AlertDialogTitle>
            <AlertDialogDescription>
              They lose this event&apos;s gate at once. The guests they let in
              stay in the log.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="secondary">Keep them</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={remove.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (!removing) return;
                remove.mutate(removing.email, {
                  onSuccess: () => {
                    refresh();
                    setRemoving(null);
                  },
                });
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </FigurePanel>
  );
}
