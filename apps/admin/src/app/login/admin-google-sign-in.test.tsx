import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";

/**
 * "Continue with Google" on the main portal's /login: the shared form in
 * admin scope, against a fake of Google Identity Services and a fake of POST
 * /auth/google/dashboard as the contract describes it. An admin can have
 * two-factor on, so the code step after Google is the case that matters most
 * here.
 */
const CLIENT_ID = "497245325238-test.apps.googleusercontent.com";
const GSI_SRC = "https://accounts.google.com/gsi/client";

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

const b64url = (o: object) => btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const credential = (email: string, secondsLeft = 3600) =>
  `${b64url({ alg: "RS256", typ: "JWT" })}.${b64url({ email, exp: Math.floor(Date.now() / 1000) + secondsLeft })}.signature`;
const emailIn = (token: string) => (JSON.parse(atob((token.split(".")[1] ?? "").replace(/-/g, "+").replace(/_/g, "/"))) as { email: string }).email;

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

const calls: Array<{ path: string; body: Record<string, string> }> = [];
let oldServer = false;

vi.stubGlobal(
  "fetch",
  vi.fn(async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as Record<string, string>;
    calls.push({ path: String(url), body });
    if (oldServer) return reply(404, { detail: "Not Found" });
    switch (emailIn(body.id_token ?? "")) {
      case "someone@gmail.com":
        return reply(401, { message: "No admin account uses this Google account.", error_code: "GOOGLE_NO_ACCOUNT" });
      case "forged@example.com":
        return reply(401, { message: "That Google sign-in could not be checked. Try again.", error_code: "INVALID_GOOGLE_TOKEN" });
      case "suspended@myotherapp.in":
        return reply(403, { message: "This account is suspended. Contact support.", error_code: "ACCOUNT_SUSPENDED" });
      case "locked@myotherapp.in":
        return reply(429, { message: "Too many attempts. Try again in 5 min.", error_code: "LOGIN_LOCKED" });
      case "owner@myotherapp.in":
        if (!body.totp_code) return reply(401, { message: "Enter the code from your authenticator app", error_code: "TOTP_REQUIRED" });
        if (body.totp_code !== "123456" && body.totp_code !== "abcd-efgh") {
          return reply(401, { message: "That code is not valid", error_code: "TOTP_INVALID" });
        }
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

const continueWithGoogle = async (token: string) => {
  gsi.next = token;
  fireEvent.click(await screen.findByRole("button", { name: "Continue with Google" }));
};

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
});

describe("the Google button on the admin sign-in", () => {
  it("is not there when the build has no Google client id, and Google's script is never loaded", async () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_CLIENT_ID", "");
    delete window.google;
    await page();
    expect(screen.getByLabelText("Username")).toBeInTheDocument();
    expect(screen.queryByText("or")).toBeNull();
    expect(screen.queryByRole("button", { name: "Continue with Google" })).toBeNull();
    expect(document.head.querySelector(`script[src="${GSI_SRC}"]`)).toBeNull();
  });

  it("draws Google's button under the admin form when the build has a client id", async () => {
    await page();
    expect(await screen.findByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
    expect(screen.getByText("or")).toBeInTheDocument();
    expect(gsi.renderButton).toHaveBeenCalledWith(expect.any(HTMLElement), expect.objectContaining({ text: "continue_with" }));
  });
});

describe("signing in to the portal with Google", () => {
  it("posts the credential through this app's gateway in admin scope, and returns to ?next=", async () => {
    search = "next=/payments?status=failed";
    await page();
    const token = credential("support@myotherapp.in");
    await continueWithGoogle(token);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/payments?status=failed"));
    expect(refresh).toHaveBeenCalled();
    expect(calls).toEqual([{ path: "/api/gateway/api/v1/auth/google/dashboard", body: { id_token: token, scope: "admin" } }]);
  });

  it("says plainly when no admin account uses the Google account", async () => {
    await page();
    await continueWithGoogle(credential("someone@gmail.com"));
    expect(await screen.findByRole("alert")).toHaveTextContent("No admin account uses this Google account.");
    expect(replace).not.toHaveBeenCalled();
  });

  it.each([
    ["INVALID_GOOGLE_TOKEN", "forged@example.com", "That Google sign-in could not be checked. Try again."],
    ["ACCOUNT_SUSPENDED", "suspended@myotherapp.in", "This account is suspended. Contact support."],
    ["LOGIN_LOCKED", "locked@myotherapp.in", "Too many attempts. Try again in 5 min."],
  ])("shows %s in the server's words", async (_code, email, message) => {
    await page();
    await continueWithGoogle(credential(email));
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(replace).not.toHaveBeenCalled();
  });
});

describe("the two-factor step after Google", () => {
  it("asks for the admin's code, then sends the same Google token with it", async () => {
    search = "next=/security";
    await page();
    const token = credential("owner@myotherapp.in");
    await continueWithGoogle(token);

    const code = await screen.findByLabelText("Authenticator code");
    expect(screen.getByText("owner@myotherapp.in")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Verify and sign in" })).toBeDisabled();

    fireEvent.change(code, { target: { value: "000000" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify and sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That code is not valid");
    expect(code).toHaveValue("");

    fireEvent.change(code, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify and sign in" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/security"));
    expect(calls.at(-1)).toEqual({
      path: "/api/gateway/api/v1/auth/google/dashboard",
      body: { id_token: token, scope: "admin", totp_code: "123456" },
    });
  });

  it("takes a recovery code in place of the authenticator's digits", async () => {
    await page();
    await continueWithGoogle(credential("owner@myotherapp.in"));
    fireEvent.change(await screen.findByLabelText("Authenticator code"), { target: { value: " abcd-efgh " } });
    fireEvent.click(screen.getByRole("button", { name: "Verify and sign in" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
    expect(calls.at(-1)?.body).toMatchObject({ totp_code: "abcd-efgh" });
  });

  it("asks for Google again when its token ran out before the code", async () => {
    await page();
    await continueWithGoogle(credential("owner@myotherapp.in", 5));
    fireEvent.change(await screen.findByLabelText("Authenticator code"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify and sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Your Google sign-in timed out. Continue with Google again.");
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
    expect(calls).toHaveLength(1);
  });
});

describe("a server without Google sign-in yet", () => {
  it("hides the button for the session on the route's bare 404", async () => {
    oldServer = true;
    await page();
    await continueWithGoogle(credential("support@myotherapp.in"));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Sign-in with Google isn't available yet. Sign in with your username and password.",
    );
    expect(screen.queryByRole("button", { name: "Continue with Google" })).toBeNull();

    cleanup();
    gsi.renderButton.mockClear();
    await page();
    expect(screen.getByLabelText("Username")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continue with Google" })).toBeNull();
    expect(gsi.renderButton).not.toHaveBeenCalled();
  });
});
