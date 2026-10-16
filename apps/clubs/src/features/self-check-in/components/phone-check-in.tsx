"use client";

import * as React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ApiError } from "@moa/api";
import { Button, cn } from "@moa/ui";
import { CircleCheckIcon, CircleXIcon, MapPinIcon, PrinterIcon, TriangleAlertIcon } from "lucide-react";

import { DOOR_FIELD, DOOR_LABEL, DoorSpinner, TONE_SOFT, TONE_SOLID, type DoorTone } from "@/features/gate";

import { checkInSelf, lookupSelf, printSelf, resendSelf, startSelf, statusSelf, verifySelf, type CheckInResult, type LookupResult, type SelfSession } from "../api";

type Step = "name" | "contact" | "code" | "confirm" | "done" | "already" | "desk";
const field = cn(DOOR_FIELD, "h-12 text-[17px]");

/** A short notice above the form: a name not found, the doors not open yet. */
function Note({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className={cn("mb-4 flex items-start gap-2.5 rounded-[var(--radius-card)] border px-4 py-3 text-[14.5px] leading-[1.5]", TONE_SOFT.caution)}>
      <TriangleAlertIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span className="text-ink">{children}</span>
    </p>
  );
}

/** Where the guest has got to, in the event's own order: their name, then a code if it asks for one, then in. */
function Steps({ labels, at }: { labels: string[]; at: number }) {
  return (
    <ol className="mb-6 flex gap-1.5" aria-label="Steps">
      {labels.map((l, i) => (
        <li key={l} className="min-w-0 flex-1" aria-current={i === at ? "step" : undefined}>
          <span className={cn("block h-1 rounded-full", i <= at ? "bg-brand" : "bg-line")} />
          <span className={cn("mt-1.5 block truncate text-[12px]", i === at ? "text-ink font-medium" : "text-ink-3")}>{l}</span>
        </li>
      ))}
    </ol>
  );
}

/** A finished state: the guest is in, already in, or has to see the desk. */
function Outcome({ tone, icon, title, children }: { tone: DoorTone; icon: React.ReactNode; title: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div role="status" className={cn("rounded-[var(--radius-sheet)] border px-5 py-6 text-center", TONE_SOFT[tone])}>
      <span aria-hidden="true" className={cn("mx-auto grid size-14 place-items-center rounded-full [&>svg]:size-7", TONE_SOLID[tone])}>
        {icon}
      </span>
      <div className="text-ink mt-3 text-[24px] leading-tight font-semibold tracking-[-0.02em]">{title}</div>
      {children ? <div className="text-ink-2 mt-1.5 text-[14.5px] leading-[1.55]">{children}</div> : null}
    </div>
  );
}

/**
 * Check-in from the guest's own phone, opened from the QR on a kiosk. Name →
 * proof as the event asks → checked in at the kiosk's door → one tap to print,
 * standing at the kiosk. Big controls, few words, nothing to install. It
 * renders on Meridian's dark scale, like the kiosk it was opened from.
 */
