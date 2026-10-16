"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import QRCode from "qrcode";
import { ApiError } from "@moa/api";
import { Button, cn, toast } from "@moa/ui";
import { CameraIcon, CameraOffIcon, DoorClosedIcon, LockIcon, MonitorSmartphoneIcon, PrinterIcon, RefreshCwIcon, ServerCrashIcon, UnplugIcon } from "lucide-react";

import { PrintFrame } from "@/features/idcards";
import { CameraWell, DOOR_FIELD, brandOnDark, DoorBanner, DoorCount, DoorProgress, DoorSpinner, TONE_ICON, TONE_SOFT, TONE_SOLID, cameraProblem, startScanner, type DoorTone, type Scanner } from "@/features/gate";

import {
  KIOSK_TOKEN_STORAGE,
  kioskCardUrl,
  kioskSelfCardUrl,
  kioskStaff,
  markSelfPrinted,
  notMe,
  redeemAtKiosk,
} from "../api";
import { useKioskContext, useSelfQr } from "../queries";
import { AgendaCycle } from "./agenda-cycle";
import {
  newRef,
  type KioskContext,
  type RedeemResult,
  type StaffInfo,
} from "../schemas";

type Step = "attract" | "result";
const DONE_RESET_S = 10;
const NOT_ME_S = 60;

const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* private mode */
  }
};

/**
 * The kiosk: one long-lived screen a guest walks up to. Scan a ticket (or
 * type the code), see your name, take your card, done. Opened with a device
 * token from the pairing link; the token stays on the tablet.
 *
 * It is a lit screen in a lobby, so it always renders on Meridian's dark
 * scale, whatever the tablet's own setting.
 */
export function KioskApp() {
  const params = useSearchParams();
  const [token, setToken] = React.useState<string | null>(
    () => params.get("token") || read(KIOSK_TOKEN_STORAGE),
  );
  React.useEffect(() => {
    const fromUrl = params.get("token");
    if (fromUrl) {
      write(KIOSK_TOKEN_STORAGE, fromUrl);
      window.history.replaceState(null, "", "/kiosk");
    }
  }, [params]);
  const ctx = useKioskContext(token);
  if (
    !token ||
    (ctx.isError && ctx.error instanceof ApiError && ctx.error.status === 401)
  ) {
    return (
      <Shell>
        <KioskNotice
          icon={<MonitorSmartphoneIcon />}
          title="This kiosk is not paired"
          action={
            token ? (
              <Button
                variant="secondary"
                size="lg"
                onClick={() => (write(KIOSK_TOKEN_STORAGE, null), setToken(null))}
              >
                Forget this pairing
              </Button>
            ) : null
          }
        >
          Pair it from the event&apos;s Team &amp; doors page: a link opens
          here with the device token. A token lasts one shift; the organiser
          can make a new one.
        </KioskNotice>
      </Shell>
    );
  }
  if (ctx.isPending)
    return (
      <Shell>
        <KioskNotice icon={<DoorSpinner className="size-6" />} title="Opening the kiosk…" />
      </Shell>
    );
  if (ctx.isError)
    return (
      <Shell>
        <KioskNotice
          tone="refuse"
          icon={<ServerCrashIcon />}
          title="The kiosk could not open"
          action={
            <Button size="lg" onClick={() => void ctx.refetch()} disabled={ctx.isFetching}>
              <RefreshCwIcon className={cn(ctx.isFetching && "animate-spin motion-reduce:animate-none")} />
              {ctx.isFetching ? "Trying…" : "Try again"}
            </Button>
          }
        >
          {ctx.error.message}
        </KioskNotice>
      </Shell>
    );
  return (
    <Kiosk
      token={token}
      ctx={ctx.data}
      onUnpair={() => (write(KIOSK_TOKEN_STORAGE, null), setToken(null))}
    />
  );
}

/**
 * The dark scale for everything inside, from Meridian's own `.dark` tokens;
 * with an event, its colour as the brand (`brandOnDark`).
 */
const Shell = ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) => (
  <div data-slot="kiosk" style={style} className="dark bg-canvas text-ink min-h-dvh">
    {children}
  </div>
);

