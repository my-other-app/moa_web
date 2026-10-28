"use client";

import * as React from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { ThemeProvider, useTheme } from "next-themes";
import { Toaster, TooltipProvider } from "@moa/ui";

import { getQueryClient, setLoginScope } from "@moa/app-kit";

// Sign-ins from this app are for a club, so a team member's own password works here.
setLoginScope("club");

/**
 * Toasts in the app's theme, not the OS's. Sonner's "system" read the OS, so
 * with the toggle set the other way a toast's description came out light
 * grey on a white card (or dark grey on a charcoal one).
 */
function ThemedToaster() {
  const { resolvedTheme } = useTheme();
  return <Toaster theme={resolvedTheme === "dark" ? "dark" : "light"} position="bottom-right" richColors closeButton />;
}

export function Providers({ children }: { children: React.ReactNode }) {
  // Not useState(() => new QueryClient()): getQueryClient already returns a
  // per-request client on the server and a stable singleton in the browser.
  const queryClient = getQueryClient();

  return (
    <QueryClientProvider client={queryClient}>
      {/* Meridian has both scales, so the theme follows the OS until the
          toggle in the top bar says otherwise; the choice is remembered. */}
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem storageKey="moa.theme" disableTransitionOnChange>
        <TooltipProvider>
          {children}
          <ThemedToaster />
        </TooltipProvider>
      </ThemeProvider>
      {process.env.NODE_ENV === "development" ? (
        <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
      ) : null}
    </QueryClientProvider>
  );
}
