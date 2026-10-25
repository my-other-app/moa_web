import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";

const calls: Array<Record<string, string>> = [];
const replace = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh, push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/login",
  useSearchParams: () => new URLSearchParams("next=/events/37"),
}));

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/**
 * /auth/token as the backend answers it: a wrong password, a locked door,
 * an account that wants its authenticator code, and a wrong code. Stubbed
 * at fetch, before the shared client is made, because the form reaches the
 * client from inside @moa/app-kit rather than through its public barrel.
 */
vi.stubGlobal(
  "fetch",
  vi.fn(async (url: string, init: RequestInit) => {
    const form = Object.fromEntries((init.body as URLSearchParams).entries());
    calls.push({ path: String(url), ...form });
    if (form.username === "locked") return reply(429, { message: "Too many wrong passwords. Try again in 5 min.", error_code: "LOGIN_LOCKED" });
    if (form.username === "applicant@example.com" && form.password === "right") {
      return reply(403, { message: "Your club is waiting for approval. We will email you when it is approved.", error_code: "CLUB_NOT_VERIFIED" });
    }
    if (form.password !== "right") return reply(401, { message: "Incorrect username or password" });
    if (form.username === "two_factor") {
      if (!form.totp_code) return reply(401, { message: "Enter the code from your authenticator app", error_code: "TOTP_REQUIRED" });
      if (form.totp_code !== "123456") return reply(401, { message: "That code is not valid", error_code: "TOTP_INVALID" });
    }
    return reply(200, { token_type: "bearer", access_token: "a", refresh_token: "r" });
  }),
);

const { render } = await import("@/test/render");
const { LoginForm, setLoginScope } = await import("@moa/app-kit");

const signIn = (username: string, password: string) => {
  fireEvent.change(screen.getByLabelText("Username"), { target: { value: username } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: password } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
};

beforeEach(() => {
  calls.length = 0;
  replace.mockClear();
  refresh.mockClear();
});

describe("signing in", () => {
  it("asks for both fields before calling the server", async () => {
    render(<LoginForm usernamePlaceholder="your_club" />);
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Enter your username")).toBeInTheDocument();
    expect(screen.getByText("Enter your password")).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it("says a wrong password plainly, and lands on ?next= after a right one", async () => {
    render(<LoginForm usernamePlaceholder="your_club" />);
    signIn("circuit", "wrong");
    expect(await screen.findByRole("alert")).toHaveTextContent("Incorrect username or password");
    signIn("circuit", "right");
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/events/37"));
    expect(refresh).toHaveBeenCalled();
  });

  it("shows the lockout message from the door", async () => {
    render(<LoginForm usernamePlaceholder="your_club" />);
    signIn("locked", "right");
    expect(await screen.findByRole("alert")).toHaveTextContent("Too many wrong passwords. Try again in 5 min.");
  });

  it("tells a club whose application is not approved yet that it is under review", async () => {
    // As the app's providers set it: the club account is looked for first.
    setLoginScope("club");
    render(<LoginForm usernamePlaceholder="your_club" />);
    signIn("applicant@example.com", "right");
    expect(await screen.findByRole("alert")).toHaveTextContent("Your club is still under review — we'll email you when it's approved.");
    expect(calls.at(-1)).toMatchObject({ scope: "club" });
    expect(replace).not.toHaveBeenCalled();
    setLoginScope(undefined);
  });

  it("asks for the authenticator code when the account has two-factor sign-in", async () => {
    render(<LoginForm usernamePlaceholder="your_club" />);
    signIn("two_factor", "right");
    const code = await screen.findByLabelText("Authenticator code");
    expect(screen.getByText("two_factor")).toBeInTheDocument();
    const verify = screen.getByRole("button", { name: "Verify and sign in" });
    expect(verify).toBeDisabled();

    fireEvent.change(code, { target: { value: "000000" } });
    fireEvent.click(verify);
    expect(await screen.findByRole("alert")).toHaveTextContent("That code is not valid");
    expect(code).toHaveValue("");

    fireEvent.change(code, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify and sign in" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/events/37"));
    expect(calls.at(-1)).toMatchObject({ path: "/api/gateway/api/v1/auth/token", username: "two_factor", password: "right", totp_code: "123456" });
  });

  it("goes back to the password from the code step", async () => {
    render(<LoginForm usernamePlaceholder="your_club" />);
    signIn("two_factor", "right");
    await screen.findByLabelText("Authenticator code");
    fireEvent.click(screen.getByRole("button", { name: "Back to the password" }));
    expect(screen.getByLabelText("Username")).toHaveValue("two_factor");
  });

  it("offers 'Forgot password?' where the app asks for it, and only there (the admin portal has none)", () => {
    const { unmount } = render(<LoginForm usernamePlaceholder="your_club" forgotPasswordHref="/forgot-password" />);
    expect(screen.getByRole("link", { name: "Forgot password?" })).toHaveAttribute("href", "/forgot-password");
    unmount();
    render(<LoginForm usernamePlaceholder="your_username" />);
    expect(screen.queryByRole("link", { name: "Forgot password?" })).not.toBeInTheDocument();
  });
});
