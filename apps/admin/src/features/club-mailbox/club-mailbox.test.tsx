import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { toApiError } from "@moa/api";

/**
 * A club's mailbox on the admin's club page: GET /admin/club-mailbox/{club_id}
 * answers its address, whether it is open, and counts -- and nothing any
 * mail said.
 */

let answer: unknown = null;
const calls: string[] = [];

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        calls.push(path);
        if (path === "/api/v1/admin/club-mailbox/5") {
          if (answer instanceof Error) throw answer;
          return answer;
        }
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { ClubMailboxCard, clubMailboxSchema } = await import("./index");

const OPEN = {
  club_id: 5,
  available: true,
  plan_allows: true,
  set_up: true,
  address: "circuit@mail.myotherapp.in",
  state: "open",
  lapsed_at: null,
  created_at: "2026-10-01T08:00:00Z",
  retention_months: 12,
  forwarding: 1,
  threads: 42,
  received: 120,
  sent: 61,
  spam: 3,
  failed: 2,
  received_this_month: 30,
  sent_this_month: 12,
  dropped_while_closed: 0,
  last_received_at: "2026-10-24T09:00:00Z",
  last_sent_at: "2026-10-24T10:00:00Z",
};

function answered(status: number, body: unknown) {
  return toApiError(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

beforeEach(() => {
  calls.length = 0;
  answer = OPEN;
});

describe("a club's mailbox, for an admin", () => {
  it("reads the server's shape, tolerating what it does not know", () => {
    const m = clubMailboxSchema.parse({ club_id: 5, state: "frozen", threads: "many" });
    expect(m).toMatchObject({ club_id: 5, state: "open", threads: 0, set_up: false, address: null, plan_allows: false });
  });

  it("shows the address, that it is open, and counts -- no mail", async () => {
    render(<ClubMailboxCard clubId={5} />);
    const card = await screen.findByRole("region", { name: "Mailbox" });
    expect(await within(card).findByText("circuit@mail.myotherapp.in")).toBeInTheDocument();
    expect(within(card).getByText("Open")).toBeInTheDocument();
    expect(within(card).getByText("42")).toBeInTheDocument();
    expect(within(card).getByText(/3 in Spam/)).toBeInTheDocument();
    expect(within(card).getByText(/30 this month/)).toBeInTheDocument();
    expect(within(card).getByText(/2 not sent/)).toBeInTheDocument();
    expect(within(card).getByText(/1 still forwarding/)).toBeInTheDocument();
    expect(calls).toEqual(["/api/v1/admin/club-mailbox/5"]);
  });

  it("says when there is none, whether its plan has one, and a lapse", async () => {
    answer = { ...OPEN, set_up: false, address: null, plan_allows: false };
    const view = render(<ClubMailboxCard clubId={5} />);
    expect(await screen.findByText(/No mailbox set up/)).toHaveTextContent("Its plan doesn't include one (Pro and Enterprise).");
    view.unmount();
    answer = { ...OPEN, plan_allows: false, state: "lapsed", lapsed_at: "2026-10-20T08:00:00Z", dropped_while_closed: 4 };
    render(<ClubMailboxCard clubId={5} />);
    expect(await screen.findByText("Closed: plan lapsed")).toBeInTheDocument();
    expect(screen.getByText("Dropped while closed")).toBeInTheDocument();
    expect(screen.getByText(/stopped including the mailbox/)).toBeInTheDocument();
  });
});

describe("ahead of its backend", () => {
  it("is left off the club's page while the API has no such route", async () => {
    answer = await answered(404, { detail: "Not Found" });
    const { container } = render(<ClubMailboxCard clubId={5} />);
    await waitFor(() => expect(calls).toEqual(["/api/v1/admin/club-mailbox/5"]));
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("still says it could not load on a 500", async () => {
    answer = await answered(500, { message: "Internal Server Error", errors: { error: "x" }, error_code: null, track_id: "t" });
    render(<ClubMailboxCard clubId={5} />);
    expect(await screen.findByText("Could not load the club's mailbox.")).toBeInTheDocument();
  });
});