export function PhoneCheckIn({ token }: { token: string }) {
  const [session, setSession] = React.useState<SelfSession | null>(null);
  const [startError, setStartError] = React.useState<string | null>(null);
  const [step, setStep] = React.useState<Step>("name");
  const [name, setName] = React.useState("");
  const [contact, setContact] = React.useState("");
  const [code, setCode] = React.useState("");
  const [lookup, setLookup] = React.useState<LookupResult | null>(null);
  const [checked, setChecked] = React.useState<CheckInResult | null>(null);
  const [printed, setPrinted] = React.useState<"idle" | "queued" | "none">("idle");
  const [note, setNote] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    startSelf(token)
      .then((s) => alive && setSession(s))
      .catch((err) => alive && setStartError(err instanceof Error ? err.message : "This link could not be opened."));
    return () => {
      alive = false;
    };
  }, [token]);

  const sid = session?.session ?? "";
  const fail = (err: unknown) => setNote(err instanceof ApiError || err instanceof Error ? err.message : "Something went wrong. Please see the desk.");
  const doLookup = useMutation({ mutationFn: (body: { name: string; contact?: string }) => lookupSelf(sid, body.name, body.contact) });
  const doVerify = useMutation({ mutationFn: (c: string) => verifySelf(sid, c) });
  const doResend = useMutation({ mutationFn: () => resendSelf(sid) });
  const doCheckIn = useMutation({ mutationFn: () => checkInSelf(sid) });
  const doPrint = useMutation({ mutationFn: () => printSelf(sid) });
  const status = useQuery({ queryKey: ["self", sid, "status"], queryFn: () => statusSelf(sid), enabled: printed === "queued", refetchInterval: (q) => (q.state.data?.print?.status === "DONE" ? false : 2000) });
  const busy = doLookup.isPending || doVerify.isPending || doCheckIn.isPending || doPrint.isPending || doResend.isPending;

  const afterLookup = (r: LookupResult) => {
    setLookup(r);
    setNote(null);
    switch (r.outcome) {
      case "READY":
        setStep("confirm");
        break;
      case "CODE_SENT":
        setStep("code");
        break;
      case "AMBIGUOUS":
        setStep("contact");
        setNote("Two guests share that name. The email or mobile on your ticket tells you apart.");
        break;
      case "ALREADY_IN":
        setStep("already");
        break;
      case "NOT_FOUND":
        setNote("We could not find that name on the list. Type it as it is on your ticket, first and last name.");
        break;
      case "NO_CONTACT":
        setStep("desk");
        break;
      case "EVENT_NOT_OPEN":
        setNote("The doors are not open yet.");
        break;
      default:
        setStep("desk");
    }
  };
  const submitName = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) return;
    doLookup.mutate({ name: name.trim(), ...(step === "contact" && contact.trim() ? { contact: contact.trim() } : {}) }, { onSuccess: afterLookup, onError: fail });
  };
  const submitCode = (e: React.FormEvent) => {
    e.preventDefault();
    doVerify.mutate(code, {
      onSuccess: (r) => {
        if (r.outcome === "READY") {
          setNote(null);
          setStep("confirm");
        } else if (r.outcome === "WRONG_CODE") setNote(`That code is not right. ${r.attempts_left} ${r.attempts_left === 1 ? "try" : "tries"} left.`);
        else if (r.outcome === "EXPIRED") {
          setNote("That code has expired. Start again from your name.");
          setStep("name");
        } else setStep("desk");
      },
      onError: fail,
    });
  };
  const confirm = () =>
    doCheckIn.mutate(undefined, {
      onSuccess: (r) => {
        setChecked(r);
        if (r.outcome === "CHECKED_IN") setStep("done");
        else if (r.outcome === "ALREADY_IN") setStep("already");
        else if (r.outcome === "EVENT_NOT_OPEN") setNote("The doors are not open yet.");
        else setStep("desk");
      },
      onError: fail,
    });
  const print = () => doPrint.mutate(undefined, { onSuccess: (r) => setPrinted(r.outcome === "QUEUED" || r.outcome === "ALREADY_PRINTED" ? "queued" : "none"), onError: fail });

  const stepLabels = ["Your name", ...(session?.verify !== "name" ? ["Code"] : []), "Check in"];
  const stepAt = step === "name" || step === "contact" ? 0 : step === "code" ? 1 : step === "confirm" ? stepLabels.length - 1 : -1;
  const cardOut = status.data?.print?.status === "DONE";

  return (
    <div className="dark bg-canvas text-ink min-h-dvh">
      <main className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pt-[max(20px,env(safe-area-inset-top))] pb-10">
        {startError ? (
          <div className="my-auto">
            <Outcome tone="refuse" icon={<CircleXIcon />} title="This link has expired">
              {startError}
            </Outcome>
          </div>
        ) : !session ? (
          <p className="text-ink-2 my-auto flex items-center justify-center gap-2.5 text-[15px]">
            <DoorSpinner /> Opening…
          </p>
        ) : (
          <>
            <header className="mb-6">
              {session.event.org_name ? <p className="eyebrow">{session.event.org_name}</p> : null}
              <h1 className="text-ink mt-1 text-[24px] leading-tight font-semibold tracking-[-0.02em]">{session.event.name}</h1>
              <p className="text-ink-2 mt-1.5 flex items-center gap-1.5 text-[14px]">
                <MapPinIcon aria-hidden="true" className="text-brand size-4" />
                Checking in at {session.event.kiosk.name}
              </p>
            </header>
            {stepAt >= 0 ? <Steps labels={stepLabels} at={stepAt} /> : null}
            {note ? <Note>{note}</Note> : null}
            {!session.door_open ? <Note>The doors are not open yet.</Note> : null}

            {step === "name" || step === "contact" ? (
              <form onSubmit={submitName} className="space-y-4">
                <div>
                  <label htmlFor="self-name" className={cn(DOOR_LABEL, "text-[15px]")}>
                    Your name, as it is on your ticket
                  </label>
                  <input id="self-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="First and last name" autoComplete="name" className={field} />
                </div>
                {step === "contact" ? (
                  <div>
                    <label htmlFor="self-contact" className={cn(DOOR_LABEL, "text-[15px]")}>
                      The email or mobile on your ticket
                    </label>
                    <input id="self-contact" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="you@example.com or mobile" autoComplete="email" className={field} />
                  </div>
                ) : null}
                <Button type="submit" size="lg" className="w-full" disabled={busy || name.trim().length < 2}>
                  {doLookup.isPending ? "Looking…" : "Continue"}
                </Button>
                <p className="text-ink-3 text-[13.5px] leading-[1.5]">{session.verify === "email" ? "We will email a six-digit code to the address on your ticket." : "The name alone checks you in at this event."}</p>
              </form>
            ) : step === "code" ? (
              <form onSubmit={submitCode} className="space-y-4">
                <p className="text-ink-2 text-[15px] leading-[1.55]">
                  We sent a six-digit code to <span className="text-ink font-medium">{lookup?.masked}</span>. It works for ten minutes.
                </p>
                <input autoFocus inputMode="numeric" pattern="\d{6}" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="000000" aria-label="Six-digit code" className={cn(DOOR_FIELD, "h-14 text-center font-mono text-[28px] tracking-[0.4em]")} />
                <Button type="submit" size="lg" className="w-full" disabled={busy || code.length !== 6}>
                  {doVerify.isPending ? "Checking…" : "Verify"}
                </Button>
                <Button type="button" variant="ghost" size="lg" className="w-full" disabled={busy} onClick={() => doResend.mutate(undefined, { onSuccess: (r) => (r.outcome === "CODE_SENT" ? afterLookup(r) : setStep("desk")), onError: fail })}>
                  Didn&apos;t get it? Send it again
                </Button>
              </form>
            ) : step === "confirm" ? (
              <div className="space-y-4">
                <p className="text-ink text-[19px] leading-[1.4]">
                  Hello, <span className="font-semibold">{name.trim()}</span>. Ready to check in?
                </p>
                <Button size="lg" className="w-full" onClick={confirm} disabled={busy || !session.door_open}>
                  {doCheckIn.isPending ? "Checking you in…" : "Check me in"}
                </Button>
                <Button type="button" variant="ghost" size="lg" className="w-full" onClick={() => setStep("name")}>
                  Not you? Start again
                </Button>
              </div>
            ) : step === "done" && checked?.guest ? (
              <div className="space-y-4">
                <Outcome tone="admit" icon={<CircleCheckIcon />} title={`Welcome, ${checked.guest.first_name}.`}>
                  <span className="text-admit font-semibold">You&apos;re in</span> · {checked.guest.role_label} · {checked.guest.ticket_id}
                </Outcome>
                {session.print && checked.can_print ? (
                  printed === "idle" ? (
                    <>
                      <Button size="lg" className="w-full" onClick={print} disabled={busy}>
                        <PrinterIcon /> {doPrint.isPending ? "Asking the kiosk…" : "Print my card"}
                      </Button>
                      <p className="text-ink-3 text-center text-[13.5px]">Tap this standing at {session.event.kiosk.name}: your card prints there.</p>
                    </>
                  ) : printed === "queued" ? (
                    <p role="status" className={cn("flex items-center justify-center gap-2.5 rounded-[var(--radius-card)] border px-4 py-3 text-center text-[15px] font-medium", cardOut ? TONE_SOFT.admit : TONE_SOFT.info)}>
                      {cardOut ? <CircleCheckIcon aria-hidden="true" className="size-5 shrink-0" /> : <DoorSpinner className="shrink-0" />}
                      {cardOut ? `Your card is out. Collect it at ${session.event.kiosk.name}.` : "Printing your card at the kiosk…"}
                    </p>
                  ) : (
                    <p className="text-ink-2 text-center text-[14px]">You are checked in. The desk can print your card.</p>
                  )
                ) : (
                  <p className="text-ink-2 text-center text-[14px]">You are all set.</p>
                )}
              </div>
            ) : step === "already" ? (
              <Outcome tone="caution" icon={<TriangleAlertIcon />} title="You’re already checked in">
                {lookup?.checked_in_at ? `Recorded at ${new Date(lookup.checked_in_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}${lookup.door ? ` at ${lookup.door}` : ""}.` : "Your check-in is already recorded."} Need a card? A volunteer at the desk can print one.
              </Outcome>
            ) : (
              <Outcome tone="refuse" icon={<CircleXIcon />} title="Please see the desk">
                {checked?.outcome === "REFUSED" ? "The door could not admit this ticket — it may have been cancelled or replaced. A volunteer can sort it out in seconds." : "We could not verify you from here — there is no usable email on your ticket, or the code was tried too often. A volunteer can check you in in seconds."}
              </Outcome>
            )}
          </>
        )}
      </main>
    </div>
  );
}
