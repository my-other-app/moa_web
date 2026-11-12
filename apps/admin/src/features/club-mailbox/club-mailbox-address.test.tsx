import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

import type { FakeState } from "@/test/fake-api";

/**
 * A club's address, for an admin (feature-register/mail-and-slugs-contract.md,
 * Parts M1–M2): every club gets one from its name (`automatic`), a club
 * whose plan has no mailbox keeps it `reserved`; owners and support change
 * it (PUT /admin/club-mailbox/{id}/address, the old one forwarding 90
 * days), and an owner gives every club its address
 * (POST /admin/club-mailbox/backfill, a dry run first).
 */
const state = vi.hoisted<FakeState>(() => ({ role: "owner", ops: null, calls: [], handlers: {} }));

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  const { fakeApi } = await import("@/test/fake-api");
  return {
    ...actual,
    useSession: () => ({ data: { id: 1, username: "a", email: "a@x.in", full_name: "Asha", user_type: "admin", admin_role: state.role }, isPending: false }),
    api: fakeApi(state),
  };
});

const { render } = await import("@/test/render");
const { freshState, callsOf, routeMissing, refusal } = await import("@/test/fake-api");
const { ClubMailboxCard, clubMailboxSchema, backfillSchema, handleProblem } = await import("./index");

const BOX = {
  club_id: 5,
  available: true,
  plan_allows: false,
  set_up: true,
  address: "gdgcloudtrivandrum@myotherapp.in",
  handle: "gdgcloudtrivandrum",
  automatic: true,
  previous: [],
  state: "reserved",
  lapsed_at: null,
  created_at: "2026-11-13T08:00:00Z",
  retention_months: 12,
  forwarding: 0,
  threads: 0,
  received: 0,
  sent: 0,
  spam: 0,
  failed: 0,
  received_this_month: 0,
  sent_this_month: 0,
  dropped_while_closed: 0,
  last_received_at: null,
  last_sent_at: null,
};
const PATH = "/api/v1/admin/club-mailbox/5";

beforeEach(() => {
  freshState(state);
  let box: Record<string, unknown> = { ...BOX };
  state.handlers[`GET ${PATH}`] = () => box;
  state.handlers[`PUT ${PATH}/address`] = (c) => {
    const handle = (c.body as { handle: string }).handle;
    box = {
      ...box,
      set_up: true,
      handle,
      address: `${handle}@myotherapp.in`,
      automatic: false,
      previous: box.address ? [{ address: box.address, forward_until: "2027-02-11T08:00:00Z" }] : [],
    };
    return box;
  };
  state.handlers["POST /api/v1/admin/club-mailbox/backfill"] = (c) =>
    (c.body as { dry_run: boolean }).dry_run
      ? { dry_run: true, created: 41, skipped: 3, failed: 0, sample: [{ club_id: 1, handle: "robotics" }, { club_id: 2, handle: "gdgcloudtrivandrum" }] }
      : { dry_run: false, created: 41, skipped: 3, failed: 0, sample: [] };
});

describe("reading it", () => {
  it("knows the reserved state, the automatic address and the old ones forwarding", () => {
    const m = clubMailboxSchema.parse({ ...BOX, previous: [{ address: "old@myotherapp.in", forward_until: null }, { nope: 1 }] });
    expect(m).toMatchObject({ state: "reserved", automatic: true, handle: "gdgcloudtrivandrum", previous: [] });
    expect(clubMailboxSchema.parse({ ...BOX, previous: [{ address: "old@myotherapp.in", forward_until: null }] }).previous).toEqual([{ address: "old@myotherapp.in", forward_until: null }]);
    expect(clubMailboxSchema.parse({ club_id: 5 })).toMatchObject({ automatic: false, previous: [], handle: null });
    expect(backfillSchema.parse({ created: "3" })).toEqual({ dry_run: true, created: 3, skipped: 0, failed: 0, sample: [] });
    expect(handleProblem("ab")).toMatch(/3 to 30/);
    expect(handleProblem("gdg..tvm")).toMatch(/two dots/);
    expect(handleProblem("gdg.tvm")).toBeNull();
  });
});

