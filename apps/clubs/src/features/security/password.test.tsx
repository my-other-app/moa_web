import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { ApiError } from "@moa/api";

import fixture from "../__fixtures__/security-overview.json";

/**
 * Changing a password from Security. The club account's password is shared
 * by the committee, and changing it ends every session, this one too -- so a
 * change that went through sends the page to sign-in, and one that did not
 * leaves it where it is. A team member changes only their own.
 */
const posts: Array<{ path: string; body: unknown }> = [];
const nav = { replace: vi.fn(), refresh: vi.fn(), push: vi.fn() };
const state: { me: unknown; refuse: Error | null } = { me: null, refuse: null };

vi.mock("next/navigation", () => ({ useRouter: () => nav, usePathname: () => "/security" }));

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        if (path.endsWith("/auth/security/overview")) return fixture;
        if (path === "/api/v1/clubs/access/me") {
          if (state.me) return state.me;
          throw new ApiError({ status: 404, message: "Not Found", routeMissing: true });
        }
        // The connected-assistants section is not what these tests are about.
        if (path.includes("/mcp")) return [];
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(async (path: string, body: unknown) => {
        posts.push({ path, body });
        if (state.refuse) throw state.refuse;
        return {};
      }),
      patch: vi.fn(),
      put: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { toast } = await import("@moa/ui");
const { render } = await import("@/test/render");
const { SecurityPage } = await import("./components/security-page");

beforeEach(() => {
  posts.length = 0;
  state.me = null;
  state.refuse = null;
  nav.replace.mockClear();
  nav.refresh.mockClear();
  vi.restoreAllMocks();
});

describe("the club account's password", () => {
  const card = async () => (await screen.findByText("Change password")).closest("[data-slot='figure-panel']") as HTMLElement;
  const fill = (c: HTMLElement, current: string, next: string, again: string) => {
    fireEvent.change(within(c).getByLabelText("Current password"), { target: { value: current } });
    fireEvent.change(within(c).getByLabelText("New password"), { target: { value: next } });
    fireEvent.change(within(c).getByLabelText("Repeat new password"), { target: { value: again } });
    fireEvent.click(within(c).getByRole("button", { name: /Update password/ }));
  };

  it("warns that a change signs out every device", async () => {
    render(<SecurityPage />);
    expect(within(await card()).getByText(/Changing it signs out every device, this one too/)).toBeInTheDocument();
  });

  it("checks the form before anything is sent", async () => {
    render(<SecurityPage />);
    const c = await card();
    fill(c, "", "abc", "abd");
    expect(await within(c).findByText("Enter your current password")).toBeInTheDocument();
    expect(within(c).getByText("Use at least 6 characters")).toBeInTheDocument();
    expect(within(c).getByText("Passwords do not match")).toBeInTheDocument();

    fill(c, "same-secret", "same-secret", "same-secret");
    expect(await within(c).findByText("Choose a password you have not used here before")).toBeInTheDocument();
    expect(posts).toEqual([]);
  });

  it("sends the current and new password only, then sends the page to sign in again", async () => {
    const said = vi.spyOn(toast, "success");
    render(<SecurityPage />);
    fill(await card(), "old-secret", "new-secret-1", "new-secret-1");

    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/login"));
    expect(posts).toEqual([{ path: "/api/v1/auth/change-password", body: { old_password: "old-secret", new_password: "new-secret-1" } }]);
    expect(said).toHaveBeenCalledWith("Password changed. Sign in again with the new one.");
    expect(nav.refresh).toHaveBeenCalled();
  });

  it("says a wrong current password and stays signed in on the page", async () => {
    state.refuse = new ApiError({ status: 400, message: "The current password is wrong" });
    const said = vi.spyOn(toast, "error");
    render(<SecurityPage />);
    const c = await card();
    fill(c, "not-it", "new-secret-1", "new-secret-1");

    await waitFor(() => expect(said).toHaveBeenCalledWith("The current password is wrong"));
    expect(nav.replace).not.toHaveBeenCalled();
    // The form is usable again for a second try.
    await waitFor(() => expect(within(c).getByRole("button", { name: /Update password/ })).toBeEnabled());
  });
});

