import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

const calls: Array<{ method: string; path: string; body?: unknown; query?: Record<string, unknown> }> = [];

const DAY = 86_400_000;
const soon = new Date(Date.now() + 2 * DAY + 60_000).toISOString();
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();

const tpl = (id: string, stage: string, name: string, over: Record<string, unknown> = {}) => ({
  id, clubId: 5, eventId: 42, stage, name, subject: `${name} · {{event_name}}`,
  design: { theme: {}, blocks: [{ id: "he-1", kind: "heading", text: "Hello {{first_name}}" }] },
  attachments: {}, audience: { who: "ALL", roles: [] },
  trigger: stage === "PRE_EVENT" ? { mode: "BEFORE_START", minutes: 1440 } : stage === "INVITE" ? { mode: "ON_TICKETS" } : { mode: "MANUAL" },
  channels: ["email"], enabled: true, version: 1, sourceId: null, createdAt: "2026-10-01T00:00:00+00:00", updatedAt: "2026-10-01T00:00:00+00:00",
  ...over,
});
const message = (id: string, subject: string, over: Record<string, unknown> = {}) => ({
  id, kind: "BROADCAST", templateId: null, scheduled: false, subject, body: "Hi {{first_name}}, the doors open at six.", audience: "ALL", roles: [], channels: ["email"],
  status: "SENT", recipients: 120, sentCount: 118, failedCount: 2, skippedCount: 0, createdAt: ago(1), createdByName: "Ananya", ...over,
});
const tally = (t: Record<string, number>) => ({ sent: 0, delivered: 0, awaiting: 0, bounced: 0, complained: 0, failed: 0, skipped: 0, pending: 0, ...t });

const reminderSend = message("m2", "Reminder · doors open", { kind: "TEMPLATE", templateId: "t3", createdAt: ago(3) });
const TEMPLATES = {
  journey: [
    { stage: "INVITE", label: "Invite", description: "", template: tpl("t1", "INVITE", "Invite · your ticket", { updatedAt: "2026-10-02T00:00:00+00:00", version: 3 }), dueAt: null, lastMessage: null },
    { stage: "PRE_EVENT", label: "Pre-event", description: "", template: tpl("t2", "PRE_EVENT", "Pre-event · the day before"), dueAt: soon, lastMessage: null },
    { stage: "REMINDER", label: "Reminder", description: "", template: tpl("t3", "REMINDER", "Reminder · doors open"), dueAt: null, lastMessage: reminderSend },
    { stage: "POST_EVENT", label: "Post-event", description: "", template: tpl("t4", "POST_EVENT", "Post-event · thank you", { enabled: false }), dueAt: null, lastMessage: null },
  ],
  custom: [tpl("t5", "CUSTOM", "Sponsor note")],
};
const MESSAGES = [
  message("m1", "Venue change", { createdAt: ago(0.5) }),
  reminderSend,
  message("m3", "Sponsor note · Hack Night", { kind: "TEMPLATE", templateId: "t5", recipients: 30, sentCount: 28, failedCount: 0, skippedCount: 2, createdAt: ago(4) }),
];

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string, options?: { query?: Record<string, unknown> }) => {
        calls.push({ method: "GET", path, query: options?.query });
        const q = options?.query ?? {};
        if (path === "/api/v1/events/42/emails") return TEMPLATES;
        if (path === "/api/v1/events/42/emails/context") return { tokens: [], sampleValues: {}, brandPrimary: "#0f8a73" };
        if (path === "/api/v1/events/42/messages") return { items: MESSAGES, total: MESSAGES.length, page: 1, pageSize: Number(q.page_size ?? 20) };
        if (path === "/api/v1/events/42/messages/m1")
          return {
            message: MESSAGES[0],
            deliveries: q.problem
              ? [{ registrationId: "r9", name: "Ravi", email: "ravi@bad", ticketId: "MOA-9", channel: "email", status: "failed", error: "Address rejected", sentAt: null }]
              : [{ registrationId: "r1", name: "Meera", email: "meera@example.com", ticketId: "MOA-1", channel: "email", status: "sent", error: null, sentAt: ago(0.5) }],
            total: 1, page: 1, pageSize: 50,
          };
        if (path.endsWith("/deliveries/summary"))
          return { kind: "ticket", registrations: 110, revoked: 0, providers: [], channels: [{ channel: "email", sent: 100, failed: 2, skipped: 1, pending: 0, unsent: 7 }] };
        if (path.endsWith("/deliveries")) {
          if (q.kind === "ticket") return { items: [], total: 0, page: 1, page_size: 1, tally: tally({ sent: 100, delivered: 96, awaiting: 2, bounced: 2 }) };
          if (q.kind === "message") return { items: [], total: 0, page: 1, page_size: 1, tally: tally({ sent: 146, delivered: 120, awaiting: 16, bounced: 10, failed: 4, skipped: 2 }) };
          return { items: [], total: 0, page: 1, page_size: 1, tally: tally({}) };
        }
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(async (path: string, body?: unknown) => {
        calls.push({ method: "POST", path, body });
        if (path.endsWith("/emails/preview")) return { subject: `Rendered: ${(body as { subject: string }).subject}`, html: "<p>Hello</p>", text: "Hello", problems: [] };
        if (path.endsWith("/emails/audience")) return { recipients: (body as { who: string }).who === "ALL" ? 118 : 40, withoutEmail: 2 };
        if (path === "/api/v1/events/42/messages") return message("m9", (body as { subject: string }).subject, { status: "SENDING", sentCount: 0, failedCount: 0 });
        throw new Error(`unstubbed POST ${path}`);
      }),
      put: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "PUT", path, body });
        const id = path.split("/").pop()!;
        const all = [...TEMPLATES.journey.map((s) => s.template), ...TEMPLATES.custom];
        return { ...all.find((t) => t.id === id), ...(body as object) };
      }),
      del: vi.fn(async (path: string) => {
        calls.push({ method: "DELETE", path });
        return {};
      }),
    },
  };
});

