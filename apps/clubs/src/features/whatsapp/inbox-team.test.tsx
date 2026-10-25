import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as React from "react";
import { act, fireEvent, renderHook, screen, waitFor, within } from "@testing-library/react";
import { ApiError, toApiError } from "@moa/api";

/**
 * The inbox worked as a team (backend club_whatsapp_inbox), against its
 * contract: GET /clubs/whatsapp/summary (counts), /team, /inbox-settings,
 * PATCH /inbox-settings(/me), PUT /conversations/{id}/assignee, POST/DELETE
 * /{id}/block and /{id}/optout, GET/POST/DELETE /{id}/notes, /saved-replies,
 * and POST /{id}/media (multipart, through XMLHttpRequest for its progress).
 * And what #106 added that the pages now show: a lapsed plan, Meta's
 * restrictions, the number's and its name's status, the app ID on its own,
 * named template values, "pending" standard templates, the new error codes.
 */

const NOW = Date.now();
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const ahead = (ms: number) => new Date(NOW + ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;

const ACCOUNT = {
  available: true,
  plan_allows: true,
  upgrade: null,
  connected: true,
  status: "active",
  mode: "keys",
  waba_id: "102938475610",
  phone_number_id: "109876543210",
  app_id: null,
  display_phone_number: "+91 98470 12345",
  verified_name: "Circuit Society",
  token_last4: "x9Q2",
  quality_rating: "GREEN",
  messaging_limit_tier: "TIER_1K",
  quality_checked_at: ago(30 * MIN),
  verified_at: ago(2 * HOUR),
  last_webhook_at: ago(5 * MIN),
  last_error: null,
  last_error_code: null,
  routing: true,
  retention_months: 12,
  webhook_url: "https://api.myotherapp.in/api/v1/hooks/whatsapp/club/AbCdEfGhIjKlMnOp",
  verify_token: "verify-me-please-1234",
  webhook_fields: ["messages", "account_update", "user_preferences"],
  can_manage: true,
  can_inbox: true,
  impersonated: false,
  warnings: [],
  locked: false,
  number_status: "CONNECTED",
  name_status: "APPROVED",
  restrictions: [],
};

const ANANYA = {
  id: 11,
  wa_id: "919847012345",
  phone: "+919847012345",
  profile_name: "Ananya",
  contact: { name: "Ananya Iyer", user_id: 4, registration_id: null, events: [] },
  status: "open",
  unread_count: 2,
  awaiting_reply: true,
  awaiting_since: ago(40 * MIN),
  last_message: { direction: "in", type: "text", preview: "Is there parking?", status: "received", at: ago(10 * MIN) },
  last_inbound_at: ago(10 * MIN),
  window_open: true,
  window_expires_at: ahead(23 * HOUR),
  assignee: null,
  blocked: null,
  opt_out: null,
  notes: 0,
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
  quoted: null,
  ...over,
});

const TEAM = {
  items: [
    { key: "owner", kind: "owner", member_id: null, name: "The club's owner", me: true },
    { key: "member:7", kind: "member", member_id: 7, name: "Priya Nair", me: false },
  ],
  me: "owner",
};

const SETTINGS = {
  alert_after_hours: 4,
  stop_reply: null,
  start_reply: null,
  stop_reply_default: "You won't get WhatsApp messages from Circuit Society any more. Reply START if you change your mind.",
  start_reply_default: "You'll get WhatsApp messages from Circuit Society again. Reply STOP any time to stop them.",
  me: { email_messages: true, email_assigned: true },
};

const NAMED = {
  id: "9001",
  name: "greet_named",
  language: "en",
  category: "UTILITY",
  status: "APPROVED",
  rejected_reason: null,
  quality: null,
  header: null,
  body: "Hi {{first_name}}, {{event_name}} is on.",
  body_variables: 2,
  parameter_format: "NAMED",
  body_names: ["first_name", "event_name"],
  footer: null,
  buttons: [],
};

