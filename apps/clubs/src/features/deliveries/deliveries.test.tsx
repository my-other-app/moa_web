import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

const calls: Array<{ method: string; path: string; body?: unknown; query?: Record<string, unknown> }> = [];

const tally = (t: Partial<Record<"sent" | "delivered" | "awaiting" | "bounced" | "complained" | "failed" | "skipped" | "pending", number>>) => ({
  sent: 0, delivered: 0, awaiting: 0, bounced: 0, complained: 0, failed: 0, skipped: 0, pending: 0, ...t,
});
const TALLIES: Record<string, ReturnType<typeof tally>> = {
  ticket: tally({ sent: 100, delivered: 90, awaiting: 6, bounced: 3, complained: 1, failed: 2, skipped: 1 }),
  certificate: tally({ sent: 40, delivered: 40 }),
  message: tally({ sent: 60, delivered: 50, awaiting: 10, failed: 4 }),
};
const row = (id: string, kind: string, over: Record<string, unknown> = {}) => ({
  id, registration_id: `reg-${id}`, ticket_id: `MOA-${id}`, name: `Guest ${id}`, address: `${id}@example.com`, kind, what: null, channel: "email",
  status: "sent", outcome: "delivered", reason: null, attempts: 1, sent_at: "2026-10-15T10:00:00+00:00", outcome_at: null, ...over,
});

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string, options?: { query?: Record<string, unknown> }) => {
        calls.push({ method: "GET", path, query: options?.query });
        if (path.endsWith("/deliveries/summary"))
          return { kind: "ticket", registrations: 110, revoked: 0, providers: [{ channel: "email", name: "Resend", configured: true, note: "" }], channels: [{ channel: "email", sent: 100, failed: 2, skipped: 1, pending: 0, unsent: 7 }] };
        if (path.endsWith("/certificates/summary"))
          return { issued: 40, revoked: 0, attended: 40, registrations: 110, outdated: 0, design_version: 1, channels: [{ channel: "email", sent: 40, failed: 0, skipped: 0, pending: 0, unsent: 0 }] };
        if (path.endsWith("/deliveries")) {
          const q = options?.query ?? {};
          if (q.page_size === 1) return { items: [], total: 0, page: 1, page_size: 1, tally: TALLIES[String(q.kind)] ?? tally({}) };
          const items = q.problem
            ? [row("b1", "ticket", { outcome: "bounced", reason: "Mailbox does not exist" })]
            : [
                row("b1", "ticket", { outcome: "bounced", reason: "Mailbox does not exist" }),
                row("m1", "message", { what: "Doors open at six", outcome: null }),
                row("c1", "certificate"),
              ];
          return { items, total: items.length, page: 1, page_size: 20, tally: tally({}) };
        }
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(async (path: string, body?: unknown) => {
        calls.push({ method: "POST", path, body });
        return { queued: 1, already_sent: 0, revoked: 0, channels: ["email"] };
      }),
      put: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { DeliveryLog } = await import("./components/delivery-log");

beforeEach(() => {
  calls.length = 0;
});

describe("the deliveries tab", () => {
  it("leads with the event's figures, each kind as a bar, and what needs a resend", async () => {
    render(<DeliveryLog eventId={42} />);
    expect(await screen.findByText(/207 sends to guests · 180 delivered · 11 need a look/)).toBeInTheDocument();

    // Sent 200, delivered 180 of the 184 heard back, 4 did not arrive, 3 could not be sent.
    expect(screen.getByText("200")).toBeInTheDocument();
    expect(screen.getByText("100 tickets · 40 certificates · 60 messages")).toBeInTheDocument();
    expect(screen.getByText("98%")).toBeInTheDocument();
    expect(screen.getByText("180 of 184 reported · 16 awaiting")).toBeInTheDocument();
    expect(screen.getByText("3 bounced · 1 spam")).toBeInTheDocument();
    expect(screen.getByText("6 refused · 1 no address")).toBeInTheDocument();

    expect(screen.getByRole("img", { name: /Tickets: 90 delivered, 6 awaiting a report, 4 did not arrive, 3 could not be sent, 7 not sent yet/ })).toBeInTheDocument();
    expect(screen.getByText("100 sent · 90 delivered · 96%")).toBeInTheDocument();

    expect(screen.getByText("10 guests are without their ticket")).toBeInTheDocument();
    expect(screen.getByText("4 sends did not arrive")).toBeInTheDocument();
    expect(screen.getByText("4 message deliveries were refused")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Send 10 tickets" }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.path === "/api/v1/events/42/tickets/send")).toBe(true));
    expect(calls.find((c) => c.path === "/api/v1/events/42/tickets/send")?.body).toEqual({ only: "unsent" });
  });

  it("lists every send with what became of it, and sends a ticket that bounced again", async () => {
    render(<DeliveryLog eventId={42} />);
    const bounced = (await screen.findByText("Guest b1")).closest("li")!;
    expect(within(bounced).getByText("Bounced")).toBeInTheDocument();
    expect(within(bounced).getByText("Mailbox does not exist")).toBeInTheDocument();
    expect(screen.getAllByText("Doors open at six").length).toBeGreaterThan(0);
    // Only a ticket or certificate that did not land is offered again; a message is not.
    expect(screen.getAllByRole("button", { name: /their .* again/ })).toHaveLength(1);

    fireEvent.click(within(bounced).getByRole("button", { name: "Send Guest b1 their ticket again" }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.path === "/api/v1/events/42/tickets/reg-b1/send")).toBe(true));
  });

  it("narrows the list to a kind and to the problems without changing the figures", async () => {
    render(<DeliveryLog eventId={42} />);
    await screen.findByText("Guest b1");

    fireEvent.click(screen.getByRole("button", { name: "Messages 64" }));
    await waitFor(() => expect(calls.some((c) => c.path.endsWith("/deliveries") && c.query?.kind === "message" && c.query?.page_size === 20)).toBe(true));

    fireEvent.click(screen.getByRole("button", { name: "Problems 4" }));
    await waitFor(() => expect(calls.some((c) => c.path.endsWith("/deliveries") && c.query?.problem === true && c.query?.kind === "message")).toBe(true));
    expect(screen.getByText("98%")).toBeInTheDocument();
  });
});
