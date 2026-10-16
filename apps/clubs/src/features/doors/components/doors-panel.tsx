"use client";

import * as React from "react";
import QRCode from "qrcode";
import {
  CopyIcon,
  DoorOpenIcon,
  LinkIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { formatDateTime, formatNumber } from "@moa/app-kit";
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
  ChoiceCard,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  FigurePanel,
  IconButton,
  NativeSelect,
  Skeleton,
  StatusBadge,
  toast,
} from "@moa/ui";

import {
  useCreateDoor,
  useDeleteDoor,
  useIssueGateLink,
  useRevokeGateLink,
  useUpdateDoor,
} from "../queries";
import {
  DOOR_KINDS,
  DOOR_KIND_META,
  type Door,
  type DoorKind,
  type GateLink,
} from "../schemas";
import { KIND_ICON } from "./parts";

const live = (d: Door) => !!d.link && !d.link.expired;

/**
 * Make a gate link in two steps: say what it may do, then see it once —
 * the QR code to scan from the phone at the door, and the address to copy.
 */
function GateLinkBody({
  eventId,
  door,
  onClose,
}: {
  eventId: number;
  door: Door;
  onClose: () => void;
}) {
  const issue = useIssueGateLink(eventId);
  const [walkup, setWalkup] = React.useState(door.link?.can_walkup ?? false);
  const [link, setLink] = React.useState<GateLink | null>(null);
  const [png, setPng] = React.useState<string | null>(null);
  const make = () =>
    issue.mutate(
      { doorId: door.id, can_walkup: walkup },
      {
        onSuccess: (l) => {
          setLink(l);
          QRCode.toDataURL(l.url, { margin: 1, width: 240 })
            .then(setPng)
            .catch(() => undefined);
        },
      },
    );
  const copy = () => {
    if (!link) return;
    void navigator.clipboard
      ?.writeText(link.url)
      .then(() => toast.success("Link copied"));
  };

  if (!link)
    return (
      <>
        <DialogHeader>
          <DialogTitle>A gate link for {door.name}</DialogTitle>
          <DialogDescription>
            A phone that opens it runs the gate console at {door.name}, with no
            account.
            {live(door)
              ? " Making a new one switches the current link off."
              : ""}
          </DialogDescription>
        </DialogHeader>
        <div
          role="radiogroup"
          aria-label="What the link may do"
          className="grid gap-2"
        >
          <ChoiceCard
            checked={!walkup}
            onClick={() => setWalkup(false)}
            title="Scan tickets"
            hint="Guests with a ticket are checked in. Nothing else."
          />
          <ChoiceCard
            checked={walkup}
            onClick={() => setWalkup(true)}
            title="Scan tickets and register walk-ups"
            hint="Someone without a ticket can be put on the list and let in here."
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={make} disabled={issue.isPending}>
            <LinkIcon /> {live(door) ? "Make a new link" : "Make the link"}
          </Button>
        </DialogFooter>
      </>
    );

  return (
    <>
      <DialogHeader>
        <DialogTitle>Gate link for {door.name}</DialogTitle>
        <DialogDescription>
          Shown once: scan the code from the phone at the door, or copy the
          link.{" "}
          {link.can_walkup
            ? "It may register walk-ups."
            : "It scans tickets only."}
          {link.expires_at
            ? ` It stops working ${formatDateTime(link.expires_at)}.`
            : ""}
        </DialogDescription>
      </DialogHeader>
      {png ? (
        // A data URL drawn in the browser; next/image has nothing to optimise.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={png}
          alt={`QR code for the ${door.name} gate link`}
          className="mx-auto size-56 rounded-xl bg-white p-2"
        />
      ) : (
        <Skeleton className="mx-auto size-56 rounded-xl" />
      )}
      <div className="flex gap-2">
        <input
          readOnly
          value={link.url}
          aria-label="Gate link"
          className="input min-w-0 flex-1 font-mono"
          onFocus={(e) => e.currentTarget.select()}
        />
        <Button variant="secondary" onClick={copy}>
          <CopyIcon /> Copy
        </Button>
      </div>
      <DialogFooter>
        <Button onClick={onClose}>Done</Button>
      </DialogFooter>
    </>
  );
}

