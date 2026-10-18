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
  CardLabel,
  ChoiceCard,
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
  Switch,
  cn,
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
import { PIN_MIN, pinFieldError, pinProblem } from "../api";
import {
  VERIFY_META,
  type KioskDevice,
  type KioskSettings,
  type PairedKiosk,
} from "../schemas";

function PairedBody({
  paired,
  onClose,
}: {
  paired: PairedKiosk;
  onClose: () => void;
}) {
  const [png, setPng] = React.useState<string | null>(null);
  React.useEffect(() => {
    let alive = true;
    QRCode.toDataURL(paired.url, { margin: 1, width: 240 })
      .then((d) => alive && setPng(d))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [paired]);
  return (
    <>
      <DialogHeader>
        <DialogTitle>Open this on the kiosk</DialogTitle>
        <DialogDescription>
          Shown once. The tablet that opens it becomes{" "}
          <strong>{paired.device.name}</strong> at {paired.device.door_label},
          with no account. The pairing lasts until{" "}
          {formatDateTime(paired.device.expires_at)}; make a new link for the
          next shift.
        </DialogDescription>
      </DialogHeader>
      {png ? (
        // A data URL drawn in the browser; next/image has nothing to optimise.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={png}
          alt="QR code for the kiosk pairing link"
          className="mx-auto size-56 rounded-xl bg-white p-2"
        />
      ) : (
        <Skeleton className="mx-auto size-56 rounded-xl" />
      )}
      <div className="flex gap-2">
        <input
          readOnly
          value={paired.url}
          aria-label="Kiosk pairing link"
          className="input min-w-0 flex-1 font-mono"
          onFocus={(e) => e.currentTarget.select()}
        />
        <Button
          variant="secondary"
          onClick={() =>
            void navigator.clipboard
              ?.writeText(paired.url)
              .then(() => toast.success("Link copied"))
          }
        >
          <CopyIcon /> Copy
        </Button>
      </div>
      <DialogFooter>
        <Button onClick={onClose}>Done</Button>
      </DialogFooter>
    </>
  );
}

function PairedDialog({
  paired,
  onClose,
}: {
  paired: PairedKiosk | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={paired !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[460px]">
        {paired ? (
          <PairedBody key={paired.token} paired={paired} onClose={onClose} />
        ) : null}
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
    <li className="border-line-soft flex flex-wrap items-center gap-3 border-t px-4 py-3">
      <span
        className="bg-brand-soft text-brand grid size-9 shrink-0 place-items-center rounded-xl"
        aria-hidden="true"
      >
        <MonitorSmartphoneIcon className="size-[18px]" />
      </span>
      <div className="min-w-[180px] flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-ink truncate text-[13.5px] font-medium">
            {device.name}
          </span>
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
        <p className="text-ink-3 mt-0.5 truncate text-[12px]">
          {device.door_label} · token {device.token_prefix}… · until{" "}
          {formatDateTime(device.expires_at)}
        </p>
      </div>
      <Button
        size="sm"
        variant="secondary"
        disabled={rotate.isPending}
        onClick={() =>
          rotate.mutate({ deviceId: device.id }, { onSuccess: onPaired })
        }
      >
        <RefreshCwIcon /> New link
      </Button>
      <IconButton
        label={`Unpair ${device.name}`}
        danger
        onClick={() => setConfirm(true)}
      >
        <Trash2Icon />
      </IconButton>
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
            <AlertDialogCancel variant="secondary">Keep</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => unpair.mutate(device.id)}
            >
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
  const id = React.useId();
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
      className="border-line-soft bg-sunken/40 grid gap-2 border-t px-4 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,180px)_120px_auto] sm:items-end"
    >
      <div>
        <label htmlFor={`${id}-name`} className="eyebrow mb-1.5 block">
          Kiosk name
        </label>
        <input
          id={`${id}-name`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Lobby tablet"
          maxLength={60}
          className="input"
        />
      </div>
      <div>
        <label htmlFor={`${id}-door`} className="eyebrow mb-1.5 block">
          Door
        </label>
        <NativeSelect
          id={`${id}-door`}
          value={doorId}
          onChange={(e) => setDoorId(e.target.value)}
        >
          <option value="">Kiosk (its own door)</option>
          {doors.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div>
        <label htmlFor={`${id}-shift`} className="eyebrow mb-1.5 block">
          Shift
        </label>
        <NativeSelect
          id={`${id}-shift`}
          value={hours}
          onChange={(e) => setHours(Number(e.target.value))}
        >
          {[4, 8, 12, 24, 72].map((h) => (
            <option key={h} value={h}>
              {h} hours
            </option>
          ))}
        </NativeSelect>
      </div>
      <Button
        type="submit"
        variant="secondary"
        disabled={!name.trim() || pair.isPending}
      >
        <PlusIcon /> Pair a kiosk
      </Button>
    </form>
  );
}

function SwitchRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="min-w-0 flex-1">
        <span className="text-ink block text-[13px]">{label}</span>
        <span className="text-ink-3 block text-[11.5px] leading-[1.5]">
          {hint}
        </span>
      </span>
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        aria-label={label}
        className="mt-0.5"
      />
    </div>
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
  const id = React.useId();
  const [pin, setPin] = React.useState("");
  // Said under the field: too short before it is sent, or the API's own word (422) after.
  const tooShort = pinProblem(pin);
  const refused = pinFieldError(update.error);
  const pinNote = tooShort ?? refused;
  return (
    <div className="border-line-soft grid gap-4 border-t px-4 py-4">
      <SwitchRow
        label="Guests may check in from their own phone"
        hint="The kiosk shows a QR; a guest scans it, types their name, and is checked in at the kiosk's door. No app to install."
        checked={settings.self_check_in_enabled}
        onChange={(on) => update.mutate({ self_check_in_enabled: on })}
      />
      {settings.self_check_in_enabled ? (
        <>
          <div
            className="grid gap-2 md:grid-cols-3"
            role="radiogroup"
            aria-label="How a guest proves who they are"
          >
            {(["name", "email", "phone"] as const).map((v) => {
              const m = VERIFY_META[v];
              return (
                <ChoiceCard
                  key={v}
                  checked={settings.self_check_in_verify === v}
                  disabled={!m.available}
                  onClick={() => update.mutate({ self_check_in_verify: v })}
                  title={m.label}
                  hint={m.note}
                />
              );
            })}
          </div>
          <SwitchRow
            label="One tap on the phone prints their card at the kiosk"
            hint="Needs a printer on the kiosk. Off: the desk prints cards."
            checked={settings.self_check_in_print}
            onChange={(on) => update.mutate({ self_check_in_print: on })}
          />
        </>
      ) : null}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!pin || tooShort) return;
          update.mutate({ kiosk_pin: pin }, { onSuccess: () => setPin("") });
        }}
        className="border-line-soft grid gap-2 border-t pt-4"
      >
        <label
          htmlFor={`${id}-pin`}
          className="flex items-center gap-2"
        >
          <span className="eyebrow">Staff PIN on the kiosk</span>
          {settings.has_pin ? <StatusBadge tone="success" label="Set" /> : null}
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            id={`${id}-pin`}
            value={pin}
            onChange={(e) => {
              setPin(e.target.value.replace(/\D/g, "").slice(0, 12));
              // A refusal belongs to the PIN it was about, not the next one.
              if (refused) update.reset();
            }}
            inputMode="numeric"
            placeholder={settings.has_pin ? "New PIN" : "4 to 12 digits"}
            minLength={PIN_MIN}
            maxLength={12}
            aria-invalid={pinNote ? true : undefined}
            aria-describedby={pinNote ? `${id}-pin-note` : undefined}
            className={cn("input w-40 font-mono", pinNote && "border-refuse")}
          />
          <Button
            type="submit"
            variant="secondary"
            disabled={pin.length < PIN_MIN || update.isPending}
          >
            {settings.has_pin ? "Change PIN" : "Set PIN"}
          </Button>
          {settings.has_pin ? (
            <Button
              type="button"
              variant="ghost"
              danger
              onClick={() => update.mutate({ kiosk_pin: null })}
            >
              Remove PIN
            </Button>
          ) : null}
        </div>
        {pinNote ? (
          <p id={`${id}-pin-note`} className="text-refuse text-[11.5px]">
            {pinNote}
          </p>
        ) : null}
        <p className="text-ink-3 text-[11.5px]">
          Volunteers tap the corner of the kiosk screen and type it to see
          counts, reload, or unpair. Five wrong tries lock it for fifteen
          minutes.
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
  const online = kiosks.data?.filter((k) => k.online).length ?? 0;
  return (
    <FigurePanel className="overflow-hidden p-0">
      <div className="px-4 pt-4">
        <CardLabel
          right={
            kiosks.data?.length ? (
              <span className="text-ink-3 font-mono text-[11px]">
                {online} of {kiosks.data.length} online
              </span>
            ) : null
          }
        >
          Self check-in kiosks
        </CardLabel>
        <p className="text-ink-3 mt-1 text-[12px] leading-[1.5]">
          A tablet on a stand: a guest scans their ticket, sees their name, and
          takes their card. It needs no account, only the link you pair it
          with.
        </p>
      </div>
      {kiosks.isPending ? (
        <div className="p-4">
          <Skeleton className="h-14" />
        </div>
      ) : kiosks.isError ? (
        <EmptyState
          size="sm"
          title="Could not load the kiosks"
          description={kiosks.error.message}
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void kiosks.refetch()}
            >
              Try again
            </Button>
          }
        />
      ) : kiosks.data.length ? (
        <ul className="mt-2">
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
        <EmptyState
          size="sm"
          icon={<MonitorSmartphoneIcon />}
          title="No kiosk paired"
          description="Name the tablet below and pair it: it opens a link and becomes a self check-in station at its door."
        />
      )}
      <PairForm eventId={eventId} doors={doors} onPaired={setPaired} />
      {settings.data ? (
        <SelfCheckInSettings eventId={eventId} settings={settings.data} />
      ) : null}
      <PairedDialog paired={paired} onClose={() => setPaired(null)} />
    </FigurePanel>
  );
}
