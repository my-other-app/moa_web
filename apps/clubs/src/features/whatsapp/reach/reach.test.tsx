import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as React from "react";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { ApiError } from "@moa/api";
import { toast } from "@moa/ui";

/**
 * A club's own WhatsApp number, further -- against the backend's contract
 * (app/api/club_whatsapp): GET /account/reach (routing by kind, Connect with
 * Meta's settings), PATCH /account/routing, POST /account/embedded-signup and
 * .../event, GET /spend, and /broadcasts (list, preview, create, get, cancel).
 * A backend without them answers each with FastAPI's bare 404: nothing new
 * is shown then.
 */

const NOW = Date.now();
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const ahead = (ms: number) => new Date(NOW + ms).toISOString();
const HOUR = 3_600_000;

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
  quality_checked_at: ago(HOUR),
  verified_at: ago(2 * HOUR),
  last_webhook_at: ago(HOUR),
  last_error: null,
  last_error_code: null,
  routing: true,
  retention_months: 12,
  webhook_url: "https://api.myotherapp.in/api/v1/hooks/whatsapp/club/AbCdEfGhIjKlMnOp",
  verify_token: "verify-me",
  webhook_fields: ["messages"],
  can_manage: true,
  can_inbox: true,
  impersonated: false,
  warnings: [],
};
const NOT_CONNECTED = { ...ACCOUNT, connected: false, status: null, mode: null, display_phone_number: null, webhook_url: null, verify_token: null };

const ES_CONFIG = { app_id: "556677889900", config_id: "998877665544", graph_version: "v24.0", version: "v5" };
const REACH = {
  routing: true,
  kinds: { tickets: true, certificates: true, reminders: true },
  embedded_signup: null as unknown,
  mode: "keys",
  token_expires_at: null,
  registered_at: null,
  on_biz_app: false,
  mm_status: null,
  messaging_limit: { tier: "TIER_1K", per_day: 1000 },
  consent_text_version: "2026-10-25",
  consent_text: "Get updates from Circuit Society on WhatsApp",
};

const SPEND = {
  month: "2026-10",
  currency: "INR",
  fetched_at: ago(5 * HOUR),
  checked_at: ago(5 * HOUR),
  categories: [
    { category: "MARKETING", volume: 150, cost: 129.465 },
    { category: "UTILITY", volume: 400, cost: 46 },
  ],
  volume: 550,
  cost: 175.465,
  approximate: true,
  note: "Meta's own figure, which it calls approximate, in your WhatsApp Business Account's currency, before tax.",
  since: ago(24 * 24 * HOUR),
  from_your_number: { deliveries: 3, broadcasts: 2, inbox: 1, total: 6 },
  fallbacks: [
    { code: "132015", reason: "The template is paused for poor quality (132015)", count: 2 },
    { code: "NO_TEMPLATE", reason: "Your account has no approved certificate_ready template", count: 1 },
  ],
  fallback_total: 3,
};

const TEMPLATES = {
  items: [
    {
      id: "1", name: "event_news", language: "en", category: "UTILITY", status: "APPROVED", rejected_reason: null, quality: null,
      header: null, body: "Hi {{1}}, news about {{2}}: {{3}}", body_variables: 3, footer: null, buttons: [],
    },
    {
      id: "2", name: "club_offer", language: "en", category: "MARKETING", status: "APPROVED", rejected_reason: null, quality: null,
      header: null, body: "Hi {{1}}, {{2}}", body_variables: 2, footer: null,
      buttons: [{ index: 0, type: "URL", text: "See it", url: "https://myotherapp.in/c/{{1}}", phone_number: null, variables: 1 }],
    },
    {
      id: "3", name: "doc_offer", language: "en", category: "MARKETING", status: "APPROVED", rejected_reason: null, quality: null,
      header: { format: "DOCUMENT", text: null, variables: 0 }, body: "Hello {{1}}", body_variables: 1, footer: null, buttons: [],
    },
    { id: "4", name: "draft_one", language: "en", category: "UTILITY", status: "PENDING", rejected_reason: null, quality: null, header: null, body: "x", body_variables: 0, footer: null, buttons: [] },
  ],
  stale: false,
  standard_missing: [],
};

