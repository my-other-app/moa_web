import * as React from "react";
import type { ApiError, SessionRenewal } from "@moa/api";

/**
 * What happens when a dashboard's session runs out under an open page.
 *
 * The browser client renews it by itself (packages/api/src/client.ts): on a
 * 401 for a spent access token it asks /auth/refresh once and sends the
 * request again. Only when that renewal is refused is the session over, and
 * then the person signs in again where they were (`/login?next=`). A page
 * holding work not saved yet (an email, a design, the site, an event form)
 * says so first, rather than navigating it away: see `SessionEndHost`.
 */

/** Renews the session from its refresh cookie, through this app's gateway. */
export const RENEW_PATH = "/api/v1/auth/refresh";

// ─── Work not saved yet ─────────────────────────────────────────────────

const unsaved = new Set<symbol>();

/** Some open editor holds changes not saved yet. */
export function hasUnsavedWork(): boolean {
  return unsaved.size > 0;
}

/**
 * Marks the page as holding work not saved yet, while `dirty` is true:
 * leaving the tab asks first (the browser's own question), and a session
 * that ends says so before anything navigates away from it.
 */
export function useUnsavedWork(dirty: boolean): void {
  React.useEffect(() => {
    if (!dirty) return;
    const mark = Symbol("unsaved work");
    unsaved.add(mark);
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => {
      unsaved.delete(mark);
      window.removeEventListener("beforeunload", warn);
    };
  }, [dirty]);
}

// ─── Signing in again ───────────────────────────────────────────────────

/** The sign-in page, told to come back here afterwards (as the edge guard does). */
export function signInAgainPath(where: { pathname: string; search?: string }): string {
  const here = `${where.pathname}${where.search ?? ""}`;
  return here === "/" ? "/login" : `/login?next=${encodeURIComponent(here)}`;
}

type Listener = (error: ApiError) => void;
let listener: Listener | null = null;

/** Who is told the session ended: the app's SessionEndHost. Returns how to stop. */
export function onSessionEnded(fn: Listener): () => void {
  listener = fn;
  return () => {
    if (listener === fn) listener = null;
  };
}

/** The renewal was refused: the session is over. Said to the host, if one is mounted. */
export function sessionEnded(error: ApiError): void {
  listener?.(error);
}

/** The browser client's renewal: this gateway's /auth/refresh, and the host told when it is refused. */
export const SESSION_RENEWAL: SessionRenewal = { path: RENEW_PATH, onEnded: sessionEnded };
