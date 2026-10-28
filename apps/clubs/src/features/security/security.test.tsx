import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

import fixture from "../__fixtures__/security-overview.json";

const calls: Array<{ method: string; path: string; body?: unknown }> = [];
const URI = "otpauth://totp/MyOtherApp:circuit-society?secret=JBSWY3DPEHPK3PXP&issuer=MyOtherApp";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }), usePathname: () => "/security" }));

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        calls.push({ method: "GET", path });
        if (path.endsWith("/auth/security/overview")) return fixture;
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "POST", path, body });
        if (path.endsWith("/sign-out-others")) return { signed_out: 4 };
        if (path.endsWith("/2fa/setup")) return { secret: "JBSWY3DPEHPK3PXP", provisioning_uri: URI };
        if (path.endsWith("/2fa/enable")) return { enabled: true, recovery_codes: ["aaaa-1111", "bbbb-2222"] };
        return {};
      }),
      patch: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "PATCH", path, body });
      }),
      put: vi.fn(),
      del: vi.fn(async (path: string) => {
        calls.push({ method: "DELETE", path });
      }),
    },
  };
});

const { render } = await import("@/test/render");
const { SecurityPage } = await import("./components/security-page");
const { securityOverviewSchema } = await import("./schemas");

beforeEach(() => {
  calls.length = 0;
});

describe("security", () => {
  it("parses the overview", () => {
    const s = securityOverviewSchema.parse(fixture);
    expect(s.sessions).toHaveLength(5);
    expect(s.sessions[0]?.current).toBe(true);
  });

  it("reads the tiles, this device, every session, the places and the history", async () => {
    render(<SecurityPage />);
    expect(await screen.findByText("Devices signed in right now")).toBeInTheDocument();
    expect(screen.getByText(/Club account · circuit-society/)).toBeInTheDocument();
    expect(screen.getByText("37")).toBeInTheDocument();
    expect(screen.getByText(/\+18%/)).toBeInTheDocument();
    expect(screen.getByText("Frankfurt, Germany was blocked after 5 tries")).toBeInTheDocument();
    expect(screen.getByText("This device")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Revoke" })).toHaveLength(4);
    expect(screen.getByRole("progressbar", { name: "Frankfurt, Germany sign-ins" })).toHaveAttribute("aria-valuenow", "3");
    expect(screen.getByRole("switch", { name: "Email me about new devices" })).toBeChecked();
    expect(screen.getAllByText("Wrong password")).toHaveLength(3);
    expect(screen.getByText("Blocked")).toBeInTheDocument();
    expect(calls[0]).toMatchObject({ method: "GET", path: "/api/v1/auth/security/overview" });
  });

  it("filters the history to failures", async () => {
    render(<SecurityPage />);
    await screen.findByText("Sign-in history");
    fireEvent.click(screen.getByRole("button", { name: "Failed only" }));
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(1 + 4);
    expect(within(table).queryByText("Signed in")).not.toBeInTheDocument();
  });

  it("revokes one session on a second click, signs out the others, and flips the switch", async () => {
    render(<SecurityPage />);
    await screen.findByText("Devices signed in right now");
    fireEvent.click(screen.getAllByRole("button", { name: "Revoke" })[0]!);
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Sign out?" }));
    await waitFor(() => expect(calls.some((c) => c.method === "DELETE")).toBe(true));
    expect(calls.find((c) => c.method === "DELETE")).toMatchObject({ path: "/api/v1/auth/sessions/s2" });

    fireEvent.click(screen.getByRole("button", { name: "Sign out all other sessions" }));
    fireEvent.click(screen.getByRole("button", { name: "Sign out 4 other sessions?" }));
    await waitFor(() => expect(calls.some((c) => c.path.endsWith("/sign-out-others"))).toBe(true));

    fireEvent.click(screen.getByRole("switch", { name: "Email me about new devices" }));
    await waitFor(() => expect(calls.some((c) => c.method === "PATCH")).toBe(true));
    expect(calls.find((c) => c.method === "PATCH")).toMatchObject({ path: "/api/v1/auth/security/preferences", body: { notify_new_device: false } });
  });

  it("sets two-factor up with a QR code to scan, and the key and link for anyone who can't", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<SecurityPage />);
    await screen.findByText("Two-factor sign-in");
    fireEvent.click(screen.getByRole("button", { name: "Turn on" }));

    const qr = await screen.findByRole("img", { name: "QR code for your authenticator app" });
    expect(qr.querySelector("path")?.getAttribute("d")).toMatch(/^M\d+ \d+h\d+/);
    expect(screen.getByText(/^Scan this with Google Authenticator, Microsoft Authenticator, 1Password or any authenticator app/)).toBeInTheDocument();
    const cantScan = screen.getByRole("group", { name: "Can't scan?" });
    expect(within(cantScan).getByText("JBSW Y3DP EHPK 3PXP")).toBeInTheDocument();
    expect(within(cantScan).getByRole("link", { name: "Open in authenticator app" })).toHaveAttribute("href", URI);
    fireEvent.click(within(cantScan).getByRole("button", { name: "Copy key" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("JBSWY3DPEHPK3PXP"));
    // Drawn here: the only calls are the page's own, never a QR service.
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(calls.filter((c) => c.method === "POST").map((c) => c.path)).toEqual(["/api/v1/auth/2fa/setup"]);
    // Still off until a code from the app is read back.
    expect(screen.getByText("Off")).toBeInTheDocument();
    fetchSpy.mockRestore();
  });

  it("goes back to the switch, with no code on screen, when setup is cancelled", async () => {
    render(<SecurityPage />);
    await screen.findByText("Two-factor sign-in");
    fireEvent.click(screen.getByRole("button", { name: "Turn on" }));
    await screen.findByRole("img", { name: "QR code for your authenticator app" });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("img", { name: "QR code for your authenticator app" })).toBeNull();
    expect(screen.queryByText("JBSW Y3DP EHPK 3PXP")).toBeNull();
    expect(screen.getByRole("button", { name: "Turn on" })).toBeInTheDocument();
  });

  it("turns two-factor on and shows the recovery codes once", async () => {
    render(<SecurityPage />);
    await screen.findByText("Two-factor sign-in");
    fireEvent.click(screen.getByRole("button", { name: "Turn on" }));
    expect(await screen.findByText("JBSW Y3DP EHPK 3PXP")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Authenticator code"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Turn on" }));
    expect(await screen.findByText("aaaa-1111")).toBeInTheDocument();
    expect(calls.find((c) => c.path.endsWith("/2fa/enable"))).toMatchObject({ body: { code: "123456" } });
    // The key is spent once it is on: the QR code and the key leave the screen.
    expect(screen.queryByRole("img", { name: "QR code for your authenticator app" })).toBeNull();
    expect(screen.queryByText("JBSW Y3DP EHPK 3PXP")).toBeNull();
  });
});
