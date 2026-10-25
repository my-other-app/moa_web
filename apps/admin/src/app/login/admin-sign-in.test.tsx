import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { NextRequest } from "next/server";

/**
 * Admin sign-in: the shared LoginForm as the admin portal's /login renders it.
 *
 * The form itself is exercised in club scope by the clubs app; here it is the
 * admin's door -- no club scope sent, the two-factor step every admin account
 * can have, ?next= kept on this site -- plus the page around it and the edge
 * guard that sends a visitor without a session to it.
 */
const calls: Array<Record<string, string>> = [];
const replace = vi.fn();
const refresh = vi.fn();
let search = "";
const session = { current: null as null | { user_type: string } };
const redirect = vi.fn((to: string) => {
  throw new Error(`redirect ${to}`);
});

vi.mock("next/navigation", () => ({
  redirect: (to: string) => redirect(to),
  useRouter: () => ({ replace, refresh, push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/login",
  useSearchParams: () => new URLSearchParams(search),
}));
vi.mock("@moa/auth/server", () => ({ getSessionQuietly: vi.fn(async () => session.current) }));

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** /auth/token as the backend answers an admin: wrong password, a lockout, two-factor. */
vi.stubGlobal(
  "fetch",
  vi.fn(async (url: string, init: RequestInit) => {
    const form = Object.fromEntries((init.body as URLSearchParams).entries());
    calls.push({ path: String(url), ...form });
    if (form.username === "locked") {
      return reply(429, { message: "Too many wrong passwords. Try again in 5 min.", error_code: "LOGIN_LOCKED" });
    }
    if (form.password !== "right") return reply(401, { message: "Incorrect username or password" });
    if (form.username === "owner") {
      if (!form.totp_code) return reply(401, { message: "Enter the code from your authenticator app", error_code: "TOTP_REQUIRED" });
      if (form.totp_code !== "123456" && form.totp_code !== "abcd-efgh") {
        return reply(401, { message: "That code is not valid", error_code: "TOTP_INVALID" });
      }
    }
    return reply(200, { token_type: "bearer", access_token: "a", refresh_token: "r" });
  })
);

const { render } = await import("@/test/render");
const { default: LoginPage } = await import("./page");
const { proxy, config } = await import("@/proxy");

const page = async (query: Record<string, string> = {}) => {
  search = new URLSearchParams(query).toString();
  render(await LoginPage({ searchParams: Promise.resolve(query) }));
};

const signIn = (username: string, password: string) => {
  fireEvent.change(screen.getByLabelText("Username"), { target: { value: username } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: password } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
};

beforeEach(() => {
  calls.length = 0;
  replace.mockClear();
  refresh.mockClear();
  redirect.mockClear();
  session.current = null;
  search = "";
});

describe("the admin sign-in page", () => {
  it("shows the admin's form, with the admin placeholder", async () => {
    await page();
    expect(screen.getByText("Admin sign in")).toBeInTheDocument();
    expect(screen.getByLabelText("Username")).toHaveAttribute("placeholder", "platform_admin");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("skips the form for an admin who is already signed in", async () => {
    session.current = { user_type: "admin" };
    await expect(LoginPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("redirect /");
  });

  it("sends an admin already signed in to where ?next= said, on this site only", async () => {
    session.current = { user_type: "admin" };
    await expect(LoginPage({ searchParams: Promise.resolve({ next: "/users/412?tab=badges" }) })).rejects.toThrow(
      "redirect /users/412?tab=badges"
    );
    await expect(LoginPage({ searchParams: Promise.resolve({ next: "//evil.example" }) })).rejects.toThrow("redirect /");
  });

  it("does not let a signed-in club account past the form", async () => {
    session.current = { user_type: "club" };
    await page();
    expect(redirect).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Username")).toBeInTheDocument();
  });

  it("says why when the dashboard turned a signed-in account away for not being an admin", async () => {
    // The (dashboard) layout's role gate sends a club or app account here with ?error=forbidden.
    session.current = { user_type: "club" };
    await page({ error: "forbidden" });
    expect(screen.getByRole("alert")).toHaveTextContent("That account is not a platform admin. Sign in with an admin account.");
    expect(screen.getByLabelText("Username")).toBeInTheDocument();
  });
});

describe("signing in as an admin", () => {
  it("asks for both fields before calling the server", async () => {
    await page();
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Enter your username")).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it("posts the form-encoded password grant through this app's gateway, with no club scope", async () => {
    await page();
    signIn("support_desk", "right");
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
    expect(refresh).toHaveBeenCalled();
    expect(calls).toEqual([{ path: "/api/gateway/api/v1/auth/token", username: "support_desk", password: "right" }]);
  });

  it("says a wrong password plainly and stays on the form", async () => {
    await page();
    signIn("support_desk", "wrong");
    expect(await screen.findByRole("alert")).toHaveTextContent("Incorrect username or password");
    expect(replace).not.toHaveBeenCalled();
  });

  it("shows the lockout from the door", async () => {
    await page();
    signIn("locked", "right");
    expect(await screen.findByRole("alert")).toHaveTextContent("Too many wrong passwords. Try again in 5 min.");
  });

  it("returns to the page the guard sent them from, and never off the site", async () => {
    await page({ next: "/payments?status=failed" });
    signIn("support_desk", "right");
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/payments?status=failed"));

    replace.mockClear();
    cleanup();
    await page({ next: "/\\evil.example" });
    signIn("support_desk", "right");
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
  });
});

describe("the two-factor step at admin sign-in", () => {
  it("asks for the code once the password is right, and keeps Verify shut until six characters", async () => {
    await page();
    signIn("owner", "right");
    const code = await screen.findByLabelText("Authenticator code");
    expect(screen.getByText("owner")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Verify and sign in" })).toBeDisabled();
    fireEvent.change(code, { target: { value: "12345" } });
    expect(screen.getByRole("button", { name: "Verify and sign in" })).toBeDisabled();
    expect(replace).not.toHaveBeenCalled();
  });

  it("clears a wrong code and says so, then signs in with the right one", async () => {
    await page({ next: "/security" });
    signIn("owner", "right");
    const code = await screen.findByLabelText("Authenticator code");

    fireEvent.change(code, { target: { value: "000000" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify and sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That code is not valid");
    expect(code).toHaveValue("");

    fireEvent.change(code, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify and sign in" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/security"));
    expect(calls.at(-1)).toEqual({ path: "/api/gateway/api/v1/auth/token", username: "owner", password: "right", totp_code: "123456" });
  });

  it("takes a recovery code in place of the authenticator's digits", async () => {
    await page();
    signIn("owner", "right");
    fireEvent.change(await screen.findByLabelText("Authenticator code"), { target: { value: " abcd-efgh " } });
    fireEvent.click(screen.getByRole("button", { name: "Verify and sign in" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
    expect(calls.at(-1)).toMatchObject({ totp_code: "abcd-efgh" });
  });

  it("goes back to the password with the username kept", async () => {
    await page();
    signIn("owner", "right");
    await screen.findByLabelText("Authenticator code");
    fireEvent.click(screen.getByRole("button", { name: "Back to the password" }));
    expect(screen.getByLabelText("Username")).toHaveValue("owner");
    expect(screen.queryByLabelText("Authenticator code")).toBeNull();
  });
});

describe("the guard in front of the portal", () => {
  const visit = (path: string, cookie?: string) =>
    proxy(new NextRequest(`https://main-portal.myotherapp.in${path}`, cookie ? { headers: { cookie } } : undefined));

  it("sends a visitor without a session to sign-in, remembering where they were going", () => {
    const response = visit("/users/412?tab=events");
    expect(response.headers.get("location")).toBe(
      `https://main-portal.myotherapp.in/login?next=${encodeURIComponent("/users/412?tab=events")}`
    );
  });

  it("sends the Overview to plain /login, with nothing to come back to", () => {
    expect(visit("/").headers.get("location")).toBe("https://main-portal.myotherapp.in/login");
  });

  it("lets a request carrying a session through to the role check", () => {
    const response = visit("/users", "access_token=abc");
    expect(response.headers.get("location")).toBeNull();
  });

  it("leaves the sign-in page and the gateway the login posts through unguarded", () => {
    const guarded = (path: string) => new RegExp(`^${config.matcher[0]}$`).test(path);
    expect(guarded("/login")).toBe(false);
    expect(guarded("/api/gateway/api/v1/auth/token")).toBe(false);
    expect(guarded("/users")).toBe(true);
    expect(guarded("/")).toBe(true);
  });
});