describe("a team member's own password", () => {
  const member = {
    role: "editor",
    role_label: "Editor",
    role_description: "Creates and runs events",
    can: { manage_access: false, see_access: false, money: false, club_profile: false, edit_events: true, delete_events: false, door: true },
    club_id: 4,
    club_name: "Circuit Society",
    member: {
      id: 12,
      email: "vani@example.com",
      full_name: "Vani Rao",
      role: "editor",
      role_label: "Editor",
      status: "active",
      invite_expired: false,
      invited_at: "2099-01-01T00:00:00Z",
      accepted_at: "2099-01-02T00:00:00Z",
      last_seen_at: null,
      whatsapp: false,
    },
  };
  const form = async () => (await screen.findByText("Change your password")).closest("[data-slot='figure-panel']") as HTMLElement;
  const fill = (f: HTMLElement, current: string, next: string, again: string) => {
    fireEvent.change(within(f).getByLabelText("Current password"), { target: { value: current } });
    fireEvent.change(within(f).getByLabelText("New password"), { target: { value: next } });
    fireEvent.change(within(f).getByLabelText("New password again"), { target: { value: again } });
  };

  beforeEach(() => {
    state.me = member;
  });

  it("sees their own account, not the club's devices or two-factor", async () => {
    render(<SecurityPage />);
    expect(await screen.findByRole("heading", { name: "Your account" })).toBeInTheDocument();
    expect(screen.getByText("You sign in to Circuit Society as yourself, with the editor role.")).toBeInTheDocument();
    expect(screen.getByText("vani@example.com")).toBeInTheDocument();
    expect(screen.queryByText("Active sessions")).toBeNull();
    expect(screen.queryByText("Two-factor sign-in")).toBeNull();
    expect(screen.queryByRole("button", { name: "Sign out all other sessions" })).toBeNull();
  });

  it("cannot send until the current and new passwords are typed", async () => {
    render(<SecurityPage />);
    const f = await form();
    const send = within(f).getByRole("button", { name: "Change password" });
    expect(send).toBeDisabled();
    fill(f, "old-secret", "", "");
    expect(send).toBeDisabled();
  });

  it("asks for at least 8 characters, and for the two new passwords to match", async () => {
    render(<SecurityPage />);
    const f = await form();
    fill(f, "old-secret", "short", "short");
    fireEvent.click(within(f).getByRole("button", { name: "Change password" }));
    expect(await within(f).findByText("Use at least 8 characters.")).toBeInTheDocument();

    fill(f, "old-secret", "long-enough-1", "long-enough-2");
    fireEvent.click(within(f).getByRole("button", { name: "Change password" }));
    expect(await within(f).findByText("The two new passwords don't match.")).toBeInTheDocument();
    expect(posts).toEqual([]);
  });

  it("changes their own password, not the club's, and clears the form", async () => {
    const said = vi.spyOn(toast, "success");
    render(<SecurityPage />);
    const f = await form();
    fill(f, "old-secret", "long-enough-1", "long-enough-1");
    fireEvent.click(within(f).getByRole("button", { name: "Change password" }));

    await waitFor(() => expect(said).toHaveBeenCalledWith("Password changed"));
    expect(posts).toEqual([{ path: "/api/v1/clubs/access/me/password", body: { current_password: "old-secret", new_password: "long-enough-1" } }]);
    await waitFor(() => expect(within(f).getByLabelText("Current password")).toHaveValue(""));
    expect(within(f).getByLabelText("New password")).toHaveValue("");
  });

  it("shows the server's refusal in the form and keeps what was typed", async () => {
    state.refuse = new ApiError({ status: 400, message: "Your current password is not right" });
    render(<SecurityPage />);
    const f = await form();
    fill(f, "not-it", "long-enough-1", "long-enough-1");
    fireEvent.click(within(f).getByRole("button", { name: "Change password" }));
    expect(await within(f).findByText("Your current password is not right")).toBeInTheDocument();
    expect(within(f).getByLabelText("Current password")).toHaveValue("not-it");
  });
});
