"use client";

import * as React from "react";
import { ApiError } from "@moa/api";
import { Button, ChoiceCard, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, toast } from "@moa/ui";
import { PrinterIcon } from "lucide-react";

import { NO_PRINTER, REPRINT_NOT_ALLOWED, stationWords, type PrintRequest } from "../schemas";

type Way = "station" | "here";

/**
 * Where to print one guest's card: the print station (the default, when one is online) or this
 * computer. A refused reprint says why; someone who may override can confirm it and send the
 * card anyway. `send` is the one call that differs between the dashboard and the door console.
 */
export function PrintChoice({
  name,
  open,
  onClose,
  send,
  onLocal,
  canOverride = true,
  localLabel = "Print on this computer",
}: {
  name: string;
  open: boolean;
  onClose: () => void;
  send: (override: boolean) => Promise<PrintRequest>;
  /** Print here, the way it was done before print stations. */
  onLocal: () => void;
  /** Whether the person at this screen may confirm a reprint the rule refuses. */
  canOverride?: boolean;
  localLabel?: string;
}) {
  const [way, setWay] = React.useState<Way>("station");
  const [busy, setBusy] = React.useState(false);
  // A refused reprint waiting for a yes, or a problem to read; cleared whenever the choice changes.
  const [refusal, setRefusal] = React.useState<{ message: string; code: string | null } | null>(null);

  const go = async (override: boolean) => {
    if (way === "here") {
      onLocal();
      onClose();
      return;
    }
    setBusy(true);
    setRefusal(null);
    try {
      const sent = await send(override);
      const where = sent ? stationWords(sent) : null;
      toast.success(where ? `${name}'s card was sent. ${where}.` : `${name}'s card was sent to the print station.`);
      onClose();
    } catch (err) {
      const code = err instanceof ApiError ? err.errorCode : null;
      setRefusal({ message: err instanceof Error && err.message ? err.message : "The card could not be sent. Try again.", code });
    } finally {
      setBusy(false);
    }
  };

  const askOverride = refusal?.code === REPRINT_NOT_ALLOWED && canOverride;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Print {name}&apos;s ID card</DialogTitle>
          <DialogDescription>Choose where the card prints.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2" role="radiogroup" aria-label="Where to print">
          <ChoiceCard
            checked={way === "station"}
            onClick={() => (setWay("station"), setRefusal(null))}
            title="Send to the print station"
            hint="It prints on its own at the station; nobody has to click."
            className="min-h-14"
          />
          <ChoiceCard checked={way === "here"} onClick={() => (setWay("here"), setRefusal(null))} title={localLabel} hint="Opens the print dialog on this screen." className="min-h-14" />
        </div>
        {refusal ? (
          <div role="alert" className="border-refuse-line bg-refuse-soft text-refuse rounded-[var(--radius-card)] border px-3 py-2.5 text-[13px] leading-[1.5]">
            <p>{refusal.message}</p>
            {askOverride ? <p className="mt-1">Print it again anyway? It will be recorded as a reprint.</p> : null}
            {refusal.code === NO_PRINTER ? <p className="mt-1">You can print on this computer instead.</p> : null}
          </div>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="secondary" size="lg" className="min-h-14" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          {askOverride ? (
            <Button type="button" size="lg" className="min-h-14" disabled={busy} onClick={() => void go(true)}>
              <PrinterIcon /> {busy ? "Sending…" : "Print it again anyway"}
            </Button>
          ) : (
            <Button type="button" size="lg" className="min-h-14" disabled={busy} onClick={() => void go(false)}>
              <PrinterIcon /> {busy ? "Sending…" : way === "station" ? "Send to the print station" : "Print"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
