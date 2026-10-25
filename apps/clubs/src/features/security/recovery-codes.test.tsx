import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { ApiError } from "@moa/api";
import { toast } from "@moa/ui";

import fixture from "../__fixtures__/security-overview.json";

/**
 * New recovery codes: the club that lost its set (or used most of it) makes
 * a fresh eight with a current authenticator code. They are shown once, and
 * the page says the old ones stopped working. An admin acting as the club is
 * refused by the server, and the page says why in plain words.
 */
const calls: Array<{ method: string; path: string; body?: unknown }> = [];
let refuse: Error | null = null;
let me: unknown = null;
const NEW_CODES = ["aaaa-1111", "bbbb-2222", "cccc-3333", "dddd-4444", "eeee-5555", "ffff-6666", "gggg-7777", "hhhh-8888"];

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }), usePathname: () => "/security" }));

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        calls.push({ method: "GET", path });
        if (path.endsWith("/auth/security/overview")) return { ...fixture, two_factor: { enabled: true, recovery_codes_remaining: 2 } };
        if (path.endsWith("/clubs/access/me") && me) return me;
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "POST", path, body });
        if (refuse) throw refuse;
        if (path.endsWith("/2fa/recovery-codes")) return { enabled: true, recovery_codes: NEW_CODES };
        return {};
      }),
      patch: vi.fn(),
      put: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { SecurityPage } = await import("./components/security-page");

beforeEach(() => {
  calls.length = 0;
  refuse = null;
  me = null;
  vi.restoreAllMocks();
});

const posts = () => calls.filter((c) => c.method === "POST");

describe("new recovery codes", () => {
  it("shows how many are left and asks for an authenticator code first", async () => {
    render(<SecurityPage />);
    expect(await screen.findByText("2 recovery codes left")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /New recovery codes/ }));
    expect(screen.getByText(/every code you had before stops working/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Make new codes/ })).toBeDisabled();
    expect(posts()).toEqual([]);
  });

  it("makes eight new codes, shows them once and says the old ones stopped working", async () => {
    render(<SecurityPage />);
    fireEvent.click(await screen.findByRole("button", { name: /New recovery codes/ }));
    fireEvent.change(screen.getByLabelText("Authenticator code"), { target: { value: "123 456" } });
    fireEvent.click(screen.getByRole("button", { name: /Make new codes/ }));
    await waitFor(() => expect(posts()).toEqual([{ method: "POST", path: "/api/v1/auth/2fa/recovery-codes", body: { code: "123 456" } }]));
    for (const c of NEW_CODES) expect(await screen.findByText(c)).toBeInTheDocument();
    expect(screen.getByText("The codes you had before no longer work. Each of these works once.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Download/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByText(NEW_CODES[0]!)).not.toBeInTheDocument();
  });

  it("says a wrong code is wrong and keeps the field", async () => {
    const error = vi.spyOn(toast, "error");
    refuse = new ApiError({ status: 400, message: "That code is not valid" });
    render(<SecurityPage />);
    fireEvent.click(await screen.findByRole("button", { name: /New recovery codes/ }));
    fireEvent.change(screen.getByLabelText("Authenticator code"), { target: { value: "000000" } });
    fireEvent.click(screen.getByRole("button", { name: /Make new codes/ }));
    await waitFor(() => expect(error).toHaveBeenCalledWith("That code is not valid"));
    expect(screen.getByLabelText("Authenticator code")).toBeInTheDocument();
  });

  it("tells an admin acting as the club that only the club can do this", async () => {
    const error = vi.spyOn(toast, "error");
    refuse = new ApiError({ status: 403, message: "Not while acting as the club", errorCode: "NOT_WHILE_IMPERSONATING" });
    render(<SecurityPage />);
    fireEvent.click(await screen.findByRole("button", { name: /New recovery codes/ }));
    fireEvent.change(screen.getByLabelText("Authenticator code"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /Make new codes/ }));
    await waitFor(() => expect(error).toHaveBeenCalledWith(expect.stringContaining("Only the club's own sign-in can make new recovery codes")));
  });

  it("is not offered to a team member, whose page is their own account", async () => {
    me = {
      role: "editor", role_label: "Editor", role_description: "Events.", club_id: 1, club_name: "Circuit Society",
      can: { manage_access: false, see_access: false, money: false, club_profile: false, edit_events: true, delete_events: false, door: true },
      member: { id: 4, email: "priya@example.com", full_name: "Priya", role: "editor", role_label: "Editor", status: "active", invite_expired: false, invited_at: null, accepted_at: null, last_seen_at: null, whatsapp: false },
    };
    render(<SecurityPage />);
    await waitFor(() => expect(calls.some((c) => c.path.endsWith("/clubs/access/me"))).toBe(true));
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole("button", { name: /New recovery codes/ })).not.toBeInTheDocument();
  });
});
