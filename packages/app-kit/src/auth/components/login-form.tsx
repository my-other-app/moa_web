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

import type { DashboardScope } from "../api";
import {
  credentialEmail,
  googleClientId,
  googleCredentialExpired,
  googleSignInMissing,
  markGoogleSignInMissing,
  subscribeGoogleSignInMissing,
} from "../google";
import { useGoogleLogin, useLogin } from "../queries";
import { loginSchema, type LoginInput } from "../schemas";
import { safeNext } from "../next";
import { GoogleSignIn } from "./google-sign-in";

/**
 * The codes /auth/token refuses with when the answer is not "wrong
 * password": the account wants its authenticator code, the code was wrong,
 * this door is locked after too many tries, or (scope "club" only) the
 * club's application has not been approved yet.
 */
const TOTP_REQUIRED = "TOTP_REQUIRED";
const TOTP_INVALID = "TOTP_INVALID";
const LOGIN_LOCKED = "LOGIN_LOCKED";
/** /auth/google/dashboard's own: no account of this dashboard's kind has the Google address; the token is bad or ran out. */
const GOOGLE_NO_ACCOUNT = "GOOGLE_NO_ACCOUNT";
const INVALID_GOOGLE_TOKEN = "INVALID_GOOGLE_TOKEN";

/**
 * An applicant whose password is right, told where it stands rather than
 * "refused". The clubs app's awaiting-approval screen says the same.
 */
export const CLUB_UNDER_REVIEW = "Your club is still under review — we'll email you when it's approved.";

/** Google's credential lasts an hour; one that ran out before the code was sent is asked for again. */
export const GOOGLE_EXPIRED = "Your Google sign-in timed out. Continue with Google again.";

/** The API has no Google sign-in yet (an older server). The button is gone for this session. */
export const GOOGLE_UNAVAILABLE = "Sign-in with Google isn't available yet. Sign in with your username and password.";

/** A login page's Google button: which dashboard it signs in to, and what to say when no account of that kind uses the address. */
export interface GoogleSignInOptions {
  scope: DashboardScope;
  /** Said for GOOGLE_NO_ACCOUNT, in this dashboard's words. */
  noAccountMessage: string;
}

type Problem = { tone: "refuse" | "caution"; text: string };

/** How the code step finishes: the password typed at the first step, or the Google credential that was answered TOTP_REQUIRED. */
type Second = { via: "password" } | { via: "google"; credential: string };

const noMissingOnServer = () => false;

/**
 * Sign in, in two steps when the account has two-factor sign-in: the
 * password (or Google) first, then — only if the server asks for it — the
 * code from the authenticator app or a recovery code. The first factor is
 * checked before the code is asked for, so the second step never appears
 * for a wrong one.
 *
 * With `google`, and a Google client id in the build, "Continue with Google"
 * sits under the password form. It signs in an existing account only, and
 * lands exactly where the password does.
 */
