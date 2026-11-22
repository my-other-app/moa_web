"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { Button, cn } from "@moa/ui";
import { BellRingIcon, CheckCircle2Icon, CircleAlertIcon, MonitorSmartphoneIcon, PrinterIcon, Settings2Icon, UnplugIcon, WifiOffIcon, XIcon } from "lucide-react";

import { PrintFrame } from "@/features/idcards";

import { claimNext, reportDone, stationCardUrl, stationHeaders, STATION_TOKEN_STORAGE, TEST_CARD_URL } from "../api";
import { playAlertSound } from "../alert-sound";
import { createStationLoop, type StationJob, type StationLoop, type StationResult, type StationState } from "../station-loop";

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

/** How long a frame stays after its print call returned, so the browser can finish handing the card to the printer. */
const FRAME_KEEP_MS = 2500;
/** A card that has not finished printing by now is reported as failed. */
const PRINT_TIMEOUT_MS = 60_000;
const KEEP_RESULTS = 20;
const TOUCH = "min-h-14";

const SETUP_FLAGS = "--kiosk --kiosk-printing --autoplay-policy=no-user-gesture-required";

/**
 * The print station: a laptop with a wired printer, one page of the club dashboard in Chrome. It
 * claims the cards guests and staff asked for, prints each with nobody clicking, and says how it
 * went. Opened from a pairing link (`?token=`); the token stays on the laptop.
 */
export function PrintStationApp() {
  const params = useSearchParams();
  const [token, setToken] = React.useState<string | null>(() => params.get("token") || read(STATION_TOKEN_STORAGE));
  React.useEffect(() => {
    const fromUrl = params.get("token");
    if (fromUrl) {
      write(STATION_TOKEN_STORAGE, fromUrl);
      window.history.replaceState(null, "", "/print-station");
    }
  }, [params]);
  const unpair = React.useCallback(() => {
    write(STATION_TOKEN_STORAGE, null);
    setToken(null);
  }, []);
  if (!token) return <NotPaired />;
  return <Station token={token} onUnpair={unpair} />;
}

const Shell = ({ children }: { children: React.ReactNode }) => (
  <div data-slot="print-station" className="dark bg-canvas text-ink min-h-dvh">
    {children}
  </div>
);

function NotPaired({ ended }: { ended?: boolean }) {
  return (
    <Shell>
      <main className="flex min-h-dvh items-center justify-center px-6 py-16">
        <div className="bg-surface border-line-soft shadow-floating w-full max-w-md rounded-[var(--radius-sheet)] border p-8 text-center">
          <span aria-hidden="true" className="bg-sunken border-line-soft text-ink-2 mx-auto grid size-14 place-items-center rounded-full border [&>svg]:size-6">
            <MonitorSmartphoneIcon />
          </span>
          <h1 className="text-ink mt-4 text-[26px] leading-tight font-semibold tracking-[-0.02em]">{ended ? "This print station's pairing has ended" : "This print station is not paired"}</h1>
          <p className="text-ink-2 mt-2 text-[15px] leading-[1.55]">
            Add a print station from the event&apos;s Team &amp; doors page: a link opens here with the device token. A token lasts one shift; the organiser can make a new link.
          </p>
        </div>
      </main>
    </Shell>
  );
}

type Frame = { key: number; job: StationJob };
type Pending = { key: number; resolve: () => void; reject: (e: unknown) => void; error: unknown; timer: ReturnType<typeof setTimeout> };

