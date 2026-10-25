import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { ApiError } from "@moa/api";

/**
 * Pricing of 2026-10-25 in the admin app: the card that gives existing clubs
 * the 14-day Pro trial (GET/POST /admin/subscriptions/trial-gift), the plan
 * editor's promotional WhatsApp cap and free-trial allowances, and the new
 * default WhatsApp extra price.
 */
let role: string | null = "owner";
/** The preview's answer; an Error is thrown instead (a route the backend doesn't have yet, a fault). */
let preview: Record<string, unknown> | Error = {};
let plansResponse: unknown[] = [];
/** GET /admin/messages/packs (prepaid credits); an Error is thrown instead. */
let packsAnswer: unknown = null;
const posts: Array<{ path: string; body?: Record<string, unknown> }> = [];
const puts: Array<{ path: string; body: Record<string, unknown> }> = [];
let refuse: ApiError | null = null;

const PREVIEW = {
  available: true,
  plan_key: "pro",
  plan_name: "Pro",
  days: 14,
  then_plan_key: "free",
  allowances: { emails_per_month: 2000, whatsapp_per_month: 50, whatsapp_marketing_per_month: 10, ai_actions_per_month: 50 },
  unlocks: ["Paid tickets with Razorpay", "Live room: quiz", "Merchandise store"],
  eligible: 37,
  sample: [
    { id: 4, name: "Robotics Club", slug: "robotics", created_at: "2026-02-01T10:00:00+05:30" },
    { id: 9, name: "Drama Society", slug: "drama", created_at: "2026-03-01T10:00:00+05:30" },
  ],
  excluded: [
    { reason: "demo", label: "Demo or showcase club", count: 8 },
    { reason: "paying", label: "Paying, or on a plan an admin set", count: 3 },
  ],
};

