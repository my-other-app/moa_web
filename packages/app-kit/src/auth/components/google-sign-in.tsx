"use client";

import * as React from "react";
import { Loader2Icon } from "lucide-react";
import { Notice } from "@moa/ui";

import { renderGoogleButton, setCredentialHandler } from "../google";

/**
 * "or", then Google's own "Continue with Google" button, under the password
 * form. Google's script loads when this first shows (the login page only).
 * If it can't load (offline, blocked) the whole block steps aside and the
 * password form is the way in, as before.
 *
 * While a credential is being checked the button can't be pressed again and
 * a line says so; what went wrong with Google shows right under it.
 */
export function GoogleSignIn({
  onCredential,
  busy,
  problem,
}: {
  onCredential: (credential: string) => void;
  busy: boolean;
  problem: { tone: "refuse" | "caution"; text: string } | null;
}) {
  const slot = React.useRef<HTMLDivElement>(null);
  const [drawn, setDrawn] = React.useState<"loading" | "ready" | "failed">("loading");
  const latest = React.useRef(onCredential);
  React.useEffect(() => {
    latest.current = onCredential;
  });

  React.useEffect(() => {
    const el = slot.current;
    if (!el) return undefined;
    let alive = true;
    setCredentialHandler((credential) => latest.current(credential));
    // As wide as the form (Google draws 200 to 400 px), in the page's theme.
    const width = el.parentElement?.clientWidth || 320;
    const dark = document.documentElement.classList.contains("dark");
    renderGoogleButton(el, { width, theme: dark ? "filled_black" : "outline" }).then(
      () => alive && setDrawn("ready"),
      () => alive && setDrawn("failed"),
    );
    return () => {
      alive = false;
      setCredentialHandler(null);
    };
  }, []);

  if (drawn === "failed") return null;

  return (
    <div className="flex flex-col gap-3" data-slot="google-sign-in">
      <div className="text-ink-3 flex items-center gap-3 text-[12px]">
        <span aria-hidden="true" className="bg-line h-px flex-1" />
        or
        <span aria-hidden="true" className="bg-line h-px flex-1" />
      </div>
      {/* Google's button is an iframe it draws in here; the height is kept so the page doesn't jump when it arrives. */}
      <div className="flex min-h-[44px] justify-center" aria-busy={busy || drawn === "loading"}>
        <div ref={slot} className={busy ? "pointer-events-none opacity-60" : undefined} />
      </div>
      {busy ? (
        <p role="status" className="text-ink-2 m-0 flex items-center justify-center gap-2 text-[12.5px]">
          <Loader2Icon className="size-3.5 animate-spin" aria-hidden="true" />
          Signing in with Google…
        </p>
      ) : null}
      {problem ? (
        <Notice tone={problem.tone} className="animate-in fade-in-0 slide-in-from-top-1 motion-reduce:animate-none">
          {problem.text}
        </Notice>
      ) : null}
    </div>
  );
}