function GateLinkDialog({
  eventId,
  door,
  onClose,
}: {
  eventId: number;
  door: Door | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={door !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[460px]">
        {door ? (
          <GateLinkBody
            key={door.id}
            eventId={eventId}
            door={door}
            onClose={onClose}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function DoorRow({
  eventId,
  door,
  onLink,
}: {
  eventId: number;
  door: Door;
  onLink: (d: Door) => void;
}) {
  const update = useUpdateDoor(eventId);
  const remove = useDeleteDoor(eventId);
  const revoke = useRevokeGateLink(eventId);
  const [editing, setEditing] = React.useState(false);
  const [name, setName] = React.useState(door.name);
  const [kind, setKind] = React.useState<DoorKind>(door.kind);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const id = React.useId();
  const open = () => {
    setName(door.name);
    setKind(door.kind);
    setEditing(true);
  };
  const save = () => {
    const next = name.trim();
    const body = {
      ...(next && next !== door.name ? { name: next } : {}),
      ...(kind !== door.kind ? { kind } : {}),
    };
    if (Object.keys(body).length === 0) return setEditing(false);
    update.mutate(
      { doorId: door.id, ...body },
      {
        onSuccess: () => {
          toast.success(`${next || door.name} saved`);
          setEditing(false);
        },
      },
    );
  };
  const team = door.volunteers.length
    ? `${door.volunteers.map((v) => v.name).join(", ")} on this door`
    : "Nobody assigned";
  const link = door.link;
  const linkLine =
    link && !link.expired
      ? ` · link …${link.prefix}${link.can_walkup ? ", walk-ups allowed" : ""}${link.expires_at ? `, until ${formatDateTime(link.expires_at)}` : ""}`
      : "";

  return (
    <li className="border-line-soft border-t px-4 py-3 first:border-t-0">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={cn(
            "grid size-9 shrink-0 place-items-center rounded-xl",
            door.active ? "bg-brand-soft text-brand" : "bg-sunken text-ink-3",
          )}
          aria-hidden="true"
        >
          {KIND_ICON[door.kind]}
        </span>
        <div className="min-w-[180px] flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "text-[13.5px] font-medium",
                door.active ? "text-ink" : "text-ink-3",
              )}
            >
              {door.name}
            </span>
            <span className="tag tag-neutral">
              {DOOR_KIND_META[door.kind].label}
            </span>
            {!door.active ? <StatusBadge label="Retired" /> : null}
            {link ? (
              link.expired ? (
                <StatusBadge tone="warning" label="Link expired" />
              ) : (
                <StatusBadge tone="success" label="Gate link on" />
              )
            ) : null}
          </div>
          <p className="text-ink-3 mt-0.5 truncate text-[12px]">
            {team}
            {linkLine}
          </p>
        </div>
        <span className="w-[72px] text-right">
          <span className="text-ink block font-mono text-[13px] tabular-nums">
            {formatNumber(door.check_ins)}
          </span>
          <span className="text-ink-3 block text-[11px]">admitted</span>
        </span>
        <span className="flex items-center gap-1.5">
          {door.active ? (
            <Button variant="secondary" size="sm" onClick={() => onLink(door)}>
              <LinkIcon /> {live(door) ? "New link" : "Gate link"}
            </Button>
          ) : null}
          {live(door) ? (
            <Button
              variant="ghost"
              size="sm"
              danger
              disabled={revoke.isPending}
              onClick={() => revoke.mutate(door.id)}
              aria-label={`Switch off the gate link for ${door.name}`}
            >
              Switch off
            </Button>
          ) : null}
          <IconButton
            label={editing ? `Close ${door.name}` : `Edit ${door.name}`}
            aria-expanded={editing}
            onClick={() => (editing ? setEditing(false) : open())}
          >
            <PencilIcon />
          </IconButton>
        </span>
      </div>

      {editing ? (
        <div className="bg-sunken mt-3 rounded-xl p-3">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_170px_auto] sm:items-end">
            <div>
              <label htmlFor={`${id}-name`} className="eyebrow mb-1.5 block">
                Name
              </label>
              <input
                id={`${id}-name`}
                className="input"
                value={name}
                maxLength={60}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) =>
                  e.key === "Enter"
                    ? save()
                    : e.key === "Escape"
                      ? setEditing(false)
                      : undefined
                }
              />
            </div>
            <div>
              <label htmlFor={`${id}-kind`} className="eyebrow mb-1.5 block">
                Kind
              </label>
              <NativeSelect
                id={`${id}-kind`}
                value={kind}
                onChange={(e) => setKind(e.target.value as DoorKind)}
              >
                {DOOR_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {DOOR_KIND_META[k].label}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="flex gap-2">
              <Button onClick={save} disabled={update.isPending}>
                Save
              </Button>
              <Button variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </div>
          <p className="text-ink-3 mt-2 text-[11.5px]">
            {DOOR_KIND_META[kind].note}
          </p>
          <div className="border-line mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
            <Button
              variant="secondary"
              size="sm"
              disabled={update.isPending}
              onClick={() =>
                update.mutate({ doorId: door.id, active: !door.active })
              }
            >
              {door.active ? "Retire this door" : "Reopen this door"}
            </Button>
            {door.check_ins === 0 ? (
              <Button
                variant="ghost"
                size="sm"
                danger
                onClick={() => setConfirmDelete(true)}
                aria-label={`Delete ${door.name}`}
              >
                <Trash2Icon /> Delete
              </Button>
            ) : null}
            <span className="text-ink-3 text-[11.5px]">
              {door.active
                ? "A retired door leaves the console's picker; its check-ins stay in the log."
                : "Reopened, it is back on the console's picker."}
            </span>
          </div>
        </div>
      ) : null}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {door.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Nobody was admitted here, so nothing is lost. Volunteers assigned
              to it are unassigned.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="secondary">Keep it</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={(e) => {
                e.preventDefault();
                remove.mutate(door.id, {
                  onSuccess: () => setConfirmDelete(false),
                });
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

/** Every place guests are admitted: its kind, its team, its gate link, and how many came through it. */
export function DoorsPanel({
  eventId,
  doors,
}: {
  eventId: number;
  doors: Door[];
}) {
  const create = useCreateDoor(eventId);
  const [name, setName] = React.useState("");
  const [kind, setKind] = React.useState<DoorKind>("door");
  const [linkFor, setLinkFor] = React.useState<Door | null>(null);
  const id = React.useId();
  const open = doors.filter((d) => d.active);
  const retired = doors.filter((d) => !d.active);
  return (
    <FigurePanel className="overflow-hidden p-0">
      <div className="px-4 pt-4">
        <CardLabel
          right={
            doors.length ? (
              <span className="text-ink-3 font-mono text-[11px]">
                {open.length} open
                {retired.length ? ` · ${retired.length} retired` : ""}
              </span>
            ) : null
          }
        >
          Doors
        </CardLabel>
        <p className="text-ink-3 mt-1 text-[12px] leading-[1.5]">
          Every place guests are admitted. Volunteers pick one on the console
          and each scan is recorded against it; a gate link opens the console at
          one door on a phone, with no account.
        </p>
      </div>
      {doors.length === 0 ? (
        <EmptyState
          size="sm"
          icon={<DoorOpenIcon />}
          title="No doors yet"
          description="Name them here first: Gate A, the front desk, the kiosk. Otherwise the first scan makes one from whatever the volunteer types."
        />
      ) : (
        <ul className="mt-2">
          {[...open, ...retired].map((d) => (
            <DoorRow
              key={d.id}
              eventId={eventId}
              door={d}
              onLink={setLinkFor}
            />
          ))}
        </ul>
      )}
      <form
        className="border-line-soft bg-sunken/40 border-t px-4 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          create.mutate(
            { name: name.trim(), kind },
            { onSuccess: () => setName("") },
          );
        }}
      >
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_160px_auto] sm:items-end">
          <div>
            <label htmlFor={`${id}-name`} className="eyebrow mb-1.5 block">
              Add a door
            </label>
            <input
              id={`${id}-name`}
              className="input"
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
              placeholder="Gate A, Loading bay, Front desk"
            />
          </div>
          <div>
            <label htmlFor={`${id}-kind`} className="eyebrow mb-1.5 block">
              Kind
            </label>
            <NativeSelect
              id={`${id}-kind`}
              value={kind}
              onChange={(e) => setKind(e.target.value as DoorKind)}
            >
              {DOOR_KINDS.map((k) => (
                <option key={k} value={k}>
                  {DOOR_KIND_META[k].label}
                </option>
              ))}
            </NativeSelect>
          </div>
          <Button
            type="submit"
            variant="secondary"
            disabled={!name.trim() || create.isPending}
          >
            <PlusIcon /> Add door
          </Button>
        </div>
        <p className="text-ink-3 mt-1.5 text-[11.5px]">
          {DOOR_KIND_META[kind].note}
        </p>
      </form>
      <GateLinkDialog
        eventId={eventId}
        door={linkFor}
        onClose={() => setLinkFor(null)}
      />
    </FigurePanel>
  );
}