describe("the card", () => {
  it("shows a reserved, automatic address for what it is", async () => {
    render(<ClubMailboxCard clubId={5} />);
    const card = await screen.findByRole("region", { name: "Mailbox" });
    expect(await within(card).findByText("gdgcloudtrivandrum@myotherapp.in")).toBeInTheDocument();
    expect(within(card).getByText("Reserved: its plan has no mailbox")).toBeInTheDocument();
    expect(within(card).getByText("Automatic")).toBeInTheDocument();
    expect(within(card).getByText(/nothing sent to it is kept until it upgrades/)).toBeInTheDocument();
    expect(within(card).queryByText(/stopped including the mailbox/)).toBeNull();
  });

  it("lets support change it: the new address, its old one forwarding until a date", async () => {
    state.role = "support";
    render(<ClubMailboxCard clubId={5} />);
    const card = await screen.findByRole("region", { name: "Mailbox" });
    fireEvent.click(await within(card).findByRole("button", { name: /Change address/ }));
    const form = within(card).getByRole("form", { name: "Change the club's address" });
    expect(within(form).getByText(/counts as the club's change for the month/)).toBeInTheDocument();
    const input = within(form).getByLabelText("New address");
    fireEvent.change(input, { target: { value: "ab" } });
    expect(within(form).getByRole("alert")).toHaveTextContent("An address is 3 to 30 characters.");
    fireEvent.change(input, { target: { value: "GDGTVM" } });
    fireEvent.click(within(form).getByRole("button", { name: "Change" }));
    await waitFor(() => expect(callsOf(state, "PUT", `${PATH}/address`)[0]?.body).toEqual({ handle: "gdgtvm" }));
    expect(await within(card).findByText("gdgtvm@myotherapp.in")).toBeInTheDocument();
    const old = within(card).getByRole("list", { name: "Old addresses" });
    expect(old).toHaveTextContent(/gdgcloudtrivandrum@myotherapp.in forwards here until/);
    expect(within(card).queryByText("Automatic")).toBeNull();
    // Giving every club its address is an owner's.
    expect(within(card).queryByRole("region", { name: "Every club's address" })).toBeNull();
  });

  it.each([
    [() => refusal(409, "", "HANDLE_TAKEN"), "That address is taken. Pick another."],
    [() => refusal(422, "", "HANDLE_RESERVED"), "That address is kept for the platform. Pick another."],
    [() => routeMissing(), "That isn't available on this server yet."],
  ])("says a refusal in words (%#)", async (refuse, words) => {
    state.handlers[`PUT ${PATH}/address`] = () => {
      throw refuse();
    };
    render(<ClubMailboxCard clubId={5} />);
    const card = await screen.findByRole("region", { name: "Mailbox" });
    fireEvent.click(await within(card).findByRole("button", { name: /Change address/ }));
    const form = within(card).getByRole("form", { name: "Change the club's address" });
    fireEvent.change(within(form).getByLabelText("New address"), { target: { value: "robotics" } });
    fireEvent.click(within(form).getByRole("button", { name: "Change" }));
    expect(await within(form).findByText(words)).toBeInTheDocument();
  });

  it("gives a club without one an address", async () => {
    const none = { ...BOX, set_up: false, address: null, handle: null, automatic: false };
    state.handlers[`GET ${PATH}`] = () => none;
    render(<ClubMailboxCard clubId={5} />);
    const card = await screen.findByRole("region", { name: "Mailbox" });
    fireEvent.click(await within(card).findByRole("button", { name: /Give it an address/ }));
    const form = within(card).getByRole("form", { name: "Give the club an address" });
    fireEvent.change(within(form).getByLabelText("The club's address"), { target: { value: "robotics" } });
    fireEvent.click(within(form).getByRole("button", { name: "Give it" }));
    await waitFor(() => expect(callsOf(state, "PUT", `${PATH}/address`)[0]?.body).toEqual({ handle: "robotics" }));
  });

  it("offers a viewer nothing to change", async () => {
    state.role = "viewer";
    render(<ClubMailboxCard clubId={5} />);
    const card = await screen.findByRole("region", { name: "Mailbox" });
    expect(await within(card).findByText("gdgcloudtrivandrum@myotherapp.in")).toBeInTheDocument();
    expect(within(card).queryByRole("button", { name: /Change address/ })).toBeNull();
    expect(within(card).queryByRole("region", { name: "Every club's address" })).toBeNull();
  });
});

describe("giving every club its address", () => {
  it("asks a dry run first, says how many and a few, then gives them", async () => {
    render(<ClubMailboxCard clubId={5} />);
    const all = await screen.findByRole("region", { name: "Every club's address" });
    fireEvent.click(within(all).getByRole("button", { name: /Give every club its address/ }));
    await waitFor(() => expect(callsOf(state, "POST", "/api/v1/admin/club-mailbox/backfill")[0]?.body).toEqual({ dry_run: true }));
    expect(await within(all).findByText(/clubs get an address; 3 already have one/)).toHaveTextContent("41");
    expect(within(all).getByRole("list", { name: "For example" })).toHaveTextContent("robotics@myotherapp.in");
    fireEvent.click(within(all).getByRole("button", { name: /Give them their addresses/ }));
    await waitFor(() => expect(callsOf(state, "POST", "/api/v1/admin/club-mailbox/backfill")[1]?.body).toEqual({ dry_run: false }));
    await waitFor(() => expect(within(all).getByRole("button", { name: /Give every club its address/ })).toBeInTheDocument());
  });

  it("says when the server doesn't have it yet", async () => {
    state.handlers["POST /api/v1/admin/club-mailbox/backfill"] = () => {
      throw routeMissing();
    };
    render(<ClubMailboxCard clubId={5} />);
    const all = await screen.findByRole("region", { name: "Every club's address" });
    fireEvent.click(within(all).getByRole("button", { name: /Give every club its address/ }));
    expect(await within(all).findByText("That isn't available on this server yet.")).toBeInTheDocument();
  });
});