function Station({ token, onUnpair }: { token: string; onUnpair: () => void }) {
  const [state, setState] = React.useState<StationState>({ kind: "connecting" });
  const [results, setResults] = React.useState<StationResult[]>([]);
  const [alert, setAlert] = React.useState<StationResult | null>(null);
  const [frame, setFrame] = React.useState<Frame | null>(null);
  const [wake, setWake] = React.useState<"on" | "off" | "unsupported">(() => (typeof navigator !== "undefined" && !("wakeLock" in navigator) ? "unsupported" : "off"));
  const [testBusy, setTestBusy] = React.useState(false);
  const loopRef = React.useRef<StationLoop | null>(null);
  const pending = React.useRef<Pending | null>(null);
  const seq = React.useRef(0);

  // What the frame reports for the job it holds: an error from the fetch, or that the print call returned.
  const settle = React.useCallback((key: number, error?: unknown) => {
    const p = pending.current;
    if (!p || p.key !== key) return;
    if (error !== undefined) p.error = error;
  }, []);
  const finish = React.useCallback((key: number) => {
    const p = pending.current;
    if (!p || p.key !== key) return;
    pending.current = null;
    clearTimeout(p.timer);
    if (p.error !== null) {
      setFrame((f) => (f?.key === key ? null : f));
      p.reject(p.error);
    } else {
      p.resolve();
      setTimeout(() => setFrame((f) => (f?.key === key ? null : f)), FRAME_KEEP_MS);
    }
  }, []);

  React.useEffect(() => {
    const loop = createStationLoop({
      claim: () => claimNext(token),
      done: (id, ok, error) => reportDone(token, id, ok, error),
      cardUrl: (c) => stationCardUrl(c.card_url),
      testUrl: TEST_CARD_URL,
      onState: setState,
      onResult: (r) => {
        setResults((prev) => [r, ...prev].slice(0, KEEP_RESULTS));
        if (!r.ok) {
          setAlert(r);
          playAlertSound();
        }
      },
      print: (job) =>
        new Promise<void>((resolve, reject) => {
          const key = ++seq.current;
          const timer = setTimeout(() => {
            const p = pending.current;
            if (p?.key !== key) return;
            p.error = new Error("Printing did not finish. Check the printer is on and has paper.");
            finish(key);
          }, PRINT_TIMEOUT_MS);
          pending.current = { key, resolve, reject, error: null, timer };
          setFrame({ key, job });
        }),
    });
    loopRef.current = loop;
    loop.start();
    return () => {
      loop.stop();
      loopRef.current = null;
    };
  }, [token, finish]);

  // The laptop's screen stays on while the page is open; the lock is given up when the tab is hidden, so it is taken again on return.
  React.useEffect(() => {
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void>; addEventListener: (e: string, f: () => void) => void }> } };
    if (!nav.wakeLock) return;
    let lock: Awaited<ReturnType<NonNullable<typeof nav.wakeLock>["request"]>> | null = null;
    let alive = true;
    const take = async () => {
      try {
        lock = await nav.wakeLock!.request("screen");
        if (!alive) return void lock.release();
        setWake("on");
        lock.addEventListener("release", () => alive && setWake("off"));
      } catch {
        setWake("off");
      }
    };
    void take();
    const again = () => document.visibilityState === "visible" && void take();
    document.addEventListener("visibilitychange", again);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", again);
      void lock?.release();
    };
  }, []);

  if (state.kind === "unpaired") return <NotPaired ended />;

  const printing = state.kind === "printing";
  const test = () => {
    setTestBusy(true);
    const ok = loopRef.current?.printTest() ?? false;
    // A card is printing: the test card waits for the next gap, so it never lands on a real card.
    if (!ok) setTestBusy(false);
    else setTimeout(() => setTestBusy(false), 4000);
  };

  return (
    <Shell>
      {frame ? (
        <PrintFrame
          key={frame.key}
          url={frame.job.url}
          method={frame.job.method}
          headers={stationHeaders(token)}
          onError={(e) => settle(frame.key, e)}
          onDone={() => finish(frame.key)}
        />
      ) : null}
      {alert ? (
        <div role="alert" className="bg-refuse text-canvas sticky top-0 z-10 flex flex-wrap items-center gap-4 px-6 py-4">
          <BellRingIcon aria-hidden="true" className="size-8 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-[24px] leading-tight font-semibold">{alert.test ? "The test card did not print" : `${alert.name}'s card did not print`}</p>
            <p className="text-[16px] leading-[1.4]">{alert.error ?? "Check the printer."} Tell the desk.</p>
          </div>
          <Button type="button" variant="secondary" size="lg" className={TOUCH} onClick={() => setAlert(null)}>
            <XIcon /> Dismiss
          </Button>
        </div>
      ) : null}
      <header className="bg-surface border-line-soft border-b">
        <div className="mx-auto flex max-w-4xl items-center gap-4 px-6 py-4">
          <PrinterIcon aria-hidden="true" className="text-brand size-6 shrink-0" />
          <div className="min-w-0 flex-1">
            <h1 className="text-ink text-[20px] leading-[1.3] font-semibold tracking-[-0.01em]">Print station</h1>
            <p className="text-ink-3 text-[13.5px]">Cards print here on their own. Leave this screen open.</p>
          </div>
          <span className="text-ink-3 hidden text-[13px] sm:block">{wake === "on" ? "Screen stays on" : wake === "unsupported" ? "Screen may sleep" : "Screen lock off"}</span>
        </div>
      </header>

      <main className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-8">
        <section aria-live="polite" className="bg-surface border-line-soft rounded-[var(--radius-sheet)] border p-8">
          <StatusLine state={state} />
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button type="button" size="lg" className={TOUCH} disabled={printing || testBusy || state.kind === "offline" || state.kind === "connecting"} onClick={test}>
              <PrinterIcon /> Print a test card
            </Button>
            <Button type="button" variant="secondary" size="lg" className={TOUCH} onClick={() => playAlertSound()}>
              <BellRingIcon /> Test the alert sound
            </Button>
          </div>
        </section>

        <section aria-labelledby="ps-results">
          <h2 id="ps-results" className="text-ink text-[18px] font-semibold">
            Last {KEEP_RESULTS} cards
          </h2>
          {results.length ? (
            <ul className="bg-surface border-line-soft divide-line-soft mt-3 divide-y overflow-hidden rounded-[var(--radius-card)] border">
              {results.map((r) => (
                <li key={`${r.id}-${r.at}`} className="flex items-start gap-3 px-4 py-3">
                  {r.ok ? <CheckCircle2Icon aria-hidden="true" className="text-admit mt-0.5 size-5 shrink-0" /> : <CircleAlertIcon aria-hidden="true" className="text-refuse mt-0.5 size-5 shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-ink text-[16px]">
                      {r.name}
                      <span className="text-ink-3 ml-2 text-[13px]">{r.test ? "Test card" : r.ok ? "Printed" : "Did not print"}</span>
                    </p>
                    {r.error ? <p className="text-refuse text-[14px]">{r.error}</p> : null}
                  </div>
                  <time className="text-ink-3 shrink-0 font-mono text-[13px] tabular-nums" dateTime={new Date(r.at).toISOString()}>
                    {new Date(r.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </time>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-ink-3 mt-2 text-[15px]">Nothing printed yet on this screen.</p>
          )}
        </section>

        <SetupPanel />

        <div>
          <Button type="button" variant="ghost" size="lg" className={TOUCH} onClick={onUnpair}>
            <UnplugIcon /> Forget this pairing
          </Button>
        </div>
      </main>
    </Shell>
  );
}

function StatusLine({ state }: { state: StationState }) {
  const base = "flex items-center gap-4";
  if (state.kind === "unpaired") return null;
  if (state.kind === "printing")
    return (
      <div className={base}>
        <PrinterIcon aria-hidden="true" className="text-info size-10 shrink-0" />
        <div>
          <p className="text-ink text-[32px] leading-tight font-semibold tracking-[-0.02em]">{state.test ? "Printing a test card" : `Printing ${state.name}'s card`}</p>
          {state.queued > 1 ? <p className="text-ink-2 mt-1 text-[18px]">{state.queued - 1} more in the queue</p> : null}
        </div>
      </div>
    );
  if (state.kind === "offline")
    return (
      <div className={base}>
        <WifiOffIcon aria-hidden="true" className="text-refuse size-10 shrink-0" />
        <div>
          <p className="text-ink text-[32px] leading-tight font-semibold tracking-[-0.02em]">Cannot reach the server</p>
          <p className="text-ink-2 mt-1 text-[18px]">{state.message} Trying again every few seconds.</p>
        </div>
      </div>
    );
  if (state.kind === "connecting")
    return (
      <div className={base}>
        <span aria-hidden="true" className="bg-ink-3 size-4 shrink-0 animate-pulse rounded-full motion-reduce:animate-none" />
        <p className="text-ink text-[32px] leading-tight font-semibold tracking-[-0.02em]">Connecting…</p>
      </div>
    );
  return (
    <div className={base}>
      <span aria-hidden="true" className="bg-admit size-4 shrink-0 rounded-full" />
      <div>
        <p className="text-ink text-[32px] leading-tight font-semibold tracking-[-0.02em]">Ready</p>
        <p className="text-ink-2 mt-1 text-[18px]">{state.queued > 0 ? `${state.queued} in the queue` : "Waiting for cards. The queue is empty."}</p>
      </div>
    </div>
  );
}

function SetupPanel() {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return (
    <details className="bg-surface border-line-soft group rounded-[var(--radius-card)] border">
      <summary className={cn("text-ink flex cursor-pointer items-center gap-3 px-5 text-[17px] font-medium", TOUCH)}>
        <Settings2Icon aria-hidden="true" className="size-5" /> Setup for printing without clicks
      </summary>
      <div className="text-ink-2 space-y-4 px-5 pb-5 text-[15px] leading-[1.6]">
        <p>Set this up once, on this laptop. After that, cards print without anyone touching the screen.</p>
        <ol className="list-decimal space-y-3 pl-5">
          <li>
            <strong className="text-ink">Make the card printer the default printer</strong> in the laptop&apos;s system settings. Chrome prints to the default printer when it is started as below.
          </li>
          <li>
            <strong className="text-ink">Paper size:</strong> CR80 (54 × 86 mm) for a card printer, or 4 × 6 in for a label printer. <strong className="text-ink">Margins: none. Scale: 100%.</strong> Set these in the printer&apos;s own preferences, then print a test card to check.
          </li>
          <li>
            <strong className="text-ink">Start Chrome with these flags</strong> (close every Chrome window first):
            <code className="bg-sunken text-ink mt-1 block rounded-lg px-3 py-2 font-mono text-[13px] break-all select-all">{SETUP_FLAGS}</code>
            <span className="text-ink-3 mt-1 block text-[13.5px]">
              <code>--kiosk</code> makes it full screen, <code>--kiosk-printing</code> prints with no dialog, and <code>--autoplay-policy=no-user-gesture-required</code> lets the alert sound play.
            </span>
          </li>
          <li>
            <strong className="text-ink">Open this page:</strong>
            <code className="bg-sunken text-ink mt-1 block rounded-lg px-3 py-2 font-mono text-[13px] break-all select-all">{origin}/print-station</code>
          </li>
          <li>
            <strong className="text-ink">Keep the laptop plugged in</strong> and the lid open. This page keeps the screen awake while it is open.
          </li>
        </ol>
      </div>
    </details>
  );
}
