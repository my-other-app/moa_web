import { beforeEach, describe, expect, it, vi } from "vitest";
import * as React from "react";
import { act, fireEvent, renderHook, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiError } from "@moa/api";
import { toast } from "@moa/ui";

/**
 * The club's own WhatsApp number, against the backend's contract
 * (app/api/club_whatsapp): GET/PUT/PATCH/DELETE /clubs/whatsapp/account and
 * POST /account/verify answer the account; /overview the account, stats and
 * quality history; /conversations a page of conversations; /conversations/{id}/messages
 * the conversation and its messages; POST .../messages the message as kept (a
 * refusal by Meta comes back 200 with status "failed"); /templates the list.
 */

const NOW = Date.now();
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const ahead = (ms: number) => new Date(NOW + ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;

const NOT_CONNECTED = {
  available: true,
  plan_allows: true,
  upgrade: null,
  connected: false,
  status: null,
  mode: null,
  waba_id: null,
  phone_number_id: null,
  app_id: null,
  display_phone_number: null,
  verified_name: null,
  token_last4: null,
  quality_rating: null,
  messaging_limit_tier: null,
  quality_checked_at: null,
  verified_at: null,
  last_webhook_at: null,
  last_error: null,
  last_error_code: null,
  routing: true,
  retention_months: 12,
  webhook_url: null,
  verify_token: null,
  webhook_fields: ["messages", "message_template_status_update", "phone_number_quality_update", "account_update"],
  can_manage: true,
  can_inbox: true,
};

const CONNECTED = {
  ...NOT_CONNECTED,
  connected: true,
  status: "active",
  mode: "keys",
  waba_id: "102938475610",
  phone_number_id: "109876543210",
  display_phone_number: "+91 98470 12345",
  verified_name: "Circuit Society",
  token_last4: "x9Q2",
  quality_rating: "GREEN",
  messaging_limit_tier: "TIER_1K",
  quality_checked_at: ago(30 * MIN),
  verified_at: ago(2 * HOUR),
  webhook_url: "https://api.myotherapp.in/api/v1/hooks/whatsapp/club/AbCdEfGhIjKlMnOp",
  verify_token: "verify-me-please-1234",
};

const UPGRADE = {
  feature: "whatsapp_own",
  label: "Your own WhatsApp Business number: inbox, templates and quality",
  required_plan: "enterprise",
  required_plan_name: "Enterprise",
  upgrade_url: "https://club-dashboard.myotherapp.in/billing",
};

const STATS = {
  days: 7,
  conversations: 14,
  open: 9,
  unanswered: 3,
  unread: 5,
  window_open: 4,
  received: 40,
  replies: 22,
  sent_by_deliveries: 60,
  median_response_seconds: 720,
  average_response_seconds: 900,
  oldest_unanswered_at: ago(3 * HOUR),
};

const ANANYA = {
  id: 11,
  wa_id: "919847012345",
  phone: "+919847012345",
  profile_name: "Ananya",
  contact: {
    name: "Ananya Iyer",
    user_id: 4,
    registration_id: "6f1c2d3e-0000-4000-8000-000000000001",
    events: [{ id: 3, name: "Build Night", event_datetime: ahead(24 * HOUR), registration_id: "6f1c2d3e-0000-4000-8000-000000000001" }],
  },
  status: "open",
  unread_count: 2,
  awaiting_reply: true,
  awaiting_since: ago(40 * MIN),
  last_message: { direction: "in", type: "text", preview: "Is there parking?", status: "received", at: ago(10 * MIN) },
  last_inbound_at: ago(10 * MIN),
  window_open: true,
  window_expires_at: ahead(24 * HOUR - 10 * MIN),
};

const BALA = {
  ...ANANYA,
  id: 12,
  wa_id: "919876543211",
  phone: "+919876543211",
  profile_name: "Bala K",
  contact: { name: null, user_id: null, registration_id: null, events: [] },
  unread_count: 0,
  awaiting_reply: false,
  awaiting_since: null,
  last_message: { direction: "out", type: "text", preview: "See you there!", status: "read", at: ago(3 * 24 * HOUR) },
  last_inbound_at: ago(3 * 24 * HOUR),
  window_open: false,
  window_expires_at: ago(2 * 24 * HOUR),
};

/** Someone with a WhatsApp username who shares no number (a newer server). */
const CHITRA = {
  ...BALA,
  id: 13,
  wa_id: null,
  bsuid: "IN.1234567890abcdef",
  username: "chitra.r",
  phone: "",
  profile_name: null,
  unread_count: 0,
  last_message: { direction: "in", type: "text", preview: "Hello?", status: "received", at: ago(2 * HOUR) },
};

const msg = (over: Record<string, unknown>) => ({
  id: 1,
  direction: "in",
  type: "text",
  body: "Is there parking?",
  media: null,
  location: null,
  template: null,
  context_wamid: null,
  wamid: "wamid.1",
  status: "received",
  status_at: null,
  error: null,
  via: null,
  sent_by: null,
  created_at: ago(10 * MIN),
  wa_timestamp: ago(10 * MIN),
  ...over,
});

const APPROVED = {
  id: "88001",
  name: "event_update",
  language: "en",
  category: "UTILITY",
  status: "APPROVED",
  rejected_reason: null,
  quality: "GREEN",
  header: null,
  body: "Hi {{1}}, {{2}} has moved to Hall B.",
  body_variables: 2,
  footer: "Circuit Society",
  buttons: [{ index: 0, type: "URL", text: "Event page", url: "https://myotherapp.in/events/{{1}}", phone_number: null, variables: 1 }],
};
const REJECTED = { ...APPROVED, id: "88002", name: "promo_blast", category: "MARKETING", status: "REJECTED", rejected_reason: "INVALID_FORMAT", body: "Big sale!", body_variables: 0, buttons: [], footer: null };

type Answer = (body?: unknown) => unknown;
const state = {
  account: CONNECTED as unknown,
  overview: { account: CONNECTED, stats: STATS, quality_history: [] } as unknown,
  conversations: { items: [ANANYA, BALA], total: 2, unread_total: 2 } as unknown,
  messages: {} as Record<number, unknown>,
  templates: { items: [APPROVED, REJECTED], stale: false, standard_missing: ["ticket_confirmed", "event_reminder", "certificate_ready"] } as unknown,
  put: (() => CONNECTED) as Answer,
  send: ((body: unknown) => msg({ id: 99, direction: "out", body: (body as { text?: string }).text ?? null, status: "sent", via: "inbox", sent_by: "Circuit Society", created_at: new Date().toISOString(), wa_timestamp: null })) as Answer,
  createTemplate: (() => ({ items: [], stale: false, standard_missing: [] })) as Answer,
  verify: null as null | (() => unknown),
  members: [] as unknown[],
};
const calls: Array<{ method: string; path: string; body?: unknown; query?: Record<string, unknown> }> = [];

function answer(value: unknown) {
  if (value instanceof Error) throw value;
  return value;
}

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string, options?: { query?: Record<string, unknown> }) => {
        calls.push({ method: "GET", path, query: options?.query });
        if (path === "/api/v1/clubs/whatsapp/account") return answer(state.account);
        if (path === "/api/v1/clubs/whatsapp/overview") return answer(state.overview);
        if (path === "/api/v1/clubs/whatsapp/conversations") {
          const c = state.conversations;
          return answer(typeof c === "function" ? (c as (query?: Record<string, unknown>) => unknown)(options?.query) : c);
        }
        if (path === "/api/v1/clubs/whatsapp/templates") return answer(state.templates);
        const m = /^\/api\/v1\/clubs\/whatsapp\/conversations\/(\d+)\/messages$/.exec(path);
        if (m) {
          const c = state.messages[Number(m[1])];
          return answer(typeof c === "function" ? (c as (query?: Record<string, unknown>) => unknown)(options?.query) : c);
        }
        if (path === "/api/v1/clubs/access/me") throw new ApiError({ message: "Not Found", status: 404 });
        if (path === "/api/v1/clubs/access") {
          return { owner_email: "circuit@example.com", members: state.members, roles: [{ key: "editor", label: "Editor", description: "Events." }], can_manage: true };
        }
        if (path === "/api/v1/clubs/entitlements") return {};
        throw new Error(`unstubbed GET ${path}`);
      }),
      put: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "PUT", path, body });
        if (path === "/api/v1/clubs/whatsapp/account") return answer(state.put(body));
        const w = /^\/api\/v1\/clubs\/access\/(\d+)\/whatsapp$/.exec(path);
        if (w) return { ...(state.members[0] as object), whatsapp: (body as { allowed: boolean }).allowed };
        throw new Error(`unstubbed PUT ${path}`);
      }),
      post: vi.fn(async (path: string, body?: unknown) => {
        calls.push({ method: "POST", path, body });
        if (path === "/api/v1/clubs/whatsapp/account/verify") return answer(state.verify ? state.verify() : state.account);
        if (path === "/api/v1/clubs/whatsapp/templates/standard") {
          return { results: { ticket_confirmed: "submitted", event_reminder: "submitted", certificate_ready: "Add your app ID in the connection settings first: a document header needs it." } };
        }
        if (path === "/api/v1/clubs/whatsapp/templates") return answer(state.createTemplate(body));
        const r = /\/conversations\/(\d+)\/read$/.exec(path);
        if (r) {
          const kept = state.messages[Number(r[1])] as { conversation?: object } | undefined;
          return { ...ANANYA, ...(typeof kept === "object" ? kept?.conversation : {}), unread_count: 0 };
        }
        if (/\/conversations\/\d+\/messages$/.test(path)) return answer(state.send(body));
        throw new Error(`unstubbed POST ${path}`);
      }),
      patch: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "PATCH", path, body });
        if (path === "/api/v1/clubs/whatsapp/account") return { ...CONNECTED, ...(body as object) };
        throw new Error(`unstubbed PATCH ${path}`);
      }),
      del: vi.fn(async (path: string) => {
        calls.push({ method: "DELETE", path });
        if (path === "/api/v1/clubs/whatsapp/account") return { ...NOT_CONNECTED, status: "disconnected" };
        throw new Error(`unstubbed DELETE ${path}`);
      }),
    },
  };
});

