"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2Icon, ShieldAlertIcon } from "lucide-react";
import { GATEWAY_PREFIX } from "@moa/auth";
import { Button } from "@moa/ui";

export function ImpersonationHandoff() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token");
  const [exchangeError, setExchangeError] = React.useState<string | null>(null);
  // A missing token is knowable during render, so it is derived rather than
  // written from the effect.
  const error = token ? exchangeError : "No hand-off token in the link.";

  React.useEffect(() => {
    if (!token) return;

    let cancelled = false;
    (async () => {
      try {
        // Form-encoded, and through this app's own gateway, so the session
        // cookies it sets belong to this origin. The token is good for two
        // minutes, which is why the exchange happens on arrival.
        const body = new URLSearchParams({ token });
        const response = await fetch(
          `${GATEWAY_PREFIX}/api/v1/auth/impersonate/exchange`,
          {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body,
          }
        );
        if (!response.ok) throw new Error("This link has expired or is invalid.");
        if (cancelled) return;
        // Replace, not push: the URL holds a credential and should not be
        // reachable with the back button.
        router.replace("/");
        router.refresh();
      } catch (e) {
        if (!cancelled) {
          // After an await, so not a synchronous write from the effect body.
          setExchangeError(
            e instanceof Error ? e.message : "Could not start the session."
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, router]);

  if (error) {
    return (
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        <ShieldAlertIcon className="text-destructive size-8" />
        <p className="text-sm">{error}</p>
        <p className="text-muted-foreground text-xs">
          Hand-off links last two minutes. Start a new one from the admin
          dashboard.
        </p>
        <Button variant="outline" size="sm" onClick={() => router.replace("/login")}>
          Go to sign in
        </Button>
      </div>
    );
  }

  return (
    <div className="text-muted-foreground flex items-center gap-2 text-sm">
      <Loader2Icon className="size-4 animate-spin" />
      Signing you in…
    </div>
  );
}
