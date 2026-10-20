import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { toApiError } from "@moa/api";

/**
 * /confirm/{token}, against docs/MCP.md section 7.1:
 *
 *   GET  /clubs/pending-actions/{token}          the action, as the page shows it
 *   POST /clubs/pending-actions/{token}/confirm  approve; the same shape back
 *   POST /clubs/pending-actions/{token}/reject   turn down; the same shape back
 *
 * and its refusals: 404 ACTION_NOT_FOUND, 409 ACTION_DECIDED, 410
 * ACTION_EXPIRED, 403 ROLE_FORBIDDEN / PLAN_LIMIT_REACHED / NOT_A_CLUB,
 * 404/409 when the target changed (the action is `failed` after), 503
 * MCP_DISABLED.
 */

const TOKEN = "moa_pa_Qx7b2kTzLr0vWm9yNe4pHs6uJc1aXd8gFo3iKt5qZbE";
const replace = vi.fn();
const redirect = vi.fn((to: string) => {
  throw new Error(`redirect ${to}`);
});
const session = { current: { user: { id: 1, user_type: "club" } as unknown, refusal: null as string | null } };

vi.mock("next/navigation", () => ({
  redirect: (to: string) => redirect(to),
  useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => `/confirm/${TOKEN}`,
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@moa/auth/server", () => ({ checkSession: vi.fn(async () => session.current) }));

const EVENT_ACTION = {
  id: "e009b1f5-1111-2222-3333-444455556666",
  kind: "publish_event",
  status: "pending",
  title: "Publish “Draft Demo Day”",
  effects: [
    "The event becomes public: on the club's page, the website and the MyOtherApp app.",
    "Registration opens as the event is set up.",
    "The club's followers (128) are told about the new event.",
  ],
  target: {
    type: "event",
    id: 2,
    name: "Draft Demo Day",
    status: "draft",
    deleted: false,
    starts_at: "2026-11-19T18:30:00+05:30",
    venue: "Lab 1",
    online: false,
    paid: false,
    fee: null,
    capacity: 80,
    dashboard_url: "https://club-dashboard.myotherapp.in/events/2",
    public_url: "https://myotherapp.in/events/draft-demo-day-39b0a7",
  },
  requested: { app: "Claude", by: { name: "Eddie Editor", email: "editor@example.com", role: "editor" }, at: "2026-10-20T01:30:36+05:30" },
  expires_at: new Date(Date.now() + 23 * 3_600_000).toISOString(),
  expired: false,
  can_decide: true,
  cannot_decide_reason: null,
  decided: null,
  result: null,
};

const ANNOUNCEMENT_ACTION = {
  ...EVENT_ACTION,
  kind: "send_announcement",
  title: "Send “Venue change”",
  effects: ["A push notification and an inbox message go to everyone registered of “Hack Night”: 120 people, 87 of them with the app.", "It counts toward the plan's announcements this month."],
  target: {
    type: "announcement",
    id: "9f1d0000-aaaa-bbbb-cccc-ddddeeeeffff",
    status: "draft",
    title: "Venue change <script>",
    body: "We've moved to <b>Hall B</b>.\nSame time.",
    audience: "all",
    event: { id: 1, name: "Hack Night" },
    people: 120,
    reachable: 87,
  },
};

const OWNER = { name: null, email: null, role: "owner" };
const CONFIRMED_EVENT = {
  ...EVENT_ACTION,
  status: "confirmed",
  can_decide: false,
  target: { ...EVENT_ACTION.target, status: "published" },
  decided: { at: "2026-10-20T02:00:00+05:30", by: OWNER },
  result: { event_id: 2, status: "published", public_url: "https://myotherapp.in/events/draft-demo-day-39b0a7" },
};
const REJECTED_EVENT = { ...EVENT_ACTION, status: "rejected", can_decide: false, decided: { at: "2026-10-20T02:00:00+05:30", by: { name: "Asha Admin", email: "a@example.com", role: "admin" } } };

type Answer = unknown | (() => unknown);
const state: { get: Answer; confirm: Answer; reject: Answer } = { get: EVENT_ACTION, confirm: CONFIRMED_EVENT, reject: REJECTED_EVENT };
const calls: Array<{ method: string; path: string; body?: unknown }> = [];

async function answer(value: Answer) {
  const v = typeof value === "function" ? await (value as () => unknown)() : value;
  if (v instanceof Error) throw v;
  return v;
}

/** A refusal as the gateway hands it over, through the app's own parser. */
const refusal = (status: number, error_code: string | null, message = "No.", errors?: unknown) =>
  toApiError(new Response(JSON.stringify(error_code ? { message, error_code, ...(errors ? { errors } : {}) } : { detail: "Not Found" }), { status, headers: { "Content-Type": "application/json" } }));

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        calls.push({ method: "GET", path });
        if (path === `/api/v1/clubs/pending-actions/${TOKEN}`) return answer(state.get);
        if (path === "/api/v1/events/info/2") return { id: 2, name: "Draft Demo Day", poster: null };
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(async (path: string, body?: unknown) => {
        calls.push({ method: "POST", path, body });
        if (path === `/api/v1/clubs/pending-actions/${TOKEN}/confirm`) return answer(state.confirm);
        if (path === `/api/v1/clubs/pending-actions/${TOKEN}/reject`) return answer(state.reject);
        throw new Error(`unstubbed POST ${path}`);
      }),
      put: vi.fn(),
      patch: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { ConfirmPage, pendingActionSchema, personLabel } = await import("./index");
const { default: ConfirmActionPage } = await import("@/app/confirm/[token]/page");
const { config, proxy } = await import("@/proxy");
const { NextRequest } = await import("next/server");

beforeEach(() => {
  calls.length = 0;
  replace.mockClear();
  redirect.mockClear();
  session.current = { user: { id: 1, user_type: "club" }, refusal: null };
  Object.assign(state, { get: EVENT_ACTION, confirm: CONFIRMED_EVENT, reject: REJECTED_EVENT });
});

const posts = () => calls.filter((c) => c.method === "POST");
const page = () => render(<ConfirmPage token={TOKEN} />);

describe("the route", () => {
  it("is guarded at the edge, which sends a visitor with no session to sign in and back", () => {
    const guarded = (path: string) => new RegExp(`^${config.matcher[0]}$`).test(path);
    expect(guarded(`/confirm/${TOKEN}`)).toBe(true);
    const res = proxy(new NextRequest(`https://club-dashboard.myotherapp.in/confirm/${TOKEN}`));
    expect(res.headers.get("location")).toBe(`https://club-dashboard.myotherapp.in/login?next=${encodeURIComponent(`/confirm/${TOKEN}`)}`);
  });

  it("sends a signed-out visitor to sign in, and back here after", async () => {
    session.current = { user: null, refusal: null };
    await expect(ConfirmActionPage({ params: Promise.resolve({ token: TOKEN }) })).rejects.toThrow(`redirect /login?next=${encodeURIComponent(`/confirm/${TOKEN}`)}`);
  });

  it("shows the page to a signed-in visitor", async () => {
    const el = await ConfirmActionPage({ params: Promise.resolve({ token: TOKEN }) });
    expect(redirect).not.toHaveBeenCalled();
    render(el);
    expect(await screen.findByRole("heading", { name: "Publish “Draft Demo Day”" })).toBeInTheDocument();
  });

  it("goes to sign-in when the session runs out on the page itself (401)", async () => {
    state.get = () => refusal(401, null);
    page();
    await waitFor(() => expect(replace).toHaveBeenCalledWith(`/login?next=${encodeURIComponent(`/confirm/${TOKEN}`)}`));
  });
});

describe("a request waiting for approval", () => {
  it("says what will happen to which event, who asked, until when, and offers Approve and Turn down", async () => {
    page();
    expect(await screen.findByRole("heading", { level: 1, name: "Publish “Draft Demo Day”" })).toBeInTheDocument();
    expect(screen.getByText("Claude wants to publish this event. Check it, then approve.")).toBeInTheDocument();
    expect(screen.getByText("Claude is asking")).toBeInTheDocument();

    const card = screen.getByRole("region", { name: "The event" });
    expect(within(card).getByText("Draft Demo Day")).toBeInTheDocument();
    expect(within(card).getByText("Draft")).toBeInTheDocument();
    expect(within(card).getByText("Lab 1")).toBeInTheDocument();
    expect(within(card).getByText(/Free entry · 80 places/)).toBeInTheDocument();
    expect(within(card).getByText(/19 Nov/)).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: /Check the whole event/ })).toHaveAttribute("href", "/events/2");

    const effects = screen.getByRole("region", { name: "What approving does" });
    expect(
      within(effects)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual(EVENT_ACTION.effects);

    expect(screen.getByText(/Claude, for Eddie Editor \(editor\)/)).toBeInTheDocument();
    expect(screen.getByText(/in 23 h/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Approve/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Turn down/ })).toBeEnabled();
  });

  it("approves, then says it is done and where to see it", async () => {
    page();
    fireEvent.click(await screen.findByRole("button", { name: /Approve/ }));
    const done = await screen.findByRole("region", { name: "What happened" });
    expect(posts()).toEqual([{ method: "POST", path: `/api/v1/clubs/pending-actions/${TOKEN}/confirm`, body: undefined }]);
    expect(within(done).getByRole("heading", { name: "Approved" })).toBeInTheDocument();
    expect(done).toHaveTextContent("The event is published: on the club's page, the website and the app.");
    expect(done).toHaveTextContent("Approved by the club account");
    expect(within(done).getByRole("link", { name: /See the public page/ })).toHaveAttribute("href", "https://myotherapp.in/events/draft-demo-day-39b0a7");
    expect(within(done).getByRole("link", { name: "Open the event" })).toHaveAttribute("href", "/events/2");
    expect(screen.queryByRole("button", { name: /Approve/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "What approving does" })).not.toBeInTheDocument();
  });

  it("turns it down, and says nothing was published", async () => {
    page();
    fireEvent.click(await screen.findByRole("button", { name: /Turn down/ }));
    const done = await screen.findByRole("region", { name: "What happened" });
    expect(posts()[0]!.path).toBe(`/api/v1/clubs/pending-actions/${TOKEN}/reject`);
    expect(within(done).getByRole("heading", { name: "Turned down" })).toBeInTheDocument();
    expect(done).toHaveTextContent("Nothing was published. The event is still a draft.");
    expect(done).toHaveTextContent("Turned down by Asha Admin (admin)");
  });

  it("shows an announcement as plain text, with who it reaches", async () => {
    state.get = ANNOUNCEMENT_ACTION;
    const { container } = page();
    expect(await screen.findByText("Claude wants to send this announcement. Check it, then approve.")).toBeInTheDocument();
    const card = screen.getByRole("region", { name: "The announcement" });
    expect(within(card).getByText("Venue change <script>")).toBeInTheDocument();
    expect(card).toHaveTextContent("We've moved to <b>Hall B</b>.");
    expect(container.querySelector("b, script")).toBeNull();
    expect(card).toHaveTextContent("To: Everyone registered of “Hack Night”");
    expect(card).toHaveTextContent("Reaches 120 people, 87 with the app");
  });

  it("says why someone cannot decide, and offers no buttons", async () => {
    state.get = { ...EVENT_ACTION, can_decide: false, cannot_decide_reason: "Your role can't approve this. Ask an admin or the club's owner." };
    page();
    expect(await screen.findByText("Your role can't approve this. Ask an admin or the club's owner.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Approve/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Turn down/ })).not.toBeInTheDocument();
  });
});

describe("every other state", () => {
  it.each([
    ["confirmed", CONFIRMED_EVENT, "Approved", "The event is published"],
    ["rejected", REJECTED_EVENT, "Turned down", "Nothing was published"],
    ["expired", { ...EVENT_ACTION, status: "expired", expired: true, can_decide: false }, "This request expired", "Ask the assistant again"],
    ["superseded", { ...EVENT_ACTION, status: "superseded", can_decide: false }, "A newer request replaced this one", "Open the newest link"],
    [
      "failed",
      { ...EVENT_ACTION, status: "failed", can_decide: false, result: { error: "EVENT_NOT_DRAFT", message: "The event is not a draft any more (it is published)." } },
      "This couldn't be done",
      "The event is not a draft any more",
    ],
    [
      "disconnected",
      { ...ANNOUNCEMENT_ACTION, status: "rejected", can_decide: false, result: { reason: "app_disconnected" } },
      "Turned down",
      "The app was disconnected, so its request was turned down.",
    ],
  ])("shows %s", async (_name, action, title, line) => {
    state.get = action;
    page();
    const done = await screen.findByRole("region", { name: "What happened" });
    expect(within(done).getByRole("heading", { name: title })).toBeInTheDocument();
    expect(done).toHaveTextContent(line);
    expect(screen.queryByRole("button", { name: /Approve/ })).not.toBeInTheDocument();
  });

  it("reads a target that no longer exists ({}) as gone", async () => {
    state.get = { ...EVENT_ACTION, target: {}, can_decide: false, cannot_decide_reason: "This action is no longer possible." };
    page();
    expect(await screen.findByText("The event this was about no longer exists.")).toBeInTheDocument();
    expect(screen.getByText("This action is no longer possible.")).toBeInTheDocument();
    expect(pendingActionSchema.parse({ ...EVENT_ACTION, target: {} }).target).toBeNull();
  });

  it("names who asked in plain words", () => {
    expect(personLabel({ name: null, email: null, role: "owner" })).toBe("the club account");
    expect(personLabel({ name: "Dee", email: "d@x.in", role: "door" })).toBe("Dee (door team)");
    expect(personLabel({ name: null, email: "e@x.in", role: "editor" })).toBe("e@x.in (editor)");
  });
});

describe("when the request cannot be read", () => {
  it.each([
    ["404 ACTION_NOT_FOUND", () => refusal(404, "ACTION_NOT_FOUND", "This link is not valid, or it is for another club."), "This link doesn't work"],
    ["503 MCP_DISABLED", () => refusal(503, "MCP_DISABLED"), "AI connections are turned off"],
    ["a 404 with no code (switched off)", () => refusal(404, null), "AI connections are turned off"],
    ["403 NOT_A_CLUB", () => refusal(403, "NOT_A_CLUB"), "This link is for a club's team"],
    ["429", () => refusal(429, null), "Too many tries"],
  ])("explains %s", async (_name, error, title) => {
    state.get = error;
    page();
    expect(await screen.findByRole("heading", { name: title })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Approve/ })).not.toBeInTheDocument();
  });
});

