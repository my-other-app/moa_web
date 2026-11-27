import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

import type { FakeState } from "@/test/fake-api";

/**
 * The admin WhatsApp inbox for MyOtherApp's own number:
 * GET /admin/whatsapp/inbox (filters club_id, event_id, unread, q),
 * GET …/unread, GET …/templates, GET …/{id}, POST …/{id}/read,
 * POST …/{id}/messages {mode: text|template}. Owner and support only.
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
const { SidebarNav } = await import("@/components/sidebar-nav");
const { WhatsAppInboxPage, conversationsSchema, labelText, windowLeft } = await import("./index");

const INBOX = "/api/v1/admin/whatsapp/inbox";
const HOUR = 3_600_000;
const ABOUT = { event_id: 5, event_name: "DevFest x CCD 2026", club_id: 3, club_name: "GDG Cloud Trivandrum" };

function conversation(over: Record<string, unknown> = {}) {
  return {
    id: 7,
    wa_id: "919876543210",
    phone: "+919876543210",
    name: "Asha",
    last_message_at: new Date(Date.now() - 5 * 60_000).toISOString(),
    last_inbound_at: new Date(Date.now() - 5 * 60_000).toISOString(),
    last_preview: "Where is the venue?",
    last_direction: "in",
    unread_count: 2,
    about: ABOUT,
    opted_out: false,
    can_send: { text: true, template: true, window_expires_at: new Date(Date.now() + 3 * HOUR).toISOString(), reason: "" },
    ...over,
  };
}

const TICKET = {
  id: "d1",
  direction: "out",
  type: "template",
  body: null,
  at: new Date(Date.now() - 48 * HOUR).toISOString(),
  status: "read",
  automatic: true,
  label: { ...ABOUT, kind: "ticket", kind_label: "Ticket" },
};
const QUESTION = {
  id: "m1",
  direction: "in",
  type: "text",
  body: "Where is the venue?",
  at: new Date(Date.now() - 5 * 60_000).toISOString(),
  status: "received",
  probably_about: { ...ABOUT, kind: "", kind_label: "" },
};

function stub(conv = conversation()) {
  state.handlers[`GET ${INBOX}`] = () => ({ items: [conv], total: 1, page: 1, page_size: 30, unread_conversations: 1, unread_messages: 2 });
  state.handlers[`GET ${INBOX}/unread`] = () => ({ unread_conversations: 1, unread_messages: 2 });
  state.handlers[`GET ${INBOX}/7`] = () => ({ items: [TICKET, QUESTION], next_before: null, conversation: conv });
  state.handlers[`POST ${INBOX}/7/read`] = () => ({ unread_conversations: 0, unread_messages: 0 });
  state.handlers[`GET ${INBOX}/templates`] = () => ({
    templates: [{ name: "event_update", label: "Event update", purpose: "An update", params: ["name", "club", "event", "update"] }],
  });
  state.handlers[`POST ${INBOX}/7/messages`] = (c) => ({
    message: { id: "m9", direction: "out", type: "text", body: (c.body as { text?: string }).text ?? null, status: "sent", sent_by: "Asha" },
    can_send: conv.can_send,
  });
}

beforeEach(() => {
  freshState(state);
  stub();
});

describe("reading the API", () => {
  it("keeps what it can read and drops what it can't", () => {
    const page = conversationsSchema.parse({ items: [conversation(), { nope: true }], total: "1", unread_conversations: "1" });
    expect(page.items).toHaveLength(1);
    expect(page.unread_conversations).toBe(1);
    expect(page.items[0]!.about.club_name).toBe("GDG Cloud Trivandrum");
  });

  it("labels an outbound message with its event, club and kind", () => {
    expect(labelText({ ...ABOUT, kind: "ticket", kind_label: "Ticket" })).toBe("DevFest x CCD 2026 · GDG Cloud Trivandrum · Ticket");
    expect(labelText(null)).toBe("");
  });

  it("counts the window down, and says nothing once it has closed", () => {
    const now = new Date("2026-11-28T10:00:00Z");
    expect(windowLeft("2026-11-28T13:12:00Z", now)).toBe("3 h 12 min left");
    expect(windowLeft("2026-11-28T10:20:00Z", now)).toBe("20 min left");
    expect(windowLeft("2026-11-28T09:00:00Z", now)).toBeNull();
    expect(windowLeft(null, now)).toBeNull();
  });
});

describe("the side menu", () => {
  it("offers WhatsApp to owners and support with the unread count", async () => {
    state.handlers["GET /api/v1/admin/mail"] = () => ({ addresses: [], unread_total: 0 });
    for (const role of ["owner", "support"]) {
      state.role = role;
      const view = render(<SidebarNav />);
      const link = await screen.findByRole("link", { name: "WhatsApp, 1 unread" });
      expect(link).toHaveAttribute("href", "/whatsapp");
      view.unmount();
    }
  });

  it("is hidden from a viewer, and on an API without the inbox", async () => {
    state.handlers["GET /api/v1/admin/mail"] = () => ({ addresses: [], unread_total: 0 });
    state.role = "viewer";
    const view = render(<SidebarNav />);
    await screen.findByRole("link", { name: "Overview" });
    expect(screen.queryByRole("link", { name: /WhatsApp, / })).toBeNull();
    expect(callsOf(state, "GET", `${INBOX}/unread`)).toHaveLength(0);
    view.unmount();

    state.role = "owner";
    state.handlers[`GET ${INBOX}/unread`] = () => {
      throw routeMissing();
    };
    render(<SidebarNav />);
    await waitFor(() => expect(callsOf(state, "GET", `${INBOX}/unread`).length).toBeGreaterThan(0));
    expect(screen.queryByRole("link", { name: /^WhatsApp/ })).toBeNull();
  });
});

describe("the inbox", () => {
  it("lists conversations with their phone, last message, unread count and club and event", async () => {
    render(<WhatsAppInboxPage />);
    const row = await screen.findByRole("button", { name: /Asha/ });
    expect(within(row).getByText("+919876543210")).toBeInTheDocument();
    expect(within(row).getByText("Where is the venue?")).toBeInTheDocument();
    expect(within(row).getByText("2")).toBeInTheDocument();
    expect(within(row).getByText("GDG Cloud Trivandrum")).toBeInTheDocument();
    expect(within(row).getByText("DevFest x CCD 2026")).toBeInTheDocument();
  });

  it("filters by unread and by club", async () => {
    render(<WhatsAppInboxPage />);
    await screen.findByRole("button", { name: /Asha/ });
    fireEvent.click(screen.getByRole("button", { name: /^Unread/ }));
    await waitFor(() => expect(callsOf(state, "GET", INBOX).at(-1)?.query).toMatchObject({ unread: true }));
    fireEvent.change(screen.getByRole("combobox", { name: "Filter by club" }), { target: { value: "3" } });
    await waitFor(() => expect(callsOf(state, "GET", INBOX).at(-1)?.query).toMatchObject({ club_id: 3 }));
  });

  it("opens a thread with labelled bubbles, marks it read and sends free text in the window", async () => {
    render(<WhatsAppInboxPage />);
    fireEvent.click(await screen.findByRole("button", { name: /Asha/ }));
    expect(await screen.findByText("DevFest x CCD 2026 · GDG Cloud Trivandrum · Ticket")).toBeInTheDocument();
    expect(screen.getByText("Probably about DevFest x CCD 2026 · GDG Cloud Trivandrum")).toBeInTheDocument();
    await waitFor(() => expect(callsOf(state, "POST", `${INBOX}/7/read`)).toHaveLength(1));
    expect(screen.getByText(/Free text allowed: \d+ h \d+ min left/)).toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "Reply" }), { target: { value: "Hall B, 9 am." } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(callsOf(state, "POST", `${INBOX}/7/messages`)[0]?.body).toEqual({ mode: "text", text: "Hall B, 9 am." }));
  });

  it("offers only a template outside the window, with its values", async () => {
    stub(conversation({ unread_count: 0, can_send: { text: false, template: true, window_expires_at: new Date(Date.now() - HOUR).toISOString(), reason: "" } }));
    render(<WhatsAppInboxPage />);
    fireEvent.click(await screen.findByRole("button", { name: /Asha/ }));
    await screen.findByText(/only an approved template can be sent/);
    expect(screen.queryByRole("textbox", { name: "Reply" })).toBeNull();
    fireEvent.change(await screen.findByRole("combobox", { name: "Template" }), { target: { value: "event_update" } });
    const send = screen.getByRole("button", { name: "Send template" });
    expect(send).toBeDisabled();
    const values = { "Their name": "Asha", Club: "GDG", Event: "DevFest", "The update": "Doors at 8" };
    for (const [label, value] of Object.entries(values)) fireEvent.change(screen.getByLabelText(label), { target: { value } });
    fireEvent.click(send);
    await waitFor(() =>
      expect(callsOf(state, "POST", `${INBOX}/7/messages`)[0]?.body).toEqual({
        mode: "template",
        template: "event_update",
        params: { name: "Asha", club: "GDG", event: "DevFest", update: "Doors at 8" },
      }),
    );
  });

  it("says why nothing can be sent after STOP, and shows a refusal in words", async () => {
    stub(conversation({ opted_out: true, can_send: { text: false, template: false, window_expires_at: null, reason: "They wrote STOP to this number." } }));
    const view = render(<WhatsAppInboxPage />);
    fireEvent.click(await screen.findByRole("button", { name: /Asha/ }));
    expect(await screen.findByText("They wrote STOP to this number.")).toBeInTheDocument();
    view.unmount();

    stub();
    state.handlers[`POST ${INBOX}/7/messages`] = () => {
      throw refusal(409, "More than 24 hours since they last wrote.", "WINDOW_CLOSED");
    };
    render(<WhatsAppInboxPage />);
    fireEvent.click(await screen.findByRole("button", { name: /Asha/ }));
    fireEvent.change(await screen.findByRole("textbox", { name: "Reply" }), { target: { value: "hi" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("More than 24 hours since they last wrote.")).toBeInTheDocument();
  });
});
