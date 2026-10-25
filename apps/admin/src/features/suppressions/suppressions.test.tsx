import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

import type { FakeState } from "@/test/fake-api";

/** The "do not mail" list: search it, see why, and take an address off (moderators). */
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
const { freshState, callsOf } = await import("@/test/fake-api");
const { SuppressionsPage, reasonWords } = await import("./index");

beforeEach(() => {
  freshState(state);
  state.handlers["GET /api/v1/admin/mail/suppressions"] = () => ({
    items: [
      { email: "gone+old@college.edu", reason: "bounce", detail: "550 mailbox unavailable", created_at: "2026-10-01T00:00:00Z" },
      { email: "angry@x.in", reason: "complaint", detail: null, created_at: "2026-10-02T00:00:00Z" },
    ],
    total: 2,
    offset: 0,
    limit: 50,
    counts: { bounce: 1, complaint: 1, last_30_days: 2 },
  });
  state.handlers["DELETE /api/v1/admin/mail/suppressions/gone%2Bold%40college.edu"] = () => ({ email: "gone+old@college.edu", removed: true });
});

describe("the suppression list", () => {
  it("shows each address with why and when, and the counts", async () => {
    render(<SuppressionsPage />);
    const row = (await screen.findByText("gone+old@college.edu")).closest("tr")!;
    expect(within(row).getByText("Bounced")).toBeInTheDocument();
    expect(within(row).getByText("550 mailbox unavailable")).toBeInTheDocument();
    expect(screen.getByText(/1 bounced · 1 marked as spam · 2 added in the last 30 days/)).toBeInTheDocument();
    expect(reasonWords("complaint")).toBe("Marked as spam");
  });

  it("searches and filters by reason", async () => {
    render(<SuppressionsPage />);
    await screen.findByText("angry@x.in");
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "complaint" } });
    await waitFor(() => expect(callsOf(state, "GET").at(-1)!.query).toMatchObject({ reason: "complaint" }));
    const search = screen.getByLabelText("Search addresses");
    fireEvent.change(search, { target: { value: "college" } });
    fireEvent.keyDown(search, { key: "Enter" });
    await waitFor(() => expect(callsOf(state, "GET").at(-1)!.query).toMatchObject({ q: "college" }));
  });

  it("takes an address off after a confirmation, its address escaped in the path", async () => {
    render(<SuppressionsPage />);
    const row = (await screen.findByText("gone+old@college.edu")).closest("tr")!;
    fireEvent.click(within(row).getByRole("button", { name: "Unblock" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Unblock" }));
    await waitFor(() => expect(callsOf(state, "DELETE")).toEqual([expect.objectContaining({ path: "/api/v1/admin/mail/suppressions/gone%2Bold%40college.edu" })]));
  });

  it("offers a viewer no unblock", async () => {
    state.role = "viewer";
    render(<SuppressionsPage />);
    await screen.findByText("angry@x.in");
    expect(screen.queryByRole("button", { name: "Unblock" })).toBeNull();
  });
});
