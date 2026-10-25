import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";

const replace = vi.fn();
const calls: Array<{ path: string; body: Record<string, unknown> }> = [];
/** What the server answers each call with, by path ending; a function sees the body. */
let answers: Record<string, (body: Record<string, unknown>) => Response> = {};

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/forgot-password",
  useSearchParams: () => new URLSearchParams(),
}));

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/**
 * The club's forgotten password, against the API as it answers: stubbed at
 * fetch (the form reaches the shared client inside @moa/app-kit), so the
 * gateway paths and bodies are exactly what goes out.
 */
vi.stubGlobal(
  "fetch",
  vi.fn(async (url: string, init: RequestInit) => {
    const path = String(url);
    const body = JSON.parse(String(init.body ?? "{}")) as Record<string, unknown>;
    calls.push({ path, body });
    const hit = Object.entries(answers).find(([end]) => path.endsWith(end));
    return hit ? hit[1](body) : reply(200, {});
  }),
);

const { render } = await import("@/test/render");
const { ForgotPassword } = await import("./components/forgot-password");

beforeEach(() => {
  calls.length = 0;
  replace.mockClear();
  answers = {
    "/auth/club/password/forgot": () => reply(200, { sent: true }),
    "/auth/club/password/reset": () => reply(200, { reset: true }),
  };
});

async function toCodeStep(email = "circuit@example.com") {
  render(<ForgotPassword />);
  fireEvent.change(screen.getByLabelText("Email address"), { target: { value: email } });
  fireEvent.click(screen.getByRole("button", { name: /Email me a code/ }));
  await screen.findByLabelText("Code from the email");
}

function fillCode(code = "123456", password = "New-pass-2026") {
  fireEvent.change(screen.getByLabelText("Code from the email"), { target: { value: code } });
  fireEvent.change(screen.getByLabelText("New password"), { target: { value: password } });
  fireEvent.change(screen.getByLabelText("Repeat the new password"), { target: { value: password } });
  fireEvent.click(screen.getByRole("button", { name: /Set the new password/ }));
}

const posts = (end: string) => calls.filter((c) => c.path.endsWith(end));

describe("forgot password", () => {
  it("asks for a valid address before calling the server", async () => {
    render(<ForgotPassword />);
    fireEvent.click(screen.getByRole("button", { name: /Email me a code/ }));
    expect(await screen.findByText("Enter the email address you sign in with")).toBeInTheDocument();
    expect(calls).toEqual([]);
  });

  it("sends the code request and says the same whoever asks", async () => {
    await toCodeStep(" Circuit@Example.com ");
    expect(posts("/auth/club/password/forgot")).toEqual([
      { path: "/api/gateway/api/v1/auth/club/password/forgot", body: { email: "Circuit@Example.com" } },
    ]);
    expect(screen.getByText(/If an account uses that address, a 6-digit code is on its way/)).toBeInTheDocument();
  });

  it("sets the new password with the code and goes back to sign in", async () => {
    await toCodeStep();
    fillCode("123 456");
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login?reset=1"));
    expect(posts("/auth/club/password/reset")[0]?.body).toEqual({ email: "circuit@example.com", code: "123456", new_password: "New-pass-2026" });
  });

  it("checks the code's shape and the repeat before asking the server", async () => {
    await toCodeStep();
    fireEvent.change(screen.getByLabelText("Code from the email"), { target: { value: "12" } });
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "New-pass-2026" } });
    fireEvent.change(screen.getByLabelText("Repeat the new password"), { target: { value: "Other-pass-2026" } });
    fireEvent.click(screen.getByRole("button", { name: /Set the new password/ }));
    expect(await screen.findByText("Enter the 6-digit code from the email")).toBeInTheDocument();
    expect(screen.getByText("Passwords do not match")).toBeInTheDocument();
    expect(posts("/auth/club/password/reset")).toEqual([]);
  });

  it("says a wrong code is wrong, with the server's words", async () => {
    answers["/auth/club/password/reset"] = () =>
      reply(400, { message: "That code isn't right. Check the email address and the code, or ask for a new one.", error_code: "CODE_INVALID", errors: { attempts_left: 4 } });
    await toCodeStep();
    fillCode();
    expect(await screen.findByText(/That code isn't right/)).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("offers a new code once the old one is spent", async () => {
    answers["/auth/club/password/reset"] = () => reply(400, { message: "Too many wrong tries. Ask for a new code.", error_code: "CODE_LOCKED", errors: { attempts_left: 0 } });
    await toCodeStep();
    fillCode();
    fireEvent.click(await screen.findByRole("button", { name: "Send a new code" }));
    await waitFor(() => expect(posts("/auth/club/password/forgot")).toHaveLength(2));
  });

  it("asks for the authenticator code when the account has two-factor on, then sends it", async () => {
    answers["/auth/club/password/reset"] = (body) =>
      body.totp_code ? reply(200, { reset: true }) : reply(401, { message: "Enter the code from your authenticator app as well.", error_code: "TOTP_REQUIRED" });
    await toCodeStep();
    fillCode();
    const totp = await screen.findByLabelText(/Authenticator code/);
    fireEvent.change(totp, { target: { value: "654321" } });
    fireEvent.click(screen.getByRole("button", { name: /Set the new password/ }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login?reset=1"));
    expect(posts("/auth/club/password/reset")[1]?.body).toMatchObject({ totp_code: "654321" });
  });

  it("says plainly when the server has no password reset yet", async () => {
    answers["/auth/club/password/forgot"] = () => reply(404, { detail: "Not Found" });
    render(<ForgotPassword />);
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "circuit@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /Email me a code/ }));
    expect(await screen.findByText(/Password reset isn't available yet — contact MyOtherApp/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Code from the email")).not.toBeInTheDocument();
  });
});