describe("when deciding is refused", () => {
  it("reloads a request decided elsewhere and shows it (409 ACTION_DECIDED)", async () => {
    let decided = false;
    state.get = () => (decided ? CONFIRMED_EVENT : EVENT_ACTION);
    state.confirm = () => {
      decided = true;
      return refusal(409, "ACTION_DECIDED", "This request was already confirmed.");
    };
    page();
    fireEvent.click(await screen.findByRole("button", { name: /Approve/ }));
    const done = await screen.findByRole("region", { name: "What happened" });
    expect(within(done).getByRole("heading", { name: "Approved" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Someone has already decided this one. Here is what happened.");
  });

  it("reloads an expired one (410 ACTION_EXPIRED)", async () => {
    let gone = false;
    state.get = () => (gone ? { ...EVENT_ACTION, status: "expired", expired: true, can_decide: false } : EVENT_ACTION);
    state.confirm = () => {
      gone = true;
      return refusal(410, "ACTION_EXPIRED", "This request expired. Ask the assistant again.");
    };
    page();
    fireEvent.click(await screen.findByRole("button", { name: /Approve/ }));
    expect(await screen.findByRole("heading", { name: "This request expired" })).toBeInTheDocument();
  });

  it("reloads one whose event changed, which failed (409 EVENT_NOT_DRAFT)", async () => {
    let failed = false;
    state.get = () =>
      failed ? { ...EVENT_ACTION, status: "failed", can_decide: false, result: { error: "EVENT_NOT_DRAFT", message: "The event is not a draft any more (it is published)." } } : EVENT_ACTION;
    state.confirm = () => {
      failed = true;
      return refusal(409, "EVENT_NOT_DRAFT", "The event is not a draft any more (it is published).");
    };
    page();
    fireEvent.click(await screen.findByRole("button", { name: /Approve/ }));
    expect(await screen.findByRole("heading", { name: "This couldn't be done" })).toBeInTheDocument();
    expect(screen.getByText(/It changed while this was waiting, so nothing was done/)).toBeInTheDocument();
  });

  it("explains the month's announcements are used up, and keeps the request waiting (403 PLAN_LIMIT_REACHED)", async () => {
    state.get = ANNOUNCEMENT_ACTION;
    state.confirm = () =>
      refusal(403, "PLAN_LIMIT_REACHED", "You've sent this month's announcements.", {
        limit: "announcements_per_month",
        limit_value: 4,
        used: 4,
        required_plan: "starter",
        required_plan_name: "Starter",
        upgrade_url: "https://club-dashboard.myotherapp.in/billing?plan=starter",
      });
    page();
    fireEvent.click(await screen.findByRole("button", { name: /Approve/ }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Your plan's announcements for this month are used up. Upgrade, then come back and approve: the request is still waiting.");
    expect(within(alert).getByRole("link", { name: "See plans" })).toHaveAttribute("href", "/billing?plan=starter");
    // Still pending: the buttons stay for after the upgrade.
    expect(screen.getByRole("button", { name: /Approve/ })).toBeEnabled();
  });

  it("explains a role that cannot approve (403 ROLE_FORBIDDEN)", async () => {
    state.confirm = () => refusal(403, "ROLE_FORBIDDEN", "Your role can't approve this.");
    page();
    fireEvent.click(await screen.findByRole("button", { name: /Approve/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Your role can't approve this. Ask an admin or the club's owner.");
  });

  it("says AI connections are off and takes the buttons away (503 MCP_DISABLED)", async () => {
    state.confirm = () => refusal(503, "MCP_DISABLED", "Connected assistants are switched off right now.");
    page();
    fireEvent.click(await screen.findByRole("button", { name: /Approve/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("AI connections are turned off right now, so this can't be approved.");
    expect(screen.queryByRole("button", { name: /Approve/ })).not.toBeInTheDocument();
  });
});
