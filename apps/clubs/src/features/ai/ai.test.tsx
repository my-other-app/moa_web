import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { toApiError } from "@moa/api";

/**
 * AI assist in the dashboard, against the backend's contract:
 *
 *   GET  /clubs/ai/status → {enabled, plan_allows, used, limit, resets_at, byok, provider}
 *   POST /clubs/ai/write {kind, language, tone, prompt, event_id} → {text, subject}
 *   GET  /events/{id}/ai/feedback-summary → {summary|null, responses, generated_at, cached}
 *   POST /events/{id}/ai/feedback-summary/refresh → the same, made again
 *   GET/PUT/DELETE /clubs/ai/key (owner and admins; PUT 422 AI_KEY_INVALID)
 *
 * and its refusals: 403 AI_DISABLED, 403 PLAN_FEATURE_LOCKED (the plan's
 * upgrade dialog), 429 AI_QUOTA_REACHED, 503 AI_UNAVAILABLE, 401
 * AI_KEY_INVALID and 402 AI_KEY_QUOTA (the club's own key).
 */

const STATUS = { enabled: true, plan_allows: true, used: 12, limit: 150, resets_at: "2026-11-01T00:00:00+05:30", byok: false, provider: null };
const BYOK = { ...STATUS, byok: true, provider: "anthropic", used: 0, limit: null };

const SUMMARY = {
  summary: {
    loved: ["The hands-on session", "Free pizza"],
    complaints: ["Wi-Fi kept dropping"],
    fix_next: ["Book a hall with better Wi-Fi"],
    sentiment: "positive",
    quotes: ["Best workshop this year!", "Loved the mentors", "Too short", "A fourth quote that should not show"],
  },
  responses: 23,
  generated_at: new Date(Date.now() - 2 * 3_600_000).toISOString(),
  cached: true,
};

const MODELS = { gemini: ["gemini-2.5-flash", "gemini-2.5-pro"], anthropic: ["claude-haiku-4-5", "claude-sonnet-4-5"] };
const NO_KEY = { connected: false, provider: null, model: null, key_last4: null, verified_at: null, models: MODELS };
const A_KEY = { connected: true, provider: "anthropic", model: "claude-sonnet-4-5", key_last4: "9xYz", verified_at: new Date(Date.now() - 60_000).toISOString(), models: MODELS };

const me = (role: "owner" | "admin" | "editor" | "door") => ({
  role,
  role_label: role[0]!.toUpperCase() + role.slice(1),
  role_description: "",
  can: { manage_access: role === "owner", see_access: role !== "door", money: role === "owner" || role === "admin", club_profile: role !== "door", edit_events: role !== "door", delete_events: role === "owner", door: true },
  club_id: 5,
  club_name: "Neural Tide",
  member: null,
});

/** The catalogue, so the plan lock can name the plan that has AI. */
const CATALOG = {
  currency: "INR",
  yearly_months_free: 2,
  plans: [
    { id: 1, key: "free", name: "Free", tagline: null, price_monthly_paise: 0, price_yearly_paise: 0, trial_days: 0, contact_sales: false, featured: false, limits: {}, features: [{ key: "ai_assist", label: "AI assist", included: false }] },
    { id: 2, key: "growth", name: "Growth", tagline: null, price_monthly_paise: 99900, price_yearly_paise: 999000, trial_days: 0, contact_sales: false, featured: true, limits: {}, features: [{ key: "ai_assist", label: "AI assist", included: true }] },
  ],
};
const ENT_FREE = { plan_key: "free", plan_name: "Free", limits: {}, features: { ai_assist: false }, usage: {}, enforced: true, configured: true };

type Answer = unknown | (() => unknown);
const state: Record<string, Answer> = {};
const calls: Array<{ method: string; path: string; body?: unknown }> = [];

async function answer(value: Answer) {
  const v = typeof value === "function" ? await (value as () => unknown)() : value;
  if (v instanceof Error) throw v;
  return v;
}

