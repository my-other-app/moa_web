import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";

const tpl = (id: string, stage: string, name: string, usage: Partial<{ events: number; customised: number; off: number; sends: number; recipients: number; delivery_rate: number | null; open_rate: number | null; bounced: number; last_sent_at: string | null }> = {}, enabled = true) => ({
  id, clubId: 5, eventId: null, stage, label: { INVITE: "Invite", PRE_EVENT: "Pre-event", REMINDER: "Reminder", POST_EVENT: "Post-event", CUSTOM: "Custom" }[stage], name, subject: `${name} · {{event_name}}`,
  design: {}, attachments: {}, audience: { who: "ALL", roles: [] }, trigger: stage === "PRE_EVENT" ? { mode: "BEFORE_START", minutes: 1440 } : stage === "INVITE" ? { mode: "ON_TICKETS" } : { mode: "MANUAL" }, channels: ["email"], enabled, version: 2, sourceId: null, createdAt: "2026-10-01T00:00:00+00:00", updatedAt: "2026-10-11T12:00:00+00:00",
  usage: { events: 0, customised: 0, off: 0, sends: 0, recipients: 0, delivery_rate: null, open_rate: null, bounced: 0, last_sent_at: null, ...usage },
});

const overview = {
  figures: { messages: 3, recipients: 240, sent: 236, failed: 4, delivered: 230, bounced: 6, read: 115, delivery_rate: 97, open_rate: 50 },
  previous: { messages: 1, recipients: 60, sent: 60, failed: 0, delivered: 0, bounced: 0, read: 0, delivery_rate: 100, open_rate: null },
  delta: { messages: 2, recipients: 180 },
  templates: [
    tpl("t1", "INVITE", "Invite · your ticket", { events: 4, customised: 1, sends: 2, recipients: 200, delivery_rate: 98, open_rate: 52, last_sent_at: "2026-10-15T10:00:00+00:00" }),
    tpl("t2", "PRE_EVENT", "Pre-event · the day before", { events: 4 }),
    tpl("t3", "REMINDER", "Reminder · doors are open", { events: 4, sends: 1, recipients: 40, delivery_rate: 95, open_rate: null, bounced: 2 }),
    tpl("t4", "POST_EVENT", "Post-event · thank you", { events: 4 }, false),
    tpl("t5", "CUSTOM", "Sponsor shout-out", { events: 1, sends: 1, recipients: 30 }),
  ],
  queue: [{ template_id: "e9", stage: "PRE_EVENT", label: "Pre-event", name: "Pre-event · the day before", event: { id: 68, name: "Hack Night 04" }, due_at: "2026-10-16T17:00:00+00:00", audience: "ALL" }],
  recent: [{ id: "m1", subject: "Your ticket for Hack Night 04", stage: "INVITE", event: { id: 68, name: "Hack Night 04" }, recipients: 120, sent: 118, failed: 2, scheduled: false, created_at: "2026-10-15T10:00:00+00:00", delivered: 115, read: 60, bounced: 3 }],
  attention: { disabled_stages: ["POST_EVENT"], bounced_30d: 6, failed_30d: 4 },
  all_time: { messages: 4, recipients: 300 },
  generated_at: "2026-10-16T09:00:00+00:00",
};

vi.mock("next/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/navigation")>();
  return { ...actual, usePathname: () => "/emails", useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }), useSearchParams: () => new URLSearchParams() };
});

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        if (path.endsWith("/clubs/me/emails/overview")) return overview;
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(async (path: string, body: unknown) => {
        if (path.endsWith("/clubs/me/emails/preview")) return { subject: `Rendered: ${(body as { subject: string }).subject}`, html: "<p>Hello</p>", text: "Hello", problems: [] };
        throw new Error(`unstubbed POST ${path}`);
      }),
      put: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { EmailLibraryPage } = await import("./components/library-page");

describe("the emails page", () => {
  it("reads the month, what goes out next, the last sends, and each journey email's use and results", async () => {
    render(<EmailLibraryPage />);
    expect(await screen.findByText("3 messages in 30 days · 240 people · 97% delivered · 50% opened")).toBeInTheDocument();
    expect(screen.getByText("6 bounced")).toBeInTheDocument();
    expect(screen.getByText(/Post-event is switched off in the library/)).toBeInTheDocument();
    expect(screen.getByText("What goes out next")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Pre-event · Pre-event · the day before" })).toHaveAttribute("href", "/events/68/emails/e9");
    expect(screen.getByRole("link", { name: "Your ticket for Hack Night 04" })).toHaveAttribute("href", "/events/68/messages");
    expect(screen.getByText(/115 delivered · 60 opened · 3 bounced/)).toBeInTheDocument();

    const invite = screen.getByText("Invite · your ticket", { selector: "p" }).closest("div")!.parentElement!.parentElement!;
    expect(within(invite).getByText("1 changed it")).toBeInTheDocument();
    expect(within(invite).getByText("52%")).toBeInTheDocument();
    expect(within(invite).getByText(/last sent/)).toBeInTheDocument();
    const reminder = screen.getByText("Reminder · doors are open", { selector: "p" }).closest("div")!.parentElement!.parentElement!;
    expect(within(reminder).getByText("2 bounced across its sends.")).toBeInTheDocument();
    expect(screen.getByText("Off")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sponsor shout-out" })).toBeInTheDocument();
    expect(screen.getByText("1 event · sent to 30")).toBeInTheDocument();
    expect(within(invite).getByText("200")).toBeInTheDocument(); // sent to
  });

  it("previews an email with sample values on request", async () => {
    render(<EmailLibraryPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Preview Invite · your ticket" }));
    expect(await screen.findByText(/Rendered: Invite · your ticket/)).toBeInTheDocument();
    expect(screen.getByTitle("Preview of Invite · your ticket")).toHaveAttribute("srcdoc", "<p>Hello</p>");
    fireEvent.click(screen.getByRole("button", { name: "Hide Invite · your ticket" }));
    expect(screen.queryByTitle("Preview of Invite · your ticket")).toBeNull();
  });
});
