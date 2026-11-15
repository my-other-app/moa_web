"use client";

import * as React from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
} from "@moa/ui";

import { api } from "../../client";
import { hasUnsavedWork, onSessionEnded, signInAgainPath } from "../session-end";

const assign = (path: string) => window.location.assign(path);
const openTab = (path: string) => {
  window.open(path, "_blank", "noopener");
};

export interface SessionEndHostProps {
  /**
   * Pages that need no session (sign-in, a door link, an invite): a refused
   * renewal there sends nobody anywhere -- it is the visitor having no
   * session, which those pages expect.
   */
  openPaths?: RegExp;
  /** Navigates; tests pass their own. */
  go?: (path: string) => void;
  /** Opens a new tab; tests pass their own. */
  open?: (path: string) => void;
}

/**
 * Mounted once, in each app's providers: what a page does when its session
 * could not be renewed. With nothing unsaved it goes to sign-in at once,
 * coming back here afterwards. With work not saved yet it asks first: sign
 * in again in a new tab (this tab, and the work in it, stay as they are;
 * the new cookies serve both), or here, leaving the work behind.
 */
export function SessionEndHost({ openPaths, go = assign, open = openTab }: SessionEndHostProps) {
  const [asking, setAsking] = React.useState(false);
  const [opened, setOpened] = React.useState(false);
  const [checking, setChecking] = React.useState(false);
  const [stillOut, setStillOut] = React.useState(false);

  React.useEffect(
    () =>
      onSessionEnded(() => {
        const { pathname } = window.location;
        if (pathname === "/login" || pathname.startsWith("/login/") || openPaths?.test(pathname)) return;
        if (!hasUnsavedWork()) {
          go(signInAgainPath(window.location));
          return;
        }
        setOpened(false);
        setStillOut(false);
        setAsking(true);
      }),
    [openPaths, go],
  );

  const signInHere = () => go(signInAgainPath(window.location));
  const signInElsewhere = () => {
    open("/login");
    setOpened(true);
  };
  // Signed in in the other tab: this tab's next call carries the new cookies.
  const carryOn = async () => {
    setChecking(true);
    try {
      await api.get("/api/v1/auth/me", { renew: false });
      setAsking(false);
    } catch {
      setStillOut(true);
    } finally {
      setChecking(false);
    }
  };

  return (
    <AlertDialog open={asking} onOpenChange={setAsking}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>You&apos;ve been signed out</AlertDialogTitle>
          <AlertDialogDescription>
            Your session on this dashboard ended, and this page has changes that aren&apos;t saved yet. To keep them, sign in again in a new tab, then come back to this tab and save.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {stillOut ? (
          <p role="alert" className="text-refuse text-[13px]">
            This tab is still signed out. Finish signing in in the other tab, then try again.
          </p>
        ) : null}
        <AlertDialogFooter>
          <Button variant="ghost" danger onClick={signInHere}>
            Sign in here (lose the changes)
          </Button>
          {opened ? (
            <Button onClick={() => void carryOn()} disabled={checking}>
              I&apos;ve signed in, back to my changes
            </Button>
          ) : (
            <Button onClick={signInElsewhere}>Sign in in a new tab</Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
