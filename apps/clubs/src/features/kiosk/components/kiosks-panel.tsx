"use client";

import * as React from "react";
import QRCode from "qrcode";
import {
  CopyIcon,
  MonitorSmartphoneIcon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
} from "lucide-react";
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
  ChoiceCard,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Skeleton,
  StatusBadge,
  toast,
} from "@moa/ui";

import type { Door } from "@/features/doors";

import {
  useKioskSettings,
  useKiosks,
  usePairKiosk,
  useRotateKiosk,
  useUnpairKiosk,
  useUpdateKioskSettings,
} from "../queries";
import {
  VERIFY_META,
  type KioskDevice,
  type KioskSettings,
  type PairedKiosk,
} from "../schemas";

const panel = "rounded-2xl bg-card ring-1 ring-border/70 shadow-sm";
const heading =
  "font-mono text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted-foreground";
const note = "text-[12px] leading-[1.5] text-muted-foreground";
const control = "h-9 rounded-md border bg-muted/40 px-2.5 text-[13px]";

function PairedDialog({
  paired,
  onClose,
}: {
  paired: PairedKiosk | null;
  onClose: () => void;
}) {
  const [png, setPng] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!paired) return;
    let alive = true;
    QRCode.toDataURL(paired.url, { margin: 1, width: 240 })
      .then((d) => alive && setPng(d))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [paired]);
  return (
    <Dialog open={paired !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Open this on the kiosk</DialogTitle>
          <DialogDescription>
            Shown once. The tablet that opens it becomes{" "}
            <strong>{paired?.device.name}</strong> at{" "}
            {paired?.device.door_label}, with no account. The pairing lasts
            until {paired ? formatDateTime(paired.device.expires_at) : ""};
            rotate it for the next shift.
          </DialogDescription>
        </DialogHeader>
        {png ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={png}
            alt="QR code for the kiosk pairing link"
            className="mx-auto size-60 rounded-md bg-white p-2"
          />
        ) : null}
        <div className="flex gap-1.5">
          <input
            readOnly
            value={paired?.url ?? ""}
            className={cn(control, "min-w-0 flex-1 font-mono text-[11px]")}
            onFocus={(e) => e.currentTarget.select()}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (!paired) return;
              void navigator.clipboard
                ?.writeText(paired.url)
                .then(() => toast.success("Link copied"));
            }}
          >
            <CopyIcon /> Copy
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function KioskRow({
  eventId,
  device,
  onPaired,
}: {
  eventId: number;
  device: KioskDevice;
  onPaired: (p: PairedKiosk) => void;
}) {
  const rotate = useRotateKiosk(eventId);
  const unpair = useUnpairKiosk(eventId);
  const [confirm, setConfirm] = React.useState(false);
  const expired = !device.active && !device.revoked_at;
  return (
    <li className="flex flex-wrap items-center gap-2 px-4 py-2.5">
      <MonitorSmartphoneIcon
        className="size-4 text-muted-foreground"
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{device.name}</span>
          <StatusBadge
            tone={device.online ? "success" : expired ? "warning" : "default"}
            label={
              device.online
                ? "Online"
                : expired
                  ? "Pairing expired"
                  : device.last_seen_at
                    ? `Seen ${formatDateTime(device.last_seen_at)}`
                    : "Never opened"
            }
          />
        </div>
        <p className={note}>
          {device.door_label} · token {device.token_prefix}… · until{" "}
          {formatDateTime(device.expires_at)}
        </p>
      </div>
      <Button
        size="sm"
        variant="outline"
        disabled={rotate.isPending}
        onClick={() =>
          rotate.mutate({ deviceId: device.id }, { onSuccess: onPaired })
        }
      >
        <RefreshCwIcon /> New link
      </Button>
      <Button
        size="icon-xs"
        variant="ghost"
        aria-label={`Unpair ${device.name}`}
        onClick={() => setConfirm(true)}
      >
        <Trash2Icon />
      </Button>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unpair {device.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              The tablet stops working at once. Its check-ins stay in the log.
              Pair it again from here when you need it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction onClick={() => unpair.mutate(device.id)}>
              Unpair
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

function PairForm({
  eventId,
  doors,
  onPaired,
}: {
  eventId: number;
  doors: Door[];
  onPaired: (p: PairedKiosk) => void;
}) {
  const pair = usePairKiosk(eventId);
  const [name, setName] = React.useState("");
  const [doorId, setDoorId] = React.useState<string>("");
  const [hours, setHours] = React.useState(12);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        pair.mutate(
          { name: name.trim(), door_id: doorId || null, shift_hours: hours },
          {
            onSuccess: (p) => {
              setName("");
              onPaired(p);
            },
          },
        );
      }}
      className="flex flex-wrap items-end gap-2 border-t px-4 py-3"
    >
      <label className="flex min-w-40 flex-1 flex-col gap-1 text-xs">
        Kiosk name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Lobby tablet"
          maxLength={60}
          className={control}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        Door
        <select
          value={doorId}
          onChange={(e) => setDoorId(e.target.value)}
          className={control}
        >
          <option value="">Kiosk (its own door)</option>
          {doors.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs">
        Shift
        <select
          value={hours}
          onChange={(e) => setHours(Number(e.target.value))}
          className={control}
        >
          {[4, 8, 12, 24, 72].map((h) => (
            <option key={h} value={h}>
              {h} hours
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" size="sm" disabled={!name.trim() || pair.isPending}>
        <PlusIcon /> Pair a kiosk
      </Button>
    </form>
  );
}

function SelfCheckInSettings({
  eventId,
  settings,
}: {
  eventId: number;
  settings: KioskSettings;
}) {
  const update = useUpdateKioskSettings(eventId);
  const [pin, setPin] = React.useState("");
  return (
    <div className="space-y-3 border-t px-4 py-3">
      <label className="flex cursor-pointer items-start gap-2.5">
        <input
          type="checkbox"
          checked={settings.self_check_in_enabled}
          onChange={(e) =>
            update.mutate({ self_check_in_enabled: e.target.checked })
          }
          className="mt-0.5 size-4 accent-primary"
        />
        <span>
          <span className="block text-[13px]">
            Guests may check in from their own phone
          </span>
          <span className={note}>
            The kiosk shows a QR; a guest scans it, types their name, and is
            checked in at the kiosk&apos;s door. No app to install.
          </span>
        </span>
      </label>
      {settings.self_check_in_enabled ? (
        <>
          <div
            className="grid gap-2 md:grid-cols-3"
            role="radiogroup"
            aria-label="How a guest proves who they are"
          >
            {(["name", "email", "phone"] as const).map((v) => {
              const m = VERIFY_META[v];
              const on = settings.self_check_in_verify === v;
              return (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={!m.available}
                  onClick={() => update.mutate({ self_check_in_verify: v })}
                  className={cn(
                    "rounded-md border px-3 py-2.5 text-left disabled:cursor-not-allowed disabled:opacity-60",
                    on ? "border-primary bg-primary/10" : "hover:bg-muted",
                  )}
                >
                  <span
                    className={cn(
                      "block text-sm font-medium",
                      on && "text-primary",
                    )}
                  >
                    {m.label}
                  </span>
                  <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
                    {m.note}
                  </span>
                </button>
              );
            })}
          </div>
          <label className="flex cursor-pointer items-start gap-2.5">
            <input
              type="checkbox"
              checked={settings.self_check_in_print}
              onChange={(e) =>
                update.mutate({ self_check_in_print: e.target.checked })
              }
              className="mt-0.5 size-4 accent-primary"
            />
            <span>
              <span className="block text-[13px]">
                One tap on the phone prints their card at the kiosk
              </span>
              <span className={note}>
                Needs a printer on the kiosk. Off: the desk prints cards.
              </span>
            </span>
          </label>
        </>
      ) : null}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          update.mutate({ kiosk_pin: pin }, { onSuccess: () => setPin("") });
        }}
        className="flex flex-wrap items-end gap-2"
      >
        <label className="flex flex-col gap-1 text-xs">
          Staff PIN on the kiosk{" "}
          {settings.has_pin ? (
            <span className="text-muted-foreground">(set)</span>
          ) : null}
          <input
            value={pin}
            onChange={(e) =>
              setPin(e.target.value.replace(/\D/g, "").slice(0, 12))
            }
            inputMode="numeric"
            placeholder={settings.has_pin ? "New PIN" : "4 to 12 digits"}
            className={cn(control, "w-40 font-mono")}
          />
        </label>
        <Button
          type="submit"
          size="sm"
          variant="outline"
          disabled={pin.length < 4 || update.isPending}
        >
          {settings.has_pin ? "Change PIN" : "Set PIN"}
        </Button>
        {settings.has_pin ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => update.mutate({ kiosk_pin: null })}
          >
            Remove
          </Button>
        ) : null}
        <p className={cn(note, "basis-full")}>
          Volunteers tap the corner of the kiosk screen and type it to see
          counts, reload, or unpair.
        </p>
      </form>
    </div>
  );
}

