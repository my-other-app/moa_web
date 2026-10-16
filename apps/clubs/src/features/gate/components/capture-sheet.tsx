"use client";

import * as React from "react";
import { Button, cn, toast } from "@moa/ui";

import { useCaptureContact } from "../queries";
import type { ScanResult } from "../schemas";

/**
 * Door capture. The scan is already recorded — this can never block, slow
 * or fail an admission. Skip is one tap, always present, never recorded.
 */
export function CaptureSheet({ gateKey, eventId, response, required, onSaved, onSkip }: { gateKey: string | null; eventId: number; response: ScanResult; required: boolean; onSaved: (phone: string, shared: string[]) => void; onSkip: () => void }) {
  const [phone, setPhone] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const capture = useCaptureContact(gateKey, eventId);
  const attendee = response.attendee!;
  const save = async () => {
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 6) {
      setError("That number looks too short. Check it — their check-in is already recorded either way.");
      return;
    }
    setError(null);
    try {
      const res = await capture.mutateAsync({ registrationId: attendee.id, phone: phone.trim() });
      onSaved(res.phone, res.shared_with);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the number");
    }
  };
  return (
    <div className="border-t border-current/30 bg-card px-4 py-3.5 text-foreground">
      <div className="mb-2.5 font-mono text-[9px] font-medium tracking-[0.1em] text-muted-foreground">{required ? "A NUMBER IS REQUIRED AT THIS DOOR" : "THEY’RE ALREADY IN — ASK IF YOU CAN"}</div>
      <label htmlFor="capture-phone" className="mb-1.5 block text-[12px] text-muted-foreground">
        Mobile number
      </label>
      <input id="capture-phone" type="tel" inputMode="tel" autoComplete="off" placeholder="+91 98765 43210" value={phone} onChange={(e) => (setPhone(e.target.value), setError(null))} aria-invalid={!!error} className={cn("h-12 w-full rounded-md border bg-muted/40 px-3 font-mono text-[15px]", error && "border-destructive")} />
      {error ? <p className="mt-1.5 text-[12.5px] text-destructive">{error}</p> : null}
      <div className="mt-3 flex gap-2">
        <Button size="lg" type="button" className="flex-1" disabled={capture.isPending} onClick={() => void save()}>
          Save
        </Button>
        <Button type="button" variant="outline" className="basis-[110px]" onClick={onSkip} size="lg">
          Skip
        </Button>
      </div>
      <p className="mt-2 text-[11.5px] leading-[1.5] text-muted-foreground">Skipping is one tap and is never recorded. Nothing about their admission depends on this.</p>
    </div>
  );
}
