import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { toast } from "@moa/ui";

/**
 * The admin's own Security page: two-factor on and off, the recovery codes,
 * and the list of sessions with "sign out" and "sign out everywhere".
 *
 * The calls are pinned in critical-surfaces.test.ts. These are the screens:
 * enrolment only turns on once a code has been read back, the recovery codes
 * are shown exactly once, turning it off needs a current code, and a wrong
 * code leaves everything as it was.
 */
type Session = { id: string; user_agent: string | null; ip_address: string | null; last_seen_at: string; current: boolean };

const calls: Array<{ method: string; path: string; body?: unknown }> = [];
let totp = { enabled: false, recovery_codes_remaining: 0 };
let sessions: Session[] = [];
/** Refuse writes to paths containing this with the given error. */
let refuse: { path: string; error: Error } | null = null;

const nav = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: nav.replace, refresh: nav.refresh, prefetch: vi.fn() }),
  usePathname: () => "/security",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  const refused = (path: string) => {
    if (refuse && path.includes(refuse.path)) throw refuse.error;
  };
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        calls.push({ method: "GET", path });
        if (path === "/api/v1/auth/2fa") return totp;
        if (path === "/api/v1/auth/sessions") return sessions;
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(async (path: string, body?: unknown) => {
        calls.push({ method: "POST", path, body });
        refused(path);
        if (path.endsWith("/2fa/setup")) {
          return { secret: "JBSWY3DPEHPK3PXP", provisioning_uri: "otpauth://totp/MyOtherApp:me?secret=JBSWY3DPEHPK3PXP" };
        }
        if (path.endsWith("/2fa/enable")) {
          totp = { enabled: true, recovery_codes_remaining: 2 };
          return { enabled: true, recovery_codes: ["aaaa-bbbb", "cccc-dddd"] };
        }
        if (path.endsWith("/2fa/disable")) {
          totp = { enabled: false, recovery_codes_remaining: 0 };
          return { message: "Two-factor disabled" };
        }
        throw new Error(`unstubbed POST ${path}`);
      }),
      put: vi.fn(),
      del: vi.fn(async (path: string) => {
        calls.push({ method: "DELETE", path });
        refused(path);
        if (path === "/api/v1/auth/sessions") sessions = [];
        else sessions = sessions.filter((s) => !path.endsWith(`/${s.id}`));
      }),
    },
  };
});

const { render } = await import("@/test/render");
const { TwoFactorPanel, SessionsPanel } = await import("./index");

const writes = () => calls.filter((c) => c.method !== "GET");
let success: MockInstance<typeof toast.success>;
let failure: MockInstance<typeof toast.error>;

beforeEach(() => {
  calls.length = 0;
  totp = { enabled: false, recovery_codes_remaining: 0 };
  sessions = [
    { id: "s-here", user_agent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)", ip_address: "10.0.0.1", last_seen_at: "2026-10-24T10:00:00+05:30", current: true },
    { id: "s-phone", user_agent: "Mozilla/5.0 (Linux; Android 14)", ip_address: "10.0.0.2", last_seen_at: "2026-10-20T10:00:00+05:30", current: false },
  ];
  refuse = null;
  nav.replace.mockClear();
  nav.refresh.mockClear();
  success = vi.spyOn(toast, "success");
  failure = vi.spyOn(toast, "error");
});

afterEach(() => vi.restoreAllMocks());

