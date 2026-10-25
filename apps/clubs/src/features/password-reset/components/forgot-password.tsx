"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon, ArrowRightIcon, Loader2Icon, MailIcon, ShieldCheckIcon } from "lucide-react";
import { ApiError, isRouteMissing } from "@moa/api";
import { Notice } from "@moa/ui";

import { askForResetCode, resetPassword } from "../api";
import {
  CODE_EXPIRED,
  CODE_LOCKED,
  NOT_AVAILABLE,
  SENT_NOTE,
  TOTP_INVALID,
  TOTP_REQUIRED,
  codeStepSchema,
  emailStepSchema,
} from "../schemas";

type Problem = { tone: "refuse" | "caution"; text: string; again?: boolean };

function firstFieldError(error: ApiError): string | null {
  const fields = error.fieldErrors ?? {};
  for (const key of ["new_password", "password", "code", "email"]) {
    const v = (fields as Record<string, unknown>)[key];
    if (Array.isArray(v) && v.length) return String(v[0]);
    if (typeof v === "string") return v;
  }
  return null;
}

/**
 * "Forgot password?" for the club's own login and its team members: an
 * email address, then the 6-digit code mailed to it with a new password (and
 * the authenticator code, when the club account has two-factor on). Nothing
 * here says whether an address has an account; the server never does either.
 */