/** A refusal exactly as the gateway hands it over, through the app's own parser. */
const refusal = (status: number, error_code: string | null, message = "No.", errors?: unknown) =>
  toApiError(new Response(JSON.stringify({ message, error_code, ...(errors ? { errors } : {}) }), { status, headers: { "Content-Type": "application/json" } }));

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        calls.push({ method: "GET", path });
        if (path === "/api/v1/clubs/ai/status") return answer(state.status);
        if (path === "/api/v1/clubs/ai/key") return answer(state.key);
        if (path === "/api/v1/clubs/access/me") return answer(state.me);
        if (path === "/api/v1/clubs/entitlements") return answer(state.ent);
        if (path === "/api/v1/plans") return CATALOG;
        if (/^\/api\/v1\/events\/\d+\/ai\/feedback-summary$/.test(path)) return answer(state.summary);
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(async (path: string, body?: unknown) => {
        calls.push({ method: "POST", path, body });
        if (path === "/api/v1/clubs/ai/write") return answer(state.write);
        if (/\/ai\/feedback-summary\/refresh$/.test(path)) return answer(state.refresh);
        throw new Error(`unstubbed POST ${path}`);
      }),
      put: vi.fn(async (path: string, body?: unknown) => {
        calls.push({ method: "PUT", path, body });
        if (path === "/api/v1/clubs/ai/key") return answer(state.put);
        throw new Error(`unstubbed PUT ${path}`);
      }),
      del: vi.fn(async (path: string) => {
        calls.push({ method: "DELETE", path });
        if (path === "/api/v1/clubs/ai/key") return answer(state.del);
        throw new Error(`unstubbed DELETE ${path}`);
      }),
      patch: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { WriteWithAi, FeedbackSummaryCard, AiKeyCard, AiUsagePanel, usageLine, aiStatusSchema, aiProblem, promptWithContext } = await import("./index");
const { PlanLockHost } = await import("@/features/plan");

beforeEach(() => {
  calls.length = 0;
  Object.assign(state, {
    status: STATUS,
    key: NO_KEY,
    me: me("owner"),
    ent: {},
    summary: SUMMARY,
    refresh: SUMMARY,
    write: { text: "Join us for a hands-on Flutter night.", subject: null },
    put: A_KEY,
    del: {},
  });
});

const posts = (path: string) => calls.filter((c) => c.method === "POST" && c.path === path);

/** An editor with "Write with AI" beside it, as the composers have, inside a form whose submit is watched. */
function Editor({ kind = "event_description", eventId = 7, initial = "", subject: initialSubject, onOuterSubmit }: { kind?: "event_description" | "email" | "announcement"; eventId?: number | null; initial?: string; subject?: string; onOuterSubmit?: () => void }) {
  const [value, setValue] = React.useState(initial);
  const [subject, setSubject] = React.useState(initialSubject ?? "");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onOuterSubmit?.();
      }}
    >
      {initialSubject !== undefined ? <input aria-label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} /> : null}
      <textarea aria-label="Body" value={value} onChange={(e) => setValue(e.target.value)} />
      <WriteWithAi kind={kind} eventId={eventId} value={value} onChange={setValue} subject={initialSubject !== undefined ? { value: subject, onChange: setSubject } : undefined} />
    </form>
  );
}

async function openWriter() {
  fireEvent.click(await screen.findByRole("button", { name: /Write with AI/ }));
  return screen.findByRole("dialog", { name: /Write with AI/ });
}

