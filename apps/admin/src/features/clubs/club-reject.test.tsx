import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

import type { FakeState } from "@/test/fake-api";

import pendingFixture from "../__fixtures__/club-pending.json";
import detailFixture from "../__fixtures__/club-detail.json";

/**
 * Turning a club's application down: beside Approve, a moderator's, with a
 * reason the applicant is mailed. Only on a backend that takes the reason;
 * on an older one there is no Reject, as before.
 */
const state = vi.hoisted<FakeState>(() => ({ role: "owner", ops: null, calls: [], handlers: {} }));
const nav = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: nav.replace, refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/clubs/14",
  useSearchParams: () => new URLSearchParams(),
}));

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
const { freshState, callsOf } = await import("@/test/fake-api");
const { ClubDetail } = await import("./index");

beforeEach(() => {
  freshState(state);
  nav.replace.mockClear();
  state.handlers["GET /api/v1/clubs/admin/14"] = () => pendingFixture;
  state.handlers["GET /api/v1/clubs/admin/5"] = () => detailFixture;
  state.handlers["POST /api/v1/clubs/14/reject"] = () => pendingFixture;
});

async function header() {
  render(<ClubDetail clubId={14} />);
  await screen.findByRole("heading", { name: "Pending Club" });
  return screen.getByRole("button", { name: /Approve/ }).parentElement!;
}

describe("rejecting an application", () => {
  it("sits beside Approve on a pending club, and asks for a reason the applicant is mailed", async () => {
    const actions = await header();
    fireEvent.click(await within(actions).findByRole("button", { name: /Reject/ }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/mailed the reason/)).toBeInTheDocument();
    const confirm = within(dialog).getByRole("button", { name: "Reject application" });
    expect(confirm).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText(/Reason/), { target: { value: "Not a student club" } });
    fireEvent.click(confirm);
    await waitFor(() => expect(callsOf(state, "POST", "/api/v1/clubs/14/reject")[0]!.body).toEqual({ reason: "Not a student club" }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/clubs"));
  });

  it("is a moderator's: a viewer is not offered it", async () => {
    state.role = "viewer";
    await header();
    await waitFor(() => expect(state.calls.some((c) => c.path === "/api/v1/admin/ops/me")).toBe(true));
    expect(screen.queryByRole("button", { name: /Reject/ })).toBeNull();
  });

  it("is not there on a backend that does not take a reason", async () => {
    state.ops = null;
    await header();
    await waitFor(() => expect(state.calls.some((c) => c.path === "/api/v1/admin/ops/me")).toBe(true));
    expect(screen.queryByRole("button", { name: /Reject/ })).toBeNull();
  });

  it("is not offered on an approved club", async () => {
    render(<ClubDetail clubId={5} />);
    await screen.findByRole("heading", { name: "IEDC CET" });
    await waitFor(() => expect(state.calls.some((c) => c.path === "/api/v1/admin/ops/me")).toBe(true));
    expect(screen.queryByRole("button", { name: /Reject/ })).toBeNull();
  });
});
