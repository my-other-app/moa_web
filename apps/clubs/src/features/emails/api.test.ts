import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: Array<{ method: string; path: string; body?: unknown; options?: unknown }> = [];

const template = {
  id: "t1",
  clubId: 7,
  eventId: 42,
  stage: "INVITE",
  version: 2,
  sourceId: "lib-1",
  createdAt: "2026-10-11T00:00:00Z",
  updatedAt: "2026-10-11T00:00:00Z",
  name: "Invite",
  subject: "Your ticket for {{event_name}}",
  design: { theme: {}, blocks: [{ kind: "heading", id: "h1", text: "You're in", level: 1, style: {} }] },
  attachments: { ticketPdf: true, certificatePdf: false },
  audience: { who: "ALL", roles: [] },
  trigger: { mode: "ON_TICKETS", minutes: null },
  channels: ["email"],
  enabled: true,
};
const message = {
  id: "m1",
  kind: "TEMPLATE",
  templateId: "t1",
  scheduled: false,
  subject: "Your ticket for Build Night",
  body: "",
  audience: "ALL",
  roles: [],
  channels: ["email"],
  status: "SENT",
  recipients: 3,
  sentCount: 2,
  failedCount: 0,
  skippedCount: 1,
  createdAt: "2026-10-11T00:00:00Z",
  createdByName: "Deepu",
};

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  const record = (method: string) => async (path: string, body?: unknown, options?: unknown) => {
    calls.push({ method, path, body, options });
    if (path.endsWith("/emails") && method === "GET" && path.includes("/events/"))
      return { journey: [{ stage: "INVITE", label: "Invite", description: "…", template, dueAt: null, lastMessage: message }], custom: [] };
    if (path.endsWith("/clubs/me/emails") && method === "GET") return [{ ...template, eventId: null }];
    if (path.endsWith("/context")) return { tokens: [{ key: "ticket_url", group: "Links", label: "Ticket link", sample: "https://…" }], sampleValues: { event_name: "Build Night" }, brandPrimary: "#1db9a0", logoUrl: null, eventIconUrl: null };
    if (path.endsWith("/preview")) return { subject: "Your ticket for Build Night", html: "<html></html>", text: "…", problems: [] };
    if (path.endsWith("/test")) return { sent: true, to: "me@example.com", subject: "Your ticket for Build Night" };
    if (path.endsWith("/audience")) return { recipients: 2, withoutEmail: 1 };
    if (path.endsWith("/images")) return { key: "uploads/events/42/layout/email-1.png", url: "https://cdn/x.png", width: 800, height: 400 };
    if (path.endsWith("/send") || path.endsWith("/messages")) return method === "GET" ? { items: [message], total: 1, page: 1, pageSize: 20 } : message;
    if (path.includes("/messages/")) return { message, deliveries: [{ registrationId: "r1", name: "Ananya", email: "a@example.com", ticketId: "MOA-1", channel: "email", status: "sent", error: null, sentAt: "2026-10-11T00:00:00Z" }], total: 1, page: 1, pageSize: 50 };
    if (method === "DELETE") return { deleted: true };
    return template;
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

const api = await import("./api");
const { emailDesignSchema } = await import("./schemas");

beforeEach(() => {
  calls.length = 0;
});

describe("the email endpoints", () => {
  it("reads an event's journey and the club's library from their own roots", async () => {
    const j = await api.fetchTemplates(42);
    const lib = await api.fetchLibrary();
    expect(j.journey[0]?.template.stage).toBe("INVITE");
    expect(j.journey[0]?.lastMessage?.sentCount).toBe(2);
    expect(lib[0]?.eventId).toBeNull();
    expect(calls.map((c) => c.path)).toEqual(["/api/v1/events/42/emails", "/api/v1/clubs/me/emails"]);
  });

  it("saves, duplicates, resets and sends by template id", async () => {
    const fields = { name: "Invite", subject: "Hi", design: emailDesignSchema.parse({}), attachments: { ticketPdf: true, certificatePdf: false }, audience: { who: "ALL" as const, roles: [] }, trigger: { mode: "MANUAL" as const, minutes: null }, channels: ["email" as const], enabled: true };
    await api.saveTemplate({ kind: "event", eventId: 42 }, "t1", fields);
    await api.saveTemplate({ kind: "library" }, "lib-1", fields);
    await api.duplicateTemplate({ kind: "event", eventId: 42 }, "t1");
    await api.resetTemplate(42, "t1");
    await api.saveToLibrary(42, "t1");
    const m = await api.sendTemplate(42, "t1", "6f1c2d3e-4a5b-4c6d-8e7f-001122334455");
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      "PUT /api/v1/events/42/emails/t1",
      "PUT /api/v1/clubs/me/emails/lib-1",
      "POST /api/v1/events/42/emails/t1/duplicate",
      "POST /api/v1/events/42/emails/t1/reset",
      "POST /api/v1/events/42/emails/t1/save-to-library",
      "POST /api/v1/events/42/emails/t1/send",
    ]);
    expect(m.recipients).toBe(3);
    // The press's key rides in the body, camel-cased as the email API speaks.
    expect(calls.at(-1)?.body).toEqual({ clientRef: "6f1c2d3e-4a5b-4c6d-8e7f-001122334455" });
  });

  it("puts a library email back to MyOtherApp's default words", async () => {
    const t = await api.resetLibraryTemplate("lib-7");
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(["POST /api/v1/clubs/me/emails/lib-7/reset"]);
    expect(calls[0]?.body).toBeUndefined();
    expect(t.id).toBe("t1");
  });

  it("sends no body without a key, as an API from before the key expects", async () => {
    await api.sendTemplate(42, "t1");
    expect(calls.at(-1)?.body).toBeUndefined();
    expect(api.newClientRef()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(api.newClientRef()).not.toBe(api.newClientRef());
  });

  it("previews and test-sends the unsaved design, and counts an audience", async () => {
    const design = emailDesignSchema.parse({});
    const p = await api.previewEmail({ kind: "event", eventId: 42 }, { subject: "s", design, registrationId: "r1" });
    await api.previewEmail({ kind: "library" }, { subject: "s", design });
    await api.sendTestEmail(42, { to: "me@example.com", subject: "s", design, attachments: { ticketPdf: false, certificatePdf: false } });
    const c = await api.countAudience(42, { who: "CHECKED_IN", roles: ["speaker"] });
    expect(p.subject).toBe("Your ticket for Build Night");
    expect(c).toEqual({ recipients: 2, withoutEmail: 1 });
    expect(calls[0]).toMatchObject({ method: "POST", path: "/api/v1/events/42/emails/preview", body: { registrationId: "r1" } });
    expect(calls[1]?.path).toBe("/api/v1/clubs/me/emails/preview");
    expect(calls[2]?.path).toBe("/api/v1/events/42/emails/test");
    expect(calls[3]).toMatchObject({ path: "/api/v1/events/42/emails/audience", body: { who: "CHECKED_IN", roles: ["speaker"] } });
  });

  it("lists messages with paging, sends one with its client ref, and opens one with its filters", async () => {
    await api.fetchMessages(42, 2, 20);
    await api.sendMessage(42, { subject: "Doors", body: "Hi", attachments: { ticketPdf: false, certificatePdf: false }, audience: { who: "ALL", roles: [] }, clientRef: "ref-1" });
    const d = await api.fetchMessage(42, "m1", { problem: true, search: "ana", page: 1, pageSize: 50 });
    expect(calls[0]).toMatchObject({ method: "GET", path: "/api/v1/events/42/messages", options: { query: { page: 2, page_size: 20 } } });
    expect(calls[1]).toMatchObject({ method: "POST", path: "/api/v1/events/42/messages", body: { clientRef: "ref-1" } });
    expect(calls[2]).toMatchObject({ method: "GET", path: "/api/v1/events/42/messages/m1", options: { query: { problem: true, search: "ana", page: 1, page_size: 50 } } });
    expect(d.deliveries[0]?.status).toBe("sent");
  });

  it("uploads a picture as a form to the scope's images route", async () => {
    const up = await api.uploadEmailImage({ kind: "library" }, new File(["x"], "logo.png", { type: "image/png" }));
    expect(up.key).toContain("email-1.png");
    expect(calls[0]?.path).toBe("/api/v1/clubs/me/emails/images");
    expect(calls[0]?.body).toBeInstanceOf(FormData);
  });

  it("knows where each scope's editor lives", () => {
    expect(api.templateHref({ kind: "event", eventId: 42 }, "t1")).toBe("/events/42/emails/t1");
    expect(api.templateHref({ kind: "library" }, "t1")).toBe("/emails/t1");
    expect(api.scopeHref({ kind: "library" })).toBe("/emails");
  });
});
