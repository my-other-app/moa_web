"use client";

import * as React from "react";
import { Button, cn, toast } from "@moa/ui";
import { PhoneIcon } from "lucide-react";

import { useCaptureContact } from "../queries";
import type { ScanResult } from "../schemas";
import { DOOR_FIELD, DOOR_LABEL } from "./door-kit";

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
    <div className="border-line-soft bg-sunken text-ink border-t px-4 py-4">
      <p className={cn("mb-3 flex items-center gap-2 text-[13.5px] font-semibold", required ? "text-caution" : "text-ink")}>
        <PhoneIcon aria-hidden="true" className="size-4" />
        {required ? "A number is required at this door" : "They’re already in — ask if you can"}
      </p>
      <label htmlFor="capture-phone" className={DOOR_LABEL}>
        Mobile number
      </label>
      <input
        id="capture-phone"
        type="tel"
        inputMode="tel"
        autoComplete="off"
        placeholder="+91 98765 43210"
        value={phone}
        onChange={(e) => (setPhone(e.target.value), setError(null))}
        aria-invalid={!!error}
        aria-describedby={error ? "capture-phone-error" : undefined}
        className={cn(DOOR_FIELD, "font-mono", error && "border-refuse")}
      />
      {error ? (
        <p id="capture-phone-error" className="text-refuse mt-1.5 text-[13px]">
          {error}
        </p>
      ) : null}
      <div className="mt-3 flex gap-2">
        <Button size="lg" type="button" className="flex-1" disabled={capture.isPending} onClick={() => void save()}>
          {capture.isPending ? "Saving…" : "Save"}
        </Button>
        <Button type="button" variant="secondary" className="basis-[110px]" onClick={onSkip} size="lg">
          Skip
        </Button>
      </div>
      <p className="text-ink-3 mt-2.5 text-[12.5px] leading-[1.5]">Skipping is one tap and is never recorded. Nothing about their admission depends on this.</p>
    </div>
  );
}