async function write(dialog: HTMLElement, prompt = "Flutter workshop for beginners") {
  fireEvent.change(within(dialog).getByLabelText("What should it say?"), { target: { value: prompt } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Write it" }));
}

// ─── The status ──────────────────────────────────────────────────────────

describe("the status line", () => {
  it("reads the month's count and the reset day, or the club's own key", () => {
    expect(usageLine(aiStatusSchema.parse(STATUS))).toBe("AI actions: 12 of 150 this month, resets 1 Nov");
    expect(usageLine(aiStatusSchema.parse(BYOK))).toBe("Using your own Claude key");
    expect(usageLine(aiStatusSchema.parse({ ...BYOK, provider: "gemini" }))).toBe("Using your own Gemini key");
    expect(usageLine(aiStatusSchema.parse({ ...STATUS, limit: null }))).toBe("AI actions: 12 this month, no monthly limit");
  });

  it("reads a server from before BYOK (no byok, no provider) as the platform's AI", () => {
    const { byok, provider, ...older } = STATUS;
    void byok;
    void provider;
    expect(aiStatusSchema.parse(older)).toMatchObject({ byok: false, provider: null });
  });

  it("puts what the page knows after the organiser's words, and never past 2,000 characters", () => {
    expect(promptWithContext("Short and friendly", "Hack Night, Sat 8 Nov")).toBe("Short and friendly\n\nAbout the event: Hack Night, Sat 8 Nov");
    expect(promptWithContext("", "Hack Night")).toBe("About the event: Hack Night");
    expect(promptWithContext("x".repeat(1990), "y".repeat(500)).length).toBeLessThanOrEqual(2000);
  });
});

describe("where AI shows", () => {
  it("hides every entry point while AI is switched off, and asks for nothing else", async () => {
    state.status = { ...STATUS, enabled: false };
    render(
      <>
        <Editor />
        <FeedbackSummaryCard eventId={5} />
        <AiUsagePanel />
        <AiKeyCard />
      </>,
    );
    await waitFor(() => expect(calls.some((c) => c.path === "/api/v1/clubs/ai/status")).toBe(true));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole("button", { name: /Write with AI/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /AI summary/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "AI assist" })).not.toBeInTheDocument();
    expect(screen.queryByText("Your own AI key")).not.toBeInTheDocument();
    expect(calls.map((c) => c.path)).not.toContain("/api/v1/clubs/ai/key");
    expect(calls.some((c) => c.path.includes("feedback-summary"))).toBe(false);
  });

  it("stays hidden on a server without AI (the status 404s)", async () => {
    state.status = () => refusal(404, null, "Not Found");
    render(<Editor />);
    await waitFor(() => expect(calls.some((c) => c.path === "/api/v1/clubs/ai/status")).toBe(true));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole("button", { name: /Write with AI/ })).not.toBeInTheDocument();
  });

  it("shows the plan's lock when the plan has no AI, and opens the upgrade dialog naming the plan that has it", async () => {
    state.status = { ...STATUS, plan_allows: false };
    state.ent = ENT_FREE;
    render(
      <>
        <PlanLockHost />
        <Editor />
        <FeedbackSummaryCard eventId={5} />
      </>,
    );
    const button = await screen.findByRole("button", { name: /Write with AI/ });
    await waitFor(() => expect(within(button).getByLabelText("Locked: part of Growth and up")).toBeInTheDocument());
    fireEvent.click(button);
    expect(await screen.findByRole("dialog", { name: "AI assist is part of Growth and up" })).toBeInTheDocument();
    // The summary card says what it would do, and asks for no summary it cannot have.
    expect(screen.getByRole("region", { name: /AI summary/ })).toHaveTextContent("AI reads every comment");
    expect(calls.some((c) => c.path.includes("feedback-summary"))).toBe(false);
  });

  it("works on any plan with the club's own key, and shows the key rather than a count", async () => {
    state.status = BYOK;
    render(
      <>
        <Editor />
        <AiUsagePanel />
      </>,
    );
    const panel = await screen.findByRole("region", { name: "AI assist" });
    expect(panel).toHaveTextContent("Using your own Claude key");
    expect(panel).toHaveTextContent("AI actions bill your Claude account");
    expect(panel).not.toHaveTextContent(/of \d+/);
    const dialog = await openWriter();
    expect(within(dialog).getByText("Using your own Claude key")).toBeInTheDocument();
  });

  it("shows the month's count on Plan & billing, amber once it is used up", async () => {
    render(<AiUsagePanel />);
    const panel = await screen.findByRole("region", { name: "AI assist" });
    expect(panel).toHaveTextContent("12 of 150 AI actions this month");
    expect(panel).toHaveTextContent("Resets 1 Nov");
    expect(within(panel).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "12");
    expect(within(panel).getByRole("link", { name: "Use your own Gemini or Claude key" })).toHaveAttribute("href", "/payments#ai-key");
  });
});

// ─── Write with AI ───────────────────────────────────────────────────────