/** A whole-screen state: not paired, opening, could not open. */
function KioskNotice({
  icon,
  title,
  tone,
  action,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  tone?: DoorTone;
  action?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-6 py-16">
      <div className="bg-surface border-line-soft shadow-floating w-full max-w-md rounded-[var(--radius-sheet)] border p-8 text-center">
        <span
          aria-hidden="true"
          className={cn(
            "mx-auto grid size-14 place-items-center rounded-full border [&>svg]:size-6",
            tone ? TONE_SOFT[tone] : "bg-sunken border-line-soft text-ink-2",
          )}
        >
          {icon}
        </span>
        <h1 className="text-ink mt-4 text-[26px] leading-tight font-semibold tracking-[-0.02em]">
          {title}
        </h1>
        {children ? (
          <p className="text-ink-2 mt-2 text-[15px] leading-[1.55]">{children}</p>
        ) : null}
        {action ? <div className="mt-6">{action}</div> : null}
      </div>
    </main>
  );
}

/** What the result screen says, by outcome: a tone, a verdict, a line, what to do. */
function verdictOf(result: RedeemResult | null): {
  tone: DoorTone;
  verdict: string;
  title: string;
  detail: string;
} {
  const g = result?.guest;
  if (result?.outcome === "MATCHED" && g)
    return g.already_checked_in
      ? { tone: "caution", verdict: "Already checked in", title: `Welcome back, ${g.first_name}.`, detail: `${g.display_name} · ${g.role_label} · ${g.ticket_id}` }
      : { tone: "admit", verdict: "Welcome", title: `Welcome in, ${g.first_name}.`, detail: `${g.display_name} · ${g.role_label} · ${g.ticket_id}` };
  const desk = "A volunteer at the desk can sort it out in a moment.";
  switch (result?.outcome) {
    case "WRONG_EVENT":
      return { tone: "refuse", verdict: "Wrong event", title: "That ticket is for another event.", detail: result.other_event ? `It is a valid ticket for ${result.other_event.name}.` : desk };
    case "REVOKED":
      return { tone: "refuse", verdict: "Cancelled", title: "This ticket was cancelled.", detail: desk };
    case "UNPAID":
      return { tone: "refuse", verdict: "Not paid", title: "This ticket has not been paid for.", detail: desk };
    case "EVENT_NOT_OPEN":
      return { tone: "caution", verdict: "Doors not open", title: "The doors are not open yet.", detail: desk };
    default:
      return { tone: "refuse", verdict: "Not recognised", title: "That code was not recognised.", detail: desk };
  }
}

