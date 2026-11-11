import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { ApiError } from "@moa/api";

import type { FakeState } from "@/test/fake-api";

/**
 * The support queue and a case: the tabs and their counts, what an admin
 * outside the teams is not shown, the reply that only goes out from its
 * preview, notes, taking a case, and the linked records the panel opens.
 */
const state = vi.hoisted<FakeState>(() => ({ role: "owner", ops: null, calls: [], handlers: {} }));
const me = vi.hoisted(() => ({ id: 1 }));

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  const { fakeApi } = await import("@/test/fake-api");
  return {
    ...actual,
    useSession: () => ({ data: { id: me.id, username: "a", email: "a@x.in", full_name: "Asha", user_type: "admin", admin_role: state.role } }),
    api: fakeApi(state),
  };
});

const { render } = await import("@/test/render");
const { freshState, callsOf } = await import("@/test/fake-api");
const { CasesPage, CasePage } = await import("./index");
const { toast } = await import("@moa/ui");

const TEAMS = [
  { key: "support", members: [{ user_id: 2, name: "Sam", email: "sam@x.in", admin_role: "support", away: false }] },
  { key: "sales", members: [{ user_id: 3, name: "Lata", email: "lata@x.in", admin_role: "viewer", away: false }] },
];

const row = (over: Record<string, unknown> = {}) => ({
  id: 8,
  number: 1042,
  subject: "Refund not received",
  status: "open",
  priority: "high",
  topic: "payments",
  channel: "app",
  requester: { kind: "user", id: 40, name: "Riya", email: "riya@x.in" },
  assignee: { id: 2, name: "Sam" },
  tags: ["refund"],
  created_at: "2026-11-10T09:00:00Z",
  updated_at: "2026-11-11T09:00:00Z",
  first_reply_due: "2026-11-10T13:00:00Z",
  resolution_due: "2026-11-12T13:00:00Z",
  overdue: false,
  flags: [],
  ...over,
});

const detail = (over: Record<string, unknown> = {}) => ({
  ...row(),
  messages: [
    { id: 1, kind: "reply_in", body_text: "My refund for DevFest hasn't come.", body_html: null, author_name: "Riya", created_at: "2026-11-10T09:00:00Z", attachments: [{ id: 3, name: "screen.png", url: "/api/v1/admin/support/attachments/3" }] },
    { id: 2, kind: "note", body_text: "Checked Razorpay: pending.", body_html: null, author_name: "Sam", created_at: "2026-11-10T10:00:00Z", attachments: [] },
  ],
  links: { user_id: 40, event_id: 77 },
  panel: {
    account: { id: 40, name: "Riya", email: "riya@x.in", sign_in: "google", suspended: false, path: "/users/40" },
    registrations: [{ id: "r1", event_id: 77, event_name: "DevFest 2026", is_paid: true, paid_amount: 499, path: "/events/77" }],
    payments: [{ order_id: "o1", receipt: "rcpt_1", amount: 499, status: "paid", razorpay_payment_id: "pay_1", path: "/payments?q=pay_1" }],
    refunds: [],
    disputes: [],
    clubs: [],
    club: null,
    evil: [{ name: "Elsewhere", path: "https://evil.example/x" }],
  },
  survey: { sent_at: null, solved: null, comment: null, answered_at: null },
  reads_bodies: true,
  can_work: true,
  can_take: false,
  ...over,
});

beforeEach(() => {
  freshState(state);
  me.id = 1;
  state.handlers["GET /api/v1/admin/teams"] = () => TEAMS;
  state.handlers["GET /api/v1/support/topics"] = () => [
    { key: "payments", label: "Payments and refunds" },
    { key: "account", label: "Account and sign-in" },
  ];
  state.handlers["GET /api/v1/admin/support/saved-replies"] = () => [{ id: 5, title: "Refund on its way", body: "Refunds take 5–7 working days.", topic: "payments" }];
  state.handlers["GET /api/v1/admin/support/cases"] = () => ({ items: [row()], total: 1, counts: { mine: 0, unassigned: 3, open: 9, waiting: 2, resolved: 40 } });
  state.handlers["GET /api/v1/admin/support/cases/8"] = () => detail();
});