describe("two-factor", () => {
  async function startSetup() {
    render(<TwoFactorPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "Set up two-factor" }));
    return screen.findByText("JBSWY3DPEHPK3PXP");
  }

  it("is off until set up, and setting up shows the key and the authenticator link", async () => {
    render(<TwoFactorPanel />);
    expect(await screen.findByText("Off")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Set up two-factor" }));

    expect(await screen.findByText("JBSWY3DPEHPK3PXP")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "this link" })).toHaveAttribute(
      "href",
      "otpauth://totp/MyOtherApp:me?secret=JBSWY3DPEHPK3PXP"
    );
    expect(writes()).toEqual([{ method: "POST", path: "/api/v1/auth/2fa/setup", body: undefined }]);
    // Not on yet: it only turns on once a code from the app is read back.
    expect(screen.getByText("Off")).toBeInTheDocument();
  });

  it("will not confirm without a six-digit code", async () => {
    await startSetup();
    const confirm = screen.getByRole("button", { name: "Confirm and turn on" });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Code from the app"), { target: { value: "12345" } });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Code from the app"), { target: { value: "123456" } });
    expect(confirm).toBeEnabled();
  });

  it("turns on with the code and shows the recovery codes once", async () => {
    await startSetup();
    fireEvent.change(screen.getByLabelText("Code from the app"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm and turn on" }));

    expect(await screen.findByText("Save these recovery codes now")).toBeInTheDocument();
    expect(writes().at(-1)).toEqual({ method: "POST", path: "/api/v1/auth/2fa/enable", body: { code: "123456" } });
    expect(screen.getByText("aaaa-bbbb")).toBeInTheDocument();
    expect(screen.getByText("cccc-dddd")).toBeInTheDocument();
    expect(screen.getByText("They are not shown again")).toBeInTheDocument();
    expect(success).toHaveBeenCalledWith("Two-factor is on");
    expect(await screen.findByText("On")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "I have saved them" }));
    expect(screen.queryByText("aaaa-bbbb")).toBeNull();
    expect(screen.getByText("2 recovery codes left.")).toBeInTheDocument();
  });

  it("copies every recovery code at once", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    await startSetup();
    fireEvent.change(screen.getByLabelText("Code from the app"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm and turn on" }));
    fireEvent.click(await screen.findByRole("button", { name: /copy all/i }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("aaaa-bbbb\ncccc-dddd"));
    expect(success).toHaveBeenCalledWith("Copied");
  });

  it("stays off, with the key still there, when the code is wrong", async () => {
    refuse = { path: "/2fa/enable", error: new Error("That code is not valid") };
    await startSetup();
    fireEvent.change(screen.getByLabelText("Code from the app"), { target: { value: "000000" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm and turn on" }));

    await waitFor(() => expect(failure).toHaveBeenCalledWith("That code is not valid"));
    expect(screen.queryByText("Save these recovery codes now")).toBeNull();
    expect(screen.getByText("JBSWY3DPEHPK3PXP")).toBeInTheDocument();
    expect(screen.getByLabelText("Code from the app")).toHaveValue("000000");
    expect(screen.getByText("Off")).toBeInTheDocument();
  });

  it("needs a current code to turn off, then turns off", async () => {
    totp = { enabled: true, recovery_codes_remaining: 7 };
    render(<TwoFactorPanel />);
    expect(await screen.findByText("7 recovery codes left.")).toBeInTheDocument();
    const off = screen.getByRole("button", { name: "Turn off" });
    expect(off).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Enter a current code to turn it off"), { target: { value: "654321" } });
    fireEvent.click(off);

    await waitFor(() => expect(success).toHaveBeenCalledWith("Two-factor is off"));
    expect(writes()).toEqual([{ method: "POST", path: "/api/v1/auth/2fa/disable", body: { code: "654321" } }]);
    expect(await screen.findByText("Off")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Set up two-factor" })).toBeInTheDocument();
  });

  it("stays on when the code to turn it off is wrong", async () => {
    refuse = { path: "/2fa/disable", error: new Error("That code is not valid") };
    totp = { enabled: true, recovery_codes_remaining: 7 };
    render(<TwoFactorPanel />);
    await screen.findByText("7 recovery codes left.");
    fireEvent.change(screen.getByLabelText("Enter a current code to turn it off"), { target: { value: "000000" } });
    fireEvent.click(screen.getByRole("button", { name: "Turn off" }));

    await waitFor(() => expect(failure).toHaveBeenCalledWith("That code is not valid"));
    expect(success).not.toHaveBeenCalled();
    expect(screen.getByText("On")).toBeInTheDocument();
    expect(screen.getByLabelText("Enter a current code to turn it off")).toHaveValue("000000");
  });

  it("starts a fresh setup after being turned off, not the spent key", async () => {
    // Turning off deletes the secret on the server, so the old key can no
    // longer be confirmed ("Start setup first"). It used to come back anyway.
    await startSetup();
    fireEvent.change(screen.getByLabelText("Code from the app"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm and turn on" }));
    fireEvent.click(await screen.findByRole("button", { name: "I have saved them" }));
    fireEvent.change(await screen.findByLabelText("Enter a current code to turn it off"), { target: { value: "654321" } });
    fireEvent.click(screen.getByRole("button", { name: "Turn off" }));

    expect(await screen.findByRole("button", { name: "Set up two-factor" })).toBeInTheDocument();
    expect(screen.queryByText("JBSWY3DPEHPK3PXP")).toBeNull();
  });
});

describe("sessions", () => {
  const rowOf = (text: string) => screen.getByText(text).closest("div.flex") as HTMLElement;

  it("lists where the account is signed in, marking this device", async () => {
    render(<SessionsPanel />);
    expect(await screen.findByText("Android")).toBeInTheDocument();
    expect(screen.getByText("Mac")).toBeInTheDocument();
    expect(screen.getByText("This device")).toBeInTheDocument();
    expect(screen.getByText(/10\.0\.0\.2 · last seen/)).toBeInTheDocument();
    // Ending the one in use is what "sign out everywhere" is for.
    expect(screen.getAllByRole("button", { name: "Sign out" })).toHaveLength(1);
  });

  it("signs one session out and drops it from the list", async () => {
    render(<SessionsPanel />);
    await screen.findByText("Android");
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    await waitFor(() => expect(success).toHaveBeenCalledWith("Signed that session out"));
    expect(writes()).toEqual([{ method: "DELETE", path: "/api/v1/auth/sessions/s-phone" }]);
    await waitFor(() => expect(screen.queryByText("Android")).toBeNull());
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("keeps the session listed when the server refuses", async () => {
    refuse = { path: "/sessions/s-phone", error: new Error("Session not found") };
    render(<SessionsPanel />);
    await screen.findByText("Android");
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    await waitFor(() => expect(failure).toHaveBeenCalledWith("Session not found"));
    expect(rowOf("Android")).toBeInTheDocument();
  });

  it("signs out everywhere, including here, and goes to sign-in", async () => {
    render(<SessionsPanel />);
    await screen.findByText("Android");
    fireEvent.click(screen.getByRole("button", { name: "Sign out everywhere, including here" }));

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/login"));
    expect(writes()).toEqual([{ method: "DELETE", path: "/api/v1/auth/sessions" }]);
    expect(nav.refresh).toHaveBeenCalled();
  });

  it("stays signed in and says why when signing out everywhere is refused", async () => {
    refuse = { path: "/api/v1/auth/sessions", error: new Error("Try again in a minute") };
    render(<SessionsPanel />);
    await screen.findByText("Android");
    fireEvent.click(screen.getByRole("button", { name: "Sign out everywhere, including here" }));

    await waitFor(() => expect(failure).toHaveBeenCalledWith("Try again in a minute"));
    expect(nav.replace).not.toHaveBeenCalled();
    expect(within(rowOf("Mac")).getByText("This device")).toBeInTheDocument();
  });

  it("says so when no session is recorded", async () => {
    sessions = [];
    render(<SessionsPanel />);
    expect(await screen.findByText("No recorded sessions")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /sign out everywhere/i })).toBeNull();
  });
});