const RESULTS = {
  recipients: 120, queued: 0, waiting: 0, sent: 110, delivered: 100, read: 40, failed: 6,
  failed_by_reason: [{ code: "131026", title: "Message undeliverable", count: 4 }, { code: "131050", title: "Stopped marketing", count: 2 }],
  skipped: { opted_out: 3, no_consent: 5, no_number: 1, limit_spill: 0, cancelled: 0, not_sent: 0 },
};
const SENT = {
  id: 7, kind: "event_update", template: "event_news", language: "en", category: "UTILITY", event: { id: 3, name: "Build Night" },
  status: "done", scheduled_at: null, started_at: ago(3 * HOUR), finished_at: ago(2 * HOUR), created_at: ago(3 * HOUR), created_by: "Priya",
  endpoint: "messages", estimate: null, last_error: null, results: RESULTS,
};
const SCHEDULED = {
  ...SENT, id: 8, kind: "promotion", template: "club_offer", category: "MARKETING", event: null, status: "scheduled", scheduled_at: ahead(5 * HOUR),
  started_at: null, finished_at: null, results: { ...RESULTS, recipients: 0, sent: 0, delivered: 0, read: 0, failed: 0, failed_by_reason: [], skipped: { ...RESULTS.skipped, opted_out: 0, no_consent: 0, no_number: 0 } },
};

const PREVIEW = {
  kind: "event_update", category: "UTILITY", template: "event_news", language: "en", event_id: 3, recipients: 2,
  excluded: { opted_out: 1, no_consent: 4, no_number: 1 },
  estimate: {
    recipients: 2, category: "UTILITY", currency: "INR", rate: 0.115, subtotal: 0.23, gst_rate: 0.18, gst: 0.04, total: 0.27, estimate: true,
    label: "An estimate at Meta's list rate for India, for every message delivered.",
    messaging_limit: { tier: "TIER_1K", per_day: 1000, used_today: 0, today: 2, days: 1 },
  },
  sample: "Hi Ananya, news about Build Night: The hall moved to Lab 3.",
};

const routeMissing = () => new ApiError({ message: "Not Found", status: 404, routeMissing: true });

type Answer = unknown | ((body?: unknown) => unknown);
const state: Record<string, Answer> = {};
const calls: Array<{ method: string; path: string; body?: unknown; query?: Record<string, unknown> }> = [];

function answer(value: Answer, body?: unknown) {
  const v = typeof value === "function" ? (value as (b?: unknown) => unknown)(body) : value;
  if (v instanceof Error) throw v;
  return v;
}

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  const W = "/api/v1/clubs/whatsapp";
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string, options?: { query?: Record<string, unknown> }) => {
        calls.push({ method: "GET", path, query: options?.query });
        if (path === `${W}/account`) return answer(state.account);
        if (path === `${W}/account/reach`) return answer(state.reach);
        if (path === `${W}/spend`) return answer(state.spend);
        if (path === `${W}/overview`) return answer(state.overview);
        if (path === `${W}/templates`) return answer(state.templates);
        if (path === `${W}/broadcasts`) return answer(state.broadcasts);
        if (path === "/api/v1/clubs/events/list") {
          return { limit: 50, offset: 0, total: 1, next: null, items: [{ id: 3, name: "Build Night", event_datetime: ahead(48 * HOUR), poster: null, category: null }] };
        }
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(async (path: string, body?: unknown) => {
        calls.push({ method: "POST", path, body });
        if (path === `${W}/account/embedded-signup`) return answer(state.signup, body);
        if (path === `${W}/account/embedded-signup/event`) return { ok: true };
        if (path === `${W}/broadcasts/preview`) return answer(state.preview, body);
        if (path === `${W}/broadcasts`) return answer(state.create, body);
        const c = /\/broadcasts\/(\d+)\/cancel$/.exec(path);
        if (c) return { ...SCHEDULED, status: "cancelled" };
        throw new Error(`unstubbed POST ${path}`);
      }),
      patch: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "PATCH", path, body });
        if (path === `${W}/account/routing`) {
          return { ...(state.reach as typeof REACH), kinds: { ...(state.reach as typeof REACH).kinds, ...(body as object) } };
        }
        if (path === `${W}/account`) return { ...(state.account as object), ...(body as object) };
        throw new Error(`unstubbed PATCH ${path}`);
      }),
      put: vi.fn(async () => {
        throw new Error("unstubbed PUT");
      }),
      del: vi.fn(async () => {
        throw new Error("unstubbed DELETE");
      }),
    },
  };
});

