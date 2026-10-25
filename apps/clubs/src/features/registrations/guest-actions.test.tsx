import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { ApiError } from "@moa/api";

import analyticsFixture from "../__fixtures__/event-analytics.json";
import eventFixture from "../__fixtures__/event-detail.json";
import registrationsFixture from "../__fixtures__/registrations.json";
import summaryFixture from "../__fixtures__/event-summary.json";

/**
 * What an organiser does to one guest from the Attendees tab: open them in
 * full, change the role they attend as, check them in by hand, take them off
 * the list -- each one a request to the server, and each refusal said.
 */
const ONE = "6f1b2c70-0000-4000-8000-000000000001";
const TWO = "6f1b2c70-0000-4000-8000-000000000002";
const SLUG = "sf-sea-hackathon-9f21a";

type Row = (typeof registrationsFixture.items)[number] & Record<string, unknown>;
const state: { rows: Row[]; refuse: Error | null; detail: Record<string, unknown> | null } = { rows: [], refuse: null, detail: null };
const writes: Array<{ method: string; path: string; body?: unknown; init?: unknown }> = [];

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/events/37/attendees",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  const write = (method: string) =>
    vi.fn(async (path: string, body?: unknown, init?: unknown) => {
      writes.push({ method, path, body, init });
      if (state.refuse) throw state.refuse;
      return undefined;
    });
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        if (path.includes("/events/info/")) return eventFixture;
        if (/\/events\/\d+\/summary$/.test(path)) return summaryFixture;
        if (path.includes("/registration/37/info/")) {
          if (!state.detail) throw new ApiError({ status: 404, message: "Registration not found" });
          return state.detail;
        }
        if (path.includes("/analytics")) return analyticsFixture;
        if (path.includes("/list")) return { ...registrationsFixture, items: state.rows };
        if (path.endsWith("/imports")) return [];
        if (path.endsWith("/deliveries/summary"))
          return { kind: "ticket", registrations: 2, revoked: 0, channels: [{ channel: "email", sent: 0, failed: 0, skipped: 0, pending: 0, unsent: 2 }] };
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: write("POST"),
      put: write("PUT"),
      patch: write("PATCH"),
      del: write("DELETE"),
    },
  };
});

const { api, formatDateTime } = await import("@moa/app-kit");
const { toast } = await import("@moa/ui");
const { render } = await import("@/test/render");
const { RegistrationsPanel } = await import("./components/registrations-panel");
const { AttendeeDetailDialog } = await import("./components/attendee-detail-dialog");

const listLoads = () => vi.mocked(api.get).mock.calls.filter(([path]) => String(path).includes("/list")).length;

beforeEach(() => {
  state.rows = registrationsFixture.items.map((r) => ({ ...r }));
  state.refuse = null;
  state.detail = null;
  writes.length = 0;
  vi.mocked(api.get).mockClear();
  vi.restoreAllMocks();
});

const openRowMenu = async (name: string) => {
  fireEvent.keyDown(await screen.findByRole("button", { name: `Actions for ${name}` }), { key: "Enter" });
};

