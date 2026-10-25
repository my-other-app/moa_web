"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  EyeIcon,
  EyeOffIcon,
  Loader2Icon,
  ShieldCheckIcon,
} from "lucide-react";
import { ApiError } from "@moa/api";
import { CLUB_NOT_VERIFIED } from "@moa/auth";
import { IconToggle, Notice } from "@moa/ui";

import { useLogin } from "../queries";
import { loginSchema, type LoginInput } from "../schemas";
import { safeNext } from "../next";

/**
 * The codes /auth/token refuses with when the answer is not "wrong
 * password": the account wants its authenticator code, the code was wrong,
 * this door is locked after too many tries, or (scope "club" only) the
 * club's application has not been approved yet.
 */
const TOTP_REQUIRED = "TOTP_REQUIRED";
const TOTP_INVALID = "TOTP_INVALID";
const LOGIN_LOCKED = "LOGIN_LOCKED";

/**
 * An applicant whose password is right, told where it stands rather than
 * "refused". The clubs app's awaiting-approval screen says the same.
 */
export const CLUB_UNDER_REVIEW = "Your club is still under review — we'll email you when it's approved.";

type Problem = { tone: "refuse" | "caution"; text: string };

/**
 * Sign in, in two steps when the account has two-factor sign-in: the
 * password first, then — only if the server asks for it — the code from
 * the authenticator app or a recovery code. The password is checked before
 * the code is asked for, so the second step never appears for a wrong one.
 */
export function LoginForm({
  usernamePlaceholder = "your_username",
  redirectTo = "/",
  forgotPasswordHref,
}: {
  usernamePlaceholder?: string;
  /** Where to land after sign-in when no ?next= was supplied. */
  redirectTo?: string;
  /** Where "Forgot password?" goes; without it there is no such link (the admin portal has none). */
  forgotPasswordHref?: string;
} = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const login = useLogin();
  const [showPassword, setShowPassword] = React.useState(false);
  const [problem, setProblem] = React.useState<Problem | null>(null);
  const [step, setStep] = React.useState<"password" | "code">("password");
  const [code, setCode] = React.useState("");
  /** Whose second factor is being asked for, as typed at the first step. */
  const [who, setWho] = React.useState("");

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "" },
  });
  const { errors } = form.formState;

  async function onSubmit(values: LoginInput) {
    setProblem(null);
    try {
      await login.mutateAsync(
        step === "code" ? { ...values, totp_code: code.trim() } : values
      );
      // `next` is checked before use: an open redirect here would let a
      // crafted link bounce an admin to an attacker's page after a genuine
      // sign-in (safeNext also refuses `/\evil.com`, which browsers read as
      // another site).
      router.replace(safeNext(searchParams.get("next"), redirectTo));
      router.refresh();
    } catch (error) {
      if (!(error instanceof ApiError)) {
        setProblem({ tone: "refuse", text: "Could not sign in. Please try again." });
        return;
      }
      if (error.errorCode === TOTP_REQUIRED) {
        // The password was right; the account wants its second factor.
        setWho(values.username.trim());
        setStep("code");
        setCode("");
        return;
      }
      if (error.errorCode === TOTP_INVALID) setCode("");
      if (error.errorCode === CLUB_NOT_VERIFIED) {
        setProblem({ tone: "caution", text: CLUB_UNDER_REVIEW });
        return;
      }
      setProblem({
        tone: error.errorCode === LOGIN_LOCKED || error.status === 429 ? "caution" : "refuse",
        text: error.message,
      });
    }
  }

  const back = () => {
    setStep("password");
    setCode("");
    setProblem(null);
  };

  const isSubmitting = form.formState.isSubmitting || login.isPending;

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      {step === "password" ? (
        <>
          <div className="field">
            <label htmlFor="login-username">Username</label>
            <input
              id="login-username"
              {...form.register("username")}
              autoComplete="username"
              autoFocus
              autoCapitalize="off"
              spellCheck={false}
              placeholder={usernamePlaceholder}
              disabled={isSubmitting}
              aria-invalid={errors.username ? true : undefined}
              aria-describedby={errors.username ? "login-username-error" : undefined}
              className="input h-11"
            />
            {errors.username ? (
              <p id="login-username-error" className="text-refuse mt-1.5 text-[12px]">
                {errors.username.message}
              </p>
            ) : null}
          </div>

          <div className="field">
            {forgotPasswordHref ? (
              <div className="flex items-baseline justify-between gap-3">
                <label htmlFor="login-password">Password</label>
                <Link href={forgotPasswordHref} className="text-brand text-[12.5px] font-medium underline-offset-2 hover:underline">
                  Forgot password?
                </Link>
              </div>
            ) : (
              <label htmlFor="login-password">Password</label>
            )}
            <div className="relative">
              <input
                id="login-password"
                {...form.register("password")}
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="••••••••••"
                disabled={isSubmitting}
                aria-invalid={errors.password ? true : undefined}
                aria-describedby={errors.password ? "login-password-error" : undefined}
                className="input h-11 pr-11"
              />
              <span className="absolute inset-y-0 right-1.5 flex items-center">
                <IconToggle
                  on={showPassword}
                  labelOn="Hide password"
                  labelOff="Show password"
                  iconOn={<EyeIcon />}
                  iconOff={<EyeOffIcon />}
                  onToggle={() => setShowPassword((v) => !v)}
                  tabIndex={-1}
                />
              </span>
            </div>
            {errors.password ? (
              <p id="login-password-error" className="text-refuse mt-1.5 text-[12px]">
                {errors.password.message}
              </p>
            ) : null}
          </div>
        </>
      ) : (
        <>
          <div className="bg-sunken flex items-start gap-3 rounded-[var(--radius-field)] px-3.5 py-3">
            <ShieldCheckIcon className="text-brand mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p className="text-ink-2 m-0 text-[12.5px] leading-[1.5]">
              Two-factor sign-in is on for <span className="text-ink font-medium">{who}</span>. Enter the 6-digit
              code from the authenticator app, or one of the recovery codes.
            </p>
          </div>
          <div className="field">
            <label htmlFor="login-code">Authenticator code</label>
            <input
              id="login-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoFocus
              autoComplete="one-time-code"
              autoCapitalize="off"
              spellCheck={false}
              maxLength={12}
              placeholder="123456"
              disabled={isSubmitting}
              className="input h-11 font-mono tracking-[0.2em]"
            />
          </div>
        </>
      )}

      {problem ? (
        <Notice tone={problem.tone} className="animate-in fade-in-0 slide-in-from-top-1 motion-reduce:animate-none">
          {problem.text}
        </Notice>
      ) : null}

      <button
        type="submit"
        className="btn btn-primary btn-lg group mt-1 w-full"
        disabled={isSubmitting || (step === "code" && code.trim().length < 6)}
      >
        {isSubmitting ? (
          <>
            <Loader2Icon className="animate-spin" />
            {step === "code" ? "Checking the code…" : "Signing in…"}
          </>
        ) : (
          <>
            {step === "code" ? "Verify and sign in" : "Sign in"}
            <ArrowRightIcon className="transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none" />
          </>
        )}
      </button>

      {step === "code" ? (
        <button type="button" className="btn btn-ghost btn-sm self-center" onClick={back} disabled={isSubmitting}>
          <ArrowLeftIcon /> Back to the password
        </button>
      ) : null}
    </form>
  );
}