export function ForgotPassword() {
  const router = useRouter();
  const [step, setStep] = React.useState<"email" | "code">("email");
  const [email, setEmail] = React.useState("");
  const [code, setCode] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [totp, setTotp] = React.useState("");
  const [needsTotp, setNeedsTotp] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [problem, setProblem] = React.useState<Problem | null>(null);
  const [busy, setBusy] = React.useState(false);

  const ask = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setProblem(null);
    const parsed = emailStepSchema.safeParse({ email });
    if (!parsed.success) {
      setErrors({ email: parsed.error.issues[0]?.message ?? "Enter your email address" });
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await askForResetCode(parsed.data.email);
      setEmail(parsed.data.email);
      setStep("code");
      setCode("");
      setNeedsTotp(false);
      setTotp("");
    } catch (error) {
      if (isRouteMissing(error)) setProblem({ tone: "caution", text: NOT_AVAILABLE });
      else setProblem({ tone: error instanceof ApiError && error.status === 429 ? "caution" : "refuse", text: error instanceof ApiError ? error.message : "Could not send the code. Please try again." });
    } finally {
      setBusy(false);
    }
  };

  const reset = async (e: React.FormEvent) => {
    e.preventDefault();
    setProblem(null);
    const parsed = codeStepSchema.safeParse({ code: code.replace(/[\s-]/g, ""), new_password: password, confirm });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const i of parsed.error.issues) next[String(i.path[0] ?? "form")] ??= i.message;
      setErrors(next);
      return;
    }
    if (needsTotp && totp.trim().length < 6) {
      setErrors({ totp: "Enter the code from the authenticator app, or a recovery code" });
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await resetPassword({
        email,
        code: parsed.data.code,
        new_password: parsed.data.new_password,
        ...(needsTotp ? { totp_code: totp.trim() } : {}),
      });
      router.replace("/login?reset=1");
    } catch (error) {
      if (isRouteMissing(error)) {
        setProblem({ tone: "caution", text: NOT_AVAILABLE });
      } else if (!(error instanceof ApiError)) {
        setProblem({ tone: "refuse", text: "Could not change the password. Please try again." });
      } else if (error.errorCode === TOTP_REQUIRED) {
        setNeedsTotp(true);
        setProblem({ tone: "caution", text: "Two-factor sign-in is on for this account. Enter the code from the authenticator app as well." });
      } else if (error.errorCode === TOTP_INVALID) {
        setTotp("");
        setProblem({ tone: "refuse", text: error.message });
      } else if (error.errorCode === CODE_LOCKED || error.errorCode === CODE_EXPIRED) {
        setCode("");
        setProblem({ tone: "refuse", text: error.message, again: true });
      } else {
        setProblem({ tone: "refuse", text: firstFieldError(error) ?? error.message });
      }
    } finally {
      setBusy(false);
    }
  };

  const back = () => {
    setStep("email");
    setProblem(null);
    setErrors({});
  };

  return step === "email" ? (
    <form onSubmit={ask} noValidate className="flex flex-col gap-4">
      <p className="text-ink-2 m-0 text-[13.5px]">
        Enter the email address you sign in with — the club&apos;s own, or yours if you are on the club&apos;s team. We&apos;ll email
        you a 6-digit code.
      </p>
      <div className="field">
        <label htmlFor="reset-email">Email address</label>
        <input
          id="reset-email"
          type="email"
          autoComplete="email"
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={busy}
          aria-invalid={errors.email ? true : undefined}
          className="input h-11"
        />
        {errors.email ? <p className="text-refuse mt-1.5 text-[12px]">{errors.email}</p> : null}
      </div>
      {problem ? <Notice tone={problem.tone}>{problem.text}</Notice> : null}
      <button type="submit" className="btn btn-primary btn-lg group w-full" disabled={busy}>
        {busy ? <Loader2Icon className="animate-spin" /> : <MailIcon />} {busy ? "Sending…" : "Email me a code"}
      </button>
      <Link href="/login" className="btn btn-ghost btn-sm self-center">
        <ArrowLeftIcon /> Back to sign in
      </Link>
    </form>
  ) : (
    <form onSubmit={reset} noValidate className="flex flex-col gap-4">
      <Notice tone="neutral">
        {SENT_NOTE} Sent to <span className="text-ink font-medium">{email}</span>.
      </Notice>
      <div className="field">
        <label htmlFor="reset-code">Code from the email</label>
        <input
          id="reset-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoFocus
          autoComplete="one-time-code"
          inputMode="numeric"
          maxLength={9}
          placeholder="123456"
          disabled={busy}
          className="input h-11 font-mono tracking-[0.2em]"
        />
        {errors.code ? <p className="text-refuse mt-1.5 text-[12px]">{errors.code}</p> : null}
      </div>
      <div className="field">
        <label htmlFor="reset-password">New password</label>
        <input
          id="reset-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={busy}
          className="input h-11"
        />
        {errors.new_password ? <p className="text-refuse mt-1.5 text-[12px]">{errors.new_password}</p> : null}
      </div>
      <div className="field">
        <label htmlFor="reset-confirm">Repeat the new password</label>
        <input
          id="reset-confirm"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          disabled={busy}
          className="input h-11"
        />
        {errors.confirm ? <p className="text-refuse mt-1.5 text-[12px]">{errors.confirm}</p> : null}
      </div>
      {needsTotp ? (
        <div className="field">
          <label htmlFor="reset-totp">
            <ShieldCheckIcon className="text-brand mr-1 inline size-3.5" aria-hidden="true" />
            Authenticator code
          </label>
          <input
            id="reset-totp"
            value={totp}
            onChange={(e) => setTotp(e.target.value)}
            autoComplete="one-time-code"
            maxLength={12}
            placeholder="123456"
            disabled={busy}
            className="input h-11 font-mono tracking-[0.2em]"
          />
          {errors.totp ? <p className="text-refuse mt-1.5 text-[12px]">{errors.totp}</p> : null}
        </div>
      ) : null}
      {problem ? (
        <Notice tone={problem.tone}>
          {problem.text}
          {problem.again ? (
            <>
              {" "}
              <button type="button" className="text-brand font-medium underline-offset-2 hover:underline" onClick={() => void ask()}>
                Send a new code
              </button>
            </>
          ) : null}
        </Notice>
      ) : null}
      <button type="submit" className="btn btn-primary btn-lg group w-full" disabled={busy}>
        {busy ? <Loader2Icon className="animate-spin" /> : null}
        {busy ? "Saving…" : "Set the new password"}
        {busy ? null : <ArrowRightIcon />}
      </button>
      <button type="button" className="btn btn-ghost btn-sm self-center" onClick={back} disabled={busy}>
        <ArrowLeftIcon /> Use another address
      </button>
    </form>
  );
}
