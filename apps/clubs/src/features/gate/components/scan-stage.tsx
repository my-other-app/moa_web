"use client";

import * as React from "react";
import { Button, cn, toast } from "@moa/ui";

import { outcomeCard, type OutcomeCardModel } from "../lib/outcome-copy";
import { cameraProblem, startScanner, type Scanner } from "../lib/scanner";
import { useScanMutation } from "../queries";
import { newRef, type GateContext, type ScanBody, type ScanResult } from "../schemas";
import { CaptureSheet } from "./capture-sheet";
import { OutcomeCard } from "./outcome-card";

interface Props {
  gateKey: string | null;
  ctx: GateContext;
  door: string;
  online: boolean;
  enqueue: (s: ScanBody) => Promise<void>;
}

const QUEUED: ScanResult = { outcome: "CHECKED_IN", attendee: null, checked_in_at: null, checked_in_by: null, other_event: null, revoked_at: null, capture: { ask: false, required: false, reason: "DISABLED" }, replayed: false };

/** Camera, typed code, and the outcome card — which must never obstruct the next scan. */
export function ScanStage({ gateKey, ctx, door, online, enqueue }: Props) {
  const scan = useScanMutation(gateKey, ctx.event.id, enqueue);
  const [card, setCard] = React.useState<{ model: OutcomeCardModel; response: ScanResult | null; captureAsk: boolean } | null>(null);
  const [code, setCode] = React.useState("");
  const [cameraOn, setCameraOn] = React.useState(false);
  const [cameraError, setCameraError] = React.useState<string | null>(null);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const scannerRef = React.useRef<Scanner | null>(null);
  const dismissTimer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const submit = React.useCallback(
    async (raw: string) => {
      const value = raw.trim();
      if (!value || scan.isPending) return;
      const body: ScanBody = { code: value, door, scanned_at: new Date().toISOString(), client_ref: newRef() };
      try {
        const res = await scan.mutateAsync(body);
        clearTimeout(dismissTimer.current);
        if (res.kind === "queued") {
          setCard({ model: outcomeCard(QUEUED, door, true), response: null, captureAsk: false });
          dismissTimer.current = setTimeout(() => setCard(null), 6000);
        } else {
          const r = res.response;
          const ask = r.capture.ask && !!r.attendee;
          setCard({ model: outcomeCard(r, door), response: r, captureAsk: ask });
          // Admissions clear themselves so the card never blocks the next scan; anything needing a decision stays.
          if (r.outcome === "CHECKED_IN" && !ask) dismissTimer.current = setTimeout(() => setCard(null), 7000);
        }
        setCode("");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "The scan failed");
      }
    },
    [door, scan]
  );

  const startCamera = async () => {
    setCameraError(null);
    try {
      setCameraOn(true);
      await new Promise((r) => setTimeout(r, 30));
      scannerRef.current = await startScanner(videoRef.current!, (c) => void submit(c));
    } catch (err) {
      setCameraOn(false);
      setCameraError(cameraProblem(err));
    }
  };
  React.useEffect(() => () => scannerRef.current?.stop(), []);

  return (
    <div className="flex flex-col gap-3.5">
      {!ctx.event.door_open ? (
        <div role="status" className="rounded-xl border border-amber-500/60 bg-amber-500/10 px-4 py-3 text-[13px] text-amber-700 dark:text-amber-300">
          <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.1em]">Door shut · </span>
          {ctx.event.door_mode === "closed" ? "The organiser closed the door. Nobody can be checked in until it is opened under Team & doors." : "Outside the event's hours, so the door is shut. The organiser can open it under Team & doors."}
        </div>
      ) : null}

      {card ? (
        <OutcomeCard card={card.model} onDismiss={() => setCard(null)}>
          {card.captureAsk && card.response ? (
            <CaptureSheet
              gateKey={gateKey}
              eventId={ctx.event.id}
              response={card.response}
              required={card.response.capture.required}
              onSkip={() => setCard(null)}
              onSaved={(phone, shared) => {
                setCard({ model: { tone: "admit", tag: "Number saved", title: `Saved — ${card.response!.attendee!.name} is reachable tonight.`, sub: `${phone} · ON THEIR RECORD`, note: shared.length ? `${shared.join(", ")} already gave this number. A couple sharing one phone is normal — saved anyway.` : undefined }, response: null, captureAsk: false });
                dismissTimer.current = setTimeout(() => setCard(null), 4500);
              }}
            />
          ) : null}
        </OutcomeCard>
      ) : null}

      <div className="relative flex aspect-square items-center justify-center overflow-hidden rounded-xl bg-[#0A0C0B]">
        <video ref={videoRef} playsInline muted className={cameraOn ? "absolute inset-0 size-full object-cover" : "hidden"} />
        {cameraOn ? (
          <>
            <div aria-hidden className="absolute left-1/2 top-1/2 aspect-square w-[58%] -translate-x-1/2 -translate-y-1/2 rounded-md shadow-[0_0_0_9999px_rgba(10,12,11,0.55)]">
              {["top-0 left-0 border-t-[3px] border-l-[3px] rounded-tl-md", "top-0 right-0 border-t-[3px] border-r-[3px] rounded-tr-md", "bottom-0 left-0 border-b-[3px] border-l-[3px] rounded-bl-md", "bottom-0 right-0 border-b-[3px] border-r-[3px] rounded-br-md"].map((c) => (
                <span key={c} className={`absolute size-[26px] border-[#E6F1EA] ${c}`} />
              ))}
            </div>
            <div className="absolute inset-x-0 bottom-3.5 text-center font-mono text-[11px] tracking-[0.09em] text-[#A3A9A4]">HOLD THE QR IN THE FRAME</div>
            <button type="button" onClick={() => (scannerRef.current?.stop(), setCameraOn(false))} className="absolute right-3 top-3 rounded-full border border-white/20 px-2.5 py-1 font-mono text-[10px] text-white/80">
              STOP
            </button>
          </>
        ) : (
          <div className="px-6 text-center">
            <div aria-hidden className="mx-auto mb-3 size-[34px] rounded-full border-2 border-[#3A403D]" />
            <div className="text-[13.5px] text-[#C7CCC8]">{cameraError ?? "Camera access needed to scan"}</div>
            {!cameraError ? <div className="mx-auto mt-1.5 max-w-[230px] font-mono text-[11.5px] leading-[1.5] text-[#71776F]">Your browser will ask once. You can always type the code instead.</div> : null}
            <button type="button" onClick={() => void startCamera()} className="mt-3.5 min-h-12 rounded-lg bg-[#57C48C] px-5 text-[14px] font-medium text-[#06190E]">
              Start camera
            </button>
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit(code);
        }}
      >
        <label htmlFor="gate-code" className="mb-1.5 block font-mono text-[9px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
          Or type the code under the QR
        </label>
        <div className="flex gap-1.5">
          <input id="gate-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder={ctx.event.ticket_example} autoCapitalize="characters" autoCorrect="off" spellCheck={false} className="h-12 min-w-0 flex-1 rounded-md border bg-muted/40 px-3 font-mono text-[15px] uppercase" />
          <Button type="submit" className={cn("h-12 px-5")} disabled={!code.trim() || scan.isPending}>
            Check in
          </Button>
        </div>
      </form>
      {!online ? <p className="text-center font-mono text-[10.5px] tracking-[0.06em] text-amber-600">OFFLINE · SCANS ARE SAVED ON THIS PHONE</p> : null}
    </div>
  );
}