describe("the queue", () => {
  it("opens on All open with every tab's count, and filters by what is picked", async () => {
    render(<CasesPage />);
    const link = await screen.findByRole("link", { name: /Refund not received/ });
    expect(link).toHaveAttribute("href", "/teamwork/support/8");
    expect(callsOf(state, "GET", "/api/v1/admin/support/cases")[0]!.query).toMatchObject({ tab: "open", page: 1, page_size: 50 });
    expect(screen.getByRole("tab", { name: /Unassigned\s*3/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Export to Excel/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Resolved\s*40/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /Unassigned/ }));
    fireEvent.change(screen.getByLabelText("Topic"), { target: { value: "payments" } });
    await waitFor(() => expect(callsOf(state, "GET", "/api/v1/admin/support/cases").at(-1)!.query).toMatchObject({ tab: "unassigned", topic: "payments" }));
  });

  it("tells an admin outside both teams they see the queue, not what people wrote, and offers no log-by-hand", async () => {
    me.id = 9;
    state.role = "support";
    render(<CasesPage />);
    expect(await screen.findByText(/not in the Support or Sales team/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Log a case/ })).toBeNull();
    // The workbook carries what people wrote about: the API refuses it outside the teams (403 TEAM_REQUIRED).
    expect(screen.queryByRole("button", { name: /Export to Excel/ })).toBeNull();
  });

  it("lets a Support member log a case by hand", async () => {
    me.id = 2;
    state.role = "support";
    render(<CasesPage />);
    expect(await screen.findByRole("button", { name: /Log a case/ })).toBeInTheDocument();
  });
});

