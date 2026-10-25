import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

import type { FakeState } from "@/test/fake-api";

/**
 * Admin accounts: who they are, adding one by email (owners only), taking
 * one away (never yourself), and the invited admin's set-password page.
 */
const state = vi.hoisted<FakeState>(() => ({ role: "owner", ops: null, calls: [], handlers: {} }));

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  const { fakeApi } = await import("@/test/fake-api");
  return {
    ...actual,
    useSession: () => ({ data: { id: 1, username: "admin", email: "a@b.c", full_name: "Admin", user_type: "admin", admin_role: state.role } }),
    api: fakeApi(state),
  };
});

const { render } = await import("@/test/render");
const { freshState, callsOf, refusal } = await import("@/test/fake-api");
const { AdminsPage, AcceptInvite } = await import("./index");

const LIST = {
  items: [
    { id: 1, full_name: "Owner One", email: "one@x.in", role: "owner", two_factor: true, is_active: true, is_you: true, created_at: "2026-01-01T00:00:00Z", invite: null },
    {
      id: 2,
      full_name: "Sam Support",
      email: "sam@x.in",
      role: "support",
      two_factor: false,
      is_active: true,
      is_you: false,
      created_at: "2026-10-20T00:00:00Z",
      invite: { state: "pending", created_at: "2026-10-20T00:00:00Z", expires_at: "2026-10-27T00:00:00Z", promoted: false },
    },
  ],
  owners: 1,
  without_two_factor: 1,
  can_manage: true,
};

const rowOf = (name: string) => screen.getByText(name).closest("tr")!;

beforeEach(() => {
  freshState(state);
  state.handlers["GET /api/v1/admin/admins"] = () => LIST;
  state.handlers["POST /api/v1/admin/admins/invite"] = ({ body }) => ({ user_id: 9, email: (body as { email: string }).email, role: "viewer", promoted: true, expires_in_days: 7 });
  state.handlers["DELETE /api/v1/admin/admins/2"] = () => ({ user_id: 2, removed: true });
  state.handlers["POST /api/v1/admin/admins/2/resend-invite"] = () => ({ user_id: 2, expires_in_days: 7 });
});

describe("the admins list", () => {
  it("shows each admin's role, two-factor and invite, and who you are", async () => {
    render(<AdminsPage />);
    expect(await screen.findByText("Sam Support")).toBeInTheDocument();
    expect(within(rowOf("Sam Support")).getByText("Off")).toBeInTheDocument();
    expect(within(rowOf("Sam Support")).getByText(/Invite sent/)).toBeInTheDocument();
    expect(within(rowOf("Owner One")).getByText("(you)")).toBeInTheDocument();
    expect(screen.getByText(/1 without two-factor/)).toBeInTheDocument();
  });

  it("will not let you remove yourself", async () => {
    render(<AdminsPage />);
    await screen.findByText("Owner One");
    expect(within(rowOf("Owner One")).getByRole("button", { name: /Remove/ })).toBeDisabled();
  });

  it("removes another admin after a confirmation", async () => {
    render(<AdminsPage />);
    await screen.findByText("Sam Support");
    fireEvent.click(within(rowOf("Sam Support")).getByRole("button", { name: /Remove/ }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/ordinary app account/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove admin access" }));
    await waitFor(() => expect(callsOf(state, "DELETE")).toEqual([expect.objectContaining({ path: "/api/v1/admin/admins/2" })]));
  });

  it("resends a set-password link", async () => {
    render(<AdminsPage />);
    await screen.findByText("Sam Support");
    fireEvent.click(within(rowOf("Sam Support")).getByRole("button", { name: /Resend link/ }));
    await waitFor(() => expect(callsOf(state, "POST", "/api/v1/admin/admins/2/resend-invite")).toHaveLength(1));
  });

  it("adds an admin by email, with a role", async () => {
    render(<AdminsPage />);
    await screen.findByText("Sam Support");
    fireEvent.click(screen.getByRole("button", { name: /Add an admin/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Email"), { target: { value: " new@x.in " } });
    fireEvent.change(within(dialog).getByLabelText("Role"), { target: { value: "support" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /Add and send the link/ }));
    await waitFor(() => expect(callsOf(state, "POST", "/api/v1/admin/admins/invite")).toHaveLength(1));
    expect(callsOf(state, "POST", "/api/v1/admin/admins/invite")[0]!.body).toEqual({ email: "new@x.in", role: "support" });
  });

  it("refuses a form without an address, before asking the server", async () => {
    render(<AdminsPage />);
    await screen.findByText("Sam Support");
    fireEvent.click(screen.getByRole("button", { name: /Add an admin/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /Add and send the link/ }));
    expect(await within(dialog).findByText("Enter an email address")).toBeInTheDocument();
    expect(callsOf(state, "POST")).toEqual([]);
  });

  it("offers no add, remove or resend to support or a viewer", async () => {
    state.role = "support";
    render(<AdminsPage />);
    await screen.findByText("Sam Support");
    expect(screen.queryByRole("button", { name: /Add an admin/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Remove/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Resend/ })).toBeNull();
  });
});

describe("an invited admin's set-password page", () => {
  beforeEach(() => {
    state.handlers["GET /api/v1/admin/invites/check"] = () => ({ email: "new@x.in", full_name: "New", role: "viewer", expires_at: null, has_password: false });
    state.handlers["POST /api/v1/admin/invites/accept"] = () => ({ email: "new@x.in", accepted: true });
  });

  it("says whom it is for, sets the password, then sends them to sign in", async () => {
    render(<AcceptInvite token="tok_123" />);
    expect(await screen.findByText("new@x.in")).toBeInTheDocument();
    expect(callsOf(state, "GET", "/api/v1/admin/invites/check")[0]!.query).toEqual({ token: "tok_123" });
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "a-long-password" } });
    fireEvent.change(screen.getByLabelText("Type it again"), { target: { value: "a-long-password" } });
    fireEvent.click(screen.getByRole("button", { name: /Set password/ }));
    expect(await screen.findByRole("link", { name: /Sign in/ })).toHaveAttribute("href", "/login");
    expect(callsOf(state, "POST", "/api/v1/admin/invites/accept")[0]!.body).toEqual({ token: "tok_123", password: "a-long-password" });
  });

  it("asks for ten characters and the same password twice", async () => {
    render(<AcceptInvite token="tok_123" />);
    await screen.findByText("new@x.in");
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "short" } });
    fireEvent.change(screen.getByLabelText("Type it again"), { target: { value: "short" } });
    fireEvent.click(screen.getByRole("button", { name: /Set password/ }));
    expect(await screen.findByText("Use at least 10 characters")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "a-long-password" } });
    fireEvent.click(screen.getByRole("button", { name: /Set password/ }));
    expect(await screen.findByText("The two passwords differ")).toBeInTheDocument();
    expect(callsOf(state, "POST")).toEqual([]);
  });

  it("shows the server's words for a link that expired or was used", async () => {
    state.handlers["GET /api/v1/admin/invites/check"] = () => {
      throw refusal(410, "This link has expired. Ask an owner for a new one.", "INVITE_EXPIRED");
    };
    render(<AcceptInvite token="old" />);
    expect(await screen.findByText("This link has expired. Ask an owner for a new one.")).toBeInTheDocument();
    expect(screen.queryByLabelText("New password")).toBeNull();
  });

  it("says so when the link has no code at all", () => {
    render(<AcceptInvite token={null} />);
    expect(screen.getByText(/missing its code/)).toBeInTheDocument();
  });
});