const { render } = await import("@/test/render");
const { EmailsPage } = await import("./components/emails-page");
const { MessagesPage } = await import("./components/messages-page");

beforeEach(() => {
  calls.length = 0;
});

const card = (name: string) => screen.getByText(name, { selector: "p" }).closest("[data-slot=figure-panel]") as HTMLElement;

describe("an event's emails", () => {
  it("says which go out, when, to whom and what they did", async () => {
    render(<EmailsPage eventId={42} />);
    expect(await screen.findByText("3 of 4 journey emails on · 1 other · next out in 2 d: Pre-event")).toBeInTheDocument();

    expect(screen.getByText("3 of 4")).toBeInTheDocument();
    expect(screen.getByText("Post-event is off")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Next to go out: 2 d. Open it/ })).toHaveAttribute("href", "/events/42/emails/t2");
    // 100 with tickets and 146 others; 216 of the 228 heard about arrived.
    expect(screen.getByText("246")).toBeInTheDocument();
    expect(screen.getByText("95%")).toBeInTheDocument();
    expect(screen.getByText(/Post-event is off for this event and will not go out/)).toBeInTheDocument();

    const invite = card("Invite · your ticket");
    expect(within(invite).getByText("of 110 guests")).toBeInTheDocument();
    expect(within(invite).getByText("10")).toBeInTheDocument();
    expect(within(invite).getByText(/changed for this event/)).toBeInTheDocument();
    expect(within(invite).getByRole("link", { name: /Send tickets/ })).toHaveAttribute("href", "/events/42/attendees");

    const pre = card("Pre-event · the day before");
    expect(within(pre).getByText("goes out in")).toBeInTheDocument();
    expect(within(pre).getByText(/the club's version/)).toBeInTheDocument();

    const reminder = card("Reminder · doors open");
    expect(within(reminder).getByText("of 120 addressed")).toBeInTheDocument();
    expect(within(reminder).getByText("2 failed · 0 no address")).toBeInTheDocument();

    expect(screen.getByRole("link", { name: "Sponsor note" })).toHaveAttribute("href", "/events/42/emails/t5");
    expect(screen.getByText("28 of 30 sent")).toBeInTheDocument();
  });

  it("switches a journey email on, and previews one in place", async () => {
    render(<EmailsPage eventId={42} />);
    fireEvent.click(await screen.findByRole("switch", { name: "Post-event switched off" }));
    await waitFor(() => expect(calls.some((c) => c.method === "PUT" && c.path === "/api/v1/events/42/emails/t4")).toBe(true));
    expect((calls.find((c) => c.method === "PUT")?.body as { enabled: boolean }).enabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Preview Reminder · doors open" }));
    expect(await screen.findByTitle("Preview of Reminder · doors open")).toHaveAttribute("srcdoc", "<p>Hello</p>");
  });

  it("keeps a custom email's actions in its menu, and asks before deleting", async () => {
    render(<EmailsPage eventId={42} />);
    fireEvent.keyDown(await screen.findByRole("button", { name: "Actions for Sponsor note" }), { key: "Enter" });
    expect(await screen.findByRole("menuitem", { name: /Send now/ })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Duplicate/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: /Delete/ }));
    const confirm = await screen.findByRole("alertdialog");
    expect(within(confirm).getByText("Delete “Sponsor note”?")).toBeInTheDocument();
    fireEvent.click(within(confirm).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(calls.some((c) => c.method === "DELETE" && c.path === "/api/v1/events/42/emails/t5")).toBe(true));
  });
});

describe("an event's messages", () => {
  it("leads with what went out and how it did, and opens a message on who it reached", async () => {
    render(<MessagesPage eventId={42} />);
    expect(await screen.findByText(/3 emails sent · 146 people reached · 92% delivered · last/)).toBeInTheDocument();
    expect(screen.getByText("10 bounced · 0 marked as spam")).toBeInTheDocument();
    expect(screen.getByText(/“Venue change” could not reach 2 of 120 guests/)).toBeInTheDocument();
    expect(screen.getByText("Written here by Ananya")).toBeInTheDocument();
    expect(screen.getAllByText("Journey email, sent by hand by Ananya")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "See who" }));
    expect(await screen.findByText("Ravi")).toBeInTheDocument();
    expect(screen.getByText("Address rejected")).toBeInTheDocument();
    expect(calls.some((c) => c.path === "/api/v1/events/42/messages/m1" && c.query?.problem === true)).toBe(true);
  });

  it("writes a message, says who it reaches, and sends it only when asked", async () => {
    render(<MessagesPage eventId={42} />);
    fireEvent.click(await screen.findByRole("button", { name: /New message/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Subject"), { target: { value: "Parking" } });
    fireEvent.change(within(dialog).getByLabelText("Message"), { target: { value: "Use gate 2." } });
    expect(await within(dialog).findByText("118 guests")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: /Review/ }));
    expect(await within(dialog).findByText("118 guests with an email address · 2 without one are skipped")).toBeInTheDocument();
    expect(calls.some((c) => c.method === "POST" && c.path === "/api/v1/events/42/messages")).toBe(false);

    fireEvent.click(within(dialog).getByRole("button", { name: /Send to 118 guests/ }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.path === "/api/v1/events/42/messages")).toBe(true));
    expect(calls.find((c) => c.path === "/api/v1/events/42/messages" && c.method === "POST")?.body).toMatchObject({
      subject: "Parking",
      body: "Use gate 2.",
      audience: { who: "ALL", roles: [] },
    });
  });
});
