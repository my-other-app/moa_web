"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import QRCode from "qrcode";
import { ApiError } from "@moa/api";
import { Button, cn, toast } from "@moa/ui";

import { PrintFrame } from "@/features/idcards";
import { cameraProblem, startScanner, type Scanner } from "@/features/gate";

import { KIOSK_TOKEN_STORAGE, kioskCardUrl, kioskSelfCardUrl, kioskStaff, markSelfPrinted, notMe, redeemAtKiosk } from "../api";
import { useKioskContext, useSelfQr } from "../queries";
import { AgendaCycle } from "./agenda-cycle";
import { newRef, type KioskContext, type RedeemResult, type StaffInfo } from "../schemas";

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
 */
export function KioskApp() {
  const params = useSearchParams();
  const [token, setToken] = React.useState<string | null>(() => params.get("token") || read(KIOSK_TOKEN_STORAGE));
  React.useEffect(() => {
    const fromUrl = params.get("token");
    if (fromUrl) {
      write(KIOSK_TOKEN_STORAGE, fromUrl);
      window.history.replaceState(null, "", "/kiosk");
    }
  }, [params]);
  const ctx = useKioskContext(token);
  if (!token || (ctx.isError && ctx.error instanceof ApiError && ctx.error.status === 401)) {
    return (
      <Shell>
        <div className="mx-auto max-w-md space-y-3 px-6 py-16 text-center">
          <h1 className="text-2xl font-semibold">This kiosk is not paired</h1>
          <p className="text-[15px] leading-[1.55] text-muted-foreground">Pair it from the event&apos;s Team &amp; doors page: a link opens here with the device token. A token lasts one shift; the organiser can make a new one.</p>
          {token ? (
            <Button variant="outline" onClick={() => (write(KIOSK_TOKEN_STORAGE, null), setToken(null))}>
              Forget this pairing
            </Button>
          ) : null}
        </div>
      </Shell>
    );
  }
  if (ctx.isPending) return <Shell><p className="px-6 py-16 text-center text-muted-foreground">Opening the kiosk…</p></Shell>;
  if (ctx.isError) return <Shell><p className="px-6 py-16 text-center text-destructive">{ctx.error.message}</p></Shell>;
  return <Kiosk token={token} ctx={ctx.data} onUnpair={() => (write(KIOSK_TOKEN_STORAGE, null), setToken(null))} />;
}

const Shell = ({ children }: { children: React.ReactNode }) => <div className="min-h-dvh bg-[#0B140F] text-[#E6F1EA]">{children}</div>;

