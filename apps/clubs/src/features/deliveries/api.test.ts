import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: Array<{ method: string; path: string; body?: unknown; options?: unknown }> = [];

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  const record = (method: string) => async (path: string, body?: unknown, options?: unknown) => {
    calls.push({ method, path, body, options });
    if (path.endsWith("/deliveries/summary"))
      return { kind: "ticket", registrations: 3, revoked: 0, channels: [{ channel: "email", sent: 2, failed: 0, skipped: 1, pending: 0, unsent: 0 }] };
    if (path.endsWith("/deliveries"))
      return { items: [], total: 0, page: 1, page_size: 50, tally: { sent: 0, delivered: 0, awaiting: 0, bounced: 0, complained: 0, failed: 0, skipped: 0, pending: 0 } };
    if (path.includes("/revoke") || path.includes("/reinstate"))
      return { registration_id: "r1", ticket_id: "MOA-1", revoked_at: path.includes("/revoke") ? "2026-10-11T00:00:00Z" : null };
    if (path.endsWith("/delivery-channels"))
      return { ticket: "whatsapp", reminder: "both", certificate: "email", whatsapp_available: true, whatsapp_note: null };
    return { queued: 1, already_sent: 0, revoked: 0, channels: ["email"] };
  };
  return {
    ...actual,
    api: {
      get: vi.fn((path: string, options?: unknown) => record("GET")(path, undefined, options)),
      put: vi.fn(record("PUT")),
      post: vi.fn(record("POST")),
      del: vi.fn(record("DELETE")),
    },
  };
});

const { bundleUrl, fetchDeliveryChannels, fetchDeliveryLog, fetchDeliverySummary, revokeTicket, saveDeliveryChannels, sendOneTicket, sendTickets } =
  await import("./api");

beforeEach(() => {
  calls.length = 0;
});

describe("the delivery endpoints", () => {
  it("sends to whoever has not been sent one, unless told otherwise", async () => {
    await sendTickets(42);
    await sendTickets(42, "all", ["r1", "r2"]);

    expect(calls[0]).toMatchObject({ method: "POST", path: "/api/v1/events/42/tickets/send", body: { only: "unsent" } });
    expect(calls[1]?.body).toEqual({ only: "all", registration_ids: ["r1", "r2"] });
  });

  it("sends one guest's ticket again, and takes a ticket back", async () => {
    await sendOneTicket(42, "r1");
    const state = await revokeTicket(42, "r1", "transferred");

    expect(calls[0]?.path).toBe("/api/v1/events/42/tickets/r1/send");
    expect(calls[1]).toMatchObject({ path: "/api/v1/events/42/tickets/r1/revoke", body: { reason: "transferred" } });
    expect(state.revoked_at).not.toBeNull();
  });

  it("reads the summary and the log, leaving the problem filter off the query unless it is on", async () => {
    const s = await fetchDeliverySummary(42);
    await fetchDeliveryLog({ eventId: 42, page: 2, pageSize: 50 });
    await fetchDeliveryLog({ eventId: 42, problem: true, search: "ananya", page: 1, pageSize: 50 });

    expect(s.channels[0]?.sent).toBe(2);
    expect(calls[1]).toMatchObject({ path: "/api/v1/events/42/deliveries", options: { query: { page: 2, page_size: 50, problem: undefined } } });
    expect(calls[2]).toMatchObject({ options: { query: { problem: true, search: "ananya" } } });
  });

  it("downloads the bundle through the gateway as a plain link", () => {
    expect(bundleUrl(42)).toBe("/api/gateway/api/v1/events/42/tickets/bundle.zip");
  });
});

describe("send channels", () => {
  it("passes channels on a send only when chosen", async () => {
    calls.length = 0;
    await sendTickets(7, "unsent", undefined, "whatsapp");
    await sendTickets(7, "failed");
    await sendOneTicket(7, "r1", "email");
    await sendOneTicket(7, "r2");
    expect(calls[0]!.body).toEqual({ only: "unsent", channels: "whatsapp" });
    expect(calls[1]!.body).toEqual({ only: "failed" });
    expect(calls[2]!.body).toEqual({ channels: "email" });
    expect(calls[3]!.body).toBeUndefined();
  });

  it("reads and saves the event's setting", async () => {
    calls.length = 0;
    const got = await fetchDeliveryChannels(7);
    expect(got.ticket).toBe("whatsapp");
    expect(got.whatsapp_available).toBe(true);
    await saveDeliveryChannels(7, { ticket: "email", reminder: "both", certificate: "whatsapp" });
    expect(calls[1]).toMatchObject({ method: "PUT", path: "/api/v1/events/7/delivery-channels", body: { ticket: "email", reminder: "both", certificate: "whatsapp" } });
  });
});
