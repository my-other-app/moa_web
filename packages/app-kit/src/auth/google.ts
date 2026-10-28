/**
 * Sign in with Google on a dashboard's login page, through Google Identity
 * Services (google.accounts.id), as the public website does it
 * (moa_eventwebsite src/auth/google.js).
 *
 * The client id is the public OAuth web client id, set as
 * NEXT_PUBLIC_GOOGLE_CLIENT_ID at build time: the same one the API checks the
 * token's audience against. Without it the login page has no Google button
 * and works exactly as before.
 *
 * Google's script is loaded only when the button is drawn (the login page),
 * never anywhere else. Every credential Google hands back goes to the one
 * handler the button sets.
 */

export const GSI_SRC = "https://accounts.google.com/gsi/client";

interface GoogleCredentialResponse {
  credential?: string;
  select_by?: string;
}

interface GoogleButtonOptions {
  type: "standard" | "icon";
  theme: "outline" | "filled_blue" | "filled_black";
  size: "large" | "medium" | "small";
  text: "signin_with" | "signup_with" | "continue_with" | "signin";
  shape: "rectangular" | "pill" | "circle" | "square";
  logo_alignment: "left" | "center";
  width: number;
}

interface GoogleId {
  initialize(config: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
    ux_mode?: "popup" | "redirect";
    auto_select?: boolean;
    context?: "signin" | "signup" | "use";
    itp_support?: boolean;
  }): void;
  renderButton(parent: HTMLElement, options: GoogleButtonOptions): void;
}

declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleId } };
  }
}

/** This build's Google web client id, or null when the build has none (no Google button). */
export function googleClientId(): string | null {
  // Read at call time, not at import: Next inlines the literal at build
  // time, and a test can stub it per case.
  const id = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

const gis = (): GoogleId | undefined => (typeof window === "undefined" ? undefined : window.google?.accounts?.id);

let loading: Promise<GoogleId> | null = null;
let initialized: { id: GoogleId; clientId: string } | null = null;
let handler: ((credential: string) => void) | null = null;

/** Where Google's credentials go. The button sets it while it is on the page. */
export function setCredentialHandler(fn: ((credential: string) => void) | null) {
  handler = fn;
}

/** Loads Google's script once. Rejects when it can't load (offline, blocked), so a later visit may try again. */
export function loadGoogle(): Promise<GoogleId> {
  const ready = gis();
  if (ready) return Promise.resolve(ready);
  loading ??= new Promise<GoogleId>((resolve, reject) => {
    const script = document.createElement("script");
    const fail = () => {
      loading = null;
      script.remove();
      reject(new Error("Google sign-in didn't load"));
    };
    script.src = GSI_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      const id = gis();
      if (id) resolve(id);
      else fail();
    };
    script.onerror = fail;
    document.head.appendChild(script);
  });
  return loading;
}

/** Draws Google's own "Continue with Google" button into `el`. */
export async function renderGoogleButton(
  el: HTMLElement,
  { width, theme }: { width: number; theme: GoogleButtonOptions["theme"] },
): Promise<void> {
  const clientId = googleClientId();
  if (!clientId) throw new Error("No Google client id in this build");
  const id = await loadGoogle();
  if (initialized?.id !== id || initialized.clientId !== clientId) {
    id.initialize({
      client_id: clientId,
      callback: (response) => {
        if (response?.credential) handler?.(response.credential);
      },
      ux_mode: "popup",
      auto_select: false,
      context: "signin",
      itp_support: true,
    });
    initialized = { id, clientId };
  }
  el.replaceChildren();
  id.renderButton(el, {
    type: "standard",
    theme,
    size: "large",
    text: "continue_with",
    shape: "rectangular",
    logo_alignment: "left",
    // Google draws between 200 and 400 px wide.
    width: Math.max(200, Math.min(400, Math.round(width))),
  });
}

/**
 * The claims in Google's credential, read without checking its signature:
 * only for showing the address or reading the expiry, never for deciding who
 * someone is (the API checks the token).
 */
function claims(credential: string): Record<string, unknown> | null {
  try {
    const part = credential.split(".")[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** The Google account's address, as the credential says it: for showing only. */
export function credentialEmail(credential: string): string | null {
  const email = claims(credential)?.email;
  return typeof email === "string" && email.trim() ? email.trim() : null;
}

/**
 * True when Google's credential has run out (they last an hour), or will
 * within half a minute: sending it again with a code would only be refused.
 * A credential whose expiry can't be read is left to the API to judge.
 */
export function googleCredentialExpired(credential: string, now = Date.now()): boolean {
  const exp = claims(credential)?.exp;
  if (typeof exp !== "number") return false;
  return exp * 1000 <= now + 30_000;
}

/*
 * An API without the route (an older server answers a bare 404) hides the
 * button for the rest of this browser session, as nullIfRouteMissing hides
 * other features the server doesn't have yet. A new session asks again, so
 * the button comes back on its own once the API has the route.
 */
const MISSING_KEY = "moa.google-sign-in.missing";
let missingHere = false;
const listeners = new Set<() => void>();

export function googleSignInMissing(): boolean {
  if (missingHere) return true;
  try {
    return window.sessionStorage.getItem(MISSING_KEY) === "1";
  } catch {
    return false;
  }
}

export function markGoogleSignInMissing() {
  try {
    window.sessionStorage.setItem(MISSING_KEY, "1");
  } catch {
    // No storage (a private window, blocked site data): this page load only.
    missingHere = true;
  }
  for (const listener of listeners) listener();
}

/** For useSyncExternalStore. */
export function subscribeGoogleSignInMissing(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