const { render } = await import("@/test/render");
const {
  WhatsAppSettingsPage,
  WhatsAppInboxPage,
  WhatsAppTemplatesPage,
  WhatsAppOverviewCard,
  useSaveAccount,
  accountSchema,
  conversationSchema,
  messageSchema,
  templateSchema,
  contactName,
  initialsOf,
  checkTemplate,
  tierWords,
  duration,
  windowText,
  mediaProblem,
  useInboxStream,
  useCoalesced,
  planRefresh,
  pollEvery,
  REOPEN_AFTER,
} = await import("./index");
const { EMPTY_TEMPLATE } = await import("./components/templates-page");
const { AccessPage, blockedBy } = await import("@/features/access");
const { navItems } = await import("@/components/nav-items");

const writeText = vi.fn(async () => {});

beforeEach(() => {
  calls.length = 0;
  writeText.mockClear();
  Object.assign(navigator, { clipboard: { writeText } });
  Object.assign(state, {
    account: CONNECTED,
    overview: { account: CONNECTED, stats: STATS, quality_history: [] },
    conversations: { items: [ANANYA, BALA], total: 2, unread_total: 2 },
    messages: {
      11: {
        conversation: ANANYA,
        items: [
          msg({ id: 1 }),
          msg({ id: 2, direction: "out", body: "Yes, behind Hall B.", status: "read", via: "inbox", sent_by: "Priya" }),
          msg({ id: 3, direction: "out", body: "And bring your ticket.", status: "failed", via: "inbox", sent_by: "Priya", error: { code: "131026", title: "WhatsApp says this number cannot receive messages" } }),
        ],
        has_more: false,
      },
      12: { conversation: BALA, items: [msg({ id: 5, body: "Thanks!", wa_timestamp: ago(3 * 24 * HOUR), created_at: ago(3 * 24 * HOUR) })], has_more: false },
    },
    templates: { items: [APPROVED, REJECTED], stale: false, standard_missing: ["ticket_confirmed", "event_reminder", "certificate_ready"] },
    put: () => CONNECTED,
    send: (body: unknown) =>
      msg({ id: 99, direction: "out", body: (body as { text?: string }).text ?? null, status: "sent", via: "inbox", sent_by: "Circuit Society", created_at: new Date().toISOString(), wa_timestamp: null }),
    createTemplate: () => state.templates,
    verify: null,
    members: [],
  });
});

// ─── The shapes ──────────────────────────────────────────────────────────

