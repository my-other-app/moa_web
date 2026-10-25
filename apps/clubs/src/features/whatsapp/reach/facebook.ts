/**
 * Meta's Embedded Signup in the browser: the Facebook JavaScript SDK, loaded
 * only when the club clicks "Connect with Meta", and the flow it opens.
 *
 * Two things come back, in either order, and both are needed:
 * - FB.login's callback carries the exchangeable `code` -- good for 30
 *   seconds, so it is posted to the backend the moment it is here;
 * - a `message` event from facebook.com (`type: "WA_EMBEDDED_SIGNUP"`)
 *   carries the session's ids on FINISH (v5: `messaging_account_ids`,
 *   `phone_number_id`, `is_on_biz_app`; v4: `waba_id`), the screen left on
 *   CANCEL (`current_step`), or the error the person reported (Meta sends
 *   that as CANCEL with `error_message`, or as ERROR).
 * When the code comes first, the ids are waited for briefly; the backend
 * finds the account from the token itself if they never come.
 */

import type { EmbeddedConfig } from "./schemas";

export const SDK_SRC = "https://connect.facebook.net/en_US/sdk.js";
/** What Embedded Signup's version the flow asks for (v2 and v3 were retired on 15 October 2026). */
export const SIGNUP_VERSION = "v5";
/** How long the ids are waited for once the code is here: well inside the code's 30 seconds. */
export const WAIT_FOR_IDS_MS = 2500;

interface LoginResponse {
  authResponse?: { code?: string | null } | null;
  status?: string;
}

export interface FacebookSdk {
  init(options: { appId: string; autoLogAppEvents?: boolean; xfbml?: boolean; version: string }): void;
  login(callback: (response: LoginResponse) => void, options: Record<string, unknown>): void;
}

declare global {
  interface Window {
    FB?: FacebookSdk;
    fbAsyncInit?: () => void;
  }
}

let loading: Promise<FacebookSdk> | null = null;
/** The SDK object initialised, and with which app: once each. */
let initialised: { fb: FacebookSdk; appId: string } | null = null;

/** The SDK, loaded once from connect.facebook.net and initialised with the platform app. */
export function loadFacebookSdk(appId: string, version: string): Promise<FacebookSdk> {
  const ready = (fb: FacebookSdk) => {
    if (initialised?.fb !== fb || initialised.appId !== appId) {
      fb.init({ appId, autoLogAppEvents: true, xfbml: false, version });
      initialised = { fb, appId };
    }
    return fb;
  };
  if (typeof window === "undefined") return Promise.reject(new Error("Meta's sign-in opens in the browser."));
  if (window.FB) return Promise.resolve(ready(window.FB));
  if (loading) return loading.then(ready);
  loading = new Promise<FacebookSdk>((resolve, reject) => {
    window.fbAsyncInit = () => (window.FB ? resolve(window.FB) : reject(new Error("Meta's sign-in didn't load.")));
    const script = document.createElement("script");
    script.src = SDK_SRC;
    script.async = true;
    script.defer = true;
    script.crossOrigin = "anonymous";
    script.onerror = () => {
      loading = null;
      reject(new Error("Couldn't load Meta's sign-in. Check your connection, or an ad blocker, and try again."));
    };
    document.body.appendChild(script);
  });
  return loading.then(ready);
}

/** Only facebook.com and its subdomains speak for Meta's flow. */
export function fromFacebook(origin: string): boolean {
  try {
    const host = new URL(origin).hostname;
    return host === "facebook.com" || host.endsWith(".facebook.com");
  } catch {
    return false;
  }
}

export interface SessionInfo {
  /** FINISH, FINISH_ONLY_WABA, FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING ..., CANCEL or ERROR. */
  event: string;
  phone_number_id?: string;
  messaging_account_ids?: string[];
  waba_id?: string;
  business_id?: string;
  is_on_biz_app?: boolean;
  current_step?: string;
  error_message?: string;
  error_code?: string;
  session_id?: string;
}

const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : undefined);

/** A `message` event, as Embedded Signup's session info -- or null when it is anything else, from anywhere else. */
export function parseSignupMessage(event: { origin: string; data: unknown }): SessionInfo | null {
  if (!fromFacebook(event.origin)) return null;
  let raw = event.data;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!raw || typeof raw !== "object") return null;
  const msg = raw as { type?: unknown; event?: unknown; data?: Record<string, unknown> };
  if (msg.type !== "WA_EMBEDDED_SIGNUP") return null;
  const d = msg.data && typeof msg.data === "object" ? msg.data : {};
  const ids = Array.isArray(d.messaging_account_ids) ? d.messaging_account_ids.map(text).filter((x): x is string => Boolean(x)) : undefined;
  return {
    event: text(msg.event)?.toUpperCase() ?? "",
    phone_number_id: text(d.phone_number_id),
    messaging_account_ids: ids,
    waba_id: text(d.waba_id),
    business_id: text(d.business_id),
    is_on_biz_app: d.is_on_biz_app === true,
    current_step: text(d.current_step),
    error_message: text(d.error_message),
    error_code: text(d.error_code),
    session_id: text(d.session_id),
  };
}

export type SignupOutcome =
  | { kind: "finish"; code: string; info: SessionInfo | null }
  | { kind: "cancel"; info: SessionInfo | null }
  | { kind: "error"; info: SessionInfo };

const isFinish = (info: SessionInfo | null) => Boolean(info?.event.startsWith("FINISH"));
const isError = (info: SessionInfo | null) => info?.event === "ERROR" || Boolean(info?.error_message);

/**
 * Opens Meta's flow and answers once it is over: finished (the code, and
 * the ids if they came), cancelled (the screen it was left on), or an error
 * the person reported. Nothing else listens once it has answered.
 */
export function runEmbeddedSignup(
  fb: FacebookSdk,
  config: EmbeddedConfig,
  { waitForIdsMs = WAIT_FOR_IDS_MS, target = window }: { waitForIdsMs?: number; target?: Pick<Window, "addEventListener" | "removeEventListener"> } = {},
): Promise<SignupOutcome> {
  return new Promise((resolve) => {
    let info: SessionInfo | null = null;
    let code: string | null = null;
    let done = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const finish = (outcome: SignupOutcome) => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      target.removeEventListener("message", onMessage as EventListener);
      resolve(outcome);
    };
    const onMessage = (event: MessageEvent) => {
      const parsed = parseSignupMessage({ origin: event.origin, data: event.data });
      if (!parsed) return;
      info = parsed;
      if (code && isFinish(info)) finish({ kind: "finish", code, info });
    };
    target.addEventListener("message", onMessage as EventListener);

    fb.login(
      (response) => {
        const got = response?.authResponse?.code;
        if (got) {
          code = got;
          if (isFinish(info)) finish({ kind: "finish", code, info });
          // The ids may be a moment behind the code; the code doesn't wait long for them.
          else timer = setTimeout(() => finish({ kind: "finish", code: got, info: isFinish(info) ? info : null }), waitForIdsMs);
          return;
        }
        // No code: the popup closed. What Meta said decides why.
        if (info && isError(info)) finish({ kind: "error", info });
        else finish({ kind: "cancel", info });
      },
      {
        config_id: config.config_id,
        response_type: "code",
        override_default_response_type: true,
        extras: { version: SIGNUP_VERSION },
      },
    );
  });
}