const { render } = await import("@/test/render");
const { WhatsAppSettingsPage } = await import("../index");
const { WhatsAppBroadcastsPage, broadcastable, slotsOf, variablesFor, parseSignupMessage, fromFacebook, runEmbeddedSignup } = await import("./index");
const { templateSchema } = await import("../schemas");

beforeEach(() => {
  calls.length = 0;
  Object.assign(state, {
    account: ACCOUNT,
    reach: REACH,
    spend: SPEND,
    overview: routeMissing(),
    templates: TEMPLATES,
    broadcasts: { items: [SENT, SCHEDULED], total: 2 },
    preview: PREVIEW,
    create: (body: unknown) => ({ ...SENT, id: 9, status: (body as { scheduled_at?: string }).scheduled_at ? "scheduled" : "sending", scheduled_at: (body as { scheduled_at?: string }).scheduled_at ?? null }),
    signup: { ...ACCOUNT, mode: "embedded" },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (window as { FB?: unknown }).FB;
});

// ─── A backend without them ──────────────────────────────────────────────

describe("against a backend from before them", () => {
  it("shows none of it: no switches by kind, no spend, no Connect with Meta, no Broadcasts tab", async () => {
    Object.assign(state, { reach: routeMissing(), spend: routeMissing(), broadcasts: routeMissing(), account: NOT_CONNECTED });
    render(<WhatsAppSettingsPage />);
    expect(await screen.findByRole("form", { name: "Connect WhatsApp" })).toBeInTheDocument();
    await waitFor(() => expect(calls.some((c) => c.path.endsWith("/account/reach"))).toBe(true));
    expect(screen.queryByRole("button", { name: /Connect with Meta/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Broadcasts" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "This month" })).not.toBeInTheDocument();
  });

  it("says broadcasts aren't available yet on their page", async () => {
    Object.assign(state, { reach: routeMissing(), broadcasts: routeMissing() });
    render(<WhatsAppBroadcastsPage />);
    expect(await screen.findByText(/Broadcasts from your own number aren't available yet/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /New broadcast/ })).not.toBeInTheDocument();
  });
});

// ─── Routing by kind ─────────────────────────────────────────────────────

describe("which deliveries go from the number", () => {
  it("switches each kind on its own, under the master switch", async () => {
    const ok = vi.spyOn(toast, "success");
    render(<WhatsAppSettingsPage />);
    const group = await screen.findByRole("group", { name: "Which ones" });
    const reminders = within(group).getByRole("switch", { name: "Day-before reminders" });
    expect(reminders).toBeChecked();
    fireEvent.click(reminders);
    await waitFor(() => expect(calls.find((c) => c.method === "PATCH" && c.path.endsWith("/account/routing"))?.body).toEqual({ reminders: false }));
    await waitFor(() => expect(within(group).getByRole("switch", { name: "Day-before reminders" })).not.toBeChecked());
    expect(ok).toHaveBeenCalledWith("Day-before reminders will go from MyOtherApp's number.");
    expect(within(group).getByRole("switch", { name: "Tickets" })).toBeChecked();
  });

  it("can't be changed with the master switch off, nor by someone who doesn't manage the number", async () => {
    state.account = { ...ACCOUNT, routing: false };
    const { unmount } = render(<WhatsAppSettingsPage />);
    const group = await screen.findByRole("group", { name: "Which ones" });
    expect(within(group).getByRole("switch", { name: "Tickets" })).toBeDisabled();
    expect(within(group).getByText(/Turn on sending from this number/)).toBeInTheDocument();
    unmount();
    state.account = { ...ACCOUNT, can_manage: false };
    render(<WhatsAppSettingsPage />);
    const again = await screen.findByRole("group", { name: "Which ones" });
    expect(within(again).getByRole("switch", { name: "Certificates" })).toBeDisabled();
  });
});

// ─── This month ──────────────────────────────────────────────────────────

describe("this month's spend", () => {
  it("shows Meta's approximate figure by category, the sends from the number and the fallbacks", async () => {
    render(<WhatsAppSettingsPage />);
    const card = await screen.findByRole("region", { name: "This month" });
    const marketing = within(card).getByRole("row", { name: /Marketing/ });
    expect(within(marketing).getByText("150")).toBeInTheDocument();
    expect(within(marketing).getByText("₹129.47")).toBeInTheDocument();
    expect(within(within(card).getByRole("row", { name: /Total/ })).getByText("₹175.47")).toBeInTheDocument();
    expect(within(card).getByText(/calls approximate/)).toBeInTheDocument();
    expect(within(card).getByText(/Meta's figure, read/)).toBeInTheDocument();
    expect(within(card).getByText("6")).toBeInTheDocument();
    expect(within(card).getByText(/3 went from MyOtherApp's number instead/)).toBeInTheDocument();
    expect(within(card).getByText(/The template is paused for poor quality \(132015\)/)).toBeInTheDocument();
    // Read once: the page never asks Meta, and asks the backend once.
    expect(calls.filter((c) => c.path.endsWith("/spend"))).toHaveLength(1);
  });

  it("says when Meta's figure hasn't been read yet this month", async () => {
    state.spend = { ...SPEND, fetched_at: null, categories: [], volume: 0, cost: 0, fallbacks: [], fallback_total: 0 };
    render(<WhatsAppSettingsPage />);
    const card = await screen.findByRole("region", { name: "This month" });
    expect(within(card).getByText("Not read from Meta yet this month")).toBeInTheDocument();
    expect(within(card).getByText(/read once a day/)).toBeInTheDocument();
    expect(within(card).getByText(/Nothing fell back/)).toBeInTheDocument();
  });
});

// ─── Connect with Meta ───────────────────────────────────────────────────

const FINISH = {
  type: "WA_EMBEDDED_SIGNUP",
  event: "FINISH",
  data: { phone_number_id: "109876543210", is_on_biz_app: false, messaging_account_ids: ["102938475610"], primary_waac_ids: [], business_id: "2729063490586005" },
};

function stubFacebook(behaviour: (cb: (r: { authResponse?: { code?: string } | null }) => void) => void) {
  const fb = { init: vi.fn(), login: vi.fn((cb: (r: { authResponse?: { code?: string } | null }) => void) => behaviour(cb)) };
  (window as { FB?: unknown }).FB = fb;
  return fb;
}

const post = (data: unknown, origin = "https://www.facebook.com") =>
  window.dispatchEvent(new MessageEvent("message", { origin, data: JSON.stringify(data) }));

describe("Connect with Meta", () => {
  it("isn't offered while the backend has it off; pasting keys is", async () => {
    state.account = NOT_CONNECTED;
    render(<WhatsAppSettingsPage />);
    expect(await screen.findByRole("form", { name: "Connect WhatsApp" })).toBeInTheDocument();
    await waitFor(() => expect(calls.some((c) => c.path.endsWith("/account/reach"))).toBe(true));
    expect(screen.queryByRole("button", { name: /Connect with Meta/ })).not.toBeInTheDocument();
  });

  it("opens Meta's flow (v5, a code) and posts the code with the session's ids at once", async () => {
    Object.assign(state, { account: NOT_CONNECTED, reach: { ...REACH, embedded_signup: ES_CONFIG } });
    const ok = vi.spyOn(toast, "success");
    const fb = stubFacebook((cb) => {
      post(FINISH);
      cb({ authResponse: { code: "AQBcode-123" } });
    });
    render(<WhatsAppSettingsPage />);
    fireEvent.click(await screen.findByRole("button", { name: /Connect with Meta/ }));
    await waitFor(() => expect(calls.some((c) => c.path.endsWith("/account/embedded-signup"))).toBe(true));
    expect(fb.init).toHaveBeenCalledWith(expect.objectContaining({ appId: ES_CONFIG.app_id, version: "v24.0" }));
    expect(fb.login).toHaveBeenCalledWith(expect.any(Function), {
      config_id: ES_CONFIG.config_id,
      response_type: "code",
      override_default_response_type: true,
      extras: { version: "v5" },
    });
    expect(calls.find((c) => c.path.endsWith("/account/embedded-signup"))?.body).toEqual({
      code: "AQBcode-123",
      phone_number_id: "109876543210",
      messaging_account_ids: ["102938475610"],
      waba_id: null,
      business_id: "2729063490586005",
      is_on_biz_app: false,
      event: "FINISH",
    });
    await waitFor(() => expect(ok).toHaveBeenCalledWith("Connected +91 98470 12345 with Meta."));
  });

  it("says where it was left when cancelled, and keeps it for Meta's support", async () => {
    Object.assign(state, { account: NOT_CONNECTED, reach: { ...REACH, embedded_signup: ES_CONFIG } });
    stubFacebook((cb) => {
      post({ type: "WA_EMBEDDED_SIGNUP", event: "CANCEL", data: { current_step: "PHONE_NUMBER_SETUP" } });
      cb({ authResponse: null });
    });
    render(<WhatsAppSettingsPage />);
    fireEvent.click(await screen.findByRole("button", { name: /Connect with Meta/ }));
    expect(await screen.findByText(/left while adding the phone number/)).toBeInTheDocument();
    await waitFor(() =>
      expect(calls.find((c) => c.path.endsWith("/embedded-signup/event"))?.body).toEqual({ event: "CANCEL", current_step: "PHONE_NUMBER_SETUP" }),
    );
    expect(calls.some((c) => c.path.endsWith("/account/embedded-signup"))).toBe(false);
  });

  it("passes on the error the person reported in Meta's flow", async () => {
    Object.assign(state, { account: NOT_CONNECTED, reach: { ...REACH, embedded_signup: ES_CONFIG } });
    stubFacebook((cb) => {
      post({ type: "WA_EMBEDDED_SIGNUP", event: "CANCEL", data: { error_message: "Your verified name violates WhatsApp guidelines.", error_code: "524126", session_id: "f34b51dab5e0498" } });
      cb({ authResponse: null });
    });
    render(<WhatsAppSettingsPage />);
    fireEvent.click(await screen.findByRole("button", { name: /Connect with Meta/ }));
    expect(await screen.findByText(/verified name violates WhatsApp guidelines.*code 524126, session f34b51dab5e0498/)).toBeInTheDocument();
    await waitFor(() =>
      expect(calls.find((c) => c.path.endsWith("/embedded-signup/event"))?.body).toEqual({
        event: "ERROR", error_message: "Your verified name violates WhatsApp guidelines.", error_code: "524126", session_id: "f34b51dab5e0498",
      }),
    );
  });

  it("says to connect again when the code expired", async () => {
    Object.assign(state, {
      account: NOT_CONNECTED,
      reach: { ...REACH, embedded_signup: ES_CONFIG },
      signup: new ApiError({ message: "Meta's sign-in expired", status: 422, errorCode: "EMBEDDED_SIGNUP_CODE_EXPIRED" }),
    });
    stubFacebook((cb) => {
      post(FINISH);
      cb({ authResponse: { code: "AQBold" } });
    });
    render(<WhatsAppSettingsPage />);
    fireEvent.click(await screen.findByRole("button", { name: /Connect with Meta/ }));
    expect(await screen.findByText(/expired before it could be finished\. Click Connect with Meta again/)).toBeInTheDocument();
  });

  it("only listens to facebook.com, and waits a moment for the ids when the code comes first", async () => {
    expect(fromFacebook("https://www.facebook.com")).toBe(true);
    expect(fromFacebook("https://web.facebook.com")).toBe(true);
    expect(fromFacebook("https://evilfacebook.com")).toBe(false);
    expect(fromFacebook("https://facebook.com.example")).toBe(false);
    expect(parseSignupMessage({ origin: "https://example.com", data: JSON.stringify(FINISH) })).toBeNull();
    expect(parseSignupMessage({ origin: "https://www.facebook.com", data: "not json" })).toBeNull();
    expect(parseSignupMessage({ origin: "https://www.facebook.com", data: JSON.stringify({ type: "OTHER" }) })).toBeNull();
    // v4's waba_id still reads.
    expect(parseSignupMessage({ origin: "https://www.facebook.com", data: { type: "WA_EMBEDDED_SIGNUP", event: "FINISH", data: { waba_id: "5", phone_number_id: "6" } } }))
      .toMatchObject({ event: "FINISH", waba_id: "5", phone_number_id: "6" });

    vi.useFakeTimers();
    try {
      type Callback = (r: { authResponse?: { code?: string } | null }) => void;
      const held: { login: Callback } = { login: () => {} };
      const fb = { init: vi.fn(), login: vi.fn((cb: Callback) => (held.login = cb)) };
      // The code first, then (a moment later) the ids -- the ids are waited for.
      const pending = runEmbeddedSignup(fb as never, ES_CONFIG, { waitForIdsMs: 1000 });
      held.login({ authResponse: { code: "C1" } });
      await act(async () => {
        vi.advanceTimersByTime(300);
        post(FINISH);
      });
      await expect(pending).resolves.toMatchObject({ kind: "finish", code: "C1", info: { messaging_account_ids: ["102938475610"] } });
      // No ids at all: the code goes without them once the wait is over (the backend reads the account from the token).
      const alone = runEmbeddedSignup(fb as never, ES_CONFIG, { waitForIdsMs: 1000 });
      held.login({ authResponse: { code: "C2" } });
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });
      await expect(alone).resolves.toEqual({ kind: "finish", code: "C2", info: null });
    } finally {
      vi.useRealTimers();
    }
  });

  it("notes a number connected with Meta, and when its sign-in runs out", async () => {
    state.reach = { ...REACH, mode: "embedded", token_expires_at: ahead(30 * 24 * HOUR) };
    render(<WhatsAppSettingsPage />);
    expect(await screen.findByText(/Connected with Meta\./)).toBeInTheDocument();
    expect(screen.getByText(/connect with Meta again before then/)).toBeInTheDocument();
  });
});

// ─── Broadcasts ──────────────────────────────────────────────────────────

describe("broadcasts", () => {
  it("are a tab once the API has them, and list how each went", async () => {
    render(<WhatsAppBroadcastsPage />);
    expect(await screen.findByRole("link", { name: "Broadcasts" })).toHaveAttribute("href", "/whatsapp/broadcasts");
    const sent = await screen.findByRole("region", { name: "Event update event_news" });
    expect(within(sent).getByText("Build Night", { exact: false })).toBeInTheDocument();
    expect(within(sent).getByText(/120 people · 110 sent · 100 delivered · 40 read · 6 failed/)).toBeInTheDocument();
    fireEvent.click(within(sent).getByText(/Why some didn't get it/));
    expect(within(sent).getByText(/WhatsApp can't reach this number/)).toBeInTheDocument();
    expect(within(sent).getByText(/They stopped your marketing messages in WhatsApp/)).toBeInTheDocument();
    expect(within(sent).getByText(/Skipped: asked you to stop × 3/)).toBeInTheDocument();
    expect(within(sent).getByText(/Skipped: never said yes × 5/)).toBeInTheDocument();
  });

  it("cancels a scheduled one", async () => {
    render(<WhatsAppBroadcastsPage />);
    const scheduled = await screen.findByRole("region", { name: "Promotion club_offer" });
    expect(within(scheduled).getByText("Scheduled")).toBeInTheDocument();
    fireEvent.click(within(scheduled).getByRole("button", { name: /Cancel/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancel broadcast" }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.path.endsWith("/broadcasts/8/cancel"))).toBe(true));
  });

  it("composes an event update: values mapped, previewed with Meta's cost and GST apart, then sent", async () => {
    const ok = vi.spyOn(toast, "success");
    render(<WhatsAppBroadcastsPage />);
    fireEvent.click(await screen.findByRole("button", { name: /New broadcast/ }));
    const composer = await screen.findByRole("region", { name: "New broadcast" });
    // Only approved UTILITY or MARKETING templates without a media header.
    const picker = within(composer).getByLabelText("Template") as HTMLSelectElement;
    await waitFor(() => expect(within(picker).getAllByRole("option")).toHaveLength(3));
    fireEvent.change(picker, { target: { value: "event_news|en" } });
    expect(within(composer).getByText(/Event update: A UTILITY template/)).toBeInTheDocument();
    await waitFor(() => expect(within(within(composer).getByLabelText("Event") as HTMLSelectElement).getAllByRole("option")).toHaveLength(2));
    fireEvent.change(within(composer).getByLabelText("Event"), { target: { value: "3" } });
    fireEvent.change(within(composer).getByLabelText("What fills {{2}}"), { target: { value: "event_name" } });
    fireEvent.change(within(composer).getByLabelText("Your words for {{3}}"), { target: { value: "The hall moved to Lab 3." } });
    expect(within(composer).getByRole("button", { name: /Send/ })).toBeDisabled();

    fireEvent.click(within(composer).getByRole("button", { name: "Preview" }));
    const shown = await within(composer).findByRole("status", { name: "Preview" });
    const sentBody = {
      template: "event_news", language: "en", kind: "event_update", event_id: 3,
      variables: { header: [], body: [{ source: "name" }, { source: "event_name" }, { source: "text", value: "The hall moved to Lab 3." }], buttons: {} },
      scheduled_at: null,
    };
    expect(calls.find((c) => c.path.endsWith("/broadcasts/preview"))?.body).toEqual(sentBody);
    expect(within(shown).getByText("2 people get it")).toBeInTheDocument();
    expect(within(shown).getByText(/1 asked you to stop, 4 never said yes, 1 have no number WhatsApp reaches/)).toBeInTheDocument();
    expect(within(shown).getByText(/₹0\.1150 a message/)).toBeInTheDocument();
    expect(within(shown).getByText(/GST 18%/)).toBeInTheDocument();
    expect(within(shown).getByText("₹0.27")).toBeInTheDocument();
    expect(within(shown).getByText(/An estimate/)).toBeInTheDocument();
    expect(within(shown).getByText(/The hall moved to Lab 3/)).toBeInTheDocument();

    fireEvent.click(within(composer).getByRole("button", { name: "Send to 2" }));
    await waitFor(() => expect(calls.find((c) => c.method === "POST" && c.path === "/api/v1/clubs/whatsapp/broadcasts")?.body).toEqual(sentBody));
    await waitFor(() => expect(ok).toHaveBeenCalledWith("Sending to 2 people."));
  });

  it("schedules a promotion, its link's value the club's own, and says the messaging limit spreads it", async () => {
    state.preview = { ...PREVIEW, kind: "promotion", category: "MARKETING", recipients: 2500,
      estimate: { ...PREVIEW.estimate, rate: 0.8631, messaging_limit: { tier: "TIER_1K", per_day: 1000, used_today: 0, today: 1000, days: 3 } } };
    render(<WhatsAppBroadcastsPage />);
    fireEvent.click(await screen.findByRole("button", { name: /New broadcast/ }));
    const composer = await screen.findByRole("region", { name: "New broadcast" });
    await waitFor(() => expect(within(within(composer).getByLabelText("Template")).getAllByRole("option")).toHaveLength(3));
    fireEvent.change(within(composer).getByLabelText("Template"), { target: { value: "club_offer|en" } });
    expect(within(composer).getByText(/Promotion: A MARKETING template/)).toBeInTheDocument();
    fireEvent.change(within(composer).getByLabelText("Your words for {{2}}"), { target: { value: "20% off the workshop." } });
    fireEvent.change(within(composer).getByLabelText('Your words for Button "See it"'), { target: { value: "workshop-26" } });
    fireEvent.click(within(composer).getByLabelText("Schedule"));
    fireEvent.change(within(composer).getByLabelText("When it goes"), { target: { value: "2026-11-02T18:30" } });
    fireEvent.click(within(composer).getByRole("button", { name: "Preview" }));
    const shown = await within(composer).findByRole("status", { name: "Preview" });
    expect(within(shown).getByText(/may reach 1,000 people a day: 1000 go today, the rest over the next 2 days/)).toBeInTheDocument();
    const body = calls.find((c) => c.path.endsWith("/broadcasts/preview"))?.body as Record<string, unknown>;
    expect(body).toMatchObject({
      template: "club_offer", kind: "promotion", event_id: null,
      variables: { header: [], body: [{ source: "name" }, { source: "text", value: "20% off the workshop." }], buttons: { "0": { source: "text", value: "workshop-26" } } },
    });
    expect(body.scheduled_at).toBe(new Date("2026-11-02T18:30").toISOString());
    fireEvent.click(within(composer).getByRole("button", { name: "Schedule" }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.path === "/api/v1/clubs/whatsapp/broadcasts")).toBe(true));
  });

  it("shows the server's refusal beside the value it is about", async () => {
    state.preview = new ApiError({ message: "Write the words that fill this value.", status: 422, errorCode: "INVALID_BROADCAST", fieldErrors: { field: "body.2" } as never });
    render(<WhatsAppBroadcastsPage />);
    fireEvent.click(await screen.findByRole("button", { name: /New broadcast/ }));
    const composer = await screen.findByRole("region", { name: "New broadcast" });
    await waitFor(() => expect(within(within(composer).getByLabelText("Template")).getAllByRole("option")).toHaveLength(3));
    fireEvent.change(within(composer).getByLabelText("Template"), { target: { value: "event_news|en" } });
    await waitFor(() => expect(within(within(composer).getByLabelText("Event") as HTMLSelectElement).getAllByRole("option")).toHaveLength(2));
    fireEvent.change(within(composer).getByLabelText("Event"), { target: { value: "3" } });
    fireEvent.click(within(composer).getByRole("button", { name: "Preview" }));
    expect(await within(composer).findByText("Write the words that fill this value.")).toBeInTheDocument();
    expect(within(composer).queryByRole("status", { name: "Preview" })).not.toBeInTheDocument();
  });

  it("asks for the event of an update before anything is sent to the server", async () => {
    render(<WhatsAppBroadcastsPage />);
    fireEvent.click(await screen.findByRole("button", { name: /New broadcast/ }));
    const composer = await screen.findByRole("region", { name: "New broadcast" });
    await waitFor(() => expect(within(within(composer).getByLabelText("Template")).getAllByRole("option")).toHaveLength(3));
    fireEvent.change(within(composer).getByLabelText("Template"), { target: { value: "event_news|en" } });
    fireEvent.click(within(composer).getByRole("button", { name: "Preview" }));
    expect(await within(composer).findByText(/Pick the event whose registrants get this update/)).toBeInTheDocument();
    expect(calls.some((c) => c.path.endsWith("/broadcasts/preview"))).toBe(false);
  });

  it("are the club's team's alone: an admin acting as the club is told so", async () => {
    state.broadcasts = new ApiError({ message: "private", status: 403, errorCode: "WHATSAPP_PRIVATE" });
    render(<WhatsAppBroadcastsPage />);
    expect(await screen.findByText(/messages are for its own team/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /New broadcast/ })).not.toBeInTheDocument();
  });

  it("can't be started without a working number, and says where to connect it", async () => {
    state.account = NOT_CONNECTED;
    render(<WhatsAppBroadcastsPage />);
    expect(await screen.findByText(/Connect your club's WhatsApp number first/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /New broadcast/ })).not.toBeInTheDocument();
  });
});

describe("the composer's helpers", () => {
  it("offers only templates a broadcast can carry, and asks for each of their values", () => {
    const parsed = TEMPLATES.items.map((t) => templateSchema.parse(t));
    expect(broadcastable(parsed).map((t) => t.name)).toEqual(["event_news", "club_offer"]);
    const offer = parsed[1];
    const slots = slotsOf(offer);
    expect(slots.map((s) => `${s.section}.${s.key}`)).toEqual(["body.0", "body.1", "buttons.0"]);
    expect(variablesFor(slots, { "body.1": { source: "event_date" } })).toEqual({
      header: [],
      body: [{ source: "text", value: "" }, { source: "event_date" }],
      buttons: { "0": { source: "text", value: "" } },
    });
  });
});