/** What the API answers, as the gateway passes it on, made into the error the client throws. */
function refused(status: number, body: unknown) {
  return toApiError(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

type Answer = (body?: unknown, query?: Record<string, unknown>) => unknown;
const state = {
  account: ACCOUNT as unknown,
  conversations: { items: [ANANYA], total: 1, unread_total: 2 } as unknown,
  messages: {} as Record<number, unknown>,
  summary: { unread_total: 2, unread_conversations: 1, waiting: 1, mine: 0 } as unknown,
  team: TEAM as unknown,
  settings: SETTINGS as unknown,
  notes: { items: [] as unknown[] },
  replies: { items: [] as unknown[] },
  templates: { items: [NAMED], stale: false, standard_missing: [] } as unknown,
  block: ((body: unknown) => ({ ...ANANYA, blocked: { at: new Date().toISOString(), meta: !(body as { local_only?: boolean }).local_only, by: "Circuit Society" } })) as Answer,
  patchAccount: ((body: unknown) => ({ ...ACCOUNT, ...(body as object) })) as Answer,
  send: ((body: unknown) => msg({ id: 99, direction: "out", body: (body as { text?: string }).text ?? null, status: "sent", via: "inbox", sent_by: "Circuit Society", wamid: "wamid.OUT" })) as Answer,
  install: (() => ({ results: {} })) as Answer,
};
const calls: Array<{ method: string; path: string; body?: unknown; query?: Record<string, unknown> }> = [];

async function answer(value: unknown) {
  const v = typeof value === "function" ? (value as () => unknown)() : value;
  const out = v instanceof Promise ? await v : v;
  if (out instanceof Error) throw out;
  return out;
}

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  const at = (p: string) => `/api/v1/clubs/whatsapp${p}`;
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string, options?: { query?: Record<string, unknown> }) => {
        calls.push({ method: "GET", path, query: options?.query });
        if (path === at("/account")) return answer(state.account);
        if (path === at("/summary")) return answer(state.summary);
        if (path === at("/team")) return answer(state.team);
        if (path === at("/inbox-settings")) return answer(state.settings);
        if (path === at("/saved-replies")) return answer(state.replies);
        if (path === at("/templates")) return answer(state.templates);
        if (path === at("/overview")) return { account: state.account, stats: null, quality_history: [] };
        if (path === at("/conversations")) return answer(state.conversations);
        const m = /\/conversations\/(\d+)\/messages$/.exec(path);
        if (m) return answer(state.messages[Number(m[1])]);
        if (/\/conversations\/\d+\/notes$/.test(path)) return answer(state.notes);
        if (path === "/api/v1/clubs/access/me") throw new ApiError({ message: "Not Found", status: 404 });
        if (path === "/api/v1/clubs/entitlements") return {};
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(async (path: string, body?: unknown) => {
        calls.push({ method: "POST", path, body });
        if (/\/conversations\/\d+\/read$/.test(path)) return { ...((state.messages[11] as { conversation?: object })?.conversation ?? ANANYA), unread_count: 0 };
        if (/\/conversations\/\d+\/messages$/.test(path)) return answer(state.send(body));
        if (/\/conversations\/\d+\/block$/.test(path)) return answer(state.block(body));
        if (/\/conversations\/\d+\/optout$/.test(path)) return { ...ANANYA, opt_out: { scope: "all", source: "team", at: new Date().toISOString(), by: "Circuit Society" } };
        if (/\/conversations\/\d+\/notes$/.test(path)) {
          const note = { id: 50 + state.notes.items.length, conversation_id: 11, body: (body as { body: string }).body, author: "Circuit Society", created_at: new Date().toISOString(), mine: true, can_delete: true };
          state.notes = { items: [...state.notes.items, note] };
          return note;
        }
        if (path === at("/saved-replies")) {
          const row = { id: 70 + state.replies.items.length, updated_at: null, ...(body as object) };
          state.replies = { items: [...state.replies.items, row] };
          return row;
        }
        if (path === at("/templates/standard")) return answer(state.install());
        throw new Error(`unstubbed POST ${path}`);
      }),
      put: vi.fn(async (path: string, body?: unknown) => {
        calls.push({ method: "PUT", path, body });
        if (/\/conversations\/\d+\/assignee$/.test(path)) {
          const b = body as { owner?: boolean; member_id?: number };
          const assignee = b.owner ? { kind: "owner", member_id: null, name: "The club's owner", key: "owner" } : b.member_id ? { kind: "member", member_id: b.member_id, name: "Priya Nair", key: `member:${b.member_id}` } : null;
          return { ...ANANYA, assignee };
        }
        if (/\/saved-replies\/\d+$/.test(path)) return { id: Number(path.split("/").pop()), updated_at: null, ...(body as object) };
        throw new Error(`unstubbed PUT ${path}`);
      }),
      patch: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "PATCH", path, body });
        if (path === at("/account")) return answer(state.patchAccount(body));
        if (path === at("/inbox-settings")) return { ...(state.settings as object), ...(body as object) };
        if (path === at("/inbox-settings/me")) return { ...SETTINGS.me, ...(body as object) };
        throw new Error(`unstubbed PATCH ${path}`);
      }),
      del: vi.fn(async (path: string, _body?: unknown, options?: { query?: Record<string, unknown> }) => {
        calls.push({ method: "DELETE", path, query: options?.query });
        if (/\/conversations\/\d+\/block$/.test(path)) return { ...ANANYA, blocked: null };
        if (/\/conversations\/\d+\/optout$/.test(path)) return { ...ANANYA, opt_out: null };
        if (/\/conversations\/\d+\/notes\/\d+$/.test(path)) {
          state.notes = { items: [] };
          return state.notes;
        }
        if (/\/saved-replies\/\d+$/.test(path)) {
          state.replies = { items: [] };
          return state.replies;
        }
        throw new Error(`unstubbed DELETE ${path}`);
      }),
    },
  };
});

let search = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/whatsapp",
  useSearchParams: () => search,
}));

const { render } = await import("@/test/render");
const wa = await import("./index");
const { WhatsAppInboxPage, WhatsAppSettingsPage, WhatsAppTemplatesPage, Composer, accountSchema, conversationSchema, messageSchema, templateSchema, keysErrorMessage, mediaProblem, errorText, titled, notificationFor, useNewMessageNotifier, writeNotify, resetNotifyCache } = wa;
const schemas = await import("./schemas");
const { checkSavedReply } = await import("./components/inbox-settings");
const { SidebarNav } = await import("@/components/sidebar-nav");
const { KIND_INFO, alertLink } = await import("@/features/club-alerts");

/** A stand-in for XMLHttpRequest: records the form, reports progress, answers as the server would. */
class FakeXHR {
  static last: FakeXHR | null = null;
  static answer: { status: number; body: unknown } = { status: 200, body: {} };
  method = "";
  url = "";
  withCredentials = false;
  status = 0;
  responseText = "";
  headers: Record<string, string> = {};
  sent: FormData | null = null;
  upload: { onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(k: string, v: string) {
    this.headers[k] = v;
  }
  send(form: FormData) {
    this.sent = form;
    FakeXHR.last = this;
  }
  abort() {
    this.onabort?.();
  }
  /** The test lets it finish: half-way progress, then the answer. */
  finish() {
    this.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 100 });
    this.status = FakeXHR.answer.status;
    this.responseText = JSON.stringify(FakeXHR.answer.body);
    this.onload?.();
  }
}