describe("removing a guest from the list", () => {
  const startRemoving = async () => {
    render(<RegistrationsPanel eventId={37} />);
    await openRowMenu("Test Participant One");
    fireEvent.click(await screen.findByRole("menuitem", { name: /Remove from the list/ }));
    return screen.findByRole("dialog", { name: "Remove Test Participant One from the list" });
  };

  it("asks for the event's slug, and stays shut until it is typed exactly", async () => {
    const dialog = await startRemoving();
    expect(within(dialog).getByText(/deletes their registration, their ticket and their check-in/)).toBeInTheDocument();
    // The slug to type is named on screen, not hidden in a placeholder.
    expect(within(dialog).getByText(SLUG)).toBeInTheDocument();
    const remove = within(dialog).getByRole("button", { name: "Remove from the list" });
    expect(remove).toBeDisabled();

    fireEvent.change(within(dialog).getByLabelText(/to confirm/), { target: { value: "sf-sea-hackathon" } });
    expect(remove).toBeDisabled();
    fireEvent.click(remove);
    expect(writes).toEqual([]);
  });

  it("removes that registration with the typed slug, says so, and reloads the list", async () => {
    const said = vi.spyOn(toast, "success");
    const dialog = await startRemoving();
    const before = listLoads();
    // Stray spaces around a pasted slug are forgiven.
    fireEvent.change(within(dialog).getByLabelText(/to confirm/), { target: { value: `  ${SLUG} ` } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove from the list" }));

    await waitFor(() => expect(said).toHaveBeenCalledWith("Removed from the list", expect.anything()));
    expect(writes).toEqual([
      { method: "DELETE", path: `/api/v1/events/registration/37/info/${ONE}`, body: undefined, init: { query: { confirm_slug: SLUG } } },
    ]);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(listLoads()).toBeGreaterThan(before));
  });

  it("keeps the dialog open with the server's refusal", async () => {
    state.refuse = new ApiError({ status: 400, message: "The slug does not match this event" });
    const said = vi.spyOn(toast, "error");
    const dialog = await startRemoving();
    fireEvent.change(within(dialog).getByLabelText(/to confirm/), { target: { value: SLUG } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove from the list" }));
    await waitFor(() => expect(said).toHaveBeenCalledWith("The slug does not match this event"));
    expect(screen.getByRole("dialog", { name: "Remove Test Participant One from the list" })).toBeInTheDocument();
  });

  it("sends nothing when the organiser keeps them", async () => {
    const dialog = await startRemoving();
    fireEvent.click(within(dialog).getByRole("button", { name: "Keep them" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(writes).toEqual([]);
  });
});

describe("changing the role a guest attends as", () => {
  it("puts the new role for that registration, holding the pick while it saves", async () => {
    let finish: () => void = () => undefined;
    vi.mocked(api.put).mockImplementationOnce(async (path: string, body?: unknown) => {
      writes.push({ method: "PUT", path, body });
      await new Promise<void>((resolve) => (finish = resolve));
    });
    const said = vi.spyOn(toast, "success");
    render(<RegistrationsPanel eventId={37} />);
    const select = await screen.findByLabelText("Role for Test Participant Two");
    expect(select).toHaveValue("attendee");

    fireEvent.change(select, { target: { value: "speaker" } });
    await waitFor(() => expect(select).toBeDisabled());
    expect(select).toHaveValue("speaker");
    expect(writes).toEqual([{ method: "PUT", path: `/api/v1/events/registration/37/role/${TWO}`, body: { role: "speaker" } }]);

    state.rows[1] = { ...state.rows[1]!, role: "speaker" };
    finish();
    await waitFor(() => expect(said).toHaveBeenCalledWith("Role updated"));
    await waitFor(() => expect(select).toBeEnabled());
    expect(screen.getByLabelText("Role for Test Participant Two")).toHaveValue("speaker");
  });

  it("goes back to the role on record when the server refuses", async () => {
    state.refuse = new ApiError({ status: 409, message: "Their certificate is already issued" });
    const said = vi.spyOn(toast, "error");
    render(<RegistrationsPanel eventId={37} />);
    const select = await screen.findByLabelText("Role for Test Participant Two");
    fireEvent.change(select, { target: { value: "staff" } });
    await waitFor(() => expect(said).toHaveBeenCalledWith("Their certificate is already issued"));
    await waitFor(() => expect(screen.getByLabelText("Role for Test Participant Two")).toHaveValue("attendee"));
  });
});

describe("checking a guest in by hand", () => {
  it("offers Check in only to someone not yet in", async () => {
    render(<RegistrationsPanel eventId={37} />);
    await screen.findByText("Test Participant One");
    // One check-in button for the one guest who is not in; the other carries the badge.
    expect(screen.getAllByRole("button", { name: "Check in" })).toHaveLength(1);
    expect(screen.getAllByText("Checked in").length).toBeGreaterThan(0);
  });

  it("marks that registration as attended, and the row shows them in once the list reloads", async () => {
    const said = vi.spyOn(toast, "success");
    render(<RegistrationsPanel eventId={37} />);
    const button = await screen.findByRole("button", { name: "Check in" });
    expect(button).toHaveAttribute("title", expect.stringMatching(/cannot be undone/));
    state.rows[0] = { ...state.rows[0]!, is_attended: true };
    fireEvent.click(button);

    await waitFor(() => expect(said).toHaveBeenCalledWith("Marked as attended"));
    expect(writes).toEqual([{ method: "POST", path: `/api/v1/events/registration/37/attendance/${ONE}`, body: undefined, init: undefined }]);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Check in" })).toBeNull());
  });

  it("will not check in a revoked ticket, and says why", async () => {
    state.rows[0] = { ...state.rows[0]!, ticket_revoked_at: "2099-06-01T10:00:00Z" };
    render(<RegistrationsPanel eventId={37} />);
    const button = await screen.findByRole("button", { name: "Check in" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", "This ticket was revoked — reinstate it first");
  });

  it("says the server's refusal and leaves them not checked in", async () => {
    state.refuse = new ApiError({ status: 409, message: "This ticket was revoked" });
    const said = vi.spyOn(toast, "error");
    render(<RegistrationsPanel eventId={37} />);
    fireEvent.click(await screen.findByRole("button", { name: "Check in" }));
    await waitFor(() => expect(said).toHaveBeenCalledWith("This ticket was revoked"));
    expect(await screen.findByRole("button", { name: "Check in" })).toBeEnabled();
  });
});

describe("one guest in full", () => {
  const fields = [
    { key: "github", label: "GitHub profile", field_type: "url" },
    { key: "tshirt", label: "T-shirt size", field_type: "select", options: ["S", "M", "L"] },
  ];
  const full = {
    ...registrationsFixture.items[0],
    is_attended: true,
    attended_on: "2099-06-09T08:40:00Z",
    created_at: "2099-05-02T10:14:00Z",
    updated_at: "2099-05-03T09:00:00Z",
    additional_details: { github: "https://github.com/one", dietary: "Vegetarian" },
    ticket_deliveries: [{ channel: "email", status: "failed", attempts: 3, error: "Mailbox full", sent_at: null }],
    certificate_issued_at: "2099-06-10T12:00:00Z",
    certificate_deliveries: [{ channel: "email", status: "sent", outcome: "delivered", attempts: 1, sent_at: "2099-06-10T12:05:00Z" }],
  };
  const section = (title: string) => screen.getByText(title).closest("section") as HTMLElement;

  it("opens from the list on the guest's name and asks for that registration", async () => {
    state.detail = full;
    render(<RegistrationsPanel eventId={37} />);
    fireEvent.click(await screen.findByRole("button", { name: "Open Test Participant One" }));
    expect(await screen.findByRole("dialog", { name: "Test Participant One" })).toBeInTheDocument();
    expect(vi.mocked(api.get).mock.calls.some(([path]) => path === `/api/v1/events/registration/37/info/${ONE}`)).toBe(true);
  });

  it("shows their contact, answers, ticket and delivery, the event, and the certificate", async () => {
    state.detail = full;
    render(<AttendeeDetailDialog eventId={37} registrationId={ONE} fields={fields} open onOpenChange={() => undefined} onEdit={() => undefined} onRemove={() => undefined} />);
    expect(await screen.findByText(`On the list since ${formatDateTime(full.created_at)}`)).toBeInTheDocument();

    const contact = section("Contact");
    expect(within(contact).getByText("participant1@example.com")).toBeInTheDocument();
    expect(within(contact).getByText("9000000001")).toBeInTheDocument();
    expect(within(contact).getByText("College of Engineering Trivandrum")).toBeInTheDocument();

    // Every question the event asks, the unanswered one said so, and an answer to a question since removed.
    const answers = section("Answers");
    expect(within(answers).getByText("GitHub profile")).toBeInTheDocument();
    expect(within(answers).getByText("https://github.com/one")).toBeInTheDocument();
    expect(within(answers).getByText("T-shirt size")).toBeInTheDocument();
    expect(within(answers).getByText("not answered")).toBeInTheDocument();
    expect(within(answers).getByText("dietary")).toBeInTheDocument();
    expect(within(answers).getByText("Vegetarian")).toBeInTheDocument();

    const ticket = section("Ticket and delivery");
    expect(within(ticket).getByText("NEX25AA001")).toBeInTheDocument();
    expect(within(ticket).getByText("Issued")).toBeInTheDocument();
    expect(within(ticket).getByText("failed after 3 tries — Mailbox full")).toBeInTheDocument();

    const cert = section("Certificate");
    expect(within(cert).getByText(`Issued ${formatDateTime(full.certificate_issued_at)}`)).toBeInTheDocument();
    expect(within(cert).getByText(`delivered · ${formatDateTime("2099-06-10T12:05:00Z")}`)).toBeInTheDocument();

    const at = section("At the event");
    expect(within(at).getByText(formatDateTime(full.attended_on))).toBeInTheDocument();
    expect(within(at).getByText(formatDateTime(full.updated_at))).toBeInTheDocument();

    expect(screen.getByText("Speaker")).toBeInTheDocument();
    expect(screen.getByText("Certificate issued")).toBeInTheDocument();
  });

  it("says a revoked ticket, a bounced address and a revoked certificate plainly", async () => {
    state.detail = {
      ...full,
      ticket_revoked_at: "2099-06-05T10:00:00Z",
      email_bounced_at: "2099-06-04T10:00:00Z",
      email_bounce_reason: "No such mailbox",
      certificate_revoked_at: "2099-06-11T10:00:00Z",
    };
    render(<AttendeeDetailDialog eventId={37} registrationId={ONE} fields={[]} open onOpenChange={() => undefined} onEdit={() => undefined} onRemove={() => undefined} />);
    expect(await screen.findByText("Ticket revoked")).toBeInTheDocument();
    expect(screen.getByText(/Revoked .* — check-in refuses it/)).toBeInTheDocument();
    expect(screen.getByText("Bounced — No such mailbox. Correct it to send again.")).toBeInTheDocument();
    expect(screen.getByText("Certificate revoked")).toBeInTheDocument();
  });

  it("copies an address in full", async () => {
    state.detail = full;
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<AttendeeDetailDialog eventId={37} registrationId={ONE} fields={[]} open onOpenChange={() => undefined} onEdit={() => undefined} onRemove={() => undefined} />);
    fireEvent.click(await screen.findByRole("button", { name: "Copy participant1@example.com" }));
    expect(writeText).toHaveBeenCalledWith("participant1@example.com");
  });

  it("hands the record to Correct details and to Remove", async () => {
    state.detail = full;
    const onEdit = vi.fn();
    const onRemove = vi.fn();
    render(<AttendeeDetailDialog eventId={37} registrationId={ONE} fields={[]} open onOpenChange={() => undefined} onEdit={onEdit} onRemove={onRemove} />);
    fireEvent.click(await screen.findByRole("button", { name: "Correct details" }));
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: ONE, email: "participant1@example.com" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove from the list" }));
    expect(onRemove).toHaveBeenCalledWith(expect.objectContaining({ id: ONE }));
  });

  it("removes from the full view with the same typed confirmation", async () => {
    state.detail = full;
    render(<RegistrationsPanel eventId={37} />);
    fireEvent.click(await screen.findByRole("button", { name: "Open Test Participant One" }));
    const dialog = await screen.findByRole("dialog", { name: "Test Participant One" });
    fireEvent.click(await within(dialog).findByRole("button", { name: "Remove from the list" }));
    expect(await screen.findByRole("dialog", { name: "Remove Test Participant One from the list" })).toBeInTheDocument();
  });

  it("says when the guest cannot be loaded, with a way to try again", async () => {
    state.detail = null;
    render(<AttendeeDetailDialog eventId={37} registrationId={ONE} fields={[]} open onOpenChange={() => undefined} onEdit={() => undefined} onRemove={() => undefined} />);
    expect(await screen.findByText("This guest could not be loaded.")).toBeInTheDocument();
    state.detail = full;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Test Participant One" })).toBeInTheDocument();
  });
});
