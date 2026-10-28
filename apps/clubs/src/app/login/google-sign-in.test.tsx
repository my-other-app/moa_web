import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";

/**
 * "Continue with Google" on the club dashboard's /login, against a fake of
 * Google Identity Services and a fake of POST /auth/google/dashboard as the
 * contract (feature-register/dashboard-google-contract.md) describes it.
 *
 * Google's real button is an iframe; the fake draws a plain button that hands
 * the page whatever credential the test queued, exactly as Google's callback
 * would.
 */
const CLIENT_ID = "497245325238-test.apps.googleusercontent.com";
const GSI_SRC = "https://accounts.google.com/gsi/client";
const NO_ACCOUNT =
  "No club dashboard uses this Google account. Sign in with your email and password, or ask your club's owner to invite this address.";

const replace = vi.fn();
const refresh = vi.fn();
let search = "";
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect ${to}`);
  },
  useRouter: () => ({ replace, refresh, push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/login",
  useSearchParams: () => new URLSearchParams(search),
}));
vi.mock("@moa/auth/server", () => ({ getSessionQuietly: vi.fn(async () => null) }));

/** A Google ID token as the page sees it: only its claims are ever read client-side. */
const b64url = (o: object) => btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const credential = (email: string, secondsLeft = 3600) =>
  `${b64url({ alg: "RS256", typ: "JWT" })}.${b64url({ email, exp: Math.floor(Date.now() / 1000) + secondsLeft })}.signature`;
const emailIn = (token: string) => (JSON.parse(atob((token.split(".")[1] ?? "").replace(/-/g, "+").replace(/_/g, "/"))) as { email: string }).email;

/** google.accounts.id, faked. */
type Callback = (response: { credential?: string }) => void;
const gsi = {
  callback: null as Callback | null,
  next: "",
  initialize: vi.fn((config: { callback: Callback }) => {
    gsi.callback = config.callback;
  }),
  renderButton: vi.fn((el: HTMLElement) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Continue with Google";
    button.addEventListener("click", () => gsi.callback?.({ credential: gsi.next }));
    el.append(button);
  }),
};

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** What the gateway was sent. */
const calls: Array<{ path: string; contentType: string | null; body: Record<string, string> }> = [];
let oldServer = false;

/** POST /auth/google/dashboard, by the Google address in the token. */
vi.stubGlobal(
  "fetch",
  vi.fn(async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as Record<string, string>;
    calls.push({ path: String(url), contentType: new Headers(init.headers).get("content-type"), body });
    if (oldServer) return reply(404, { detail: "Not Found" });
    const email = emailIn(body.id_token ?? "");
    switch (email) {
      case "nobody@example.com":
        return reply(401, { message: "No club dashboard uses this Google account.", error_code: "GOOGLE_NO_ACCOUNT" });
      case "forged@example.com":
        return reply(401, { message: "That Google sign-in could not be checked. Try again.", error_code: "INVALID_GOOGLE_TOKEN" });
      case "suspended@example.com":
        return reply(403, { message: "This account is suspended. Contact support.", error_code: "ACCOUNT_SUSPENDED" });
      case "applicant@example.com":
        return reply(403, { message: "Your club is waiting for approval. We will email you when it is approved.", error_code: "CLUB_NOT_VERIFIED" });
      case "closed@example.com":
        return reply(403, { message: "This club's dashboard is closed.", error_code: "CLUB_UNAVAILABLE" });
      case "locked@example.com":
        return reply(429, { message: "Too many attempts. Try again in 5 min.", error_code: "LOGIN_LOCKED" });
      case "lapsed@example.com":
        // Accepted until the code is sent, by which time Google's token has run out.
        if (!body.totp_code) return reply(401, { message: "Enter the code from your authenticator app", error_code: "TOTP_REQUIRED" });
        return reply(401, { message: "Google's sign-in has expired.", error_code: "INVALID_GOOGLE_TOKEN" });
      case "two-factor@example.com":
        if (!body.totp_code) return reply(401, { message: "Enter the code from your authenticator app", error_code: "TOTP_REQUIRED" });
        if (body.totp_code !== "123456") return reply(401, { message: "That code is not valid", error_code: "TOTP_INVALID" });
        return reply(200, { token_type: "bearer", access_token: "a", refresh_token: "r" });
      default:
        return reply(200, { token_type: "bearer", access_token: "a", refresh_token: "r" });
    }
  }),
);

const { render } = await import("@/test/render");
const { default: LoginPage } = await import("./page");

const page = async () => {
  render(await LoginPage({ searchParams: Promise.resolve({}) }));
};

/** Google hands the page a credential for `email`, as its button's callback does. */
const continueWithGoogle = async (token: string) => {
  gsi.next = token;
  fireEvent.click(await screen.findByRole("button", { name: "Continue with Google" }));
};

const gsiScript = () => document.head.querySelector(`script[src="${GSI_SRC}"]`);

beforeEach(() => {
  calls.length = 0;
  replace.mockClear();
  refresh.mockClear();
  gsi.initialize.mockClear();
  gsi.renderButton.mockClear();
  search = "";
  oldServer = false;
  window.sessionStorage.clear();
  vi.stubEnv("NEXT_PUBLIC_GOOGLE_CLIENT_ID", CLIENT_ID);
  window.google = { accounts: { id: gsi } };
});

afterEach(() => {
  vi.unstubAllEnvs();
  gsiScript()?.remove();
});

describe("the Google button on the club dashboard's sign-in", () => {
  it("is not there when the build has no Google client id, and Google's script is never loaded", async () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_CLIENT_ID", "");
    delete window.google;
    await page();
    expect(screen.getByLabelText("Username")).toBeInTheDocument();
    expect(screen.queryByText("or")).toBeNull();
    expect(screen.queryByRole("button", { name: "Continue with Google" })).toBeNull();
    expect(gsiScript()).toBeNull();
  });

  it("steps aside when Google's script can't load, leaving the password form", async () => {
    delete window.google;
    await page();
    const script = await waitFor(() => {
      const found = gsiScript();
      expect(found).not.toBeNull();
      return found!;
    });
    script.dispatchEvent(new Event("error"));
    await waitFor(() => expect(screen.queryByText("or")).toBeNull());
    expect(screen.getByLabelText("Username")).toBeInTheDocument();
  });

  it("loads Google's script on the sign-in page and draws its button under the form", async () => {
    delete window.google;
    await page();
    const script = await waitFor(() => {
      const found = gsiScript();
      expect(found).not.toBeNull();
      return found!;
    });
    window.google = { accounts: { id: gsi } };
    script.dispatchEvent(new Event("load"));

    expect(await screen.findByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
    expect(screen.getByText("or")).toBeInTheDocument();
    expect(gsi.initialize).toHaveBeenCalledWith(expect.objectContaining({ client_id: CLIENT_ID, ux_mode: "popup", auto_select: false }));
    expect(gsi.renderButton).toHaveBeenCalledWith(expect.any(HTMLElement), expect.objectContaining({ text: "continue_with", size: "large" }));
    // The password form is still the first thing on the page.
    expect(screen.getByLabelText("Username")).toBeInTheDocument();
  });
});

describe("signing in with Google", () => {
  it("posts the credential through this app's gateway for a club, and lands on ?next= as the password does", async () => {
    search = "next=/events/37";
    await page();
    const token = credential("owner@club.example");
    await continueWithGoogle(token);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/events/37"));
    expect(refresh).toHaveBeenCalled();
    expect(calls).toEqual([
      { path: "/api/gateway/api/v1/auth/google/dashboard", contentType: "application/json", body: { id_token: token, scope: "club" } },
    ]);
  });

  it("never leaves the site for a crafted ?next=", async () => {
    search = "next=/\\evil.example";
    await page();
    await continueWithGoogle(credential("owner@club.example"));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
  });

  it("says plainly when no club dashboard uses the Google account", async () => {
    await page();
    await continueWithGoogle(credential("nobody@example.com"));
    expect(await screen.findByRole("alert")).toHaveTextContent(NO_ACCOUNT);
    expect(replace).not.toHaveBeenCalled();
    // The button stays, for another Google account.
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
  });

  it.each([
    ["INVALID_GOOGLE_TOKEN", "forged@example.com", "That Google sign-in could not be checked. Try again."],
    ["ACCOUNT_SUSPENDED", "suspended@example.com", "This account is suspended. Contact support."],
    ["CLUB_NOT_VERIFIED", "applicant@example.com", "Your club is waiting for approval. We will email you when it is approved."],
    ["CLUB_UNAVAILABLE", "closed@example.com", "This club's dashboard is closed."],
    ["LOGIN_LOCKED", "locked@example.com", "Too many attempts. Try again in 5 min."],
  ])("shows %s in the server's words", async (_code, email, message) => {
    await page();
    await continueWithGoogle(credential(email));
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(replace).not.toHaveBeenCalled();
  });
});

describe("two-factor after Google", () => {
  it("asks for the code, then sends the same Google token again with it", async () => {
    search = "next=/events/37";
    await page();
    const token = credential("two-factor@example.com");
    await continueWithGoogle(token);

    const code = await screen.findByLabelText("Authenticator code");
    expect(screen.getByText("two-factor@example.com")).toBeInTheDocument();
    // The Google button and the password fields step aside for the code.
    expect(screen.queryByRole("button", { name: "Continue with Google" })).toBeNull();
    expect(screen.queryByLabelText("Password")).toBeNull();

    fireEvent.change(code, { target: { value: "000000" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify and sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That code is not valid");
    expect(code).toHaveValue("");

    fireEvent.change(code, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify and sign in" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/events/37"));
    expect(calls.map((c) => c.body)).toEqual([
      { id_token: token, scope: "club" },
      { id_token: token, scope: "club", totp_code: "000000" },
      { id_token: token, scope: "club", totp_code: "123456" },
    ]);
  });

  it("asks for Google again, without sending, when Google's token has run out before the code", async () => {
    await page();
    // Accepted, but within half a minute of running out by the time the code is typed.
    await continueWithGoogle(credential("two-factor@example.com", 10));
    fireEvent.change(await screen.findByLabelText("Authenticator code"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify and sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Your Google sign-in timed out. Continue with Google again.");
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Authenticator code")).toBeNull();
    expect(calls).toHaveLength(1);
    expect(replace).not.toHaveBeenCalled();
  });

  it("asks for Google again when the server finds the token ran out at the code", async () => {
    await page();
    await continueWithGoogle(credential("lapsed@example.com"));
    fireEvent.change(await screen.findByLabelText("Authenticator code"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify and sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Your Google sign-in timed out. Continue with Google again.");
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
  });

  it("goes back to sign-in from the code step", async () => {
    await page();
    await continueWithGoogle(credential("two-factor@example.com"));
    await screen.findByLabelText("Authenticator code");
    fireEvent.click(screen.getByRole("button", { name: "Back to sign in" }));
    expect(screen.getByLabelText("Username")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
  });
});

describe("an API without Google sign-in yet", () => {
  it("hides the button for the rest of the session on the route's bare 404, and says to use the password", async () => {
    oldServer = true;
    await page();
    await continueWithGoogle(credential("owner@club.example"));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Sign-in with Google isn't available yet. Sign in with your username and password.",
    );
    expect(screen.queryByRole("button", { name: "Continue with Google" })).toBeNull();
    expect(screen.queryByText("or")).toBeNull();
    expect(replace).not.toHaveBeenCalled();

    // Back on the page later in the same session: no button, no Google drawing.
    cleanup();
    gsi.renderButton.mockClear();
    await page();
    expect(screen.getByLabelText("Username")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continue with Google" })).toBeNull();
    expect(gsi.renderButton).not.toHaveBeenCalled();
  });
});
