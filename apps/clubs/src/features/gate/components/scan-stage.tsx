"use client";

import * as React from "react";
import { Button, toast } from "@moa/ui";
import { CameraIcon, CameraOffIcon, DoorClosedIcon, HandIcon, PrinterIcon, ScanLineIcon, WifiOffIcon } from "lucide-react";

import { PrintFrame, cardPdfUrl } from "@/features/idcards";

import { gateHeaders } from "../api";
import { afterHandover, OFFLINE_ADMISSION_NUMBER_CARD, OFFLINE_DESK_CARD, OFFLINE_NOT_A_TICKET_CARD, STATION_SAVED_CARD, UNVERIFIED_CARD, needsHandCheckIn, offlineRepeatCard, outcomeCard, stationOfflineRepeatCard, type OutcomeCardModel } from "../lib/outcome-copy";
import { cameraProblem, startScanner, type Scanner } from "../lib/scanner";
import { useCheckInByHand, useScanMutation, type Enqueue } from "../queries";
import { missingOf, newRef, type DoorPurpose, type GateContext, type ScanBody, type ScanResult } from "../schemas";
import { CaptureSheet } from "./capture-sheet";
import { MissingAnswersStrip } from "./missing-answers-sheet";
import { CameraWell, DOOR_FIELD, DOOR_LABEL, DoorBanner, DoorSpinner } from "./door-kit";
import { DeskRewards } from "./desk-rewards";
import { OutcomeCard } from "./outcome-card";

interface Props {
  gateKey: string | null;
  ctx: GateContext;
  door: string;
  online: boolean;
  enqueue: Enqueue;
  /**
   * What the door is for: null at an entrance (every door before quests, and
   * exactly today's behaviour), "station" (a scan records a visit) or
   * "swag_desk" (a scan shows the guest's quest rewards to hand over).
   */
  purpose?: DoorPurpose | null;
}

/** The words that change with what the door is for; an entrance's are the ones it always had. */
const STAGE_COPY: Record<"entrance" | DoorPurpose, { submit: string; busy: string; idle: string; idleNote: string }> = {
  entrance: { submit: "Check in", busy: "Checking…", idle: "Ready for the next guest", idleNote: "The verdict shows here the moment a ticket is read: welcome in, already in, not paid or the wrong event." },
  station: { submit: "Record visit", busy: "Recording…", idle: "Ready for the next visitor", idleNote: "Scan a guest's ticket and their visit here is recorded for the quest. Nobody is checked in at a station." },
  swag_desk: { submit: "Look up", busy: "Looking up…", idle: "Ready for the next guest", idleNote: "Scan a guest's ticket to see the rewards they unlocked, then hand them over. Nobody is checked in here." },
};

/**
 * Camera, typed code, and the outcome card — which must never obstruct the
 * next scan. On a phone the verdict sits above the camera; on a tablet the
 * camera keeps the left and the verdict takes the right.
 */