describe("a case", () => {
  it("shows the thread, the notes and the person's records, following only the portal's own paths", async () => {
    render(<CasePage caseId={8} />);
    expect(await screen.findByText("My refund for DevFest hasn't come.")).toBeInTheDocument();
    expect(screen.getByText("Checked Razorpay: pending.").closest("li")).toHaveAttribute("data-kind", "note");
    expect(screen.getByRole("link", { name: "screen.png" })).toHaveAttribute("href", "/api/gateway/api/v1/admin/support/attachments/3");
    const panel = screen.getByRole("region", { name: "Linked records" });
    expect(within(panel).getByText("DevFest 2026")).toBeInTheDocument();
    expect(within(panel).getByRole("link", { name: "Open DevFest 2026" })).toHaveAttribute("href", "/events/77");
    expect(within(panel).getByRole("link", { name: "Open the account" })).toHaveAttribute("href", "/users/40");
    expect(within(panel).getByText("Elsewhere")).toBeInTheDocument();
    expect(within(panel).queryByRole("link", { name: "Open Elsewhere" })).toBeNull();
  });

  it("sends a reply only from its preview: Preview asks the API to render it, Send sends it", async () => {
    state.handlers["POST /api/v1/admin/support/cases/8/messages"] = ({ body }) =>
      (body as { preview_only?: boolean }).preview_only
        ? { preview: true, to: "riya@x.in", subject: "[#1042] Refund not received", text: "Refunds take 5–7 working days.", html: "<p>Refunds take 5–7 working days.</p>", will_push: true }
        : { id: 3, kind: "reply_out", body_text: "Refunds take 5–7 working days.", author_name: "Asha", created_at: "2026-11-11T10:00:00Z", attachments: [] };
    render(<CasePage caseId={8} />);
    const box = await screen.findByRole("region", { name: "Reply" });
    expect(within(box).queryByRole("button", { name: /Send/ })).toBeNull();
    fireEvent.change(await within(box).findByLabelText("Insert a saved reply"), { target: { value: "5" } });
    expect(within(box).getByLabelText("Reply")).toHaveValue("Refunds take 5–7 working days.");
    fireEvent.click(within(box).getByRole("button", { name: /Preview reply/ }));
    expect(await screen.findByText("Check the reply before it goes")).toBeInTheDocument();
    expect(screen.getByText(/To riya@x.in · \[#1042\] Refund not received · they also get a push/)).toBeInTheDocument();
    expect(screen.getByTitle("The reply as it will be sent")).toHaveAttribute("sandbox", "allow-popups allow-popups-to-escape-sandbox");
    const posts = () => callsOf(state, "POST", "/api/v1/admin/support/cases/8/messages");
    expect(posts()).toHaveLength(1);
    expect(posts()[0]!.body).toEqual({ kind: "reply_out", body: "Refunds take 5–7 working days.", saved_reply_id: 5, preview_only: true });
    fireEvent.click(screen.getByRole("button", { name: /Send reply/ }));
    await waitFor(() => expect(posts()).toHaveLength(2));
    expect(posts()[1]!.body).toEqual({ kind: "reply_out", body: "Refunds take 5–7 working days.", saved_reply_id: 5 });
  });

  it("adds an internal note straight away: notes never leave the portal", async () => {
    state.handlers["POST /api/v1/admin/support/cases/8/messages"] = ({ body }) => ({ id: 4, kind: "note", body_text: (body as { body: string }).body, attachments: [] });
    render(<CasePage caseId={8} />);
    const box = await screen.findByRole("region", { name: "Reply" });
    fireEvent.click(within(box).getByRole("radio", { name: "Internal note" }));
    fireEvent.change(within(box).getByLabelText("Internal note"), { target: { value: "Called her back." } });
    fireEvent.click(within(box).getByRole("button", { name: /Add note/ }));
    await waitFor(() => expect(callsOf(state, "POST", "/api/v1/admin/support/cases/8/messages")[0]?.body).toEqual({ kind: "note", body: "Called her back." }));
  });

  it("hides the words, the reply box and the controls from an admin outside both teams", async () => {
    me.id = 9;
    state.role = "viewer";
    state.handlers["GET /api/v1/admin/support/cases/8"] = () =>
      detail({
        messages: [{ id: 1, kind: "reply_in", body_text: null, body_html: null, author_name: "Riya", created_at: "2026-11-10T09:00:00Z", attachments: [] }],
        reads_bodies: false,
        can_work: false,
      });
    render(<CasePage caseId={8} />);
    expect(await screen.findByText("Only the Support and Sales teams read what was written.")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Reply" })).toBeNull();
    expect(screen.queryByLabelText("Status")).toBeNull();
    expect(screen.queryByRole("button", { name: /Merge/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Turn into a lead/ })).toBeNull();
  });

  it("lets a Support member take an unassigned case, and only note it until then", async () => {
    me.id = 2;
    state.role = "support";
    state.handlers["GET /api/v1/admin/support/cases/8"] = () => detail({ assignee: null, can_work: false, can_take: true });
    state.handlers["POST /api/v1/admin/support/cases/8/take"] = () => ({ ok: true });
    render(<CasePage caseId={8} />);
    const box = await screen.findByRole("region", { name: "Reply" });
    expect(within(box).queryByRole("button", { name: /Preview reply/ })).toBeNull();
    expect(within(box).getByRole("button", { name: /Add note/ })).toBeInTheDocument();
    expect(screen.queryByLabelText("Assignee")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Take it/ }));
    await waitFor(() => expect(callsOf(state, "POST", "/api/v1/admin/support/cases/8/take")).toHaveLength(1));
  });

  it("lets an owner assign the case to a Support member", async () => {
    state.handlers["PATCH /api/v1/admin/support/cases/8"] = ({ body }) => detail(body as Record<string, unknown>);
    render(<CasePage caseId={8} />);
    fireEvent.change(await screen.findByLabelText("Assignee"), { target: { value: "" } });
    await waitFor(() => expect(callsOf(state, "PATCH", "/api/v1/admin/support/cases/8")[0]?.body).toEqual({ assignee_id: null }));
  });
});

describe("files with a reply", () => {
  const file = (name: string, bytes: number, type = "application/pdf") => new File([new Uint8Array(bytes)], name, { type });
  const uploads = () => callsOf(state, "POST", "/api/v1/admin/support/cases/8/attachments");
  const posts = () => callsOf(state, "POST", "/api/v1/admin/support/cases/8/messages");

  beforeEach(() => {
    let n = 0;
    state.handlers["POST /api/v1/admin/support/cases/8/attachments"] = ({ body }) => {
      const f = (body as FormData).get("file") as File;
      n += 1;
      return { key: `k${n}`, name: f.name, size: f.size };
    };
    state.handlers["POST /api/v1/admin/support/cases/8/messages"] = ({ body }) =>
      (body as { preview_only?: boolean }).preview_only
        ? { preview: true, to: "riya@x.in", subject: "[#1042] Refund not received", text: "Here is the receipt.", html: "<p>Here is the receipt.</p>", will_push: false }
        : { id: 3, kind: "reply_out", body_text: "Here is the receipt.", author_name: "Asha", created_at: "2026-11-11T10:00:00Z", attachments: [] };
  });

  it("uploads each file as it is picked, lists it, and sends the keys with the reply from its preview", async () => {
    render(<CasePage caseId={8} />);
    const box = await screen.findByRole("region", { name: "Reply" });
    fireEvent.change(within(box).getByLabelText("Attach files"), { target: { files: [file("receipt.pdf", 2048), file("refund.png", 4096, "image/png")] } });
    await waitFor(() => expect(uploads()).toHaveLength(2));
    expect(((uploads()[0]!.body as FormData).get("file") as File).name).toBe("receipt.pdf");
    const attached = await within(box).findByRole("list", { name: "Attached files" });
    await within(attached).findByText("refund.png");
    expect(within(attached).getByText("receipt.pdf")).toBeInTheDocument();
    // Taken off again before anything is sent.
    fireEvent.click(within(attached).getByRole("button", { name: "Remove refund.png" }));
    expect(within(attached).queryByText("refund.png")).toBeNull();

    fireEvent.change(within(box).getByLabelText("Reply"), { target: { value: "Here is the receipt." } });
    fireEvent.click(within(box).getByRole("button", { name: /Preview reply/ }));
    expect(await screen.findByText(/With 1 file: receipt.pdf/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Send reply/ }));
    await waitFor(() => expect(posts()).toHaveLength(2));
    expect(posts()[1]!.body).toEqual({ kind: "reply_out", body: "Here is the receipt.", attachments: ["k1"] });
    // Sent: the box is empty again, files and all.
    await waitFor(() => expect(within(box).queryByRole("list", { name: "Attached files" })).toBeNull());
  });

  it("sends files with a note too", async () => {
    render(<CasePage caseId={8} />);
    const box = await screen.findByRole("region", { name: "Reply" });
    fireEvent.click(within(box).getByRole("radio", { name: "Internal note" }));
    fireEvent.change(within(box).getByLabelText("Attach files"), { target: { files: [file("call-log.txt", 100, "text/plain")] } });
    await within(box).findByText("call-log.txt");
    fireEvent.change(within(box).getByLabelText("Internal note"), { target: { value: "Called her back." } });
    fireEvent.click(within(box).getByRole("button", { name: /Add note/ }));
    await waitFor(() => expect(posts()[0]?.body).toEqual({ kind: "note", body: "Called her back.", attachments: ["k1"] }));
  });

  it("refuses a file over 10 MB before uploading it", async () => {
    const said = vi.spyOn(toast, "error");
    render(<CasePage caseId={8} />);
    const box = await screen.findByRole("region", { name: "Reply" });
    fireEvent.change(within(box).getByLabelText("Attach files"), { target: { files: [file("video.mov", 10 * 1024 * 1024 + 1, "video/quicktime")] } });
    expect(said).toHaveBeenCalledWith(expect.stringContaining("each file can be 10 MB at most"));
    expect(uploads()).toHaveLength(0);
    said.mockRestore();
  });

  it("offers no files to a Support member who may only note someone else's case", async () => {
    me.id = 2;
    state.role = "support";
    state.handlers["GET /api/v1/admin/support/cases/8"] = () => detail({ assignee: { id: 5, name: "Other" }, can_work: false, can_take: false });
    render(<CasePage caseId={8} />);
    const box = await screen.findByRole("region", { name: "Reply" });
    expect(within(box).getByRole("button", { name: /Add note/ })).toBeInTheDocument();
    expect(within(box).queryByLabelText("Attach files")).toBeNull();
  });
});

describe("turning a case into a lead", () => {
  const duplicate = () =>
    new ApiError({
      status: 409,
      message: "This looks like a lead we already have.",
      errorCode: "DUPLICATE_LEAD",
      fieldErrors: { matches: [{ id: 12, name: "Riya Foods", city: "Kochi", stage: "meeting", type: "sponsor" }] } as unknown as Record<string, string[]>,
    });
  const toLead = () => callsOf(state, "POST", "/api/v1/admin/support/cases/8/to-lead");

  it("opens the lead when there is none like it", async () => {
    state.handlers["POST /api/v1/admin/support/cases/8/to-lead"] = () => ({ id: 30, name: "Riya" });
    render(<CasePage caseId={8} />);
    fireEvent.click(await screen.findByRole("button", { name: /Turn into a lead/ }));
    const dialog = await screen.findByRole("dialog", { name: "Turn into a lead" });
    fireEvent.click(within(dialog).getByRole("button", { name: /Open lead/ }));
    await waitFor(() => expect(toLead()).toHaveLength(1));
    expect(toLead()[0]!.body).toEqual({ type: "sponsor" });
  });

  it("shows the lead it may repeat, to open, and creates it anyway only when asked", async () => {
    state.handlers["POST /api/v1/admin/support/cases/8/to-lead"] = ({ body }) => {
      if (!(body as { force?: boolean }).force) throw duplicate();
      return { id: 31, name: "Riya" };
    };
    render(<CasePage caseId={8} />);
    fireEvent.click(await screen.findByRole("button", { name: /Turn into a lead/ }));
    const dialog = await screen.findByRole("dialog", { name: "Turn into a lead" });
    fireEvent.click(within(dialog).getByRole("button", { name: /Open lead/ }));
    expect(await within(dialog).findByText(/Sales already has/)).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "Riya Foods" })).toHaveAttribute("href", "/teamwork/leads/12");
    expect(within(dialog).getByRole("link", { name: /Open the existing lead/ })).toHaveAttribute("href", "/teamwork/leads/12");
    expect(within(dialog).getByRole("link", { name: "Riya Foods" }).closest("li")).toHaveTextContent("Riya Foods · Kochi · Meeting");
    expect(toLead()).toHaveLength(1);
    fireEvent.click(within(dialog).getByRole("button", { name: /Create anyway/ }));
    await waitFor(() => expect(toLead()).toHaveLength(2));
    expect(toLead()[1]!.body).toEqual({ type: "sponsor", force: true });
  });

  it("says so, and reads the case again, when it is a lead already", async () => {
    const said = vi.spyOn(toast, "error");
    state.handlers["POST /api/v1/admin/support/cases/8/to-lead"] = () => {
      throw new ApiError({ status: 409, message: "This case is a lead already.", errorCode: "ALREADY_A_LEAD", fieldErrors: { lead_id: 12 } as unknown as Record<string, string[]> });
    };
    render(<CasePage caseId={8} />);
    fireEvent.click(await screen.findByRole("button", { name: /Turn into a lead/ }));
    const dialog = await screen.findByRole("dialog", { name: "Turn into a lead" });
    const reads = callsOf(state, "GET", "/api/v1/admin/support/cases/8").length;
    fireEvent.click(within(dialog).getByRole("button", { name: /Open lead/ }));
    await waitFor(() => expect(said).toHaveBeenCalledWith("This case is a lead already."));
    await waitFor(() => expect(callsOf(state, "GET", "/api/v1/admin/support/cases/8").length).toBeGreaterThan(reads));
    expect(within(dialog).queryByRole("button", { name: /Create anyway/ })).toBeNull();
    said.mockRestore();
  });
});
