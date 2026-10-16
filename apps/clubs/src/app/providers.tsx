"use client";

import * as React from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { ThemeProvider } from "next-themes";
import { Toaster, TooltipProvider } from "@moa/ui";

import { getQueryClient, setLoginScope } from "@moa/app-kit";

// Sign-ins from this app are for a club, so a team member's own password works here.
setLoginScope("club");

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
          <Toaster position="bottom-right" richColors closeButton />
        </TooltipProvider>
      </ThemeProvider>
      {process.env.NODE_ENV === "development" ? (
        <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
      ) : null}
    </QueryClientProvider>
  );
}