export function ScanStage({ gateKey, ctx, door, online, enqueue, purpose = null }: Props) {
  const scan = useScanMutation(gateKey, ctx.event.id, enqueue, purpose);
  const copy = STAGE_COPY[purpose ?? "entrance"];
  const byHand = useCheckInByHand(gateKey, ctx.event.id);
  const [card, setCard] = React.useState<{ model: OutcomeCardModel; response: ScanResult | null; captureAsk: boolean; n?: number } | null>(null);
  const [printing, setPrinting] = React.useState<string | null>(null);
  const printCard = React.useCallback(
    (registrationId: string, source: "checkin" | "manual") => setPrinting(cardPdfUrl(ctx.event.id, registrationId, { source, record: true, door })),
    [ctx.event.id, door]
  );
  const [code, setCode] = React.useState("");
  const [cameraOn, setCameraOn] = React.useState(false);
  const [cameraError, setCameraError] = React.useState<string | null>(null);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const scannerRef = React.useRef<Scanner | null>(null);
  const dismissTimer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Counts the server's answers: a swag desk's rewards start afresh from each one, even for the same guest.
  const answers = React.useRef(0);

  const show = React.useCallback(
    (r: ScanResult) => {
      clearTimeout(dismissTimer.current);
      const ask = r.capture.ask && !!r.attendee;
      answers.current += 1;
      setCard({ model: outcomeCard(r, door), response: r, captureAsk: ask, n: answers.current });
      // A first admission prints the card when the event says so.
      if (r.outcome === "CHECKED_IN" && r.badge.auto && r.attendee) printCard(r.attendee.id, "checkin");
      // Admissions clear themselves so the card never blocks the next scan; anything needing a decision stays.
      if (r.outcome === "CHECKED_IN" && !ask) dismissTimer.current = setTimeout(() => setCard(null), 7000);
      // So does a station's visit: the next visitor is already in the queue. A swag desk's rewards stay.
      if (r.outcome === "STATION_VISIT") dismissTimer.current = setTimeout(() => setCard(null), 5000);
    },
    [door, printCard]
  );

  const submit = React.useCallback(
    async (raw: string) => {
      const value = raw.trim();
      if (!value || scan.isPending) return;
      const body: ScanBody = { code: value, door, scanned_at: new Date().toISOString(), client_ref: newRef() };
      try {
        const res = await scan.mutateAsync(body);
        clearTimeout(dismissTimer.current);
        // No signal: these cards ask the volunteer to decide, so they stay until the next scan or a dismiss.
        if (res.kind === "queued") {
          setCard({ model: purpose === "station" ? STATION_SAVED_CARD : UNVERIFIED_CARD, response: null, captureAsk: false });
        } else if (res.kind === "offline-refused") {
          setCard({ model: res.reason === "admission-number" ? OFFLINE_ADMISSION_NUMBER_CARD : OFFLINE_NOT_A_TICKET_CARD, response: null, captureAsk: false });
        } else if (res.kind === "offline-repeat") {
          setCard({ model: purpose === "station" ? stationOfflineRepeatCard(res.earlier.queuedAt) : offlineRepeatCard(res.earlier.queuedAt), response: null, captureAsk: false });
        } else if (res.kind === "offline-desk") {
          setCard({ model: OFFLINE_DESK_CARD, response: null, captureAsk: false });
        } else {
          show(res.response);
        }
        setCode("");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "The scan failed");
      }
    },
    [door, purpose, scan, show]
  );

  /** An admission number's holder, confirmed by the volunteer: in by hand, as Find would. */
  const admitByHand = async (registrationId: string) => {
    try {
      show(await byHand.mutateAsync({ registrationId, door }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not check them in");
    }
  };

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

  const admitted = card?.response?.attendee && (card.response.outcome === "CHECKED_IN" || card.response.outcome === "ALREADY_CHECKED_IN") ? card.response.attendee : null;
  const mayPrint = admitted && card?.response?.badge.may_print;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-start lg:gap-5">
      {/* The door's hours are about admissions: a station or swag desk admits nobody. */}
      {!ctx.event.door_open && !purpose ? (
        <DoorBanner tone="caution" icon={<DoorClosedIcon />} title="Door shut" className="rounded-[var(--radius-card)] lg:col-span-2">
          {ctx.event.door_mode === "closed" ? "The organiser closed the door. Nobody can be checked in until it is opened under Team & doors." : "Outside the event's hours, so the door is shut. The organiser can open it under Team & doors."}
        </DoorBanner>
      ) : null}

      {printing ? <PrintFrame key={printing} url={printing} headers={gateHeaders(gateKey)} onDone={() => setTimeout(() => setPrinting(null), 4000)} /> : null}

      <div className={card ? "lg:order-2" : "hidden lg:order-2 lg:block"}>
        {card ? (
          <OutcomeCard card={card.model} onDismiss={() => setCard(null)}>
            {needsHandCheckIn(card.response) ? (
              <div className="border-line-soft flex flex-col gap-2 border-t px-4 py-3">
                <Button type="button" size="lg" className="w-full" disabled={byHand.isPending} onClick={() => void admitByHand(card.response!.attendee!.id)}>
                  <HandIcon />{" "}
                  {purpose === "station"
                    ? byHand.isPending
                      ? "Recording…"
                      : `Record ${card.response.attendee.name}'s visit by hand`
                    : purpose === "swag_desk"
                      ? byHand.isPending
                        ? "Looking up…"
                        : `Show ${card.response.attendee.name}'s rewards`
                      : byHand.isPending
                        ? "Checking them in…"
                        : `Check ${card.response.attendee.name} in by hand`}
                </Button>
                <Button type="button" size="lg" variant="secondary" className="w-full" onClick={() => setCard(null)}>
                  Not them — ask for the ticket code
                </Button>
              </div>
            ) : null}
            {card.response?.outcome === "SWAG_DESK" && card.response.swag && card.response.attendee ? (
              <DeskRewards
                key={`${card.response.attendee.id}-${card.n ?? 0}`}
                gateKey={gateKey}
                eventId={ctx.event.id}
                door={door}
                guest={card.response.attendee.name}
                rewards={card.response.swag.rewards}
                canHandOver={ctx.quests?.can_hand_over ?? ctx.permissions.merch}
                // The verdict above follows the handovers made here.
                onChange={(rewards) =>
                  setCard((c) => (c && c.response?.swag ? { ...c, model: afterHandover({ ...c.response, swag: { ...c.response.swag, rewards } }) } : c))
                }
              />
            ) : null}
            {mayPrint ? (
              <div className="border-line-soft border-t px-4 py-3">
                <Button type="button" variant="secondary" size="lg" onClick={() => printCard(card.response!.attendee!.id, "manual")}>
                  {/* The card printed at this admission counts too: the scan's answer predates it. */}
                  <PrinterIcon /> {card.response!.badge.printed_at || card.response!.badge.auto ? "Print the card again" : "Print their card"}
                </Button>
              </div>
            ) : null}
            {admitted && missingOf(admitted).length ? (
              <MissingAnswersStrip
                key={admitted.id}
                gateKey={gateKey}
                ctx={ctx}
                registrationId={admitted.id}
                name={admitted.name}
                missing={missingOf(admitted)}
                // Filling them holds the card: it would otherwise clear itself under the volunteer.
                onOpen={() => clearTimeout(dismissTimer.current)}
              />
            ) : null}
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
        ) : (
          <div className="border-line text-ink-3 flex min-h-[220px] flex-col items-center justify-center gap-2 rounded-[var(--radius-panel)] border border-dashed px-6 text-center">
            <ScanLineIcon aria-hidden="true" className="size-8" />
            <p className="text-ink-2 text-[15px] font-medium">{copy.idle}</p>
            <p className="max-w-[300px] text-[13px] leading-[1.5]">{copy.idleNote}</p>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4 lg:order-1">
        <CameraWell videoRef={videoRef} on={cameraOn} className="aspect-square">
          {cameraOn ? (
            <>
              <span className="bg-canvas/80 text-ink absolute top-3 left-3 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[12.5px] font-medium backdrop-blur-sm">
                <span aria-hidden="true" className="bg-admit size-2 rounded-full motion-safe:animate-pulse" />
                Scanning at {door}
              </span>
              <Button type="button" variant="secondary" size="lg" className="absolute top-3 right-3" onClick={() => (scannerRef.current?.stop(), setCameraOn(false))}>
                <CameraOffIcon /> Stop
              </Button>
              <span className="bg-canvas/80 text-ink-2 absolute inset-x-0 bottom-4 mx-auto w-fit rounded-full px-3.5 py-1.5 text-[13px] backdrop-blur-sm">
                {scan.isPending ? (
                  <span className="text-ink inline-flex items-center gap-2">
                    <DoorSpinner className="size-3.5" /> Checking the ticket…
                  </span>
                ) : (
                  "Hold the QR inside the frame"
                )}
              </span>
            </>
          ) : (
            <div className="px-6 text-center">
              <span aria-hidden="true" className={cameraError ? "border-refuse-line text-refuse mx-auto grid size-14 place-items-center rounded-full border" : "border-line text-ink-2 mx-auto grid size-14 place-items-center rounded-full border"}>
                {cameraError ? <CameraOffIcon className="size-6" /> : <CameraIcon className="size-6" />}
              </span>
              <p className="text-ink mt-3 text-[15px] font-medium">{cameraError ? "The camera did not start" : "Camera access needed to scan"}</p>
              <p className="text-ink-2 mx-auto mt-1.5 max-w-[280px] text-[13px] leading-[1.5]">{cameraError ?? "Your browser will ask once. You can always type the ticket code instead."}</p>
              <Button type="button" size="lg" className="mt-4" onClick={() => void startCamera()}>
                <CameraIcon /> {cameraError ? "Try the camera again" : "Start camera"}
              </Button>
            </div>
          )}
        </CameraWell>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit(code);
          }}
        >
          <label htmlFor="gate-code" className={DOOR_LABEL}>
            Or type the ticket code ({ctx.event.ticket_example})
          </label>
          <div className="flex gap-2">
            <input id="gate-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder={ctx.event.ticket_example} autoCapitalize="characters" autoCorrect="off" spellCheck={false} className={`${DOOR_FIELD} min-w-0 flex-1 font-mono uppercase`} />
            <Button type="submit" size="lg" disabled={!code.trim() || scan.isPending}>
              {scan.isPending ? copy.busy : copy.submit}
            </Button>
          </div>
        </form>
        {!online ? (
          <p className="text-caution flex items-center justify-center gap-2 text-[13px] font-medium">
            <WifiOffIcon aria-hidden="true" className="size-4" />{" "}
            {purpose === "station" ? "Offline — visits are saved on this phone and sent later" : purpose === "swag_desk" ? "Offline — rewards can’t be looked up or handed over" : "Offline — tickets can’t be checked; scans are saved on this phone"}
          </p>
        ) : null}
      </div>
    </div>
  );
}
