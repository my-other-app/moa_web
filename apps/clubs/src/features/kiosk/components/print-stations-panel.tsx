"use client";

import * as React from "react";
import { PlusIcon, PrinterIcon, RefreshCwIcon, Trash2Icon } from "lucide-react";
import { formatDateTime } from "@moa/app-kit";
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
  EmptyState,
  FigurePanel,
  IconButton,
  NativeSelect,
  Skeleton,
  StatusBadge,
  cn,
} from "@moa/ui";

import type { Door } from "@/features/doors";

import { useKiosks, usePairKiosk, useRotateKiosk, useSetPrinterDoor, useUnpairKiosk } from "../queries";
import type { KioskDevice, PairedKiosk } from "../schemas";
import { PairedDialog } from "./kiosks-panel";

const ANY_DOOR = "";

/** The words for a station's door in the list. */
export function printsForWords(device: Pick<KioskDevice, "door_id">, doors: Pick<Door, "id" | "name">[]): string {
  if (!device.door_id) return "Prints for any door";
  const door = doors.find((d) => d.id === device.door_id);
  return door ? `Prints for ${door.name}` : "Prints for a door that was removed";
}

/** "Prints for": any door, or one door. Cards asked for at that door come out at this station. */
function DoorPicker({ id, value, doors, onChange, disabled }: { id: string; value: string | null | undefined; doors: Pick<Door, "id" | "name">[]; onChange: (doorId: string | null) => void; disabled?: boolean }) {
  return (
    <NativeSelect id={id} value={value ?? ANY_DOOR} disabled={disabled} onChange={(e) => onChange(e.target.value === ANY_DOOR ? null : e.target.value)}>
      <option value={ANY_DOOR}>Any door</option>
      {doors.map((d) => (
        <option key={d.id} value={d.id}>
          {d.name}
        </option>
      ))}
    </NativeSelect>
  );
}

function StationRow({ eventId, device, doors, onPaired }: { eventId: number; device: KioskDevice; doors: Pick<Door, "id" | "name">[]; onPaired: (p: PairedKiosk) => void }) {
  const rotate = useRotateKiosk(eventId);
  const setDoor = useSetPrinterDoor(eventId);
  const pickId = React.useId();
  const unpair = useUnpairKiosk(eventId);
  const [confirm, setConfirm] = React.useState(false);
  const expired = !device.active && !device.revoked_at;
  return (
    <li className="border-line-soft flex flex-wrap items-center gap-3 border-t px-4 py-3">
      <span className="bg-brand-soft text-brand grid size-9 shrink-0 place-items-center rounded-xl" aria-hidden="true">
        <PrinterIcon className="size-[18px]" />
      </span>
      <div className="min-w-[180px] flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span aria-hidden="true" className={cn("size-2.5 shrink-0 rounded-full", device.online ? "bg-admit" : "bg-ink-3")} />
          <span className="text-ink truncate text-[13.5px] font-medium">{device.name}</span>
          <StatusBadge
            tone={device.online ? "success" : expired ? "warning" : "default"}
            label={device.online ? "Online" : expired ? "Pairing expired" : device.last_seen_at ? `Seen ${formatDateTime(device.last_seen_at)}` : "Never opened"}
          />
        </div>
        <p className="text-ink-3 mt-0.5 truncate text-[12px]">
          {printsForWords(device, doors)} · token {device.token_prefix}… · until {formatDateTime(device.expires_at)}
        </p>
      </div>
      <div className="w-[170px]">
        <label htmlFor={pickId} className="sr-only">
          {`Prints for, ${device.name}`}
        </label>
        <DoorPicker id={pickId} value={device.door_id} doors={doors} disabled={setDoor.isPending} onChange={(doorId) => setDoor.mutate({ deviceId: device.id, doorId })} />
      </div>
      <Button size="sm" variant="secondary" disabled={rotate.isPending} onClick={() => rotate.mutate({ deviceId: device.id }, { onSuccess: onPaired })}>
        <RefreshCwIcon /> New link
      </Button>
      <IconButton label={`Unpair ${device.name}`} danger onClick={() => setConfirm(true)}>
        <Trash2Icon />
      </IconButton>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unpair {device.name}?</AlertDialogTitle>
            <AlertDialogDescription>The laptop stops printing at once. Cards waiting for it stay in the queue for another print station. Add it again from here when you need it.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="secondary">Keep</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => unpair.mutate(device.id)}>
              Unpair
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

function AddForm({ eventId, doors, onPaired }: { eventId: number; doors: Pick<Door, "id" | "name">[]; onPaired: (p: PairedKiosk) => void }) {
  const pair = usePairKiosk(eventId);
  const id = React.useId();
  const [name, setName] = React.useState("");
  const [doorId, setDoorId] = React.useState<string | null>(null);
  const [hours, setHours] = React.useState(12);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        pair.mutate(
          { name: name.trim(), shift_hours: hours, role: "printer", ...(doorId ? { door_id: doorId } : {}) },
          {
            onSuccess: (p) => {
              setName("");
              onPaired(p);
            },
          },
        );
      }}
      className="border-line-soft bg-sunken/40 grid gap-2 border-t px-4 py-3 sm:grid-cols-[minmax(0,1fr)_160px_120px_auto] sm:items-end"
    >
      <div>
        <label htmlFor={`${id}-name`} className="eyebrow mb-1.5 block">
          Print station name
        </label>
        <input id={`${id}-name`} value={name} onChange={(e) => setName(e.target.value)} placeholder="Help desk laptop" maxLength={60} className="input" />
      </div>
      <div>
        <label htmlFor={`${id}-door`} className="eyebrow mb-1.5 block">
          Prints for
        </label>
        <DoorPicker id={`${id}-door`} value={doorId} doors={doors} onChange={setDoorId} />
      </div>
      <div>
        <label htmlFor={`${id}-shift`} className="eyebrow mb-1.5 block">
          Shift
        </label>
        <NativeSelect id={`${id}-shift`} value={hours} onChange={(e) => setHours(Number(e.target.value))}>
          {[4, 8, 12, 24, 72].map((h) => (
            <option key={h} value={h}>
              {h} hours
            </option>
          ))}
        </NativeSelect>
      </div>
      <Button type="submit" variant="secondary" disabled={!name.trim() || pair.isPending}>
        <PlusIcon /> Add a print station
      </Button>
    </form>
  );
}