export function LoginForm({
  usernamePlaceholder = "your_username",
  redirectTo = "/",
  forgotPasswordHref,
  google: googleOptions,
}: {
  usernamePlaceholder?: string;
  /** Where to land after sign-in when no ?next= was supplied. */
  redirectTo?: string;
  /** Where "Forgot password?" goes; without it there is no such link (the admin portal has none). */
  forgotPasswordHref?: string;
  /** Offer "Continue with Google" (shown only when the build has NEXT_PUBLIC_GOOGLE_CLIENT_ID). */
  google?: GoogleSignInOptions;
} = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const login = useLogin();
  const google = useGoogleLogin();
  const [showPassword, setShowPassword] = React.useState(false);
  const [problem, setProblem] = React.useState<Problem | null>(null);
  /** What went wrong with Google at the first step, shown under its button. */
  const [googleProblem, setGoogleProblem] = React.useState<Problem | null>(null);
  const [step, setStep] = React.useState<"password" | "code">("password");
  const [second, setSecond] = React.useState<Second>({ via: "password" });
  const [code, setCode] = React.useState("");
  /** Whose second factor is being asked for, as typed at the first step (or Google's address). */
  const [who, setWho] = React.useState("");
  // Read after hydration (the server can't see this tab's session), so the
  // first render matches the server's.
  const googleMissing = React.useSyncExternalStore(subscribeGoogleSignInMissing, googleSignInMissing, noMissingOnServer);
  const googleShown = Boolean(googleOptions && googleClientId()) && !googleMissing;

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "" },
  });
  const { errors } = form.formState;

  /**
   * Signed in: the cookies are set. `next` is checked before use: an open
   * redirect here would let a crafted link bounce an admin to an attacker's
   * page after a genuine sign-in (safeNext also refuses `/\evil.com`, which
   * browsers read as another site).
   */
  function land() {
    router.replace(safeNext(searchParams.get("next"), redirectTo));
    router.refresh();
  }

  async function onSubmit(values: LoginInput) {
    setProblem(null);
    setGoogleProblem(null);
    try {
      await login.mutateAsync(
        step === "code" ? { ...values, totp_code: code.trim() } : values
      );
      land();
    } catch (error) {
      if (!(error instanceof ApiError)) {
        setProblem({ tone: "refuse", text: "Could not sign in. Please try again." });
        return;
      }
      if (error.errorCode === TOTP_REQUIRED) {
        // The password was right; the account wants its second factor.
        setWho(values.username.trim());
        setSecond({ via: "password" });
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

  /** Back to the first step, Google's button showing again, saying why. */
  function askForGoogleAgain() {
    setStep("password");
    setSecond({ via: "password" });
    setCode("");
    setProblem(null);
    setGoogleProblem({ tone: "caution", text: GOOGLE_EXPIRED });
  }

  /**
   * Google's credential, from its button (no code yet), or sent again with
   * the code after TOTP_REQUIRED. It goes through this app's gateway like the
   * password does, so the API's cookies are set the same way.
   */
  async function signInWithGoogle(credential: string, totpCode?: string) {
    if (!googleOptions || google.isPending || login.isPending) return;
    const atCode = totpCode !== undefined;
    // At the first step what went wrong shows under Google's button; at the code step, in the form.
    const say = atCode ? setProblem : setGoogleProblem;
    setProblem(null);
    setGoogleProblem(null);
    if (atCode && googleCredentialExpired(credential)) {
      askForGoogleAgain();
      return;
    }
    try {
      const tokens = await google.mutateAsync({ idToken: credential, scope: googleOptions.scope, totpCode });
      if (tokens === null) {
        // An older API: no such route. Hide the button for this session.
        markGoogleSignInMissing();
        setStep("password");
        setSecond({ via: "password" });
        setCode("");
        setProblem({ tone: "caution", text: GOOGLE_UNAVAILABLE });
        return;
      }
      land();
    } catch (error) {
      if (!(error instanceof ApiError)) {
        say({ tone: "refuse", text: "Could not sign in. Please try again." });
        return;
      }
      if (error.errorCode === TOTP_REQUIRED) {
        // Google vouched for the address; the account wants its second
        // factor, sent with this same credential.
        setWho(credentialEmail(credential) ?? "this Google account");
        setSecond({ via: "google", credential });
        setStep("code");
        setCode("");
        return;
      }
      if (atCode && error.errorCode === INVALID_GOOGLE_TOKEN) {
        // It ran out while the code was being found.
        askForGoogleAgain();
        return;
      }
      if (error.errorCode === TOTP_INVALID) setCode("");
      if (error.errorCode === GOOGLE_NO_ACCOUNT) {
        say({ tone: "refuse", text: googleOptions.noAccountMessage });
        return;
      }
      say({
        tone:
          error.errorCode === LOGIN_LOCKED || error.status === 429 || error.errorCode === CLUB_NOT_VERIFIED
            ? "caution"
            : "refuse",
        text: error.message,
      });
    }
  }

  const back = () => {
    setStep("password");
    setSecond({ via: "password" });
    setCode("");
    setProblem(null);
  };

  function submit(event: React.FormEvent<HTMLFormElement>) {
    if (step === "code" && second.via === "google") {
      // No password to check: the code goes with Google's credential.
      event.preventDefault();
      void signInWithGoogle(second.credential, code.trim());
      return;
    }
    void form.handleSubmit(onSubmit)(event);
  }

  const isSubmitting = form.formState.isSubmitting || login.isPending || google.isPending;

  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
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
            <ArrowLeftIcon /> {second.via === "google" ? "Back to sign in" : "Back to the password"}
          </button>
        ) : null}
      </form>

      {googleShown && step === "password" ? (
        <GoogleSignIn
          onCredential={(credential) => void signInWithGoogle(credential)}
          busy={google.isPending}
          problem={googleProblem}
        />
      ) : null}
    </div>
  );
}