function Kiosk({
  token,
  ctx,
  onUnpair,
}: {
  token: string;
  ctx: KioskContext;
  onUnpair: () => void;
}) {
  const [step, setStep] = React.useState<Step>("attract");
  const [result, setResult] = React.useState<RedeemResult | null>(null);
  const [printing, setPrinting] = React.useState<string | null>(null);
  const [printingSession, setPrintingSession] = React.useState<string | null>(
    null,
  );
  const [cameraOn, setCameraOn] = React.useState(false);
  const [cameraError, setCameraError] = React.useState<string | null>(null);
  const [code, setCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [staff, setStaff] = React.useState<StaffInfo | null>(null);
  const [pinOpen, setPinOpen] = React.useState(false);
  const [pin, setPin] = React.useState("");
  const [left, setLeft] = React.useState(DONE_RESET_S);
  const [notMeLeft, setNotMeLeft] = React.useState(0);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const scannerRef = React.useRef<Scanner | null>(null);
  const selfQr = useSelfQr(token, ctx.self_check_in.self_check_in_enabled);
  const [selfPng, setSelfPng] = React.useState<string | null>(null);
  const printedSessions = React.useRef(new Set<string>());

  // The self check-in QR, redrawn when the server rotates it. Black on white: the code must scan.
  React.useEffect(() => {
    const url = selfQr.data?.url;
    if (!url) return;
    let alive = true;
    QRCode.toDataURL(url, { margin: 1, width: 360 })
      .then((d) => alive && setSelfPng(d))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [selfQr.data?.url]);

  // A phone that tapped print: the kiosk prints it, once.
  React.useEffect(() => {
    const pending = selfQr.data?.recent.find(
      (r) => r.print_requested && !printedSessions.current.has(r.session),
    );
    if (!pending || printing) return;
    printedSessions.current.add(pending.session);
    setPrintingSession(pending.session);
    setPrinting(kioskSelfCardUrl(token, pending.session));
  }, [selfQr.data, printing, token]);

  const reset = React.useCallback(() => {
    setStep("attract");
    setResult(null);
    setCode("");
    setLeft(DONE_RESET_S);
    setNotMeLeft(0);
  }, []);

  // The result screen clears itself so the next guest finds the scanner.
  React.useEffect(() => {
    if (step !== "result") return;
    const t = setInterval(
      () => setLeft((n) => (n <= 1 ? (reset(), DONE_RESET_S) : n - 1)),
      1000,
    );
    return () => clearInterval(t);
  }, [step, reset]);
  React.useEffect(() => {
    if (notMeLeft <= 0) return;
    const t = setTimeout(() => setNotMeLeft((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [notMeLeft]);

  const submit = React.useCallback(
    async (raw: string) => {
      const value = raw.trim();
      if (!value || busy) return;
      setBusy(true);
      try {
        const r = await redeemAtKiosk(token, value, newRef());
        setResult(r);
        setStep("result");
        setLeft(r.outcome === "MATCHED" ? 25 : DONE_RESET_S);
        setNotMeLeft(
          r.outcome === "MATCHED" && !r.guest?.already_checked_in
            ? NOT_ME_S
            : 0,
        );
        if (r.outcome === "MATCHED" && r.auto_print && r.print_url)
          setPrinting(kioskCardUrl(token, r.print_url));
        setCode("");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "The scan failed");
      } finally {
        setBusy(false);
      }
    },
    [busy, token],
  );

  const startCamera = async () => {
    setCameraError(null);
    try {
      setCameraOn(true);
      await new Promise((r) => setTimeout(r, 30));
      // A kiosk faces the guest, so the camera looking at them is the front one.
      scannerRef.current = await startScanner(
        videoRef.current!,
        (c) => void submit(c),
        "user",
      );
    } catch (err) {
      setCameraOn(false);
      setCameraError(cameraProblem(err));
    }
  };
  React.useEffect(() => () => scannerRef.current?.stop(), []);

  const printAgain = () => {
    if (result?.print_url) setPrinting(kioskCardUrl(token, result.print_url));
  };
  const undo = async () => {
    if (!result?.redemption_token) return;
    try {
      await notMe(token, result.redemption_token);
      toast.success("That check-in was taken back.");
      reset();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not undo");
    }
  };
  const openStaff = async () => {
    try {
      setStaff(await kioskStaff(token, pin));
      setPinOpen(false);
      setPin("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Wrong PIN");
    }
  };
  const g = result?.guest;
  // The club's colour on the buttons, the accents and the agenda; never on a verdict.
  const brand = brandOnDark(ctx.event.brand_primary);
  const v = verdictOf(result);
  const VerdictIcon = TONE_ICON[v.tone];
  const place = [ctx.event.org_name, ctx.device.door].filter(Boolean).join(" · ");

  return (
    <Shell style={brand}>
      {printing ? (
        <PrintFrame
          key={printing}
          url={printing}
          onDone={() => {
            // The phone is polling: tell it the card is out, then free the frame for the next one.
            if (printingSession)
              void markSelfPrinted(token, printingSession).catch(
                () => undefined,
              );
            setPrintingSession(null);
            setTimeout(() => setPrinting(null), 6000);
          }}
        />
      ) : null}
      <header className="bg-surface border-line-soft border-b">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-6 py-4">
          <span aria-hidden="true" className="bg-brand size-3 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1">
            <p className="text-ink truncate text-[18px] leading-[1.3] font-semibold tracking-[-0.01em]">
              {ctx.event.name}
            </p>
            <p className="text-ink-3 truncate text-[13.5px]">{place}</p>
          </div>
          <DoorCount
            checkedIn={ctx.counters.checked_in}
            registered={ctx.counters.registered}
            size="lg"
          />
          <Button
            type="button"
            variant="quiet"
            size="lg"
            onClick={() => setPinOpen(true)}
          >
            <LockIcon /> Staff
          </Button>
        </div>
        <DoorProgress
          checkedIn={ctx.counters.checked_in}
          registered={ctx.counters.registered}
        />
      </header>

      {!ctx.event.door_open ? (
        <div className={cn("border-b", TONE_SOFT.caution)}>
          <DoorBanner
            tone="caution"
            icon={<DoorClosedIcon />}
            title="The doors are not open yet"
            className="mx-auto max-w-5xl border-0 px-6"
          >
            Please wait, or see the desk.
          </DoorBanner>
        </div>
      ) : null}

      {step === "attract" ? (
        <main
          className={cn(
            "mx-auto grid max-w-5xl gap-8 px-6 py-8",
            selfQr.data?.enabled ? "lg:grid-cols-[3fr_2fr]" : "max-w-2xl",
          )}
        >
          <section className="space-y-5">
            <div>
              <p className="text-brand text-[15px] font-semibold">Self check-in</p>
              <h1 className="text-ink mt-1 text-[40px] leading-tight font-semibold tracking-[-0.025em]">
                Scan your ticket
              </h1>
              <p className="text-ink-2 mt-1.5 text-[17px] leading-[1.5]">
                Hold the QR on your ticket up to the camera. Your name comes up,
                and your card prints here.
              </p>
            </div>
            <CameraWell
              videoRef={videoRef}
              on={cameraOn}
              frame={46}
              className="aspect-[4/3]"
              style={brand}
            >
              {cameraOn ? (
                <span className="bg-canvas/80 text-ink absolute inset-x-0 bottom-5 mx-auto w-fit rounded-full px-4 py-2 text-[15px] backdrop-blur-sm">
                  {busy ? (
                    <span className="inline-flex items-center gap-2">
                      <DoorSpinner /> Checking your ticket…
                    </span>
                  ) : (
                    "Hold the QR inside the frame"
                  )}
                </span>
              ) : (
                <div className="px-6 text-center">
                  <span
                    aria-hidden="true"
                    className={cn(
                      "mx-auto grid size-16 place-items-center rounded-full border",
                      cameraError
                        ? "border-refuse-line text-refuse"
                        : "border-line text-ink-2",
                    )}
                  >
                    {cameraError ? (
                      <CameraOffIcon className="size-7" />
                    ) : (
                      <CameraIcon className="size-7" />
                    )}
                  </span>
                  <p className="text-ink-2 mx-auto mt-3 max-w-[360px] text-[15px] leading-[1.5]">
                    {cameraError ?? "The camera is off"}
                  </p>
                  <Button
                    type="button"
                    size="lg"
                    className="mt-4"
                    onClick={() => void startCamera()}
                  >
                    <CameraIcon /> Start camera
                  </Button>
                </div>
              )}
            </CameraWell>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void submit(code);
              }}
              className="flex gap-2"
            >
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Or type the code under the QR"
                aria-label="Ticket code"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                className={cn(
                  DOOR_FIELD,
                  "min-w-0 flex-1 font-mono text-[18px] uppercase placeholder:font-sans placeholder:text-[16px] placeholder:normal-case",
                )}
              />
              <Button type="submit" size="lg" disabled={!code.trim() || busy}>
                {busy ? "Checking…" : "Check in"}
              </Button>
            </form>
          </section>
          {selfQr.data?.enabled && selfPng ? (
            <aside className="bg-surface border-brand-line flex flex-col items-center gap-3 self-start rounded-[var(--radius-sheet)] border p-6 text-center">
              <h2 className="text-ink text-[22px] font-semibold tracking-[-0.015em]">
                No ticket handy?
              </h2>
              <p className="text-ink-2 text-[15px] leading-[1.5]">
                Scan this with your phone and check in with your name
                {selfQr.data.verify === "email"
                  ? " and a code we email you"
                  : ""}
                .
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={selfPng}
                alt="QR code for checking in from your phone"
                className="size-56 rounded-xl bg-white p-2"
              />
              {selfQr.data.recent.length ? (
                <div className="w-full text-left">
                  <p className="eyebrow mt-2 mb-1.5">Just checked in</p>
                  <ul className="divide-line-soft divide-y">
                    {selfQr.data.recent.slice(0, 4).map((r) => (
                      <li
                        key={r.session}
                        className="flex items-center justify-between gap-3 py-2 text-[14px]"
                      >
                        <span className="text-ink truncate">{r.name}</span>
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-2.5 py-0.5 text-[12px] font-medium",
                            r.print_requested
                              ? "bg-info-soft text-info"
                              : "bg-admit-soft text-admit",
                          )}
                        >
                          {r.print_requested ? "Printing…" : "Checked in"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </aside>
          ) : null}
        </main>
      ) : (
        <main
          className="mx-auto flex max-w-2xl flex-col items-center px-6 py-12 text-center"
          role="status"
          aria-live="assertive"
        >
          <span
            aria-hidden="true"
            className={cn(
              "grid size-24 place-items-center rounded-full",
              TONE_SOLID[v.tone],
            )}
          >
            <VerdictIcon className="size-12" />
          </span>
          <span
            className={cn(
              "mt-6 rounded-full border px-3.5 py-1 text-[15px] font-semibold",
              TONE_SOFT[v.tone],
            )}
          >
            {v.verdict}
          </span>
          <h1 className="text-ink mt-3 text-[44px] leading-tight font-semibold tracking-[-0.025em]">
            {v.title}
          </h1>
          <p className="text-ink-2 mt-2 text-[18px] leading-[1.5]">{v.detail}</p>
          {result?.outcome === "MATCHED" && g ? (
            <>
              {printing ? (
                <>
                  <p className="bg-info-soft text-info border-info-line mt-6 inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[16px] font-medium">
                    <PrinterIcon aria-hidden="true" className="size-5" />
                    Printing your card…
                  </p>
                  {ctx.agenda.length ? <AgendaCycle items={ctx.agenda} /> : null}
                </>
              ) : result.print_url && g.may_print ? (
                <Button
                  type="button"
                  size="lg"
                  className="mt-6"
                  onClick={printAgain}
                >
                  <PrinterIcon />
                  {g.has_card ? "Print my card again" : "Print my card"}
                </Button>
              ) : null}
              {notMeLeft > 0 && !g.already_checked_in ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="lg"
                  className="mt-6"
                  onClick={() => void undo()}
                >
                  This isn&apos;t me ({notMeLeft}s)
                </Button>
              ) : null}
            </>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            size="lg"
            className="mt-10"
            onClick={reset}
          >
            Done · back in {left}s
          </Button>
        </main>
      )}

      {pinOpen ? (
        <div className="bg-canvas/80 fixed inset-0 z-20 flex items-center justify-center p-6 backdrop-blur-sm">
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="kiosk-pin-title"
            onSubmit={(e) => {
              e.preventDefault();
              void openStaff();
            }}
            className="bg-surface border-line shadow-floating w-full max-w-sm space-y-4 rounded-[var(--radius-sheet)] border p-6"
          >
            <div>
              <h2
                id="kiosk-pin-title"
                className="text-ink text-[20px] font-semibold"
              >
                Staff mode
              </h2>
              <p className="text-ink-2 mt-1 text-[14px] leading-[1.5]">
                The event PIN opens the counts, a reload and unpairing.
              </p>
            </div>
            <input
              autoFocus
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="Event PIN"
              aria-label="Event PIN"
              className={cn(DOOR_FIELD, "font-mono text-[20px] tracking-[0.3em] placeholder:tracking-normal")}
            />
            <div className="flex gap-2">
              <Button type="submit" size="lg" className="flex-1">
                Open
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="lg"
                className="flex-1"
                onClick={() => (setPinOpen(false), setPin(""))}
              >
                Cancel
              </Button>
            </div>
          </form>
        </div>
      ) : null}
      {staff ? (
        <div className="bg-canvas/80 fixed inset-0 z-20 flex items-center justify-center p-6 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="kiosk-staff-title"
            className="bg-surface border-line shadow-floating w-full max-w-md space-y-5 rounded-[var(--radius-sheet)] border p-6"
          >
            <div>
              <p className="eyebrow">Staff mode</p>
              <h2
                id="kiosk-staff-title"
                className="text-ink mt-1 text-[20px] font-semibold"
              >
                {staff.device.name}
              </h2>
            </div>
            <dl className="grid grid-cols-3 gap-2">
              {[
                { k: "Checked in here", v: String(staff.checked_in_here) },
                { k: "Checked in, all doors", v: `${staff.counters.checked_in} / ${staff.counters.registered}` },
                { k: "Cards printed today", v: String(staff.printed_today) },
              ].map((s) => (
                <div key={s.k} className="bg-sunken rounded-[var(--radius-card)] px-3 py-3">
                  <dt className="text-ink-3 text-[12px] leading-[1.35]">{s.k}</dt>
                  <dd className="text-ink mt-1.5 font-mono text-[20px] leading-none tabular-nums">{s.v}</dd>
                </div>
              ))}
            </dl>
            <div className="flex flex-col gap-2">
              <Button
                type="button"
                variant="secondary"
                size="lg"
                onClick={() => window.location.reload()}
              >
                <RefreshCwIcon /> Reload the screen
              </Button>
              <Button
                type="button"
                variant="secondary"
                danger
                size="lg"
                onClick={onUnpair}
              >
                <UnplugIcon /> Unpair this kiosk
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="lg"
                onClick={() => setStaff(null)}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </Shell>
  );
}