/** Tablets that check guests in by themselves, and whether guests may do it from their own phone. */
export function KiosksPanel({
  eventId,
  doors,
}: {
  eventId: number;
  doors: Door[];
}) {
  const kiosks = useKiosks(eventId);
  const settings = useKioskSettings(eventId);
  const [paired, setPaired] = React.useState<PairedKiosk | null>(null);
  return (
    <section className={panel}>
      <div className="px-4 pt-4">
        <p className={heading}>Self check-in kiosks</p>
        <p className={note}>
          A tablet on a stand: a guest scans their ticket, sees their name, and
          takes their card. It needs no account, only the link you pair it with.
        </p>
      </div>
      {kiosks.isPending ? (
        <Skeleton className="m-4 h-16" />
      ) : kiosks.isError ? (
        <p className="px-4 py-3 text-sm text-destructive">
          {kiosks.error.message}
        </p>
      ) : kiosks.data.length ? (
        <ul className="mt-2 divide-y">
          {kiosks.data.map((d) => (
            <KioskRow
              key={d.id}
              eventId={eventId}
              device={d}
              onPaired={setPaired}
            />
          ))}
        </ul>
      ) : (
        <p className="px-4 py-3 text-sm text-muted-foreground">No kiosk yet.</p>
      )}
      <PairForm eventId={eventId} doors={doors} onPaired={setPaired} />
      {settings.data ? (
        <SelfCheckInSettings eventId={eventId} settings={settings.data} />
      ) : null}
      <PairedDialog
        key={paired?.token ?? "none"}
        paired={paired}
        onClose={() => setPaired(null)}
      />
    </section>
  );
}