describe("reading the server", () => {
  it("turns what it can't read into its empty form rather than failing the page", () => {
    const a = accountSchema.parse({ available: true, connected: "yes", status: "paused", quality_rating: 5, webhook_fields: "messages" });
    expect(a).toMatchObject({ available: true, connected: false, status: null, quality_rating: null, webhook_fields: [], plan_allows: true, routing: true, retention_months: 12 });
    const c = conversationSchema.parse({ id: 1, wa_id: "919800000000", status: "archived", window_open: true });
    expect(c.contact).toEqual({ name: null, user_id: null, registration_id: null, wa_id: null, bsuid: null, username: null, events: [] });
    expect(c.status).toBe("open");
    const m = messageSchema.parse({ id: 2, direction: "sideways", status: "teleported", created_at: "2026-10-20T10:00:00Z" });
    expect(m).toMatchObject({ direction: "in", status: "sent", type: "unsupported" });
    expect(m.media ?? null).toBeNull();
  });

  it("reads an older server's payloads and a newer one's, the new fields defaulting", () => {
    // Older: none of the new fields.
    const old = accountSchema.parse(NOT_CONNECTED);
    expect(old).toMatchObject({ impersonated: false, warnings: [] });
    const before = conversationSchema.parse(ANANYA);
    expect(before).toMatchObject({ wa_id: "919847012345", bsuid: null, username: null });
    expect(before.contact).toMatchObject({ bsuid: null, username: null, wa_id: null });
    expect(templateSchema.parse(APPROVED).flagged).toBe(false);
    // Newer: every one of them, a username instead of a number.
    const now = accountSchema.parse({ ...CONNECTED, can_inbox: false, impersonated: true, warnings: ["Add a payment method in Meta's Billing Hub."] });
    expect(now).toMatchObject({ impersonated: true, warnings: ["Add a payment method in Meta's Billing Hub."] });
    const after = conversationSchema.parse({ ...CHITRA, phone: null, contact: { ...CHITRA.contact, bsuid: "IN.1234567890abcdef", username: "chitra.r", wa_id: null } });
    expect(after).toMatchObject({ wa_id: null, bsuid: "IN.1234567890abcdef", username: "chitra.r", phone: "" });
    expect(templateSchema.parse({ ...APPROVED, flagged: true }).flagged).toBe(true);
    // A value it can't read is its empty form.
    expect(accountSchema.parse({ ...CONNECTED, impersonated: "yes", warnings: "pay" })).toMatchObject({ impersonated: false, warnings: [] });
  });

  it("names someone by what they share, never a blank or +null", () => {
    const c = conversationSchema.parse(CHITRA);
    expect(contactName(c)).toBe("@chitra.r");
    expect(contactName({ ...c, profile_name: "Chitra" })).toBe("Chitra");
    expect(contactName({ ...c, username: null })).toBe("WhatsApp user");
    expect(contactName(conversationSchema.parse({ ...BALA, profile_name: null }))).toBe("+919876543211");
    expect(contactName(conversationSchema.parse(ANANYA))).toBe("Ananya Iyer");
  });

  it("takes initials as whole letters: Malayalam and Tamil vowel signs stay on", () => {
    expect(initialsOf("Ananya Iyer")).toBe("AI");
    expect(initialsOf("@chitra.r")).toBe("CR");
    expect(initialsOf("WhatsApp user")).toBe("WU");
    expect(initialsOf("+919876543211")).toBe("91");
    // ദേ is ദ with its vowel sign; தெ is த with its own: neither is cut off.
    expect(initialsOf("ദേവി രാജ്")).toBe("ദേരാ");
    expect(initialsOf("தமிழ் செல்வி")).toBe("தசெ");
    expect(initialsOf("👩🏽‍💻 Asha")).toBe("👩🏽‍💻A");
    expect(initialsOf("")).toBe("?");
  });

  it("puts the limit, the reply time and the window in words", () => {
    expect(tierWords("TIER_1K")).toBe("1,000 people a day");
    expect(tierWords("TIER_100K")).toBe("1,00,000 people a day");
    expect(tierWords("TIER_UNLIMITED")).toBe("No daily limit");
    expect(tierWords(null)).toBe("Not set yet");
    expect(duration(45)).toBe("45 s");
    expect(duration(720)).toBe("12 min");
    expect(duration(3 * 3600 + 300)).toBe("3 h 5 min");
    expect(duration(null)).toBe("—");
    const now = new Date(NOW);
    expect(windowText({ window_open: true, window_expires_at: ahead(3 * HOUR), last_inbound_at: ago(21 * HOUR) }, now)).toBe("You can reply freely for 3 h more");
    expect(windowText({ window_open: false, window_expires_at: ago(HOUR), last_inbound_at: ago(25 * HOUR) }, now)).toMatch(/only an approved template/);
    expect(windowText({ window_open: false, window_expires_at: null, last_inbound_at: null }, now)).toMatch(/haven't written yet/);
  });
});

// ─── Settings ────────────────────────────────────────────────────────────

describe("WhatsApp settings", () => {
  it("offers the connect form, and checks each field before asking Meta", async () => {
    state.account = NOT_CONNECTED;
    render(<WhatsAppSettingsPage />);
    const form = await screen.findByRole("form", { name: "Connect WhatsApp" });
    fireEvent.click(within(form).getByRole("button", { name: /Connect WhatsApp/ }));
    expect(await screen.findByText("Paste the WhatsApp Business Account ID.")).toBeInTheDocument();
    expect(screen.getByText("Paste the phone number ID.")).toBeInTheDocument();
    expect(screen.getByText("Paste the app secret.")).toBeInTheDocument();
    expect(calls.some((c) => c.method === "PUT")).toBe(false);

    fireEvent.change(screen.getByLabelText("WhatsApp Business Account ID"), { target: { value: "+91 98470 12345" } });
    fireEvent.click(within(form).getByRole("button", { name: /Connect WhatsApp/ }));
    expect(await screen.findByText("It's a long number, under WhatsApp → API Setup.")).toBeInTheDocument();
  });

  it("connects with the keys trimmed, and then shows the number", async () => {
    state.account = NOT_CONNECTED;
    render(<WhatsAppSettingsPage />);
    await screen.findByRole("form", { name: "Connect WhatsApp" });
    fireEvent.change(screen.getByLabelText("WhatsApp Business Account ID"), { target: { value: " 102938475610 " } });
    fireEvent.change(screen.getByLabelText("Phone number ID"), { target: { value: "109876543210" } });
    fireEvent.change(screen.getByLabelText("Access token"), { target: { value: "EAAGm0PX4ZCpsBAKZCZBtoken1234567890" } });
    fireEvent.change(screen.getByLabelText("App secret"), { target: { value: "0123456789abcdef0123456789ABCDEF" } });
    fireEvent.click(screen.getByRole("button", { name: /Connect WhatsApp/ }));
    await waitFor(() => expect(calls.find((c) => c.method === "PUT")).toBeTruthy());
    expect(calls.find((c) => c.method === "PUT")!.body).toEqual({
      waba_id: "102938475610",
      phone_number_id: "109876543210",
      access_token: "EAAGm0PX4ZCpsBAKZCZBtoken1234567890",
      app_secret: "0123456789abcdef0123456789ABCDEF",
      app_id: null,
    });
    expect(await screen.findByRole("heading", { name: "+91 98470 12345" })).toBeInTheDocument();
  });

  it.each([
    ["WHATSAPP_APP_SECRET_WRONG", null, "App secret", "That app secret doesn't belong to the app the access token was made in."],
    ["WHATSAPP_TOKEN_INVALID", null, "Access token", "Meta didn't accept the access token: it's wrong, expired or revoked."],
    ["WHATSAPP_NUMBER_NOT_IN_WABA", null, "Phone number ID", "That phone number isn't in that WhatsApp Business Account."],
    ["INVALID_WHATSAPP_KEYS", { field: "waba_id" }, "WhatsApp Business Account ID", "That isn't a WhatsApp Business Account ID."],
  ])("shows Meta's refusal %s on the field it is about", async (code, errors, label, text) => {
    state.account = NOT_CONNECTED;
    state.put = () => new ApiError({ status: 422, errorCode: code, message: text, fieldErrors: errors as Record<string, string[]> | null });
    render(<WhatsAppSettingsPage />);
    await screen.findByRole("form", { name: "Connect WhatsApp" });
    fireEvent.change(screen.getByLabelText("WhatsApp Business Account ID"), { target: { value: "102938475610" } });
    fireEvent.change(screen.getByLabelText("Phone number ID"), { target: { value: "109876543210" } });
    fireEvent.change(screen.getByLabelText("Access token"), { target: { value: "EAAGm0PX4ZCpsBAKZCZBtoken1234567890" } });
    fireEvent.change(screen.getByLabelText("App secret"), { target: { value: "0123456789abcdef0123456789abcdef" } });
    fireEvent.click(screen.getByRole("button", { name: /Connect WhatsApp/ }));
    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(screen.getByLabelText(label)).toHaveAttribute("aria-invalid", "true");
  });

  it("says when Meta couldn't be reached, not on a field", async () => {
    state.account = NOT_CONNECTED;
    state.put = () => new ApiError({ status: 502, errorCode: "META_UNREACHABLE", message: "Couldn't reach Meta to check. Try again in a minute." });
    render(<WhatsAppSettingsPage />);
    await screen.findByRole("form", { name: "Connect WhatsApp" });
    fireEvent.change(screen.getByLabelText("WhatsApp Business Account ID"), { target: { value: "102938475610" } });
    fireEvent.change(screen.getByLabelText("Phone number ID"), { target: { value: "109876543210" } });
    fireEvent.change(screen.getByLabelText("Access token"), { target: { value: "EAAGm0PX4ZCpsBAKZCZBtoken1234567890" } });
    fireEvent.change(screen.getByLabelText("App secret"), { target: { value: "0123456789abcdef0123456789abcdef" } });
    fireEvent.click(screen.getByRole("button", { name: /Connect WhatsApp/ }));
    const notice = await screen.findByRole("alert");
    expect(notice).toHaveTextContent("Couldn't reach Meta to check.");
  });

  it("shows a connected number: its quality, limit, webhook to paste, and the fields to subscribe", async () => {
    render(<WhatsAppSettingsPage />);
    expect(await screen.findByRole("heading", { name: "+91 98470 12345" })).toBeInTheDocument();
    const card = screen.getAllByRole("region", { name: "Your WhatsApp number" })[0]!;
    expect(within(card).getByText("Quality: High")).toBeInTheDocument();
    expect(within(card).getByText("1,000 people a day")).toBeInTheDocument();
    expect(within(card).getByText("ends …x9Q2")).toBeInTheDocument();
    const hook = screen.getByRole("region", { name: "Step 2: the webhook" });
    expect(within(hook).getByText(CONNECTED.webhook_url)).toBeInTheDocument();
    expect(within(hook).getByText(CONNECTED.verify_token)).toBeInTheDocument();
    expect(within(within(hook).getByRole("list", { name: "Webhook fields" })).getAllByRole("listitem")).toHaveLength(4);
    fireEvent.click(within(hook).getByRole("button", { name: "Copy the verify token" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(CONNECTED.verify_token));
    // The overview: stats in words.
    const overview = await screen.findByRole("region", { name: "WhatsApp overview" });
    expect(within(overview).getByText("12 min")).toBeInTheDocument();
  });

  it("shows Meta's cautions about the account", async () => {
    state.account = {
      ...CONNECTED,
      warnings: ["Add a payment method in Meta's Billing Hub.", "Accounts in India must move to INR by 31 Dec 2026."],
    };
    render(<WhatsAppSettingsPage />);
    const first = await screen.findByText("Add a payment method in Meta's Billing Hub.");
    expect(first.closest("[role=alert]")).toHaveTextContent("Meta");
    expect(screen.getByText("Accounts in India must move to INR by 31 Dec 2026.")).toBeInTheDocument();
  });

  it("says the messaging limit is the business portfolio's, shared by its numbers", async () => {
    render(<WhatsAppSettingsPage />);
    const card = (await screen.findAllByRole("region", { name: "Your WhatsApp number" }))[0]!;
    expect(within(card).getByText("Your business portfolio's limit, shared by all its numbers")).toBeInTheDocument();
  });

  it("says what Meta said when the number stopped working", async () => {
    state.account = { ...CONNECTED, status: "failed", last_error: "Meta didn't accept the access token: it's wrong, expired or revoked.", last_error_code: "190" };
    render(<WhatsAppSettingsPage />);
    const alert = await screen.findByText(/Meta didn't accept the access token/);
    expect(alert.closest("[role=alert]")).toHaveTextContent("(190)");
    expect(screen.getByText("Not working")).toBeInTheDocument();
  });

  it.each([
    ["checked just now", () => ({ ...CONNECTED, verified_at: new Date().toISOString() }), "success", "Checked. Meta accepts the keys."],
    ["Meta unreachable: the status stays, last_error says why", () => ({ ...CONNECTED, last_error: "Couldn't reach Meta to check the number. Try again in a minute." }), "error", "Couldn't reach Meta to check the number. Try again in a minute."],
    ["nothing new: verified_at unchanged", () => CONNECTED, "error", "Meta couldn't check the number just now. Try again in a minute."],
    ["refused", () => ({ ...CONNECTED, status: "failed", last_error: "Token expired." }), "error", "Meta refused the number. See what it said on the page."],
  ])("says what \"Check again\" found: %s", async (_case, verify, kind, text) => {
    const success = vi.spyOn(toast, "success");
    const error = vi.spyOn(toast, "error");
    try {
      state.verify = verify;
      render(<WhatsAppSettingsPage />);
      fireEvent.click(await screen.findByRole("button", { name: /Check again/ }));
      await waitFor(() => expect(kind === "success" ? success : error).toHaveBeenCalledWith(text));
      expect(kind === "success" ? error : success).not.toHaveBeenCalled();
    } finally {
      success.mockRestore();
      error.mockRestore();
    }
  });

  it("keeps the token and secret out of autofill and password managers", async () => {
    state.account = NOT_CONNECTED;
    render(<WhatsAppSettingsPage />);
    await screen.findByRole("form", { name: "Connect WhatsApp" });
    for (const label of ["Access token", "App secret"]) {
      const input = screen.getByLabelText(label);
      expect(input).toHaveAttribute("type", "password");
      expect(input).toHaveAttribute("autocomplete", "off");
      expect(input).toHaveAttribute("data-1p-ignore");
      expect(input).toHaveAttribute("data-lpignore", "true");
    }
  });

  it("doesn't keep the keys in the mutation cache once the save is done", async () => {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result, unmount } = renderHook(() => useSaveAccount(), { wrapper });
    await act(() =>
      result.current.mutateAsync({ waba_id: "102938475610", phone_number_id: "109876543210", access_token: "EAAGm0PX4ZCpsBAKZCZBtoken1234567890", app_secret: "0123456789abcdef0123456789abcdef" }),
    );
    unmount();
    await waitFor(() => expect(client.getMutationCache().getAll()).toHaveLength(0));
  });

  it("asks before disconnecting, and says the keys are wiped", async () => {
    render(<WhatsAppSettingsPage />);
    fireEvent.click(await screen.findByRole("button", { name: /Disconnect/ }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("wiped");
    fireEvent.click(within(dialog).getByRole("button", { name: "Disconnect" }));
    await waitFor(() => expect(calls.some((c) => c.method === "DELETE" && c.path === "/api/v1/clubs/whatsapp/account")).toBe(true));
  });

  it("turns routing off and changes retention", async () => {
    render(<WhatsAppSettingsPage />);
    fireEvent.click(await screen.findByRole("switch", { name: /Send tickets, certificates and reminders/ }));
    await waitFor(() => expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ routing: false }));
    fireEvent.change(screen.getByLabelText("Keep messages for"), { target: { value: "6" } });
    await waitFor(() => expect(calls.filter((c) => c.method === "PATCH").at(-1)?.body).toEqual({ retention_months: 6 }));
  });

  it("shows the plan that has it, and no form, on a plan without it", async () => {
    state.account = { ...NOT_CONNECTED, plan_allows: false, upgrade: UPGRADE };
    render(<WhatsAppSettingsPage />);
    expect(await screen.findByText(/is part of Enterprise\./)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See plans" })).toHaveAttribute("href", "/billing");
    expect(screen.queryByRole("form", { name: "Connect WhatsApp" })).toBeNull();
  });

  it("is read-only for a member who may only use the inbox", async () => {
    state.account = { ...CONNECTED, can_manage: false, verify_token: null };
    render(<WhatsAppSettingsPage />);
    expect(await screen.findByText(/Only the club's owner and its admins can connect or change/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Disconnect/ })).toBeNull();
    expect(screen.getByText("Only the club's owner and admins can see it.")).toBeInTheDocument();
  });

  it("answers someone without the permission calmly", async () => {
    state.account = new ApiError({ status: 403, errorCode: "WHATSAPP_PERMISSION", message: "You need the WhatsApp permission." });
    render(<WhatsAppSettingsPage />);
    expect(await screen.findByText("WhatsApp isn't open to you")).toBeInTheDocument();
  });
});

// ─── The inbox ───────────────────────────────────────────────────────────

describe("the inbox", () => {
  it("lists conversations with who they are, their events, unread counts and who is waiting", async () => {
    render(<WhatsAppInboxPage />);
    const list = await screen.findByRole("region", { name: "Conversations" });
    expect(await within(list).findByText("Ananya Iyer")).toBeInTheDocument();
    // No registration matched: the WhatsApp profile name.
    expect(within(list).getByText("Bala K")).toBeInTheDocument();
    expect(within(list).getByText("Build Night")).toBeInTheDocument();
    expect(within(list).getByLabelText("2 unread")).toBeInTheDocument();
    expect(within(list).getByText("Waiting for a reply")).toBeInTheDocument();
  });

  it("says why an attachment can't be shown, by the proxy's answer, and tries again when that can help", async () => {
    expect(mediaProblem(410)).toEqual({ text: "This attachment is no longer available from WhatsApp.", retry: false });
    expect(mediaProblem(409).text).toMatch(/isn't connected/);
    expect(mediaProblem(413)).toEqual({ text: "This attachment is too large to show here.", retry: false });
    expect(mediaProblem(502)).toEqual({ text: "Couldn't reach WhatsApp for this attachment.", retry: true });
    expect(mediaProblem(0).retry).toBe(true);
    for (const status of [0, 409, 410, 413, 500, 502]) expect(mediaProblem(status).text).not.toMatch(/30 days/);

    const answers = [502, 200];
    const fetchMock = vi.fn(async () => {
      const status = answers.shift() ?? 200;
      return { ok: status === 200, status, blob: async () => new Blob(["x"], { type: "image/jpeg" }) } as unknown as Response;
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      const picture = msg({ id: 7, type: "image", body: "The venue", media: { url: "/api/v1/clubs/whatsapp/media/7", mime: "image/jpeg", filename: null } });
      const gone = msg({ id: 8, type: "image", body: "Old one", media: { url: "/api/v1/clubs/whatsapp/media/8", mime: "image/jpeg", filename: null } });
      state.messages[11] = { conversation: ANANYA, items: [picture], has_more: false };
      render(<WhatsAppInboxPage />);
      fireEvent.click(await screen.findByRole("button", { name: /Ananya Iyer/ }));
      const log = await screen.findByRole("log", { name: "Messages" });
      expect(await within(log).findByText("Couldn't reach WhatsApp for this attachment.")).toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledWith("/api/gateway/api/v1/clubs/whatsapp/media/7", { credentials: "include" });
      fireEvent.click(within(log).getByRole("button", { name: /Try again/ }));
      expect(await within(log).findByRole("img", { name: "The venue" })).toBeInTheDocument();

      answers.push(410);
      state.messages[12] = { conversation: BALA, items: [gone], has_more: false };
      fireEvent.click(screen.getByRole("button", { name: /Bala K/ }));
      expect(await screen.findByText("This attachment is no longer available from WhatsApp.")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Try again/ })).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("filters and searches on the server", async () => {
    render(<WhatsAppInboxPage />);
    const list = await screen.findByRole("region", { name: "Conversations" });
    await within(list).findByText("Ananya Iyer");
    fireEvent.click(within(list).getByRole("button", { name: "Unanswered" }));
    await waitFor(() => expect(calls.some((c) => c.path.endsWith("/conversations") && c.query?.filter === "unanswered")).toBe(true));
    fireEvent.change(within(list).getByLabelText("Search conversations"), { target: { value: "anan" } });
    await waitFor(() => expect(calls.some((c) => c.path.endsWith("/conversations") && c.query?.q === "anan")).toBe(true));
  });

  it("opens a conversation, marks it read, and replies in the window", async () => {
    render(<WhatsAppInboxPage />);
    fireEvent.click(await screen.findByRole("button", { name: /Ananya Iyer/ }));
    const thread = await screen.findByLabelText("Conversation with Ananya Iyer");
    expect(await within(thread).findByText("Is there parking?")).toBeInTheDocument();
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.path.endsWith("/conversations/11/read"))).toBe(true));
    expect(within(thread).getByTestId("window-indicator")).toHaveTextContent(/You can reply freely for/);
    // A message Meta refused shows why, in the thread.
    expect(within(thread).getByText("Not delivered: WhatsApp says this number cannot receive messages")).toBeInTheDocument();
    expect(within(thread).getByRole("img", { name: "Read" })).toBeInTheDocument();

    fireEvent.change(within(thread).getByLabelText("Message"), { target: { value: "  Hall B car park  " } });
    fireEvent.click(within(thread).getByRole("button", { name: "Send" }));
    await waitFor(() => expect(calls.find((c) => c.method === "POST" && c.path.endsWith("/conversations/11/messages"))?.body).toEqual({ type: "text", text: "Hall B car park" }));
  });

  it("shows a reply Meta refused, with its reason, and keeps the text", async () => {
    state.send = () => msg({ id: 100, direction: "out", body: "Hello", status: "failed", via: "inbox", error: { code: "131047", title: "Outside the 24-hour window" } });
    render(<WhatsAppInboxPage />);
    fireEvent.click(await screen.findByRole("button", { name: /Ananya Iyer/ }));
    const thread = await screen.findByLabelText("Conversation with Ananya Iyer");
    await within(thread).findByText("Is there parking?");
    fireEvent.change(within(thread).getByLabelText("Message"), { target: { value: "Hello" } });
    fireEvent.click(within(thread).getByRole("button", { name: "Send" }));
    expect(await within(thread).findByText("Outside the 24-hour window")).toBeInTheDocument();
    expect(within(thread).getByLabelText("Message")).toHaveValue("Hello");
  });

  it("outside the window offers only approved templates, with a field for each value", async () => {
    render(<WhatsAppInboxPage />);
    fireEvent.click(await screen.findByRole("button", { name: /Bala K/ }));
    const thread = await screen.findByLabelText("Conversation with Bala K");
    expect(await within(thread).findByTestId("window-indicator")).toHaveTextContent(/only an approved template can reach them/);
    expect(within(thread).queryByLabelText("Message")).toBeNull();
    const picker = await within(thread).findByLabelText("Template");
    // The rejected one is not offered.
    expect(within(picker).queryByText(/promo_blast/)).toBeNull();
    fireEvent.change(picker, { target: { value: "event_update|en" } });
    const send = within(thread).getByRole("button", { name: /Send template/ });
    expect(send).toBeDisabled();
    fireEvent.change(within(thread).getByLabelText("Value {{1}}"), { target: { value: "Bala" } });
    fireEvent.change(within(thread).getByLabelText("Value {{2}}"), { target: { value: "Build Night" } });
    fireEvent.change(within(thread).getByLabelText("Link value for Event page"), { target: { value: "build-night" } });
    expect(within(thread).getByLabelText("Preview")).toHaveTextContent("Hi Bala, Build Night has moved to Hall B.");
    fireEvent.click(send);
    await waitFor(() =>
      expect(calls.find((c) => c.method === "POST" && c.path.endsWith("/conversations/12/messages"))?.body).toEqual({
        type: "template",
        template: "event_update",
        language: "en",
        params: { header: [], body: ["Bala", "Build Night"], buttons: { "0": "build-night" } },
      }),
    );
    expect(calls.some((c) => c.path === "/api/v1/clubs/whatsapp/templates" && c.query?.refresh === false)).toBe(true);
  });

  it("says the window closed when the server says so, and keeps what was typed when the reply box changes", async () => {
    state.send = () => {
      // The server's answer, and the conversation as it now reads: the window shut.
      const kept = state.messages[11] as { conversation: object };
      state.messages[11] = { ...kept, conversation: { ...kept.conversation, window_open: false, window_expires_at: ago(MIN) } };
      return new ApiError({ status: 409, errorCode: "WINDOW_CLOSED", message: "It's been more than 24 hours." });
    };
    render(<WhatsAppInboxPage />);
    fireEvent.click(await screen.findByRole("button", { name: /Ananya Iyer/ }));
    const thread = await screen.findByLabelText("Conversation with Ananya Iyer");
    await within(thread).findByText("Is there parking?");
    fireEvent.change(within(thread).getByLabelText("Message"), { target: { value: "See you at Hall B at 6" } });
    fireEvent.click(within(thread).getByRole("button", { name: "Send" }));
    // The conversation is read again, the window has closed: the template picker, and the notice and draft kept.
    expect(await within(thread).findByLabelText("Template")).toBeInTheDocument();
    expect(within(thread).queryByLabelText("Message")).toBeNull();
    expect(within(thread).getByText(/Send an approved template instead/).closest("[role=alert]")).toHaveTextContent("Not sent");
    const kept = within(thread).getByRole("group", { name: "Your unsent message" });
    expect(kept).toHaveTextContent("See you at Hall B at 6");
    fireEvent.click(within(kept).getByRole("button", { name: /Copy/ }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("See you at Hall B at 6"));
    fireEvent.click(within(kept).getByRole("button", { name: "Discard" }));
    expect(within(thread).queryByRole("group", { name: "Your unsent message" })).toBeNull();
  });

  it("sends with Ctrl+Enter or Cmd+Enter, and says so", async () => {
    render(<WhatsAppInboxPage />);
    fireEvent.click(await screen.findByRole("button", { name: /Ananya Iyer/ }));
    const thread = await screen.findByLabelText("Conversation with Ananya Iyer");
    const box = await within(thread).findByLabelText("Message");
    expect(box).toHaveAccessibleDescription(/Ctrl \+ Enter to send/);
    fireEvent.change(box, { target: { value: "On my way" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(calls.some((c) => c.method === "POST" && c.path.endsWith("/conversations/11/messages"))).toBe(false);
    fireEvent.keyDown(box, { key: "Enter", ctrlKey: true });
    await waitFor(() => expect(calls.find((c) => c.method === "POST" && c.path.endsWith("/conversations/11/messages"))?.body).toEqual({ type: "text", text: "On my way" }));
    fireEvent.change(box, { target: { value: "Here" } });
    fireEvent.keyDown(box, { key: "Enter", metaKey: true });
    await waitFor(() => expect(calls.filter((c) => c.method === "POST" && c.path.endsWith("/conversations/11/messages"))).toHaveLength(2));
  });

  it("counts the window down a minute at a time, and turns to templates when it ends", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      state.messages[11] = {
        ...(state.messages[11] as object),
        conversation: { ...ANANYA, unread_count: 0, window_expires_at: new Date(Date.now() + 2 * MIN + 40_000).toISOString() },
      };
      render(<WhatsAppInboxPage />);
      fireEvent.click(await screen.findByRole("button", { name: /Ananya Iyer/ }));
      const thread = await screen.findByLabelText("Conversation with Ananya Iyer");
      const indicator = await within(thread).findByTestId("window-indicator");
      expect(indicator).toHaveTextContent("You can reply freely for 3 min more");
      act(() => vi.advanceTimersByTime(60_000));
      expect(within(thread).getByTestId("window-indicator")).toHaveTextContent("You can reply freely for 2 min more");
      act(() => vi.advanceTimersByTime(120_000));
      expect(within(thread).getByTestId("window-indicator")).toHaveTextContent(/only an approved template can reach them/);
      expect(within(thread).queryByLabelText("Message")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("needs the WhatsApp permission", async () => {
    state.account = { ...CONNECTED, can_inbox: false };
    render(<WhatsAppInboxPage />);
    expect(await screen.findByText("The inbox needs the WhatsApp permission")).toBeInTheDocument();
    expect(calls.some((c) => c.path.endsWith("/conversations"))).toBe(false);
  });

  it("tells an admin acting as the club that the messages are the club's, not that a permission is missing", async () => {
    // As the server answers an impersonated admin: no inbox, and why.
    state.account = { ...CONNECTED, can_inbox: false, impersonated: true };
    const first = render(<WhatsAppInboxPage />);
    expect(await screen.findByText(/A club's WhatsApp messages are for its own team/)).toBeInTheDocument();
    expect(screen.queryByText(/needs the WhatsApp permission/)).toBeNull();
    expect(calls.some((c) => c.path.endsWith("/conversations"))).toBe(false);
    first.unmount();
    render(<WhatsAppTemplatesPage />);
    expect(await screen.findByText("Templates are for the club's own team")).toBeInTheDocument();
    expect(calls.some((c) => c.path.endsWith("/templates"))).toBe(false);
  });

  it("still says so from an older server, which refuses the list with WHATSAPP_PRIVATE", async () => {
    state.conversations = new ApiError({ status: 403, errorCode: "WHATSAPP_PRIVATE", message: "Private." });
    render(<WhatsAppInboxPage />);
    expect(await screen.findByText(/A club's WhatsApp messages are for its own team/)).toBeInTheDocument();
  });

  it("shows someone who shares only a username, in the list and the thread", async () => {
    state.conversations = { items: [ANANYA, CHITRA], total: 2, unread_total: 2 };
    state.messages[13] = { conversation: CHITRA, items: [msg({ id: 30, body: "Hello?" })], has_more: false };
    render(<WhatsAppInboxPage />);
    const list = await screen.findByRole("region", { name: "Conversations" });
    const row = await within(list).findByRole("button", { name: /@chitra\.r/ });
    expect(row).toHaveTextContent("CR");
    expect(list).not.toHaveTextContent("+null");
    fireEvent.click(row);
    const thread = await screen.findByLabelText("Conversation with @chitra.r");
    expect(await within(thread).findByText("Hello?")).toBeInTheDocument();
    expect(within(thread).getByRole("heading", { name: "@chitra.r" })).toBeInTheDocument();
    expect(thread).not.toHaveTextContent("null");
  });

  it("pages through every conversation, not just the first 50", async () => {
    const people = Array.from({ length: 120 }, (_, i) => ({ ...BALA, id: 1000 + i, profile_name: `Person ${i + 1}`, phone: `+9190000${String(i).padStart(5, "0")}` }));
    state.conversations = (query?: Record<string, unknown>) => {
      const offset = Number(query?.offset ?? 0);
      const limit = Number(query?.limit ?? 50);
      return { items: people.slice(offset, offset + limit), total: people.length, unread_total: 0 };
    };
    render(<WhatsAppInboxPage />);
    const list = await screen.findByRole("region", { name: "Conversations" });
    await within(list).findByText("Person 50");
    expect(within(list).queryByText("Person 51")).toBeNull();
    fireEvent.click(within(list).getByRole("button", { name: "Load more" }));
    expect(await within(list).findByText("Person 100")).toBeInTheDocument();
    fireEvent.click(within(list).getByRole("button", { name: "Load more" }));
    expect(await within(list).findByText("Person 120")).toBeInTheDocument();
    expect(within(list).queryByRole("button", { name: "Load more" })).toBeNull();
    const offsets = calls.filter((c) => c.path.endsWith("/conversations")).map((c) => c.query?.offset);
    expect(offsets).toEqual([0, 50, 100]);
  });

  it("says when the next page couldn't be loaded, and tries again on request", async () => {
    const people = Array.from({ length: 60 }, (_, i) => ({ ...BALA, id: 2000 + i, profile_name: `Member ${i + 1}` }));
    let failNext = true;
    state.conversations = (query?: Record<string, unknown>) => {
      const offset = Number(query?.offset ?? 0);
      if (offset > 0 && failNext) {
        failNext = false;
        return new ApiError({ status: 502, message: "Bad gateway" });
      }
      return { items: people.slice(offset, offset + 50), total: people.length, unread_total: 0 };
    };
    render(<WhatsAppInboxPage />);
    const list = await screen.findByRole("region", { name: "Conversations" });
    await within(list).findByText("Member 50");
    fireEvent.click(within(list).getByRole("button", { name: "Load more" }));
    expect(await within(list).findByText("Couldn't load more conversations.")).toBeInTheDocument();
    // What was loaded stays.
    expect(within(list).getByText("Member 1")).toBeInTheDocument();
    fireEvent.click(within(list).getByRole("button", { name: "Try again" }));
    expect(await within(list).findByText("Member 60")).toBeInTheDocument();
  });

  it("is one viewport tall, with the list and the messages each scrolling inside it", async () => {
    render(<WhatsAppInboxPage />);
    const panel = await screen.findByRole("region", { name: "Inbox" });
    expect(panel.className).toMatch(/h-\[calc\(100dvh-/);
    expect(panel.className).toContain("grid-rows-[minmax(0,1fr)]");
    expect(panel.className).toContain("overflow-hidden");
    expect(panel.className).not.toMatch(/(^|\s)min-h-\[560px\]/);
    const list = within(panel).getByRole("region", { name: "Conversations" });
    await within(list).findByText("Ananya Iyer");
    const scroller = within(list).getAllByRole("list")[0]!.parentElement!;
    expect(scroller.className).toContain("overflow-y-auto");
    expect(scroller.className).toContain("min-h-0");
    fireEvent.click(await within(list).findByRole("button", { name: /Ananya Iyer/ }));
    const log = await screen.findByRole("log", { name: "Messages" });
    expect(log.className).toContain("overflow-y-auto");
    expect(log.className).toContain("min-h-0");
    expect(log.className).toContain("flex-1");
    expect(within(screen.getByLabelText("Conversation with Ananya Iyer")).getByLabelText("Reply").className).toContain("shrink-0");
  });

  it("on a phone shows the list or the conversation, with a way back", async () => {
    render(<WhatsAppInboxPage />);
    const list = await screen.findByRole("region", { name: "Conversations" });
    const pane = screen.getByRole("region", { name: "Conversation" });
    expect(list.className).not.toContain("hidden");
    expect(pane.className).toMatch(/(^|\s)hidden(\s|$)/);
    fireEvent.click(await within(list).findByRole("button", { name: /Ananya Iyer/ }));
    await screen.findByLabelText("Conversation with Ananya Iyer");
    expect(list.className).toMatch(/(^|\s)hidden lg:flex/);
    expect(pane.className).not.toMatch(/(^|\s)hidden(\s|$)/);
    fireEvent.click(screen.getByRole("button", { name: "Back to conversations" }));
    expect(list.className).not.toContain("hidden");
  });

  it("searches a username without its @", async () => {
    render(<WhatsAppInboxPage />);
    const list = await screen.findByRole("region", { name: "Conversations" });
    fireEvent.change(within(list).getByLabelText("Search conversations"), { target: { value: "@chitra" } });
    await waitFor(() => expect(calls.some((c) => c.path.endsWith("/conversations") && c.query?.q === "chitra")).toBe(true));
  });

  it("asks to connect a number first when there is none", async () => {
    state.account = NOT_CONNECTED;
    state.conversations = { items: [], total: 0, unread_total: 0 };
    render(<WhatsAppInboxPage />);
    expect(await screen.findByText("Connect your WhatsApp number to start")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Connect a number" })).toHaveAttribute("href", "/whatsapp/settings");
  });
});

// ─── Live updates ────────────────────────────────────────────────────────

class FakeSource {
  static last: FakeSource | null = null;
  static made = 0;
  readyState = 0;
  closed = false;
  listeners: Record<string, Array<(e: { data?: string }) => void>> = {};
  constructor(public url: string) {
    FakeSource.last = this;
    FakeSource.made += 1;
  }
  addEventListener(type: string, fn: (e: { data?: string }) => void) {
    (this.listeners[type] ??= []).push(fn);
  }
  emit(type: string, data?: unknown) {
    for (const fn of this.listeners[type] ?? []) fn({ data: data === undefined ? undefined : JSON.stringify(data) });
  }
  close() {
    this.closed = true;
  }
}

describe("the inbox's stream", () => {
  const create = (url: string) => new FakeSource(url) as unknown as EventSource;

  it("goes live on `ready`, hands on each change, and polls when the stream drops", () => {
    const onChange = vi.fn();
    const { result, unmount } = renderHook(() => useInboxStream({ enabled: true, onChange, create, url: "/api/gateway/api/v1/clubs/whatsapp/stream" }));
    const source = FakeSource.last!;
    expect(source.url).toBe("/api/gateway/api/v1/clubs/whatsapp/stream");
    expect(result.current).toBe("connecting");
    act(() => source.emit("ready", { club: 1 }));
    expect(result.current).toBe("live");
    expect(pollEvery(result.current, "list")).toBe(false);
    act(() => source.emit("changed", { conversation_id: 11, kind: "message" }));
    expect(onChange).toHaveBeenCalledWith({ conversationId: 11, kind: "message" });
    act(() => source.emit("error"));
    expect(result.current).toBe("polling");
    expect(pollEvery(result.current, "list")).toBe(15_000);
    expect(pollEvery(result.current, "thread")).toBe(5_000);
    // The browser's reconnect brings `ready` again: live again.
    act(() => source.emit("ready", { club: 1 }));
    expect(result.current).toBe("live");
    unmount();
    expect(source.closed).toBe(true);
  });

  it("reads everything once on each `ready`, the first and after a reconnect", () => {
    const onReady = vi.fn();
    renderHook(() => useInboxStream({ enabled: true, onChange: vi.fn(), onReady, create }));
    const source = FakeSource.last!;
    act(() => source.emit("ready", { club: 1 }));
    expect(onReady).toHaveBeenCalledTimes(1);
    act(() => source.emit("error"));
    act(() => source.emit("ready", { club: 1 }));
    expect(onReady).toHaveBeenCalledTimes(2);
  });

  it("opens the stream again itself when the browser gives up: 5 s, 15 s, then every minute, polling meanwhile", () => {
    vi.useFakeTimers();
    try {
      const onReady = vi.fn();
      const { result, unmount } = renderHook(() => useInboxStream({ enabled: true, onChange: vi.fn(), onReady, create }));
      const giveUp = () => {
        const s = FakeSource.last!;
        s.readyState = 2;
        act(() => s.emit("error"));
        expect(s.closed).toBe(true);
      };
      const reopensAfter = (ms: number) => {
        const before = FakeSource.made;
        act(() => vi.advanceTimersByTime(ms - 1));
        expect(FakeSource.made).toBe(before);
        act(() => vi.advanceTimersByTime(1));
        expect(FakeSource.made).toBe(before + 1);
      };
      expect(REOPEN_AFTER).toEqual([5_000, 15_000, 60_000]);
      giveUp(); // A 502 while the backend deploys.
      expect(result.current).toBe("polling");
      reopensAfter(5_000);
      giveUp();
      reopensAfter(15_000);
      giveUp();
      reopensAfter(60_000);
      giveUp();
      reopensAfter(60_000);
      expect(result.current).toBe("polling");
      // Back: live, and the next give-up starts from 5 s again.
      act(() => FakeSource.last!.emit("ready", { club: 1 }));
      expect(result.current).toBe("live");
      expect(onReady).toHaveBeenCalledTimes(1);
      giveUp();
      reopensAfter(5_000);
      // A drop the browser retries itself (CONNECTING) is left to the browser.
      const before = FakeSource.made;
      act(() => FakeSource.last!.emit("error"));
      act(() => vi.advanceTimersByTime(120_000));
      expect(FakeSource.made).toBe(before);
      // Gone: nothing is opened again.
      const last = FakeSource.last!;
      last.readyState = 2;
      act(() => last.emit("error"));
      unmount();
      act(() => vi.advanceTimersByTime(120_000));
      expect(FakeSource.made).toBe(before);
    } finally {
      vi.useRealTimers();
    }
  });

  it("hands on a burst at most once in the window: the first at once, the rest together", () => {
    vi.useFakeTimers();
    try {
      const flush = vi.fn();
      const { result } = renderHook(() => useCoalesced<number>(flush, 1_500));
      act(() => {
        for (let i = 1; i <= 10; i++) result.current(i);
      });
      expect(flush).toHaveBeenCalledTimes(1);
      expect(flush).toHaveBeenLastCalledWith([1]);
      act(() => vi.advanceTimersByTime(1_499));
      expect(flush).toHaveBeenCalledTimes(1);
      act(() => vi.advanceTimersByTime(1));
      expect(flush).toHaveBeenCalledTimes(2);
      expect(flush).toHaveBeenLastCalledWith([2, 3, 4, 5, 6, 7, 8, 9, 10]);
      // Quiet for a while: the next one goes at once.
      act(() => vi.advanceTimersByTime(5_000));
      act(() => result.current(11));
      expect(flush).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reads the list again for a status only when that conversation is on screen", () => {
    const onScreen = new Set([11, 12]);
    expect(planRefresh([{ conversationId: 99, kind: "status" }], onScreen)).toEqual({ list: false, threads: [99] });
    expect(planRefresh([{ conversationId: 11, kind: "status" }], onScreen)).toEqual({ list: true, threads: [11] });
    expect(planRefresh([{ conversationId: 99, kind: "message" }, { conversationId: 99, kind: "status" }], onScreen)).toEqual({ list: true, threads: [99] });
    expect(planRefresh([{ conversationId: 11, kind: "read" }, { conversationId: null, kind: "resync" }], onScreen)).toEqual({ list: true, threads: "all" });
  });

  it("polls when it may not stream, or the stream can't be opened", async () => {
    const off = renderHook(() => useInboxStream({ enabled: false, onChange: vi.fn(), create }));
    expect(off.result.current).toBe("polling");
    const failing = (): EventSource => {
      throw new Error("blocked");
    };
    const broken = renderHook(() => useInboxStream({ enabled: true, onChange: vi.fn(), create: failing }));
    await waitFor(() => expect(broken.result.current).toBe("polling"));
  });
});

describe("the inbox, live", () => {
  beforeEach(() => {
    FakeSource.made = 0;
    FakeSource.last = null;
    vi.stubGlobal("EventSource", FakeSource);
    return () => vi.unstubAllGlobals();
  });
  const listCalls = () => calls.filter((c) => c.method === "GET" && c.path === "/api/v1/clubs/whatsapp/conversations").length;

  it("reads everything on `ready`, and a burst of frames is one more read, not one each", async () => {
    render(<WhatsAppInboxPage />);
    await screen.findByText("Ananya Iyer");
    await waitFor(() => expect(FakeSource.last).not.toBeNull());
    expect(listCalls()).toBe(1);
    act(() => FakeSource.last!.emit("ready", { club: 1 }));
    expect(await screen.findByText("Live")).toBeInTheDocument();
    await waitFor(() => expect(listCalls()).toBe(2));
    act(() => {
      for (let i = 0; i < 25; i++) FakeSource.last!.emit("changed", { conversation_id: 11, kind: i % 2 ? "status" : "message" });
    });
    await waitFor(() => expect(listCalls()).toBe(3), { timeout: 4_000 });
    await new Promise((r) => setTimeout(r, 1_700));
    expect(listCalls()).toBe(3);
  });

  it("opens on the newest message, and follows new ones only while the reader is at the bottom", async () => {
    const height = vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(2_000);
    const client = vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(400);
    try {
      render(<WhatsAppInboxPage />);
      fireEvent.click(await screen.findByRole("button", { name: /Ananya Iyer/ }));
      const log = await screen.findByRole("log", { name: "Messages" });
      await within(log).findByText("Is there parking?");
      await waitFor(() => expect(FakeSource.last).not.toBeNull());
      expect(log.scrollTop).toBe(2_000);
      act(() => FakeSource.last!.emit("ready", { club: 1 }));
      await screen.findByText("Live");

      // Scrolled up to read: a new message doesn't pull them down.
      log.scrollTop = 300;
      fireEvent.scroll(log);
      const conv = state.messages[11] as { items: unknown[] };
      state.messages[11] = { ...conv, items: [...conv.items, msg({ id: 4, body: "Also, is there food?" })] };
      act(() => FakeSource.last!.emit("changed", { conversation_id: 11, kind: "message" }));
      expect(await within(log).findByText("Also, is there food?", {}, { timeout: 4_000 })).toBeInTheDocument();
      expect(log.scrollTop).toBe(300);

      // Back at the bottom: the next one is brought into view.
      log.scrollTop = 1_600;
      fireEvent.scroll(log);
      const now = state.messages[11] as { items: unknown[] };
      state.messages[11] = { ...now, items: [...now.items, msg({ id: 5, body: "Thanks!" })] };
      act(() => FakeSource.last!.emit("changed", { conversation_id: 11, kind: "message" }));
      expect(await within(log).findByText("Thanks!", {}, { timeout: 4_000 })).toBeInTheDocument();
      expect(log.scrollTop).toBe(2_000);
    } finally {
      height.mockRestore();
      client.mockRestore();
    }
  });

  const reads = () => calls.filter((c) => c.method === "POST" && c.path.endsWith("/conversations/11/read")).length;
  const messageReads = () => calls.filter((c) => c.method === "GET" && c.path.endsWith("/conversations/11/messages")).length;
  async function openLive(name: RegExp) {
    render(<WhatsAppInboxPage />);
    fireEvent.click(await screen.findByRole("button", { name }));
    const log = await screen.findByRole("log", { name: "Messages" });
    await waitFor(() => expect(FakeSource.last).not.toBeNull());
    act(() => FakeSource.last!.emit("ready", { club: 1 }));
    await screen.findByText("Live");
    return log;
  }
  function arrive(id: number, body: string, unread = 1) {
    const conv = state.messages[11] as { conversation: object; items: unknown[] };
    state.messages[11] = { ...conv, conversation: { ...conv.conversation, unread_count: unread }, items: [...conv.items, msg({ id, body })] };
    act(() => FakeSource.last!.emit("changed", { conversation_id: 11, kind: "message" }));
  }

  it("marks the open conversation read again as each new message from them arrives", async () => {
    const log = await openLive(/Ananya Iyer/);
    await waitFor(() => expect(reads()).toBe(1));
    arrive(40, "One more thing");
    expect(await within(log).findByText("One more thing", {}, { timeout: 4_000 })).toBeInTheDocument();
    await waitFor(() => expect(reads()).toBe(2));
    // A status coming back is not a new message: no read.
    act(() => FakeSource.last!.emit("changed", { conversation_id: 11, kind: "status" }));
    await new Promise((r) => setTimeout(r, 1_700));
    expect(reads()).toBe(2);
  });

  it("waits for the tab to be in front before marking read", async () => {
    const hidden = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    try {
      render(<WhatsAppInboxPage />);
      fireEvent.click(await screen.findByRole("button", { name: /Ananya Iyer/ }));
      await screen.findByText("Is there parking?");
      await new Promise((r) => setTimeout(r, 50));
      expect(reads()).toBe(0);
      hidden.mockReturnValue("visible");
      act(() => {
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await waitFor(() => expect(reads()).toBe(1));
    } finally {
      hidden.mockRestore();
    }
  });

  it("keeps older pages joined to the newest as messages arrive: none falls between", async () => {
    // 120 messages, ids 1..120; a page is the 50 before `before`.
    let last = 120;
    const all = () => Array.from({ length: last }, (_, i) => msg({ id: i + 1, body: `Message ${i + 1}`, wa_timestamp: ago(HOUR), created_at: ago(HOUR) }));
    state.messages[11] = (query?: Record<string, unknown>) => {
      const before = query?.before === undefined ? Infinity : Number(query.before);
      const older = all().filter((m) => m.id < before);
      const page = older.slice(-50);
      return { conversation: { ...ANANYA, unread_count: 0 }, items: page, has_more: older.length > page.length };
    };
    const log = await openLive(/Ananya Iyer/);
    expect(await within(log).findByText("Message 120")).toBeInTheDocument();
    expect(within(log).queryByText("Message 70")).toBeNull();
    fireEvent.click(within(log).getByRole("button", { name: "Load older" }));
    expect(await within(log).findByText("Message 21")).toBeInTheDocument();
    expect(calls.some((c) => c.path.endsWith("/conversations/11/messages") && c.query?.before === 71)).toBe(true);
    // Three arrive: the newest page now starts at 74, and the older one is read again before it.
    last = 123;
    act(() => FakeSource.last!.emit("changed", { conversation_id: 11, kind: "message" }));
    expect(await within(log).findByText("Message 123", {}, { timeout: 4_000 })).toBeInTheDocument();
    await waitFor(() => expect(calls.some((c) => c.path.endsWith("/conversations/11/messages") && c.query?.before === 74)).toBe(true));
    for (const n of [24, 71, 72, 73, 74, 100, 123]) expect(within(log).getByText(`Message ${n}`)).toBeInTheDocument();
  });

  it("says when older messages couldn't be loaded, and tries again on request", async () => {
    let fail = true;
    state.messages[11] = (query?: Record<string, unknown>) => {
      if (query?.before !== undefined && fail) {
        fail = false;
        return new ApiError({ status: 502, message: "Bad gateway" });
      }
      if (query?.before !== undefined) return { conversation: ANANYA, items: [msg({ id: 0, body: "The very first" })], has_more: false };
      return { conversation: { ...ANANYA, unread_count: 0 }, items: [msg({ id: 1 })], has_more: true };
    };
    render(<WhatsAppInboxPage />);
    fireEvent.click(await screen.findByRole("button", { name: /Ananya Iyer/ }));
    const log = await screen.findByRole("log", { name: "Messages" });
    fireEvent.click(await within(log).findByRole("button", { name: "Load older" }));
    expect(await within(log).findByText("Couldn't load older messages.")).toBeInTheDocument();
    // What was there stays.
    expect(within(log).getByText("Is there parking?")).toBeInTheDocument();
    fireEvent.click(within(log).getByRole("button", { name: "Try again" }));
    expect(await within(log).findByText("The very first")).toBeInTheDocument();
  });

  it("puts a sent message in the conversation at once, without reading it again", async () => {
    const log = await openLive(/Ananya Iyer/);
    await within(log).findByText("Is there parking?");
    await new Promise((r) => setTimeout(r, 1_700));
    const before = messageReads();
    const thread = screen.getByLabelText("Conversation with Ananya Iyer");
    fireEvent.change(within(thread).getByLabelText("Message"), { target: { value: "Hall B car park" } });
    fireEvent.click(within(thread).getByRole("button", { name: "Send" }));
    expect(await within(log).findByText("Hall B car park")).toBeInTheDocument();
    expect(within(thread).getByLabelText("Message")).toHaveValue("");
    expect(messageReads()).toBe(before);
  });

  it("opens no stream and lists nothing for a club that never connected a number", async () => {
    state.account = NOT_CONNECTED;
    render(<WhatsAppInboxPage />);
    expect(await screen.findByText("Connect your WhatsApp number to start")).toBeInTheDocument();
    expect(FakeSource.made).toBe(0);
    expect(calls.some((c) => c.path.endsWith("/conversations"))).toBe(false);
  });

  it("opens no stream on a plan without it, but keeps what a disconnected number received", async () => {
    state.account = { ...NOT_CONNECTED, status: "disconnected", plan_allows: false, upgrade: UPGRADE };
    render(<WhatsAppInboxPage />);
    expect(await screen.findByText("Ananya Iyer")).toBeInTheDocument();
    expect(FakeSource.made).toBe(0);
    expect(screen.queryByText("Live")).toBeNull();
    expect(screen.getByText(/is part of Enterprise\./)).toBeInTheDocument();
  });
});

// ─── Templates ───────────────────────────────────────────────────────────

describe("checking a template as Meta would", () => {
  const form = (over: Partial<typeof EMPTY_TEMPLATE>) => ({ ...EMPTY_TEMPLATE, name: "event_update", body: "Hi {{1}}, see you at {{2}} tonight.", bodyExamples: ["Asha", "Build Night"], ...over });

  it("takes a good one", () => {
    expect(checkTemplate(form({}))).toBeNull();
    expect(checkTemplate(form({ headerText: "{{1}} is on", headerExamples: ["Build Night"], buttons: [{ type: "URL", text: "Open", url: "https://myotherapp.in/e/{{1}}", example: "https://myotherapp.in/e/x" }] }))).toBeNull();
  });

  it.each([
    [{ name: "Event Update" }, "name"],
    [{ language: "english" }, "language"],
    [{ body: "" }, "body"],
    [{ body: "{{1}} is on tonight", bodyExamples: ["Build Night"] }, "body"],
    [{ body: "See you at {{1}}", bodyExamples: ["Build Night"] }, "body"],
    [{ body: "Hi {{2}}, ok {{3}} then", bodyExamples: ["a", "b"] }, "body"],
    [{ body: "Hi {{name}}, ok", bodyExamples: [] }, "body"],
    [{ bodyExamples: ["Asha"] }, "body_examples"],
    [{ headerText: "{{1}} and {{2}} today", headerExamples: ["a", "b"] }, "header"],
    [{ footer: "Thanks {{1}}" }, "footer"],
    [{ buttons: [{ type: "URL" as const, text: "Open", url: "http://example.com" }] }, "buttons.0"],
    [{ buttons: [{ type: "URL" as const, text: "Open", url: "https://example.com/{{1}}/x" }] }, "buttons.0"],
    [{ buttons: [{ type: "PHONE_NUMBER" as const, text: "Call", phone_number: "12" }] }, "buttons.0"],
    [{ buttons: [{ type: "QUICK_REPLY" as const, text: "" }] }, "buttons.0"],
  ])("refuses %o on %s", (over, field) => {
    expect(checkTemplate(form(over as Partial<typeof EMPTY_TEMPLATE>))?.field).toBe(field);
  });
});

describe("the templates page", () => {
  it("lists templates with their status and Meta's reason, and offers MyOtherApp's", async () => {
    render(<WhatsAppTemplatesPage />);
    const list = await screen.findByRole("region", { name: "Templates" });
    expect(within(list).getByText("event_update")).toBeInTheDocument();
    expect(within(list).getByText("Approved")).toBeInTheDocument();
    expect(within(list).getByText("Rejected")).toBeInTheDocument();
    expect(within(list).getByText("Meta's reason: invalid format")).toBeInTheDocument();
    const standard = screen.getByRole("region", { name: "MyOtherApp's templates" });
    fireEvent.click(within(standard).getByRole("button", { name: /Add MyOtherApp's templates/ }));
    expect(await within(standard).findByText(/Add your app ID in the connection settings first/)).toBeInTheDocument();
    expect(within(standard).getAllByText("submitted for review")).toHaveLength(2);
  });

  it("checks a new template before Meta does, then shows the server's refusal on its field", async () => {
    state.createTemplate = () => new ApiError({ status: 422, errorCode: "INVALID_TEMPLATE", message: "Meta already has a template by that name.", fieldErrors: { field: "name" } as unknown as Record<string, string[]> });
    render(<WhatsAppTemplatesPage />);
    fireEvent.click(await screen.findByRole("button", { name: /New template/ }));
    const panel = await screen.findByRole("form", { name: "New template" });
    fireEvent.change(within(panel).getByLabelText("Name"), { target: { value: "Event Update" } });
    fireEvent.change(within(panel).getByLabelText("Message"), { target: { value: "Hi {{1}}, it's moved." } });
    fireEvent.click(within(panel).getByRole("button", { name: /Submit for review/ }));
    expect(await within(panel).findByText(/Use lowercase letters, numbers and underscores only/)).toBeInTheDocument();
    expect(calls.some((c) => c.method === "POST" && c.path.endsWith("/templates"))).toBe(false);

    fireEvent.change(within(panel).getByLabelText("Name"), { target: { value: "event_update" } });
    // A variable makes an example field appear for it.
    fireEvent.click(within(panel).getByRole("button", { name: /Submit for review/ }));
    expect(await within(panel).findByText(/Give an example for each variable \(1\)/)).toBeInTheDocument();
    fireEvent.change(within(panel).getByLabelText("Example for {{1}}"), { target: { value: "Asha" } });
    fireEvent.click(within(panel).getByRole("button", { name: /Submit for review/ }));
    expect(await within(panel).findByText("Meta already has a template by that name.")).toBeInTheDocument();
    expect(calls.find((c) => c.method === "POST" && c.path.endsWith("/templates"))?.body).toEqual({
      name: "event_update",
      language: "en",
      category: "UTILITY",
      header: null,
      body: { text: "Hi {{1}}, it's moved.", examples: ["Asha"] },
      footer: null,
      buttons: [],
    });
  });

  it("marks a template Meta flagged as at risk", async () => {
    state.templates = { items: [{ ...APPROVED, flagged: true }, REJECTED], stale: false, standard_missing: [] };
    render(<WhatsAppTemplatesPage />);
    const list = await screen.findByRole("region", { name: "Templates" });
    expect(within(list).getByText("Flagged by Meta: at risk")).toBeInTheDocument();
    expect(within(list).getAllByText(/Flagged by Meta/)).toHaveLength(1);
  });

  it("shows Meta's own words on the form when it refuses a template", async () => {
    // No field the form shows: Meta's words go on the form itself.
    state.createTemplate = () => new ApiError({ status: 422, errorCode: "INVALID_TEMPLATE", message: "Meta: the message has too many variables for its length.", fieldErrors: { field: "components" } as unknown as Record<string, string[]> });
    render(<WhatsAppTemplatesPage />);
    fireEvent.click(await screen.findByRole("button", { name: /New template/ }));
    const panel = await screen.findByRole("form", { name: "New template" });
    fireEvent.change(within(panel).getByLabelText("Name"), { target: { value: "event_update" } });
    fireEvent.change(within(panel).getByLabelText("Message"), { target: { value: "See you tonight at the hall." } });
    fireEvent.click(within(panel).getByRole("button", { name: /Submit for review/ }));
    const notice = await within(panel).findByRole("alert");
    expect(notice).toHaveTextContent("Not sent");
    expect(notice).toHaveTextContent("Meta: the message has too many variables for its length.");
  });

  it("shows why Meta wouldn't delete a template, on that template", async () => {
    const { api } = await import("@moa/app-kit");
    vi.mocked(api.del).mockImplementationOnce(async (path: string) => {
      calls.push({ method: "DELETE", path });
      throw new ApiError({ status: 422, errorCode: "INVALID_TEMPLATE", message: "Meta: this template is in use by a campaign." });
    });
    render(<WhatsAppTemplatesPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Delete event_update (en)" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Delete" }));
    const list = screen.getByRole("region", { name: "Templates" });
    const notice = await within(list).findByRole("alert");
    expect(notice).toHaveTextContent("Not deleted");
    expect(notice).toHaveTextContent("Meta: this template is in use by a campaign.");
  });

  it("asks before deleting one language of a template", async () => {
    render(<WhatsAppTemplatesPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Delete event_update (en)" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(calls.some((c) => c.method === "DELETE" && c.path === "/api/v1/clubs/whatsapp/templates/event_update")).toBe(true));
  });
});

// ─── Elsewhere in the dashboard ──────────────────────────────────────────

describe("around the dashboard", () => {
  it("puts WhatsApp in the rail for those who may open it, locked to Enterprise", () => {
    const item = navItems.find((n) => n.href === "/whatsapp")!;
    expect(item).toMatchObject({ label: "WhatsApp", needs: "whatsapp", feature: "whatsapp_own" });
    expect(blockedBy("/whatsapp/templates", { whatsapp: false })?.what).toBe("WhatsApp");
    expect(blockedBy("/whatsapp", { whatsapp: true })).toBeNull();
  });

  it("shows the overview card on the dashboard only once a number is connected", async () => {
    const first = render(<WhatsAppOverviewCard />);
    const card = await screen.findByRole("region", { name: "WhatsApp overview" });
    expect(within(card).getByText("Quality: High")).toBeInTheDocument();
    expect(within(card).getByText("14")).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: /Open inbox/ })).toHaveAttribute("href", "/whatsapp");
    first.unmount();
    state.overview = { account: NOT_CONNECTED, stats: null, quality_history: [] };
    const second = render(<WhatsAppOverviewCard />);
    await waitFor(() => expect(calls.filter((c) => c.path.endsWith("/overview")).length).toBeGreaterThan(1));
    expect(second.container).toBeEmptyDOMElement();
  });

  it("lets the owner give a member the WhatsApp permission", async () => {
    state.members = [
      {
        id: 7, email: "priya@example.com", full_name: "Priya Nair", role: "editor", role_label: "Editor", status: "active",
        invite_expired: false, invited_at: null, accepted_at: null, last_seen_at: null, whatsapp: false,
      },
    ];
    render(<AccessPage />);
    const toggle = await screen.findByRole("switch", { name: "WhatsApp permission for Priya Nair" });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    fireEvent.click(toggle);
    await waitFor(() => expect(calls.find((c) => c.method === "PUT" && c.path === "/api/v1/clubs/access/7/whatsapp")?.body).toEqual({ allowed: true }));
  });
});