beforeEach(() => {
  calls.length = 0;
  search = new URLSearchParams();
  Object.assign(state, {
    account: ACCOUNT,
    conversations: { items: [ANANYA], total: 1, unread_total: 2 },
    messages: {
      11: {
        conversation: ANANYA,
        items: [
          msg({ id: 1, wamid: "wamid.IN1" }),
          msg({ id: 2, direction: "out", body: "Yes, behind Hall B.", status: "read", via: "inbox", sent_by: "Priya", wamid: "wamid.OUT1", context_wamid: "wamid.IN1", quoted: { id: 1, direction: "in", type: "text", preview: "Is there parking?" } }),
          msg({ id: 3, direction: "out", body: "You won't get WhatsApp messages from Circuit Society any more.", status: "sent", via: "auto", sent_by: "Automatic reply", wamid: "wamid.AUTO" }),
        ],
        has_more: false,
      },
    },
    summary: { unread_total: 2, unread_conversations: 1, waiting: 1, mine: 0 },
    team: TEAM,
    settings: SETTINGS,
    notes: { items: [] },
    replies: { items: [] },
    templates: { items: [NAMED], stale: false, standard_missing: [] },
    block: (body: unknown) => ({ ...ANANYA, blocked: { at: new Date().toISOString(), meta: !(body as { local_only?: boolean }).local_only, by: "Circuit Society" } }),
    patchAccount: (body: unknown) => ({ ...ACCOUNT, ...(body as object) }),
    send: (body: unknown) => msg({ id: 99, direction: "out", body: (body as { text?: string }).text ?? null, status: "sent", via: "inbox", sent_by: "Circuit Society", wamid: "wamid.OUT" }),
    install: () => ({ results: {} }),
  });
  FakeXHR.last = null;
  FakeXHR.answer = { status: 200, body: msg({ id: 120, direction: "out", type: "image", body: "The map", status: "sent", via: "inbox", sent_by: "Circuit Society", wamid: "wamid.IMG", media: { url: "/api/v1/clubs/whatsapp/media/120", mime: "image/jpeg", filename: "map.jpg" } }) };
  vi.stubGlobal("XMLHttpRequest", FakeXHR);
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, blob: async () => new Blob(["x"], { type: "image/jpeg" }) }) as unknown as Response));
  resetNotifyCache();
  try {
    window.localStorage.clear();
  } catch {
    /* none */
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function openAnanya() {
  render(<WhatsAppInboxPage />);
  fireEvent.click(await screen.findByRole("button", { name: /Ananya Iyer/ }));
  return screen.findByRole("log", { name: "Messages" });
}

// ─── Reading the server ──────────────────────────────────────────────────

describe("what the server says", () => {
  it("reads an older server's payloads, every new field defaulting, and a null phone", () => {
    const a = accountSchema.parse({ available: true, connected: true });
    expect(a).toMatchObject({ locked: false, number_status: null, name_status: null, restrictions: [] });
    const c = conversationSchema.parse({ id: 1, phone: null, status: "open", window_open: false });
    expect(c).toMatchObject({ phone: "", assignee: null, blocked: null, opt_out: null, notes: 0 });
    expect(schemas.contactName(c)).toBe("WhatsApp user");
    const m = messageSchema.parse({ id: 2, created_at: "2026-10-20T10:00:00Z" });
    expect(m.quoted).toBeNull();
    const t = templateSchema.parse({ name: "x", body: "Hi" });
    expect(t).toMatchObject({ parameter_format: "POSITIONAL", body_names: [] });
  });

  it("reads the new ones", () => {
    const a = accountSchema.parse({ ...ACCOUNT, locked: true, restrictions: [{ type: "RESTRICTED_BIZ_INITIATED_MESSAGING", expires_at: ahead(3 * 24 * HOUR), remediation: null }] });
    expect(a.locked).toBe(true);
    expect(a.restrictions[0]!.type).toBe("RESTRICTED_BIZ_INITIATED_MESSAGING");
    const c = conversationSchema.parse({ ...ANANYA, assignee: { kind: "member", member_id: 7, name: "Priya Nair", key: "member:7" }, opt_out: { scope: "marketing", source: "user_preferences", at: ago(MIN), by: null } });
    expect(c.assignee?.name).toBe("Priya Nair");
    expect(c.opt_out?.scope).toBe("marketing");
    expect(templateSchema.parse(NAMED).body_names).toEqual(["first_name", "event_name"]);
  });

  it("checks a file as WhatsApp would, before a byte is sent", () => {
    const file = (name: string, type: string, size: number) => ({ name, type, size });
    expect(schemas.checkMedia(file("a.jpg", "image/jpeg", 4_000_000))).toEqual({ ok: true, kind: "image", mime: "image/jpeg" });
    expect(schemas.checkMedia(file("a.jpg", "image/jpeg", 5_000_001))).toMatchObject({ ok: false, text: expect.stringMatching(/5\.0 MB at most/) });
    expect(schemas.checkMedia(file("clip.mp4", "video/mp4", 17_000_000))).toMatchObject({ ok: false });
    expect(schemas.checkMedia(file("rules.pdf", "", 1_000))).toMatchObject({ ok: true, kind: "document" });
    expect(schemas.checkMedia(file("note.opus", "audio/opus", 1_000))).toMatchObject({ ok: true, kind: "audio", mime: "audio/ogg" });
    expect(schemas.checkMedia(file("a.gif", "image/gif", 1_000))).toMatchObject({ ok: false, text: expect.stringMatching(/can't send a\.gif/) });
    expect(schemas.checkMedia(file("a.webp", "image/webp", 1_000))).toMatchObject({ ok: false });
    expect(schemas.checkMedia(file("big.pdf", "application/pdf", 100_000_001))).toMatchObject({ ok: false, text: expect.stringMatching(/100 MB at most/) });
  });

  it("fills saved replies and finds them by shortcut", () => {
    const items = [
      { id: 1, title: "Parking", body: "Hi {name}, parking is behind Hall B.", shortcut: "parking", updated_at: null },
      { id: 2, title: "Venue map", body: "Here's the map, {name}.", shortcut: "map", updated_at: null },
    ];
    expect(schemas.fillName(items[0]!.body, "Ananya Iyer")).toBe("Hi Ananya Iyer, parking is behind Hall B.");
    expect(schemas.matchReplies(items, "/ma").map((r) => r.id)).toEqual([2]);
    expect(schemas.matchReplies(items, "/park").map((r) => r.id)).toEqual([1]);
    expect(schemas.matchReplies(items, "/").length).toBe(2);
    expect(checkSavedReply({ id: null, title: "", body: "x", shortcut: "" })?.field).toBe("title");
    expect(checkSavedReply({ id: null, title: "t", body: "x", shortcut: "two words" })?.field).toBe("shortcut");
    expect(checkSavedReply({ id: null, title: "t", body: "x", shortcut: "/Parking" })).toBeNull();
  });

  it("says each new refusal in words", async () => {
    const expires = await refused(422, { message: "", error_code: "WHATSAPP_TOKEN_EXPIRES", errors: { field: "access_token" } });
    expect(keysErrorMessage(expires).field).toBe("access_token");
    const mismatch = await refused(422, { message: "That app ID isn't the token's app.", error_code: "WHATSAPP_APP_MISMATCH", errors: { field: "app_id" } });
    expect(keysErrorMessage(mismatch)).toEqual({ field: "app_id", text: "That app ID isn't the token's app." });
    const notConnected = await refused(422, { message: "", error_code: "WHATSAPP_NUMBER_NOT_CONNECTED" });
    expect(keysErrorMessage(notConnected).field).toBe("phone_number_id");
    expect(mediaProblem(410, "MEDIA_OTHER_NUMBER")).toEqual({ text: schemas.ERROR_TEXT.MEDIA_OTHER_NUMBER, retry: false });
    expect(mediaProblem(502, "MEDIA_UNAVAILABLE").text).toMatch(/unexpected address/);
    for (const code of ["LIVE_STREAM_FULL", "PLAN_FEATURE_LOCKED", "OPTED_OUT", "CONTACT_BLOCKED", "BLOCK_WINDOW_CLOSED"]) {
      expect(errorText(new ApiError({ message: "", status: 409, errorCode: code }))).toBe(schemas.ERROR_TEXT[code]);
    }
  });

  it("labels the bell's new notices and leads them to the conversation", () => {
    expect(KIND_INFO.whatsapp_message).toMatchObject({ label: "WhatsApp message", link: "/whatsapp" });
    expect(KIND_INFO.whatsapp_waiting!.tone).toBe("caution");
    expect(alertLink({ kind: "whatsapp_message", link: "/whatsapp?c=11" })).toBe("/whatsapp?c=11");
  });
});

// ─── The unread count ────────────────────────────────────────────────────

describe("what waits", () => {
  it("shows the unread count on WhatsApp in the rail and in the tab's title", async () => {
    document.title = "Inbox · MyOtherApp";
    const view = render(<SidebarNav />);
    const badge = await screen.findByTestId("whatsapp-unread");
    expect(badge).toHaveTextContent("2 unread");
    expect(screen.getByRole("link", { name: /WhatsApp\s*2 unread/ })).toHaveAttribute("href", "/whatsapp");
    await waitFor(() => expect(document.title).toBe("(2) Inbox · MyOtherApp"));
    // A page that sets its own title keeps the count in front.
    document.title = "Events · MyOtherApp";
    await waitFor(() => expect(document.title).toBe("(2) Events · MyOtherApp"));
    view.unmount();
    expect(document.title).toBe("Events · MyOtherApp");
    expect(titled("(9) Events", 0)).toBe("Events");
    expect(titled("Events", 120)).toBe("(99+) Events");
  });

  it("shows no count to someone the inbox refuses, nor from a server without it", async () => {
    state.summary = refused(403, { message: "You need the WhatsApp permission.", error_code: "WHATSAPP_PERMISSION" });
    const first = render(<SidebarNav />);
    await waitFor(() => expect(calls.some((c) => c.path.endsWith("/summary"))).toBe(true));
    expect(screen.queryByTestId("whatsapp-unread")).toBeNull();
    first.unmount();
    state.summary = refused(404, { detail: "Not Found" });
    render(<SidebarNav />);
    await waitFor(() => expect(calls.filter((c) => c.path.endsWith("/summary")).length).toBeGreaterThan(1));
    expect(screen.queryByTestId("whatsapp-unread")).toBeNull();
  });
});

// ─── The inbox ───────────────────────────────────────────────────────────

describe("the inbox as a team's", () => {
  it("filters Mine, Unassigned and Blocked, and by person, on the server", async () => {
    render(<WhatsAppInboxPage />);
    const list = await screen.findByRole("region", { name: "Conversations" });
    for (const [label, filter] of [["Mine", "mine"], ["Unassigned", "unassigned"], ["Blocked", "blocked"]] as const) {
      fireEvent.click(within(list).getByRole("button", { name: label }));
      await waitFor(() => expect(calls.some((c) => c.path.endsWith("/conversations") && c.query?.filter === filter)).toBe(true));
    }
    fireEvent.change(await within(list).findByRole("combobox", { name: "Show whose" }), { target: { value: "member:7" } });
    await waitFor(() => expect(calls.some((c) => c.path.endsWith("/conversations") && c.query?.assignee === "member:7")).toBe(true));
  });

  it("marks who a conversation is assigned to, and who is blocked or opted out, in the list", async () => {
    state.conversations = {
      items: [
        { ...ANANYA, assignee: { kind: "member", member_id: 7, name: "Priya Nair", key: "member:7" } },
        { ...ANANYA, id: 12, contact: { ...ANANYA.contact, name: "Bala K" }, blocked: { at: ago(MIN), meta: false, by: "Priya" }, unread_count: 0 },
        { ...ANANYA, id: 13, contact: { ...ANANYA.contact, name: "Chitra R" }, opt_out: { scope: "all", source: "keyword", at: ago(MIN), by: null }, unread_count: 0 },
      ],
      total: 3,
      unread_total: 2,
    };
    render(<WhatsAppInboxPage />);
    expect(await screen.findByRole("button", { name: /Ananya Iyer.*Assigned to Priya Nair/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Bala K.*Blocked/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Chitra R.*Opted out/ })).toBeInTheDocument();
  });

  it("opens the conversation a bell notice leads to (?c=)", async () => {
    search = new URLSearchParams("c=11");
    render(<WhatsAppInboxPage />);
    expect(await screen.findByRole("log", { name: "Messages" })).toBeInTheDocument();
    expect(calls.some((c) => c.path.endsWith("/conversations/11/messages"))).toBe(true);
  });

  it("offers none of the team's tools against a backend with #106 but without them", async () => {
    state.summary = refused(404, { detail: "Not Found" });
    const log = await openAnanya();
    await waitFor(() => expect(calls.some((c) => c.path.endsWith("/summary"))).toBe(true));
    // The thread and the reply box as they were: no assigning, notes, actions, Reply, files or saved replies.
    expect(screen.queryByRole("combobox", { name: "Assigned to" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Notes" })).toBeNull();
    expect(screen.queryByRole("button", { name: "More actions" })).toBeNull();
    expect(within(log).queryByRole("button", { name: "Reply to this message" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Attach a photo/ })).toBeNull();
    expect(screen.getByRole("textbox", { name: "Message" })).toHaveAttribute("placeholder", "Write a reply");
  });

  it("assigns a conversation to someone with the inbox", async () => {
    await openAnanya();
    const select = await screen.findByRole("combobox", { name: "Assigned to" });
    await waitFor(() => expect(within(select).getByRole("option", { name: "Priya Nair" })).toBeInTheDocument());
    fireEvent.change(select, { target: { value: "member:7" } });
    await waitFor(() => expect(calls.find((c) => c.method === "PUT" && c.path.endsWith("/conversations/11/assignee"))?.body).toEqual({ member_id: 7 }));
    fireEvent.change(select, { target: { value: "owner" } });
    await waitFor(() => expect(calls.filter((c) => c.method === "PUT").at(-1)?.body).toEqual({ owner: true }));
    fireEvent.change(select, { target: { value: "" } });
    await waitFor(() => expect(calls.filter((c) => c.method === "PUT").at(-1)?.body).toEqual({}));
  });
});

// ─── STOP, opt-outs, blocking ────────────────────────────────────────────

describe("opt-outs and blocks", () => {
  it("shows a clear banner while they are opted out, and the automatic answer as one", async () => {
    state.messages[11] = { ...(state.messages[11] as object), conversation: { ...ANANYA, opt_out: { scope: "all", source: "keyword", at: ago(MIN), by: null } } };
    const log = await openAnanya();
    expect(await screen.findByText(/They wrote STOP: no templates, and their tickets skip WhatsApp/)).toBeInTheDocument();
    expect(within(log).getByText("Automatic reply")).toBeInTheDocument();
  });

  it("says a marketing stop is theirs to undo", async () => {
    state.messages[11] = { ...(state.messages[11] as object), conversation: { ...ANANYA, opt_out: { scope: "marketing", source: "user_preferences", at: ago(MIN), by: null } } };
    await openAnanya();
    expect(await screen.findByText(/stopped marketing messages from you in WhatsApp's settings/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    expect(await screen.findByText(/only they can undo that/)).toBeInTheDocument();
  });

  it("opts them out on their word, after asking", async () => {
    await openAnanya();
    fireEvent.click(await screen.findByRole("button", { name: "More actions" }));
    fireEvent.click(await screen.findByRole("button", { name: "Opt them out of WhatsApp" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/Only on their word/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Opt out" }));
    await waitFor(() => expect(calls.find((c) => c.method === "POST" && c.path.endsWith("/conversations/11/optout"))?.body).toEqual({ scope: "all" }));
  });

  it("blocks at WhatsApp, and offers a block here when WhatsApp says it's too late", async () => {
    state.block = (body: unknown) =>
      (body as { local_only?: boolean }).local_only
        ? { ...ANANYA, blocked: { at: new Date().toISOString(), meta: false, by: "Circuit Society" } }
        : refused(409, { message: "Meta only lets you block someone who wrote to you in the last 24 hours. You can block them here instead.", error_code: "BLOCK_WINDOW_CLOSED", errors: { local_available: true, meta_code: "131047" } });
    await openAnanya();
    fireEvent.click(await screen.findByRole("button", { name: "More actions" }));
    fireEvent.click(await screen.findByRole("button", { name: /Block Ananya Iyer/ }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Block" }));
    expect(await screen.findByText(/only lets you block someone who wrote to you in the last 24 hours/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Block here instead" }));
    await waitFor(() => expect(calls.filter((c) => c.path.endsWith("/block")).map((c) => c.body)).toEqual([{ local_only: false }, { local_only: true }]));
    // Blocked: the banner says so, nothing can be written, and it can be lifted.
    expect(await screen.findByText(/Blocked here by Circuit Society/)).toBeInTheDocument();
    expect(screen.getByText(/You blocked them, so nothing can be sent/)).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Message" })).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: "Unblock" })[0]!);
    await waitFor(() => expect(calls.some((c) => c.method === "DELETE" && c.path.endsWith("/conversations/11/block"))).toBe(true));
  });
});

// ─── Notes ───────────────────────────────────────────────────────────────

describe("notes", () => {
  it("are the team's, written and deleted beside the conversation", async () => {
    state.notes = { items: [{ id: 40, conversation_id: 11, body: "Sponsor's daughter: be kind.", author: "Priya Nair", created_at: ago(HOUR), mine: false, can_delete: false }] };
    await openAnanya();
    fireEvent.click(await screen.findByRole("button", { name: "Notes" }));
    const panel = await screen.findByRole("region", { name: "Team notes" });
    expect(await within(panel).findByText("Sponsor's daughter: be kind.")).toBeInTheDocument();
    expect(within(panel).getByText(/never sent/)).toBeInTheDocument();
    expect(within(panel).queryByRole("button", { name: /Delete the note/ })).toBeNull();
    fireEvent.change(within(panel).getByRole("textbox", { name: "New note" }), { target: { value: "Called her back." } });
    fireEvent.click(within(panel).getByRole("button", { name: "Add note" }));
    await waitFor(() => expect(calls.find((c) => c.method === "POST" && c.path.endsWith("/notes"))?.body).toEqual({ body: "Called her back." }));
    const mine = await within(panel).findByRole("button", { name: "Delete the note by Circuit Society" });
    fireEvent.click(mine);
    await waitFor(() => expect(calls.some((c) => c.method === "DELETE" && /\/notes\/\d+$/.test(c.path))).toBe(true));
  });
});

// ─── Replies, files, saved replies ───────────────────────────────────────

describe("replying", () => {
  it("shows the quoted message above a reply, and replies to one with Reply", async () => {
    const log = await openAnanya();
    const out = within(log).getByText("Yes, behind Hall B.").closest("[data-direction]")!;
    expect(within(out as HTMLElement).getByText("Is there parking?")).toBeInTheDocument();
    fireEvent.click(within(log).getAllByRole("button", { name: "Reply to this message" })[0]!);
    const chip = await screen.findByRole("group", { name: "Replying to" });
    expect(within(chip).getByText("Is there parking?")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Message" }), { target: { value: "Yes, free." } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(calls.find((c) => c.method === "POST" && c.path.endsWith("/messages"))?.body).toEqual({ type: "text", text: "Yes, free.", reply_to: 1 }));
    await waitFor(() => expect(screen.queryByRole("group", { name: "Replying to" })).toBeNull());
  });

  it("refuses a file WhatsApp won't take before uploading, and sends one it will with progress", async () => {
    await openAnanya();
    const input = screen.getByLabelText("Choose a file to send") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["gif"], "funny.gif", { type: "image/gif" })] } });
    expect(await screen.findByText(/WhatsApp can't send funny\.gif/)).toBeInTheDocument();
    const big = new File(["x"], "huge.png", { type: "image/png" });
    Object.defineProperty(big, "size", { value: 6_000_000 });
    fireEvent.change(input, { target: { files: [big] } });
    expect(await screen.findByText(/huge\.png is 6\.0 MB: WhatsApp sends a image of 5\.0 MB at most/)).toBeInTheDocument();
    expect(FakeXHR.last).toBeNull();

    const map = new File(["\xff\xd8\xffjpeg"], "map.jpg", { type: "image/jpeg" });
    fireEvent.change(input, { target: { files: [map] } });
    const pending = await screen.findByRole("group", { name: "File to send" });
    fireEvent.change(within(pending).getByRole("textbox", { name: "Caption" }), { target: { value: "The map" } });
    fireEvent.click(within(pending).getByRole("button", { name: /Send photo/ }));
    await waitFor(() => expect(FakeXHR.last).not.toBeNull());
    const xhr = FakeXHR.last!;
    expect(xhr.method).toBe("POST");
    expect(xhr.url).toBe("/api/gateway/api/v1/clubs/whatsapp/conversations/11/media");
    expect(xhr.withCredentials).toBe(true);
    // The size goes first: the server needs it before the file to stream it on.
    expect([...xhr.sent!.keys()]).toEqual(["size", "caption", "file"]);
    expect(xhr.sent!.get("size")).toBe(String(map.size));
    expect(xhr.sent!.get("caption")).toBe("The map");
    expect(await within(pending).findByRole("progressbar", { name: "Sending the file" })).toBeInTheDocument();
    await act(async () => xhr.finish());
    await waitFor(() => expect(screen.queryByRole("group", { name: "File to send" })).toBeNull());
    expect(await within(screen.getByRole("log", { name: "Messages" })).findByRole("img", { name: "The map" })).toBeInTheDocument();
  });

  it("takes a file dropped on the conversation, and says the server's refusal", async () => {
    FakeXHR.answer = { status: 409, body: { message: "", error_code: "WINDOW_CLOSED" } };
    await openAnanya();
    const thread = screen.getByLabelText("Conversation with Ananya Iyer");
    const rules = new File(["%PDF-1.4"], "rules.pdf", { type: "application/pdf" });
    fireEvent.dragOver(thread, { dataTransfer: { types: ["Files"], files: [rules] } });
    fireEvent.drop(thread, { dataTransfer: { types: ["Files"], files: [rules] } });
    const pending = await screen.findByRole("group", { name: "File to send" });
    expect(within(pending).getByText("rules.pdf")).toBeInTheDocument();
    fireEvent.click(within(pending).getByRole("button", { name: /Send document/ }));
    await waitFor(() => expect(FakeXHR.last).not.toBeNull());
    await act(async () => FakeXHR.last!.finish());
    expect(await screen.findByText(schemas.ERROR_TEXT.WINDOW_CLOSED!)).toBeInTheDocument();
  });

  it("offers saved replies after /, with the person's name put in", async () => {
    state.replies = { items: [{ id: 3, title: "Parking", body: "Hi {name}, parking is free behind Hall B.", shortcut: "parking", updated_at: null }] };
    await openAnanya();
    const box = screen.getByRole("textbox", { name: "Message" });
    fireEvent.change(box, { target: { value: "/par" } });
    const list = await screen.findByRole("listbox", { name: "Saved replies" });
    expect(within(list).getByText("/parking")).toBeInTheDocument();
    fireEvent.keyDown(box, { key: "Enter" });
    await waitFor(() => expect(box).toHaveValue("Hi Ananya Iyer, parking is free behind Hall B."));
    expect(screen.queryByRole("listbox", { name: "Saved replies" })).toBeNull();
  });

  it("fills a template made with named values by name", async () => {
    const conv = schemas.conversationSchema.parse({ ...ANANYA, window_open: false, window_expires_at: ago(HOUR), last_inbound_at: ago(25 * HOUR) });
    render(<Composer conversation={conv} draft="" onDraft={() => {}} problem={null} onProblem={() => {}} />);
    fireEvent.change(await screen.findByRole("combobox", { name: "Template" }), { target: { value: "greet_named|en" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Value {{first_name}}" }), { target: { value: "Ananya" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Value {{event_name}}" }), { target: { value: "Build Night" } });
    expect(screen.getByLabelText("Preview")).toHaveTextContent("Hi Ananya, Build Night is on.");
    fireEvent.click(screen.getByRole("button", { name: /Send template/ }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === "POST" && c.path.endsWith("/messages"))?.body).toEqual({
        type: "template", template: "greet_named", language: "en", params: { header: [], body: ["Ananya", "Build Night"], buttons: {} },
      }),
    );
  });
});

// ─── Browser notifications ───────────────────────────────────────────────

describe("this browser's notifications", () => {
  it("shows one while the tab is hidden for a conversation whose unread count went up: who, never what", () => {
    const shown: Array<{ title: string; options: NotificationOptions }> = [];
    vi.stubGlobal("Notification", Object.assign(function () {}, { permission: "granted", requestPermission: async () => "granted" }));
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    writeNotify({ enabled: true, sound: false });
    const a = schemas.conversationSchema.parse(ANANYA);
    const make = (title: string, options: NotificationOptions) => {
      shown.push({ title, options });
      return null;
    };
    const { rerender } = renderHook(({ items }) => useNewMessageNotifier(items, undefined, make), { initialProps: { items: [a] } });
    expect(shown).toEqual([]);
    rerender({ items: [{ ...a, unread_count: 3, last_message: { ...a.last_message!, preview: "my secret words" } }] });
    expect(shown).toEqual([{ title: "Ananya Iyer", options: { body: "3 new WhatsApp messages", tag: "moa-whatsapp-11" } }]);
    expect(JSON.stringify(shown)).not.toMatch(/secret/);
    // Not for a blocked conversation, nor when off, nor when the tab is in front.
    rerender({ items: [{ ...a, unread_count: 5, blocked: { at: ago(MIN), meta: false, by: null } }] });
    writeNotify({ enabled: false, sound: false });
    rerender({ items: [{ ...a, unread_count: 7 }] });
    expect(shown.length).toBe(1);
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    expect(notificationFor(a, 1).body).toBe("New WhatsApp message");
  });
});

// ─── Settings ────────────────────────────────────────────────────────────

describe("settings", () => {
  it("says the plan lapsed, Meta's restrictions in words, and the number's and name's status", async () => {
    state.account = {
      ...ACCOUNT,
      locked: true,
      plan_allows: false,
      number_status: "FLAGGED",
      name_status: "PENDING_REVIEW",
      restrictions: [{ type: "RESTRICTED_BIZ_INITIATED_MESSAGING", expires_at: ahead(3 * 24 * HOUR), remediation: "Review your templates." }],
    };
    render(<WhatsAppSettingsPage />);
    expect(await screen.findByText(/Messages people send it still arrive and are kept in the inbox, but nothing is sent from/)).toBeInTheDocument();
    expect(screen.getByText(/Can't start conversations/)).toBeInTheDocument();
    expect(screen.getByText(/Review your templates\./)).toBeInTheDocument();
    expect(screen.getByText(/Flagged: its quality is low/)).toBeInTheDocument();
    expect(screen.getByText("Waiting for Meta's review")).toBeInTheDocument();
  });

  it("adds the app ID on its own, and says when it's another app's", async () => {
    state.patchAccount = (body: unknown) =>
      (body as { app_id?: string }).app_id === "11111"
        ? refused(422, { message: "That app ID isn't the app your access token was made in.", error_code: "WHATSAPP_APP_MISMATCH", errors: { field: "app_id" } })
        : { ...ACCOUNT, ...(body as object) };
    render(<WhatsAppSettingsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Add" }));
    const form = screen.getByRole("form", { name: "App ID" });
    fireEvent.change(within(form).getByRole("textbox", { name: "App ID" }), { target: { value: "abc" } });
    fireEvent.click(within(form).getByRole("button", { name: "Save" }));
    expect(await within(form).findByText(/long number at the top/)).toBeInTheDocument();
    fireEvent.change(within(form).getByRole("textbox", { name: "App ID" }), { target: { value: "11111" } });
    fireEvent.click(within(form).getByRole("button", { name: "Save" }));
    expect(await within(form).findByText("That app ID isn't the app your access token was made in.")).toBeInTheDocument();
    fireEvent.change(within(form).getByRole("textbox", { name: "App ID" }), { target: { value: "556677889900" } });
    fireEvent.click(within(form).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(calls.filter((c) => c.method === "PATCH" && c.path.endsWith("/account")).map((c) => c.body)).toEqual([{ app_id: "11111" }, { app_id: "556677889900" }]));
  });

  it("asks a club set up earlier to tick user_preferences", async () => {
    render(<WhatsAppSettingsPage />);
    expect(await screen.findByText(/New: tick/)).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Webhook fields" })).getByText("user_preferences")).toBeInTheDocument();
  });

  it("sets how long a message may wait, the answers to STOP and START, and my mails", async () => {
    render(<WhatsAppSettingsPage />);
    const waiting = await screen.findByRole("region", { name: "Waiting too long" });
    fireEvent.change(within(waiting).getByRole("combobox"), { target: { value: "2" } });
    await waitFor(() => expect(calls.find((c) => c.method === "PATCH" && c.path.endsWith("/inbox-settings"))?.body).toEqual({ alert_after_hours: 2 }));

    const answers = screen.getByRole("region", { name: "STOP and START" });
    const stop = within(answers).getByLabelText("Answer to STOP");
    expect(stop).toHaveAttribute("placeholder", SETTINGS.stop_reply_default);
    fireEvent.change(stop, { target: { value: "Bye from {club}." } });
    fireEvent.click(within(answers).getByRole("button", { name: "Save answers" }));
    await waitFor(() => expect(calls.filter((c) => c.method === "PATCH" && c.path.endsWith("/inbox-settings")).at(-1)?.body).toEqual({ stop_reply: "Bye from {club}." }));

    const mine = screen.getByRole("region", { name: "Your notifications" });
    fireEvent.click(within(mine).getByRole("switch", { name: "Mail me when a conversation is assigned to me" }));
    await waitFor(() => expect(calls.find((c) => c.path.endsWith("/inbox-settings/me"))?.body).toEqual({ email_assigned: false }));
  });

  it("turns this browser's notifications on only once the browser allows them", async () => {
    let allowed: NotificationPermission = "default";
    vi.stubGlobal("Notification", Object.assign(function () {}, { get permission() { return allowed; }, requestPermission: async () => (allowed = "denied") }));
    render(<WhatsAppSettingsPage />);
    const mine = await screen.findByRole("region", { name: "Your notifications" });
    const toggle = within(mine).getByRole("switch", { name: "Notify me in this browser" });
    fireEvent.click(toggle);
    await waitFor(() => expect(within(mine).getByText(/blocks notifications for this site/)).toBeInTheDocument());
    expect(toggle).toHaveAttribute("aria-checked", "false");
    vi.stubGlobal("Notification", Object.assign(function () {}, { get permission() { return allowed; }, requestPermission: async () => (allowed = "granted") }));
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle).toHaveAttribute("aria-checked", "true"));
    expect(within(mine).getByRole("switch", { name: "With a sound" })).not.toBeDisabled();
  });

  it("keeps saved replies, checked before the server is asked", async () => {
    render(<WhatsAppSettingsPage />);
    const panel = await screen.findByRole("region", { name: "Saved replies" });
    fireEvent.click(within(panel).getByRole("button", { name: /New/ }));
    const form = within(panel).getByRole("form", { name: "New saved reply" });
    fireEvent.change(within(form).getByLabelText("Title"), { target: { value: "Parking" } });
    fireEvent.change(within(form).getByLabelText("Shortcut (optional)"), { target: { value: "two words" } });
    fireEvent.change(within(form).getByLabelText("Reply"), { target: { value: "Hi {name}, it's free." } });
    fireEvent.click(within(form).getByRole("button", { name: "Save" }));
    expect(await within(form).findByText(/One word: letters, digits/)).toBeInTheDocument();
    expect(calls.some((c) => c.method === "POST" && c.path.endsWith("/saved-replies"))).toBe(false);
    fireEvent.change(within(form).getByLabelText("Shortcut (optional)"), { target: { value: "/Parking" } });
    fireEvent.click(within(form).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(calls.find((c) => c.method === "POST" && c.path.endsWith("/saved-replies"))?.body).toEqual({ title: "Parking", body: "Hi {name}, it's free.", shortcut: "parking" }));
    expect(await within(panel).findByText("/parking")).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole("button", { name: "Delete Parking" }));
    await waitFor(() => expect(within(panel).getByText("None yet.")).toBeInTheDocument());
  });

  it("shows none of the inbox's settings from a server without them, or to someone without the inbox", async () => {
    state.settings = refused(404, { detail: "Not Found" });
    const first = render(<WhatsAppSettingsPage />);
    await screen.findByRole("region", { name: "Your WhatsApp number" });
    await waitFor(() => expect(calls.some((c) => c.path.endsWith("/inbox-settings"))).toBe(true));
    expect(screen.queryByRole("region", { name: "Saved replies" })).toBeNull();
    first.unmount();
    state.settings = SETTINGS;
    state.account = { ...ACCOUNT, can_inbox: false };
    calls.length = 0;
    render(<WhatsAppSettingsPage />);
    await screen.findByRole("region", { name: "Your WhatsApp number" });
    expect(screen.queryByRole("region", { name: "Waiting too long" })).toBeNull();
    expect(calls.some((c) => c.path.endsWith("/inbox-settings"))).toBe(false);
  });
});

describe("templates", () => {
  it("says a standard template already submitted is waiting for Meta, and how a named one is filled", async () => {
    state.templates = { items: [NAMED], stale: false, standard_missing: ["ticket_confirmed"] };
    state.install = () => ({ results: { ticket_confirmed: "pending", event_reminder: "exists" } });
    render(<WhatsAppTemplatesPage />);
    expect(await screen.findByText("Filled by name: {{first_name}}, {{event_name}}")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Add MyOtherApp's templates/ }));
    expect(await screen.findByText("already submitted, waiting for Meta's review")).toBeInTheDocument();
  });
});
