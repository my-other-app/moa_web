import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

import type { FakeState } from "@/test/fake-api";

/**
 * Payouts: what MyOtherApp owes each club for sales on its own Razorpay, one
 * club's statement, recording a payout (partial, or over the balance only
 * when said so) and voiding one. Money: owners only.
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
const { PayoutsOverview, ClubStatement, statementCsvUrl, feeRateLabel } = await import("./index");

const figures = (over: Record<string, unknown> = {}) => ({
  gross: 1000,
  fees: 23.6,
  fees_estimated: 1,
  refunds: 100,
  chargebacks: 0,
  net: 876.4,
  paid_out: 500,
  outstanding: 376.4,
  payments: 3,
  payouts: 1,
  last_payout_on: "2026-10-10",
  ...over,
});

const OVERVIEW = {
  items: [
    { club: { id: 5, name: "Circuit", slug: "circuit", is_deleted: false }, ...figures() },
    { club: { id: 6, name: "Drama", slug: "drama", is_deleted: false }, ...figures({ outstanding: 0, fees_estimated: 0, net: 500 }) },
  ],
  total: 2,
  totals: figures({ outstanding: 376.4, fees_estimated: 1, payouts: 2 }),
  owing_clubs: 1,
  fee_rate_estimate: 0.0236,
  offset: 0,
  limit: 50,
};

const STATEMENT = {
  club: { id: 5, name: "Circuit", slug: "circuit", is_deleted: false },
  summary: figures(),
  period: { from: null, to: null },
  payments: [
    { payment_log_id: "p1", razorpay_payment_id: "pay_1", status: "captured", paid_at: "2026-10-01T10:00:00Z", event: { id: 3, name: "Build Night" }, gross: 500, fee: 11.8, fee_estimated: true, refunded: 0, chargeback: 0, net: 488.2 },
  ],
  payments_total: 1,
  payouts: [
    { id: 11, amount: 500, paid_on: "2026-10-10", reference: "UTR123", note: null, created_at: null, created_by: { id: 1, name: "Owner" }, voided: false, voided_at: null, void_reason: null, voided_by: null },
  ],
  fee_rate_estimate: 0.0236,
};

beforeEach(() => {
  freshState(state);
  state.handlers["GET /api/v1/admin/payouts"] = () => OVERVIEW;
  state.handlers["GET /api/v1/admin/payouts/clubs/5"] = () => STATEMENT;
  state.handlers["POST /api/v1/admin/payouts/fees/fetch"] = () => ({ missing: 4, queued: 4 });
  state.handlers["POST /api/v1/admin/payouts/clubs/5"] = ({ body }) => ({ ...STATEMENT.payouts[0], id: 12, amount: (body as { amount: number }).amount });
  state.handlers["POST /api/v1/admin/payouts/11/void"] = () => ({ ...STATEMENT.payouts[0], voided: true });
});

describe("the overview", () => {
  it("lists each club's balance with its fees marked estimated, and links to the statement", async () => {
    render(<PayoutsOverview />);
    const circuit = await screen.findByRole("link", { name: "Circuit" });
    expect(circuit).toHaveAttribute("href", "/payouts/5");
    const row = circuit.closest("tr")!;
    expect(within(row).getByText("est.")).toBeInTheDocument();
    expect(within(row).getByText(/376\.40/)).toBeInTheDocument();
    expect(screen.getByText(/1 clubs are owed/)).toBeInTheDocument();
  });

  it("filters to the clubs owed money, and searches by name", async () => {
    render(<PayoutsOverview />);
    await screen.findByRole("link", { name: "Circuit" });
    fireEvent.click(screen.getByLabelText("Only clubs owed money"));
    await waitFor(() => expect(callsOf(state, "GET", "/api/v1/admin/payouts").at(-1)!.query).toMatchObject({ owing: true }));
    const search = screen.getByLabelText("Search clubs");
    fireEvent.change(search, { target: { value: "circ" } });
    fireEvent.keyDown(search, { key: "Enter" });
    await waitFor(() => expect(callsOf(state, "GET", "/api/v1/admin/payouts").at(-1)!.query).toMatchObject({ q: "circ" }));
  });

  it("asks Razorpay for the missing fees, for an owner", async () => {
    render(<PayoutsOverview />);
    await screen.findByRole("link", { name: "Circuit" });
    fireEvent.click(screen.getByRole("button", { name: /Fetch fees from Razorpay/ }));
    await waitFor(() => expect(callsOf(state, "POST", "/api/v1/admin/payouts/fees/fetch")).toHaveLength(1));
  });

  it("offers support no money action", async () => {
    state.role = "support";
    render(<PayoutsOverview />);
    await screen.findByRole("link", { name: "Circuit" });
    expect(screen.queryByRole("button", { name: /Fetch fees/ })).toBeNull();
  });
});

describe("a club's statement", () => {
  it("shows the balance, the payments and the payouts, with the CSV through the gateway", async () => {
    render(<ClubStatement clubId={5} />);
    expect(await screen.findByText("Build Night")).toBeInTheDocument();
    expect(screen.getByText("UTR123")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Statement CSV/ })).toHaveAttribute("href", "/api/gateway/api/v1/admin/payouts/clubs/5/statement.csv");
    expect(statementCsvUrl(5, { from: "2026-10-01", to: "2026-10-31" })).toBe("/api/gateway/api/v1/admin/payouts/clubs/5/statement.csv?from=2026-10-01&to=2026-10-31");
    expect(feeRateLabel(0.0236)).toBe("2.36%");
  });

  it("records a payout, starting from what is owed", async () => {
    render(<ClubStatement clubId={5} />);
    await screen.findByText("Build Night");
    fireEvent.click(screen.getByRole("button", { name: /Record payout/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText("Amount (₹)")).toHaveValue("376.40");
    fireEvent.change(within(dialog).getByLabelText("Amount (₹)"), { target: { value: "200" } });
    fireEvent.change(within(dialog).getByLabelText("Reference"), { target: { value: "UTR999" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Record payout" }));
    await waitFor(() => expect(callsOf(state, "POST", "/api/v1/admin/payouts/clubs/5")).toHaveLength(1));
    expect(callsOf(state, "POST", "/api/v1/admin/payouts/clubs/5")[0]!.body).toMatchObject({ amount: 200, reference: "UTR999", force: false });
  });

  it("asks before recording more than the balance, then sends it with force", async () => {
    let tries = 0;
    state.handlers["POST /api/v1/admin/payouts/clubs/5"] = ({ body }) => {
      tries += 1;
      if (!(body as { force: boolean }).force) throw refusal(409, "That is more than the ₹376.40 outstanding. Record it anyway to go ahead.", "PAYOUT_EXCEEDS_BALANCE");
      return { ...STATEMENT.payouts[0], id: 13, amount: 400 };
    };
    render(<ClubStatement clubId={5} />);
    await screen.findByText("Build Night");
    fireEvent.click(screen.getByRole("button", { name: /Record payout/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Amount (₹)"), { target: { value: "400" } });
    fireEvent.change(within(dialog).getByLabelText("Reference"), { target: { value: "UTR400" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Record payout" }));
    fireEvent.click(await within(dialog).findByRole("button", { name: "Record anyway" }));
    await waitFor(() => expect(tries).toBe(2));
    expect(callsOf(state, "POST", "/api/v1/admin/payouts/clubs/5")[1]!.body).toMatchObject({ amount: 400, force: true });
  });

  it("voids a payout with a reason", async () => {
    render(<ClubStatement clubId={5} />);
    await screen.findByText("UTR123");
    fireEvent.click(screen.getByRole("button", { name: /Void/ }));
    const dialog = await screen.findByRole("alertdialog");
    const confirm = within(dialog).getByRole("button", { name: "Void payout" });
    expect(confirm).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText("Why"), { target: { value: "Recorded twice" } });
    fireEvent.click(confirm);
    await waitFor(() => expect(callsOf(state, "POST", "/api/v1/admin/payouts/11/void")[0]!.body).toEqual({ reason: "Recorded twice" }));
  });

  it("lets support read it, but not record or void", async () => {
    state.role = "support";
    render(<ClubStatement clubId={5} />);
    await screen.findByText("UTR123");
    expect(screen.queryByRole("button", { name: /Record payout/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Void/ })).toBeNull();
  });
});