function Kiosk({ token, ctx, onUnpair }: { token: string; ctx: KioskContext; onUnpair: () => void }) {
  const brand = ctx.event.brand_primary;
  const [step, setStep] = React.useState<Step>("attract");
  const [result, setResult] = React.useState<RedeemResult | null>(null);
  const [printing, setPrinting] = React.useState<string | null>(null);
  const [printingSession, setPrintingSession] = React.useState<string | null>(null);
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

  // The self check-in QR, redrawn when the server rotates it.
  React.useEffect(() => {
    const url = selfQr.data?.url;
    if (!url) return;
    let alive = true;
    QRCode.toDataURL(url, { margin: 1, width: 360, color: { dark: "#0B140F", light: "#FFFFFF" } }).then((d) => alive && setSelfPng(d)).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [selfQr.data?.url]);

  // A phone that tapped print: the kiosk prints it, once.
  React.useEffect(() => {
    const pending = selfQr.data?.recent.find((r) => r.print_requested && !printedSessions.current.has(r.session));
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
    const t = setInterval(() => setLeft((n) => (n <= 1 ? (reset(), DONE_RESET_S) : n - 1)), 1000);
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
        setNotMeLeft(r.outcome === "MATCHED" && !r.guest?.already_checked_in ? NOT_ME_S : 0);
        if (r.outcome === "MATCHED" && r.auto_print && r.print_url) setPrinting(kioskCardUrl(token, r.print_url));
        setCode("");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "The scan failed");
      } finally {
        setBusy(false);
      }
    },
    [busy, token]
  );

  const startCamera = async () => {
    setCameraError(null);
    try {
      setCameraOn(true);
      await new Promise((r) => setTimeout(r, 30));
      // A kiosk faces the guest, so the camera looking at them is the front one.
      scannerRef.current = await startScanner(videoRef.current!, (c) => void submit(c), "user");
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

  return (
    <Shell>
      {printing ? (
        <PrintFrame
          key={printing}
          url={printing}
          onDone={() => {
            // The phone is polling: tell it the card is out, then free the frame for the next one.
            if (printingSession) void markSelfPrinted(token, printingSession).catch(() => undefined);
            setPrintingSession(null);
            setTimeout(() => setPrinting(null), 6000);
          }}
        />
      ) : null}
      <header className="flex items-center gap-3 border-b border-white/10 px-6 py-4">
        <span aria-hidden className="size-3 rounded-full" style={{ background: brand }} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-medium">{ctx.event.name}</div>
          <div className="truncate font-mono text-[10.5px] uppercase tracking-[0.1em] text-[#8C948B]">
            {ctx.event.org_name} · {ctx.device.door}
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#8C948B]">Checked in</div>
          <div className="font-mono text-[22px] leading-none" style={{ color: brand }}>
            {ctx.counters.checked_in}
            <span className="text-[12px] text-[#8C948B]"> / {ctx.counters.registered}</span>
          </div>
        </div>
        <button type="button" onClick={() => setPinOpen(true)} aria-label="Staff" className="ml-2 size-8 rounded-full border border-white/10 text-[11px] text-[#8C948B]">
          ⋯
        </button>
      </header>

      {!ctx.event.door_open ? <div className="bg-amber-500/15 px-6 py-3 text-center text-[14px] text-amber-200">The doors are not open yet. Please wait, or see the desk.</div> : null}

      {step === "attract" ? (
        <main className={cn("mx-auto grid max-w-5xl gap-8 px-6 py-8", selfQr.data?.enabled ? "lg:grid-cols-[3fr_2fr]" : "max-w-2xl")}>
          <section className="space-y-5">
            <div>
              <h1 className="text-[36px] font-semibold leading-tight tracking-[-0.02em]">Scan your ticket</h1>
              <p className="mt-1 text-[16px] text-[#C6D2C8]">Hold the QR on your ticket up to the camera. Your name comes up, and your card prints here.</p>
            </div>
            <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-2xl bg-black">
              <video ref={videoRef} playsInline muted className={cameraOn ? "absolute inset-0 size-full object-cover" : "hidden"} />
              {cameraOn ? (
                <div aria-hidden className="absolute left-1/2 top-1/2 aspect-square w-[46%] -translate-x-1/2 -translate-y-1/2 rounded-lg border-2 border-white/70" />
              ) : (
                <div className="px-6 text-center">
                  <div className="text-[15px] text-[#C7CCC8]">{cameraError ?? "The camera is off"}</div>
                  <button type="button" onClick={() => void startCamera()} className="mt-4 min-h-14 rounded-xl px-6 text-[16px] font-medium text-[#06190E]" style={{ background: brand }}>
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
              className="flex gap-2"
            >
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Or type the code under the QR" autoCapitalize="characters" autoCorrect="off" spellCheck={false} className="h-14 min-w-0 flex-1 rounded-xl border border-white/15 bg-white/5 px-4 font-mono text-[18px] uppercase placeholder:font-sans placeholder:normal-case" />
              <button type="submit" disabled={!code.trim() || busy} className="h-14 rounded-xl px-6 text-[16px] font-medium text-[#06190E] disabled:opacity-50" style={{ background: brand }}>
                Check in
              </button>
            </form>
          </section>
          {selfQr.data?.enabled && selfPng ? (
            <aside className="flex flex-col items-center gap-3 rounded-2xl border border-white/10 p-6 text-center">
              <h2 className="text-[20px] font-semibold">No ticket handy?</h2>
              <p className="text-[14px] text-[#C6D2C8]">Scan this with your phone and check in with your name{selfQr.data.verify === "email" ? " and a code we email you" : ""}.</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={selfPng} alt="QR code for checking in from your phone" className="size-56 rounded-xl bg-white p-2" />
              {selfQr.data.recent.length ? (
                <ul className="w-full space-y-1 text-left text-[13px] text-[#C6D2C8]">
                  {selfQr.data.recent.slice(0, 4).map((r) => (
                    <li key={r.session} className="flex justify-between">
                      <span>{r.name}</span>
                      <span className="text-[#8C948B]">{r.print_requested ? "printing…" : "checked in"}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </aside>
          ) : null}
        </main>
      ) : (
        <main className="mx-auto max-w-2xl px-6 py-10 text-center">
          {result?.outcome === "MATCHED" && g ? (
            <>
              <div className="font-mono text-[11px] uppercase tracking-[0.12em]" style={{ color: brand }}>
                {g.already_checked_in ? "Already checked in" : "Welcome"}
              </div>
              <h1 className="mt-2 text-[44px] font-semibold leading-tight tracking-[-0.02em]">{g.already_checked_in ? `Welcome back, ${g.first_name}.` : `Welcome in, ${g.first_name}.`}</h1>
              <p className="mt-2 text-[18px] text-[#C6D2C8]">
                {g.display_name} · {g.role_label} · {g.ticket_id}
              </p>
              {printing ? (
                <>
                  <p className="mt-6 text-[16px]" style={{ color: brand }}>
                    Printing your card…
                  </p>
                  {ctx.agenda.length ? <AgendaCycle items={ctx.agenda} brand={brand} /> : null}
                </>
              ) : result.print_url && g.may_print ? (
                <button type="button" onClick={printAgain} className="mt-6 min-h-14 rounded-xl px-6 text-[16px] font-medium text-[#06190E]" style={{ background: brand }}>
                  {g.has_card ? "Print my card again" : "Print my card"}
                </button>
              ) : null}
              {notMeLeft > 0 && !g.already_checked_in ? (
                <button type="button" onClick={() => void undo()} className="mt-8 block w-full text-[14px] text-[#8C948B] underline">
                  This isn&apos;t me ({notMeLeft}s)
                </button>
              ) : null}
            </>
          ) : (
            <>
              <h1 className="text-[36px] font-semibold leading-tight tracking-[-0.02em]">
                {result?.outcome === "WRONG_EVENT" ? "That ticket is for another event." : result?.outcome === "REVOKED" ? "This ticket was cancelled." : result?.outcome === "UNPAID" ? "This ticket has not been paid for." : result?.outcome === "EVENT_NOT_OPEN" ? "The doors are not open yet." : "That code was not recognised."}
              </h1>
              <p className="mt-3 text-[17px] text-[#C6D2C8]">{result?.outcome === "WRONG_EVENT" && result.other_event ? `It is a valid ticket for ${result.other_event.name}.` : "A volunteer at the desk can sort it out in a moment."}</p>
            </>
          )}
          <button type="button" onClick={reset} className="mt-10 text-[14px] text-[#8C948B] underline">
            Done · back in {left}s
          </button>
        </main>
      )}

      {pinOpen ? (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/70 p-6">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void openStaff();
            }}
            className="w-full max-w-sm space-y-3 rounded-2xl bg-[#13201A] p-6"
          >
            <h2 className="text-[18px] font-semibold">Staff mode</h2>
            <input autoFocus type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="Event PIN" className="h-12 w-full rounded-xl border border-white/15 bg-white/5 px-4 font-mono text-[18px]" />
            <div className="flex gap-2">
              <button type="submit" className="h-12 flex-1 rounded-xl text-[15px] font-medium text-[#06190E]" style={{ background: brand }}>
                Open
              </button>
              <button type="button" onClick={() => (setPinOpen(false), setPin(""))} className="h-12 flex-1 rounded-xl border border-white/15 text-[15px]">
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}
      {staff ? (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/70 p-6">
          <div className="w-full max-w-sm space-y-4 rounded-2xl bg-[#13201A] p-6">
            <h2 className="text-[18px] font-semibold">{staff.device.name}</h2>
            <dl className="grid grid-cols-2 gap-2 text-[14px]">
              <dt className="text-[#8C948B]">Checked in here</dt>
              <dd className="text-right font-mono">{staff.checked_in_here}</dd>
              <dt className="text-[#8C948B]">Checked in, all doors</dt>
              <dd className="text-right font-mono">{staff.counters.checked_in} / {staff.counters.registered}</dd>
              <dt className="text-[#8C948B]">Cards printed today</dt>
              <dd className="text-right font-mono">{staff.printed_today}</dd>
            </dl>
            <div className="flex flex-col gap-2">
              <button type="button" onClick={() => window.location.reload()} className="h-12 rounded-xl border border-white/15 text-[15px]">
                Reload the screen
              </button>
              <button type="button" onClick={onUnpair} className="h-12 rounded-xl border border-destructive/60 text-[15px] text-red-300">
                Unpair this kiosk
              </button>
              <button type="button" onClick={() => setStaff(null)} className="h-12 rounded-xl text-[15px] text-[#8C948B]">
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </Shell>
  );
}