describe("Write with AI", () => {
  it("sends the kind, language, tone, prompt and event, and inserts the words after what is there", async () => {
    render(<Editor initial="Doors open at 5." />);
    const dialog = await openWriter();
    expect(within(dialog).getByLabelText("What it's for")).toHaveValue("event_description");
    expect(within(dialog).getByText("AI actions: 12 of 150 this month, resets 1 Nov")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("radio", { name: "Malayalam" }));
    fireEvent.click(within(dialog).getByRole("radio", { name: "Hype" }));
    await write(dialog);

    expect(await within(dialog).findByTestId("ai-write-result")).toHaveTextContent("Join us for a hands-on Flutter night.");
    expect(posts("/api/v1/clubs/ai/write")[0]!.body).toEqual({ kind: "event_description", language: "ml", tone: "hype", prompt: "Flutter workshop for beginners", event_id: 7 });

    fireEvent.click(within(dialog).getByRole("button", { name: "Insert" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByLabelText("Body")).toHaveValue("Doors open at 5.\n\nJoin us for a hands-on Flutter night.");
  });

  it("replaces what is there, and asks again on Try again", async () => {
    render(<Editor initial="Old words" />);
    const dialog = await openWriter();
    await write(dialog);
    await within(dialog).findByTestId("ai-write-result");
    state.write = { text: "A second go.", subject: null };
    fireEvent.click(within(dialog).getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(within(dialog).getByTestId("ai-write-result")).toHaveTextContent("A second go."));
    expect(posts("/api/v1/clubs/ai/write")).toHaveLength(2);

    fireEvent.click(within(dialog).getByRole("button", { name: "Replace" }));
    await waitFor(() => expect(screen.getByLabelText("Body")).toHaveValue("A second go."));
  });

  it("fills an email's subject: when empty on Insert, always on Replace", async () => {
    state.write = { text: "Hi {{first_name}}, see you tomorrow.", subject: "See you tomorrow" };
    const { unmount } = render(<Editor kind="email" eventId={9} subject="" />);
    let dialog = await openWriter();
    expect(within(dialog).getByLabelText("What it's for")).toHaveValue("email");
    await write(dialog, "Reminder for tomorrow");
    expect(await within(dialog).findByText("See you tomorrow")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Insert" }));
    await waitFor(() => expect(screen.getByLabelText("Subject")).toHaveValue("See you tomorrow"));
    expect(screen.getByLabelText("Body")).toHaveValue("Hi {{first_name}}, see you tomorrow.");
    unmount();

    // A subject the organiser wrote stays on Insert, and goes on Replace.
    render(<Editor kind="email" eventId={9} subject="My own subject" initial="Mine" />);
    dialog = await openWriter();
    await write(dialog);
    await within(dialog).findByTestId("ai-write-result");
    fireEvent.click(within(dialog).getByRole("button", { name: "Insert" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByLabelText("Subject")).toHaveValue("My own subject");

    dialog = await openWriter();
    await write(dialog);
    await within(dialog).findByTestId("ai-write-result");
    fireEvent.click(within(dialog).getByRole("button", { name: "Replace" }));
    await waitFor(() => expect(screen.getByLabelText("Subject")).toHaveValue("See you tomorrow"));
  });

  it("never submits the form it sits in (an announcement's Send)", async () => {
    const outer = vi.fn();
    render(<Editor onOuterSubmit={outer} />);
    const dialog = await openWriter();
    await write(dialog);
    await within(dialog).findByTestId("ai-write-result");
    expect(outer).not.toHaveBeenCalled();
  });

  it.each([
    ["429 AI_QUOTA_REACHED", () => refusal(429, "AI_QUOTA_REACHED"), "You've used all 150 AI actions this month. They reset on 1 Nov."],
    ["503 AI_UNAVAILABLE", () => refusal(503, "AI_UNAVAILABLE"), "AI is busy, try again in a minute."],
    ["403 AI_DISABLED", () => refusal(403, "AI_DISABLED"), "AI assist is switched off for now."],
    ["401 AI_KEY_INVALID", () => refusal(401, "AI_KEY_INVALID", "Your AI key was rejected. Update it in Settings → AI"), "Your AI key was rejected. Update it under Payments → Your own AI key."],
    ["402 AI_KEY_QUOTA", () => refusal(402, "AI_KEY_QUOTA", "Your AI provider says your key is out of credit"), "Your AI provider says your key is out of credit."],
  ])("explains %s", async (_name, error, text) => {
    state.write = error;
    render(<Editor />);
    const dialog = await openWriter();
    await write(dialog);
    const alert = await within(dialog).findByRole("alert");
    expect(alert).toHaveTextContent(text);
    if (_name.includes("AI_KEY")) expect(within(alert).getByRole("link", { name: "Your AI key" })).toHaveAttribute("href", "/payments#ai-key");
    // The words never arrived, so nothing changed in the editor.
    expect(screen.getByLabelText("Body")).toHaveValue("");
  });

  it("reads a plan refusal as the upgrade dialog's, not as an error of its own", async () => {
    state.write = () => refusal(403, "PLAN_FEATURE_LOCKED", "AI assist is not on your plan.", { feature: "ai_assist", label: "AI assist", required_plan: "growth", required_plan_name: "Growth" });
    render(
      <>
        <PlanLockHost />
        <Editor />
      </>,
    );
    const dialog = await openWriter();
    await write(dialog);
    expect(await screen.findByRole("dialog", { name: "AI assist is part of Growth and up" })).toBeInTheDocument();
    expect(aiProblem(await refusal(403, "PLAN_FEATURE_LOCKED")).plan).toBe(true);
  });
});

// ─── The feedback summary ────────────────────────────────────────────────

describe("the AI summary of the feedback", () => {
  it("shows what people loved, the complaints, what to fix, the mood and at most three quotes", async () => {
    render(<FeedbackSummaryCard eventId={5} />);
    const card = await screen.findByRole("region", { name: /AI summary/ });
    await within(card).findByText("What people loved");
    expect(within(card).getByText("The hands-on session")).toBeInTheDocument();
    expect(within(card).getByText("Complaints")).toBeInTheDocument();
    expect(within(card).getByText("Wi-Fi kept dropping")).toBeInTheDocument();
    expect(within(card).getByText("Fix next time")).toBeInTheDocument();
    expect(within(card).getByText("Mostly positive")).toBeInTheDocument();
    expect(card.querySelectorAll("blockquote")).toHaveLength(3);
    expect(card).not.toHaveTextContent("A fourth quote");
    expect(card).toHaveTextContent("From 23 replies · made 2 h ago");
    expect(within(card).getByText("Uses one AI action")).toBeInTheDocument();
  });

  it("makes it again on Refresh, and shows the new one", async () => {
    render(<FeedbackSummaryCard eventId={5} />);
    const card = await screen.findByRole("region", { name: /AI summary/ });
    await within(card).findByText("What people loved");
    state.refresh = { ...SUMMARY, summary: { ...SUMMARY.summary, sentiment: "mixed", complaints: ["Queues at the door"] }, responses: 30 };
    fireEvent.click(within(card).getByRole("button", { name: "Refresh" }));
    await within(card).findByText("Queues at the door");
    expect(within(card).getByText("Mixed")).toBeInTheDocument();
    expect(posts("/api/v1/events/5/ai/feedback-summary/refresh")).toHaveLength(1);
  });

  it("waits for five responses with comments", async () => {
    state.summary = { summary: null, responses: 3, generated_at: null, cached: false };
    render(<FeedbackSummaryCard eventId={5} />);
    const card = await screen.findByRole("region", { name: /AI summary/ });
    expect(await within(card).findByText("Needs at least 5 responses with comments")).toBeInTheDocument();
    expect(card).toHaveTextContent("3 so far.");
    expect(within(card).queryByRole("button", { name: /Refresh|Summarise/ })).not.toBeInTheDocument();
  });

  it("offers to summarise once there are enough and none has been made", async () => {
    state.summary = { summary: null, responses: 8, generated_at: null, cached: false };
    render(<FeedbackSummaryCard eventId={5} />);
    const card = await screen.findByRole("region", { name: /AI summary/ });
    fireEvent.click(await within(card).findByRole("button", { name: "Summarise" }));
    await within(card).findByText("What people loved");
  });

  it("says loading, then what went wrong, and tries again", async () => {
    let fail = true;
    state.summary = () => (fail ? refusal(503, "AI_UNAVAILABLE") : SUMMARY);
    render(<FeedbackSummaryCard eventId={5} />);
    const card = await screen.findByRole("region", { name: /AI summary/ });
    expect(within(card).getByRole("status")).toHaveTextContent(/Loading the summary/);
    expect(await within(card).findByRole("alert")).toHaveTextContent("AI is busy, try again in a minute.");
    fail = false;
    fireEvent.click(within(card).getByRole("button", { name: "Try again" }));
    await within(card).findByText("What people loved");
  });

  it("explains a spent month on Refresh", async () => {
    state.refresh = () => refusal(429, "AI_QUOTA_REACHED");
    render(<FeedbackSummaryCard eventId={5} />);
    const card = await screen.findByRole("region", { name: /AI summary/ });
    fireEvent.click(await within(card).findByRole("button", { name: "Refresh" }));
    expect(await within(card).findByRole("alert")).toHaveTextContent("You've used all 150 AI actions this month. They reset on 1 Nov.");
  });
});

// ─── The club's own key ──────────────────────────────────────────────────

describe("your own AI key", () => {
  it("connects a Claude key and never shows it again", async () => {
    const secret = "sk-ant-api03-SECRETSECRET-9xYz";
    let saved = false;
    state.key = () => (saved ? A_KEY : NO_KEY);
    state.put = () => {
      saved = true;
      return A_KEY;
    };
    const { container } = render(<AiKeyCard />);
    const form = await screen.findByRole("form", { name: "Connect an AI key" });
    // Help: where to get one, and who pays.
    expect(screen.getByRole("link", { name: /Google AI Studio/ })).toHaveAttribute("href", "https://aistudio.google.com/apikey");
    expect(screen.getByRole("link", { name: /the Claude Console/ })).toBeInTheDocument();
    expect(screen.getByText(/none of them count against your plan's monthly AI actions/)).toBeInTheDocument();

    fireEvent.change(within(form).getByLabelText("Provider"), { target: { value: "anthropic" } });
    await waitFor(() => expect(within(form).getByLabelText("Model")).toHaveValue("claude-haiku-4-5"));
    fireEvent.change(within(form).getByLabelText("Model"), { target: { value: "claude-sonnet-4-5" } });
    const key = within(form).getByLabelText("API key");
    expect(key).toHaveAttribute("type", "password");
    fireEvent.change(key, { target: { value: secret } });
    fireEvent.click(within(form).getByRole("button", { name: "Connect" }));

    const card = await screen.findByRole("region", { name: "Your AI key" });
    expect(calls.find((c) => c.method === "PUT")!.body).toEqual({ provider: "anthropic", api_key: secret, model: "claude-sonnet-4-5" });
    expect(card).toHaveTextContent("Using your own Claude key");
    expect(card).toHaveTextContent("•••• 9xYz");
    expect(card).toHaveTextContent("claude-sonnet-4-5");
    // The key is nowhere on the page: not as text, not left in a field.
    expect(container.textContent).not.toContain(secret);
    expect([...container.querySelectorAll("input")].some((i) => i.value === secret)).toBe(false);
    expect(document.body.innerHTML).not.toContain(secret);
  });

  it("shows the provider's reason when the key is refused, and keeps nothing", async () => {
    state.put = () => refusal(422, "AI_KEY_INVALID", "Google rejected the key: API key not valid.");
    render(<AiKeyCard />);
    const form = await screen.findByRole("form", { name: "Connect an AI key" });
    fireEvent.change(within(form).getByLabelText("API key"), { target: { value: "AIzaBadKey123" } });
    fireEvent.click(within(form).getByRole("button", { name: "Connect" }));
    expect(await within(form).findByRole("alert")).toHaveTextContent("Google rejected the key: API key not valid.");
    expect(calls.find((c) => c.method === "PUT")!.body).toMatchObject({ provider: "gemini", model: "gemini-2.5-flash" });
    expect(screen.queryByRole("region", { name: "Your AI key" })).not.toBeInTheDocument();
  });

  it("removes the key after asking", async () => {
    let removed = false;
    state.key = () => (removed ? NO_KEY : A_KEY);
    state.del = () => {
      removed = true;
      return {};
    };
    render(<AiKeyCard />);
    const card = await screen.findByRole("region", { name: "Your AI key" });
    fireEvent.click(within(card).getByRole("button", { name: "Remove key" }));
    const confirm = await screen.findByRole("alertdialog", { name: "Remove your AI key?" });
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);
    fireEvent.click(within(confirm).getByRole("button", { name: "Remove key" }));
    await screen.findByRole("form", { name: "Connect an AI key" });
    expect(calls.filter((c) => c.method === "DELETE")).toHaveLength(1);
  });

  it.each(["editor", "door"] as const)("is not there for %s staff, who are never asked about it", async (role) => {
    state.me = me(role);
    render(<AiKeyCard />);
    await waitFor(() => expect(calls.some((c) => c.path === "/api/v1/clubs/access/me")).toBe(true));
    await waitFor(() => expect(calls.some((c) => c.path === "/api/v1/clubs/ai/status")).toBe(true));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText("Your own AI key")).not.toBeInTheDocument();
    expect(calls.map((c) => c.path)).not.toContain("/api/v1/clubs/ai/key");
  });

  it("is there for an admin", async () => {
    state.me = me("admin");
    render(<AiKeyCard />);
    expect(await screen.findByRole("form", { name: "Connect an AI key" })).toBeInTheDocument();
  });

  it("hides itself when the server says no (403)", async () => {
    state.key = () => refusal(403, "ROLE_FORBIDDEN");
    render(<AiKeyCard />);
    await waitFor(() => expect(calls.some((c) => c.path === "/api/v1/clubs/ai/key")).toBe(true));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText("Your own AI key")).not.toBeInTheDocument();
  });
});