/** Laptops with a printer that print guests' ID cards on their own: paired like a kiosk, shown with an online dot. */
export function PrintStationsPanel({ eventId, doors = [] }: { eventId: number; doors?: Pick<Door, "id" | "name">[] }) {
  const devices = useKiosks(eventId);
  const [paired, setPaired] = React.useState<PairedKiosk | null>(null);
  const stations = devices.data?.filter((d) => d.role === "printer");
  const online = stations?.filter((d) => d.online).length ?? 0;
  return (
    <FigurePanel className="overflow-hidden p-0">
      <div className="px-4 pt-4">
        <CardLabel right={stations?.length ? <span className="text-ink-3 font-mono text-[11px]">{online} of {stations.length} online</span> : null}>Print stations</CardLabel>
        <p className="text-ink-3 mt-1 text-[12px] leading-[1.5]">
          A laptop with a printer, left open on the print station page. The kiosk, the door and the guest list can send an ID card to it, and it prints with nobody clicking. Pick the door it prints for: cards asked for at that door come out there. If that laptop goes offline, another one prints them.
        </p>
      </div>
      {devices.isPending ? (
        <div className="p-4">
          <Skeleton className="h-14" />
        </div>
      ) : devices.isError ? (
        <EmptyState
          size="sm"
          title="Could not load the print stations"
          description={devices.error.message}
          action={
            <Button variant="secondary" size="sm" onClick={() => void devices.refetch()}>
              Try again
            </Button>
          }
        />
      ) : stations?.length ? (
        <ul className="mt-2">
          {stations.map((d) => (
            <StationRow key={d.id} eventId={eventId} device={d} doors={doors} onPaired={setPaired} />
          ))}
        </ul>
      ) : (
        <EmptyState size="sm" icon={<PrinterIcon />} title="No print station yet" description="Name the laptop below: it gets a link to open in Chrome, and becomes a print station." />
      )}
      <AddForm eventId={eventId} doors={doors} onPaired={setPaired} />
      <PairedDialog paired={paired} onClose={() => setPaired(null)} />
    </FigurePanel>
  );
}
