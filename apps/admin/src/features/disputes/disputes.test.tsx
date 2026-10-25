import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

import type { FakeState } from "@/test/fake-api";

/** Razorpay disputes: what is open, when its evidence is due, and the team's notes. */
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
const { DisputesPage, statusLabel, kindLabel } = await import("./index");

const dispute = (over: Record<string, unknown> = {}) => ({
  id: 1,
  razorpay_dispute_id: "disp_A",
  razorpay_payment_id: "pay_A",
  payment_log_id: "p1",
  subscription_charge_id: null,
  kind: "ticket",
  amount: 499,
  amount_deducted: 499,
  currency: "INR",
  reason_code: "chargeback",
  reason: "Customer says not received",
  phase: "chargeback",
  status: "open",
  is_open: true,
  respond_by: "2026-10-20T00:00:00Z",
  overdue: true,
  opened_at: "2026-10-10T00:00:00Z",
  closed_at: null,
  updated_at: null,
  last_event: "payment.dispute.created",
  club: { id: 5, name: "Circuit", slug: "circuit" },
  event: { id: 3, name: "Build Night" },
  notes: [],
  ...over,
});

let notes: Array<Record<string, unknown>> = [];

beforeEach(() => {
  freshState(state);
  notes = [];
  state.handlers["GET /api/v1/admin/disputes"] = ({ query }) => ({
    items: query?.status === "closed" ? [dispute({ id: 2, razorpay_dispute_id: "disp_B", status: "lost", is_open: false, overdue: false })] : [dispute({ notes })],
    total: 1,
    open: 1,
    offset: 0,
    limit: 50,
  });
  state.handlers["POST /api/v1/admin/disputes/1/notes"] = ({ body }) => {
    notes = [...notes, { at: "2026-10-12T00:00:00Z", by_id: 1, by_name: "Admin", text: (body as { text: string }).text }];
    return dispute({ notes });
  };
});

describe("the disputes list", () => {
  it("shows what is open: status, amount, the deadline (overdue marked), the payment and the club", async () => {
    render(<DisputesPage />);
    const id = await screen.findByText("disp_A");
    const row = id.closest("tr")!;
    expect(within(row).getByText("open")).toBeInTheDocument();
    expect(within(row).getByText(/overdue/)).toBeInTheDocument();
    expect(within(row).getByText("pay_A")).toBeInTheDocument();
    expect(within(row).getByText("Circuit")).toBeInTheDocument();
    expect(within(row).getByText("Build Night")).toBeInTheDocument();
    expect(callsOf(state, "GET", "/api/v1/admin/disputes")[0]!.query).toMatchObject({ status: "open" });
  });

  it("switches to the closed ones", async () => {
    render(<DisputesPage />);
    await screen.findByText("disp_A");
    fireEvent.click(screen.getByRole("radio", { name: "Closed" }));
    expect(await screen.findByText("disp_B")).toBeInTheDocument();
    expect(statusLabel("under_review")).toBe("under review");
    expect(kindLabel("subscription")).toBe("Plan charge");
  });

  it("opens a dispute and adds a note", async () => {
    render(<DisputesPage />);
    await screen.findByText("disp_A");
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByText("Customer says not received", { exact: false })).toBeInTheDocument();
    fireEvent.change(within(sheet).getByLabelText("Add a note"), { target: { value: "Sent the ticket scan as evidence" } });
    fireEvent.click(within(sheet).getByRole("button", { name: "Add note" }));
    await waitFor(() => expect(callsOf(state, "POST", "/api/v1/admin/disputes/1/notes")[0]!.body).toEqual({ text: "Sent the ticket scan as evidence" }));
    expect(await within(sheet).findByText("Sent the ticket scan as evidence")).toBeInTheDocument();
  });

  it("lets a viewer read the notes but not add one", async () => {
    state.role = "viewer";
    render(<DisputesPage />);
    await screen.findByText("disp_A");
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).queryByLabelText("Add a note")).toBeNull();
  });
});