function plan(overrides: Record<string, unknown> = {}) {
  return {
    id: 4,
    key: "pro",
    name: "Pro",
    price_monthly_paise: 149900,
    price_yearly_paise: 1499000,
    trial_days: 0,
    visibility: "public",
    billable: true,
    subscriber_count: 2,
    email_overage_paise: 10,
    whatsapp_overage_paise: 150,
    limits: { emails_per_month: 20000, whatsapp_per_month: 1000, whatsapp_marketing_per_month: 200, ai_actions_per_month: 500 },
    trial_limits: { emails_per_month: 2000, whatsapp_per_month: 50, whatsapp_marketing_per_month: 10, ai_actions_per_month: 50 },
    features: { tickets: true },
    feature_groups: { every_event: ["tickets"] },
    ...overrides,
  };
}

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    useSession: () => ({ data: { id: 1, username: "admin", email: "a@b.c", full_name: "Admin", user_type: "admin", admin_role: role } }),
    api: {
      get: vi.fn(async (path: string) => {
        if (path === "/api/v1/admin/subscriptions/trial-gift") {
          if (preview instanceof Error) throw preview;
          return preview;
        }
        if (path === "/api/v1/admin/subscriptions/totals") return { mrr_paise: 0, arr_paise: 0 };
        if (path === "/api/v1/admin/plans") return plansResponse;
        if (path === "/api/v1/admin/messages/packs") {
          if (packsAnswer instanceof Error) throw packsAnswer;
          return packsAnswer;
        }
        if (path === "/api/v1/admin/subscriptions") return { limit: 25, offset: 0, total: 0, next: null, items: [] };
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(async (path: string, body?: Record<string, unknown>) => {
        posts.push({ path, body });
        if (refuse) throw refuse;
        if (path === "/api/v1/admin/subscriptions/trial-gift") {
          const started = posts.filter((p) => p.path === path).length === 1 ? 37 : 0;
          return {
            started,
            emailed: body?.email ? started : 0,
            skipped: 0,
            remaining: 0,
            ends_at: started ? "2026-11-08T12:00:00+05:30" : null,
            clubs: started ? PREVIEW.sample : [],
          };
        }
        throw new Error(`unstubbed POST ${path}`);
      }),
      put: vi.fn(async (path: string, body: Record<string, unknown>) => {
        puts.push({ path, body });
        return plan(body);
      }),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { TrialGiftCard } = await import("./components/trial-gift-card");
const { SubscriptionsV2 } = await import("./components/subscriptions-v2");
const { PlansTab } = await import("./components/plans-tab");
const { CompareTab } = await import("./components/compare-tab");
const { allowancesLine, whatsappAllowance, planSchema, toForm, toPayload, LIMIT_FIELDS } =
  await import("./schemas");

beforeEach(() => {
  role = "owner";
  packsAnswer = { prices_include_gst: true, validity_months: 12, packs: [] };
  preview = { ...PREVIEW };
  plansResponse = [plan()];
  posts.length = 0;
  puts.length = 0;
  refuse = null;
});

describe("the trial for existing clubs", () => {
  it("shows the count, a sample, who is left out and what the trial gives", async () => {
    render(<TrialGiftCard />);
    expect(await screen.findByLabelText("37 eligible clubs")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Give existing clubs the 14-day Pro trial" })).toBeInTheDocument();
    expect(screen.getByText("Robotics Club")).toBeInTheDocument();
    expect(screen.getByText("Drama Society")).toBeInTheDocument();
    expect(screen.getByText(/Left out: demo or showcase club \(8\), paying, or on a plan an admin set \(3\)\./)).toBeInTheDocument();
    expect(screen.getByText(/2,000 emails, 50 WhatsApp messages and 50 AI actions a month/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Email each club's owner/ })).toHaveAttribute("aria-pressed", "true");
    expect(posts).toHaveLength(0);
  });

  it("asks once more, starts the trials with the mail, and shows the result", async () => {
    render(<TrialGiftCard />);
    fireEvent.click(await screen.findByRole("button", { name: "Give 37 clubs the trial" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Start the Pro trial for 37 clubs?")).toBeInTheDocument();
    expect(within(dialog).getByText(/Each owner is emailed once\./)).toBeInTheDocument();
    expect(posts).toHaveLength(0);
    fireEvent.click(within(dialog).getByRole("button", { name: "Start 37 trials" }));
    await waitFor(() => expect(posts).toEqual([{ path: "/api/v1/admin/subscriptions/trial-gift", body: { email: true } }]));
    expect(await screen.findByText("37 clubs started the Pro trial")).toBeInTheDocument();
    expect(screen.getByText(/37 owners mailed\./)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("sends no mail when the box is unticked", async () => {
    render(<TrialGiftCard />);
    fireEvent.click(await screen.findByRole("button", { name: /Email each club's owner/ }));
    expect(screen.getByRole("button", { name: /Email each club's owner/ })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByRole("button", { name: "Give 37 clubs the trial" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/No one is emailed\./)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Start 37 trials" }));
    await waitFor(() => expect(posts[0]?.body).toEqual({ email: false }));
    expect(await screen.findByText(/No mail was sent\./)).toBeInTheDocument();
  });

  it("has nothing to press when no club is eligible", async () => {
    preview = { ...PREVIEW, eligible: 0, sample: [] };
    render(<TrialGiftCard />);
    expect(await screen.findByRole("button", { name: "Nothing to give" })).toBeDisabled();
    expect(screen.getByText(/Every club has had its trial/)).toBeInTheDocument();
  });

  it("keeps the dialog and says so when the server refuses", async () => {
    refuse = new ApiError({ status: 403, errorCode: "FORBIDDEN", message: "You don't have permission to do that." });
    render(<TrialGiftCard />);
    fireEvent.click(await screen.findByRole("button", { name: "Give 37 clubs the trial" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Start 37 trials" }));
    expect(await within(dialog).findByText(/Nothing was changed\./)).toBeInTheDocument();
  });

  it("is on the Subscriptions screen for an owner, and not for a role that does not handle money", async () => {
    const { unmount } = render(<SubscriptionsV2 />);
    expect(await screen.findByRole("heading", { name: "Give existing clubs the 14-day Pro trial" })).toBeInTheDocument();
    unmount();
    role = "support";
    render(<SubscriptionsV2 />);
    expect(await screen.findByRole("heading", { name: "Subscriptions" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Give existing clubs the 14-day Pro trial" })).not.toBeInTheDocument();
  });
});

describe("the plan editor", () => {
  it("edits the promotional WhatsApp cap and the free trial's allowances, and saves them", async () => {
    render(<PlansTab />);
    expect(await screen.findByLabelText("Promotional WhatsApp limit")).toHaveValue(200);
    const trialEmails = screen.getByLabelText("Trial emails a month");
    expect(trialEmails).toHaveValue(2000);
    fireEvent.change(trialEmails, { target: { value: "2500" } });
    fireEvent.change(screen.getByLabelText("Promotional WhatsApp limit"), { target: { value: "150" } });
    // Emptying one goes back to the plan's own.
    fireEvent.change(screen.getByLabelText("Trial ai actions a month"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save plan" }));
    await waitFor(() => expect(puts).toHaveLength(1));
    const body = puts[0]!.body as { limits: Record<string, number | null>; trial_limits: Record<string, number | null> };
    expect(body.limits.whatsapp_marketing_per_month).toBe(150);
    expect(body.trial_limits).toEqual({ emails_per_month: 2500, whatsapp_per_month: 50, whatsapp_marketing_per_month: 10, ai_actions_per_month: null });
    // Per-message prices were retired with prepaid credits: never sent.
    expect(body).not.toHaveProperty("whatsapp_overage_paise");
    expect(body).not.toHaveProperty("email_overage_paise");
  });

  it("shows the trial's allowances only on the plan the trial gives", async () => {
    plansResponse = [plan({ id: 3, key: "growth", name: "Growth", trial_limits: {} })];
    render(<PlansTab />);
    expect(await screen.findByLabelText("Promotional WhatsApp limit")).toBeInTheDocument();
    expect(screen.queryByText("Free trial allowances")).not.toBeInTheDocument();
  });

  it("reads a server from before the trial allowances", () => {
    // A server from before the trial allowances sends none: the form has none, and sends nulls.
    const old = planSchema.parse({ ...plan(), trial_limits: undefined });
    expect(old.trial_limits).toEqual({});
    expect(toPayload(toForm(old)).trial_limits).toEqual({
      emails_per_month: null, whatsapp_per_month: null, whatsapp_marketing_per_month: null, ai_actions_per_month: null,
    });
    expect(LIMIT_FIELDS.map((f) => f.key)).toEqual(expect.arrayContaining(["whatsapp_marketing_per_month", "ai_actions_per_month"]));
  });
});

describe("words", () => {
  it("says a plan's WhatsApp with its promotional cap", () => {
    expect(whatsappAllowance({ whatsapp_per_month: 1000, whatsapp_marketing_per_month: 200 })).toBe("1,000 (up to 200 promotional)");
    expect(whatsappAllowance({ whatsapp_per_month: 50 })).toBe("50");
    expect(whatsappAllowance({ whatsapp_per_month: 0, whatsapp_marketing_per_month: 0 })).toBe("None");
    expect(whatsappAllowance({ whatsapp_per_month: null })).toBe("Unlimited");
  });

  it("says the trial's allowances in one line", () => {
    expect(allowancesLine(PREVIEW.allowances)).toBe("2,000 emails, 50 WhatsApp messages and 50 AI actions a month");
    expect(allowancesLine({ emails_per_month: 1 })).toBe("1 email a month");
    expect(allowancesLine({ emails_per_month: null })).toBeNull();
  });
});

describe("deployed ahead of the backend (production before backend #111)", () => {
  /** FastAPI's own 404 for a path nothing is mounted on: the route isn't on this backend yet. */
  const routeMissing = () => new ApiError({ status: 404, message: "Not Found", routeMissing: true });
  /** A plan as the older API sends it: no promotional cap, no trial allowances. */
  const olderPlan = (overrides: Record<string, unknown> = {}) => {
    const p = plan(overrides) as Record<string, unknown>;
    const { whatsapp_marketing_per_month: _cap, ...limits } = p.limits as Record<string, number | null>;
    delete p.trial_limits;
    return { ...p, limits, whatsapp_overage_paise: 100 };
  };

  it("leaves out the Credit packs tab while the packs' route doesn't exist yet, and shows it once it does", async () => {
    packsAnswer = routeMissing();
    const { unmount } = render(<SubscriptionsV2 />);
    expect(await screen.findByRole("tab", { name: /Plans and features/ })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("tab", { name: /Credit packs/ })).not.toBeInTheDocument());
    unmount();
    packsAnswer = { prices_include_gst: true, validity_months: 12, packs: [] };
    render(<SubscriptionsV2 />);
    expect(await screen.findByRole("tab", { name: /Credit packs/ })).toBeInTheDocument();
  });

  it("shows no trial card at all, and no error, when the preview's route doesn't exist yet", async () => {
    preview = routeMissing();
    render(<SubscriptionsV2 />);
    expect(await screen.findByRole("heading", { name: "Subscriptions" })).toBeInTheDocument();
    // Give the failed read time to land, then: nothing of the card, nothing that says it failed.
    await waitFor(() => expect(screen.queryByText(/Give existing clubs/)).not.toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /the trial|Nothing to give/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Couldn.t work out|eligible|not available/i)).not.toBeInTheDocument();
    expect(posts).toHaveLength(0);
  });

  it("shows no card either when the preview can't be read for another reason", async () => {
    preview = new ApiError({ status: 500, message: "Something went wrong on our side." });
    render(<TrialGiftCard />);
    await waitFor(() => expect(screen.queryByText(/Give existing clubs/)).not.toBeInTheDocument());
    expect(screen.queryByText(/went wrong/)).not.toBeInTheDocument();
  });

  it("offers neither the promotional cap nor the trial's allowances in the editor or the comparison", async () => {
    plansResponse = [olderPlan(), olderPlan({ id: 3, key: "growth", name: "Growth" })];
    const { unmount } = render(<PlansTab />);
    expect(await screen.findByLabelText("Emails limit")).toBeInTheDocument();
    expect(screen.queryByLabelText("Promotional WhatsApp limit")).not.toBeInTheDocument();
    expect(screen.queryByText("Free trial allowances")).not.toBeInTheDocument();
    expect(screen.queryByText(/bought credits can send promotional messages past it/)).not.toBeInTheDocument();
    // Per-message prices were retired with prepaid credits: none offered, whatever the API sends.
    expect(screen.queryByLabelText(/Each extra/)).not.toBeInTheDocument();
    unmount();
    render(<CompareTab />);
    expect(await screen.findByText(/Emails · per month/)).toBeInTheDocument();
    expect(screen.queryByText(/Promotional WhatsApp/)).not.toBeInTheDocument();
  });

  it("offers both once the API sends them", async () => {
    render(<PlansTab />);
    expect(await screen.findByLabelText("Promotional WhatsApp limit")).toBeInTheDocument();
    expect(screen.getByText("Free trial allowances")).toBeInTheDocument();
    expect(screen.getByText(/bought credits can send promotional messages past it/)).toBeInTheDocument();
    expect(screen.getByText(/Nothing is billed per extra message/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Each extra/)).not.toBeInTheDocument();
  });
});
