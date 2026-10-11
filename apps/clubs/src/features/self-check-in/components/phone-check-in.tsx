"use client";

import * as React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ApiError } from "@moa/api";
import { cn } from "@moa/ui";

import { checkInSelf, lookupSelf, printSelf, resendSelf, startSelf, statusSelf, verifySelf, type CheckInResult, type LookupResult, type SelfSession } from "../api";

type Step = "name" | "contact" | "code" | "confirm" | "done" | "already" | "desk";
const input = "h-14 w-full rounded-xl border border-white/15 bg-white/5 px-4 text-[18px] text-white placeholder:text-[#6F786F]";

/** The one big button a thumb cannot miss, in the event's colour. */
function Big({ brand, children, className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { brand: string }) {
  return (
    <button type="button" {...props} className={cn("h-14 w-full rounded-xl text-[17px] font-medium text-[#06190E] disabled:opacity-50", className)} style={{ background: brand }}>
      {children}
    </button>
  );
}

/**
 * Check-in from the guest's own phone, opened from the QR on a kiosk. Name →
 * proof as the event asks → checked in at the kiosk's door → one tap to print,
 * standing at the kiosk. Big controls, few words, nothing to install.
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
  const brand = session?.event.brand_primary ?? "#1db9a0";
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


  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col bg-[#0B140F] px-5 pb-10 pt-[max(20px,env(safe-area-inset-top))] text-[#E6F1EA]">
      {startError ? (
        <div className="my-auto space-y-3 text-center">
          <h1 className="text-[24px] font-semibold">This link has expired</h1>
          <p className="text-[15px] text-[#C6D2C8]">{startError}</p>
        </div>
      ) : !session ? (
        <p className="my-auto text-center text-[#8C948B]">Opening…</p>
      ) : (
        <>
          <header className="mb-6">
            <div className="font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color: brand }}>
              {session.event.org_name}
            </div>
            <h1 className="text-[22px] font-semibold leading-tight">{session.event.name}</h1>
            <p className="text-[13px] text-[#8C948B]">Checking in at {session.event.kiosk.name}</p>
          </header>
          {note ? <p className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-[14px] text-amber-200">{note}</p> : null}
          {!session.door_open ? <p className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-[14px] text-amber-200">The doors are not open yet.</p> : null}

          {step === "name" || step === "contact" ? (
            <form onSubmit={submitName} className="space-y-3">
              <label className="block text-[15px]">Your name, as it is on your ticket</label>
              <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="First and last name" autoComplete="name" className={input} />
              {step === "contact" ? (
                <>
                  <label className="block text-[15px]">The email or mobile on your ticket</label>
                  <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="you@example.com or mobile" autoComplete="email" className={input} />
                </>
              ) : null}
              <Big brand={brand} type="submit" disabled={busy || name.trim().length < 2}>
                {doLookup.isPending ? "Looking…" : "Continue"}
              </Big>
              <p className="text-[13px] text-[#8C948B]">{session.verify === "email" ? "We will email a six-digit code to the address on your ticket." : "The name alone checks you in at this event."}</p>
            </form>
          ) : step === "code" ? (
            <form onSubmit={submitCode} className="space-y-3">
              <p className="text-[15px] text-[#C6D2C8]">
                We sent a six-digit code to <span className="text-white">{lookup?.masked}</span>. It works for ten minutes.
              </p>
              <input autoFocus inputMode="numeric" pattern="\d{6}" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="000000" className={cn(input, "text-center font-mono text-[28px] tracking-[0.4em]")} />
              <Big brand={brand} type="submit" disabled={busy || code.length !== 6}>
                {doVerify.isPending ? "Checking…" : "Verify"}
              </Big>
              <button type="button" disabled={busy} onClick={() => doResend.mutate(undefined, { onSuccess: (r) => (r.outcome === "CODE_SENT" ? afterLookup(r) : setStep("desk")), onError: fail })} className="w-full text-[14px] text-[#8C948B] underline">
                Didn&apos;t get it? Send it again
              </button>
            </form>
          ) : step === "confirm" ? (
            <div className="space-y-3">
              <p className="text-[18px]">
                Hello, <span className="font-semibold">{name.trim()}</span>. Ready to check in?
              </p>
              <Big brand={brand} onClick={confirm} disabled={busy || !session.door_open}>
                {doCheckIn.isPending ? "Checking you in…" : "Check me in"}
              </Big>
              <button type="button" onClick={() => setStep("name")} className="w-full text-[14px] text-[#8C948B] underline">
                Not you? Start again
              </button>
            </div>
          ) : step === "done" && checked?.guest ? (
            <div className="space-y-4">
              <div className="rounded-2xl border px-5 py-6 text-center" style={{ borderColor: brand }}>
                <div className="font-mono text-[10px] uppercase tracking-[0.12em]" style={{ color: brand }}>
                  You&apos;re in
                </div>
                <div className="mt-1 text-[28px] font-semibold leading-tight">Welcome, {checked.guest.first_name}.</div>
                <div className="mt-1 text-[14px] text-[#C6D2C8]">
                  {checked.guest.role_label} · {checked.guest.ticket_id}
                </div>
              </div>
              {session.print && checked.can_print ? (
                printed === "idle" ? (
                  <>
                    <Big brand={brand} onClick={print} disabled={busy}>
                      {doPrint.isPending ? "Asking the kiosk…" : "Print my card"}
                    </Big>
                    <p className="text-center text-[13px] text-[#8C948B]">Tap this standing at {session.event.kiosk.name}: your card prints there.</p>
                  </>
                ) : printed === "queued" ? (
                  <p className="rounded-xl border border-white/10 px-4 py-3 text-center text-[15px] text-[#C6D2C8]">{status.data?.print?.status === "DONE" ? `Your card is out. Collect it at ${session.event.kiosk.name}.` : "Printing your card at the kiosk…"}</p>
                ) : (
                  <p className="text-center text-[14px] text-[#8C948B]">You are checked in. The desk can print your card.</p>
                )
              ) : (
                <p className="text-center text-[14px] text-[#8C948B]">You are all set.</p>
              )}
            </div>
          ) : step === "already" ? (
            <div className="space-y-3 rounded-2xl border border-white/10 px-5 py-6 text-center">
              <h2 className="text-[22px] font-semibold">You&apos;re already checked in</h2>
              <p className="text-[14px] text-[#C6D2C8]">{lookup?.checked_in_at ? `Recorded at ${new Date(lookup.checked_in_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}${lookup.door ? ` at ${lookup.door}` : ""}.` : "Your check-in is already recorded."} Need a card? A volunteer at the desk can print one.</p>
            </div>
          ) : (
            <div className="space-y-3 rounded-2xl border border-white/10 px-5 py-6 text-center">
              <h2 className="text-[22px] font-semibold">Please see the desk</h2>
              <p className="text-[14px] text-[#C6D2C8]">{checked?.outcome === "REFUSED" ? "The door could not admit this ticket — it may have been cancelled or replaced. A volunteer can sort it out in seconds." : "We could not verify you from here — there is no usable email on your ticket, or the code was tried too often. A volunteer can check you in in seconds."}</p>
            </div>
          )}
        </>
      )}
    </main>
  );
}
