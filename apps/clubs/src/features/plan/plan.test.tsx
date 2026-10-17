import { beforeEach, describe, expect, it, vi } from "vitest";
import { useForm, useWatch } from "react-hook-form";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { ApiError, toApiError } from "@moa/api";
import { Form, toast } from "@moa/ui";

import eventDetail from "../__fixtures__/event-detail.json";

/**
 * The plan in the dashboard, against the backend's contract for plan
 * enforcement: GET /clubs/entitlements with `enforced` and
 * `grandfathered_before`, and 403s with PLAN_FEATURE_LOCKED or
 * PLAN_LIMIT_REACHED and their details in `errors`.
 *
 * The rules are tested on `planState` directly; the screens are tested for
 * the marks they leave (a lock, a meter, a create button that opens the
 * upgrade dialog) and for leaving none when enforcement is off.
 */

const NOW = Date.now();
const iso = (ms: number) => new Date(NOW + ms).toISOString();
const DAY = 86_400_000;

const row = (key: string, label: string, included: boolean) => ({ key, label, included });
const FEATURE_ROWS = (keys: string[]) =>
  [
    ["checkin", "Check-in at the door"],
    ["tickets", "Paid tickets with Razorpay"],
    ["website", "Club website"],
    ["links", "Tracking links"],
    ["quiz", "Live room: quiz"],
    ["merch", "Merchandise store"],
    ["roles", "Team roles and access"],
    ["finance", "Finance and expenses"],
  ].map(([k, l]) => row(k!, l!, keys.includes(k!)));

const plan = (key: string, name: string, limits: Record<string, number | null>, features: string[]) => ({
  id: name.length,
  key,
  name,
  tagline: null,
  price_monthly_paise: 0,
  price_yearly_paise: 0,
  trial_days: 0,
  contact_sales: false,
  featured: false,
  limits,
  features: FEATURE_ROWS(features),
});

/** A catalogue where paid tickets start on "Basic", so the dialog's plan name is provably the catalogue's. */
const CATALOG = {
  currency: "INR",
  yearly_months_free: 2,
  plans: [
    plan("free", "Free", { events_per_month: 2, committee_seats: 1, announcements_per_month: 4, merch_items_per_event: 5, website_templates: 1 }, ["checkin"]),
    plan("basic", "Basic", { events_per_month: 6, committee_seats: 3, announcements_per_month: 12, merch_items_per_event: 5, website_templates: 2 }, ["checkin", "tickets", "website"]),
    plan("growth", "Growth", { events_per_month: null, committee_seats: 10, announcements_per_month: null, merch_items_per_event: 20, website_templates: null }, ["checkin", "tickets", "website", "links", "quiz", "merch"]),
    plan("pro", "Pro", { events_per_month: null, committee_seats: null, announcements_per_month: null, merch_items_per_event: null, website_templates: null }, ["checkin", "tickets", "website", "links", "quiz", "merch", "roles", "finance"]),
  ],
};

const CUTOFF = "2026-10-01T00:00:00+05:30";

/** A club on Free with plans enforced: every gated flag off, the month's events used up. */
const FREE_ENFORCED = {
  plan_key: "free",
  plan_name: "Free",
  status: null,
  cycle: null,
  current_period_end: null,
  limits: CATALOG.plans[0]!.limits,
  features: { checkin: true, certificates: true, regform: true, reviews: true, threads: true, tickets: false, website: false, links: false, quiz: false, polls: false, qa: false, report: false, merch: false, swag: false, badges: false, roles: false, teams: false, judging: false, rounds: false, finance: false },
  configured: true,
  requested_plan: null,
  requested_cycle: null,
  subscription_status: null,
  usage: { events_per_month: 2, registrations_per_month: 40, committee_seats: 1, announcements_per_month: 3 },
  enforced: true,
  grandfathered_before: CUTOFF,
};

/** The same club with the kill switch thrown: the server holds nobody to anything. */
const NOT_ENFORCED = { ...FREE_ENFORCED, enforced: false };

const ACCESS_LIST = {
  owner_email: "club@example.com",
  members: [{ id: 9, email: "ed@example.com", full_name: "Ed", role: "editor", role_label: "Editor", status: "active", invite_expired: false, invited_at: null, accepted_at: null, last_seen_at: null }],
  roles: [
    { key: "admin", label: "Admin", description: "Everything but access." },
    { key: "editor", label: "Editor", description: "Events and messages." },
    { key: "door", label: "Door", description: "Check-in only." },
  ],
  can_manage: true,
};

/** The event detail, three ways: grandfathered by the server, not, and from a server that does not say. */
const DETAIL = { ...eventDetail, created_at: "2026-09-01T10:00:00+05:30" };
const DETAILS: Record<string, Record<string, unknown>> = {
  "37": { ...DETAIL, id: 37, plan_grandfathered: true },
  "38": { ...DETAIL, id: 38, plan_grandfathered: false },
  "39": { ...eventDetail, id: 39 },
};

const FIGURES = { upcoming: 0, next_event: null, registered: 0, capacity: 0, collected: 0, outstanding: 0, attention: { closing_soon: [], doors_open: [], unmarked: [], stale_drafts: [] }, past: 0, drafts: 0, generated_at: iso(0) };

type Post = (path: string, body: unknown) => unknown;
const state = { ent: FREE_ENFORCED as Record<string, unknown>, post: (() => ({})) as Post };
const calls: Array<{ method: string; path: string; body?: unknown }> = [];

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        calls.push({ method: "GET", path });
        if (path === "/api/v1/clubs/entitlements") return state.ent;
        if (path === "/api/v1/plans") return CATALOG;
        if (path === "/api/v1/clubs/access") return ACCESS_LIST;
        if (path.endsWith("/events/figures")) return FIGURES;
        if (path.endsWith("/events/list")) return { items: [], total: 0, limit: 20, offset: 0, next: null };
        const detail = /^\/api\/v1\/events\/info\/(\d+)$/.exec(path);
        if (detail && DETAILS[detail[1]!]) return DETAILS[detail[1]!];
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "POST", path, body });
        return state.post(path, body);
      }),
      patch: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "PATCH", path, body });
        return {};
      }),
      put: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { PlanLockHost, LimitMeter, LockedNotice, planState, planLockFromError, isPlanLockError, toastError, lockCopy, meterText } = await import("./index");
const { entitlementsSchema, catalogSchema } = await import("@/features/billing/schemas");
const { EntryStep } = await import("@/features/event-form/components/steps/entry-step");
const { emptyEventForm } = await import("@/features/event-form/components/event-form");
const { ClubEventsList } = await import("@/features/events/components/events-list");
const { AccessPage } = await import("@/features/access/components/access-page");
const { NewAnnouncementDialog } = await import("@/features/announcements/components/new-announcement-dialog");
const { usePublishSite } = await import("@/features/site/queries");
const { useDuplicateEvent } = await import("@/features/event-form/queries");
const { useFeatureGate, useLimitGate, useEventGrandfathered, exemptState, skippedNotice } = await import("./index");
const { NewLinkDialog } = await import("@/features/links/components/new-link-dialog");
const { EventConsole } = await import("@/features/console/components/event-console");
const { LivePage } = await import("@/features/live/components/live-page");
const { useSendAnnouncement } = await import("@/features/announcements/queries");
const { SidebarNav } = await import("@/components/sidebar-nav");

const ent = (over: Record<string, unknown> = {}) => entitlementsSchema.parse({ ...FREE_ENFORCED, ...over });
const catalog = catalogSchema.parse(CATALOG);

/** A 403 exactly as the gateway hands it over, through the same parser the app uses. */
async function refusal(body: Record<string, unknown>) {
  return toApiError(new Response(JSON.stringify(body), { status: 403, headers: { "Content-Type": "application/json" } }));
}

const FEATURE_REFUSAL = {
  message: "The club website is not on your plan.",
  error_code: "PLAN_FEATURE_LOCKED",
  errors: { feature: "website", label: "The club website", required_plan: "basic", required_plan_name: "Basic", upgrade_url: "https://clubs.myotherapp.in/billing" },
};
const LIMIT_REFUSAL = {
  message: "You've sent this month's announcements.",
  error_code: "PLAN_LIMIT_REACHED",
  errors: { limit: "announcements_per_month", limit_value: 4, used: 4, required_plan: "basic", required_plan_name: "Basic", upgrade_url: "/billing" },
};

beforeEach(() => {
  calls.length = 0;
  state.ent = FREE_ENFORCED;
  state.post = () => ({});
  vi.restoreAllMocks();
});

// ─── The rules ───────────────────────────────────────────────────────────

describe("usePlan's rules (planState)", () => {
  it("locks the flags the plan lacks, never the always-on ones, and names the cheapest plan that has each", () => {
    const p = planState(ent(), catalog);
    expect(p).toMatchObject({ ready: true, enforced: true, planKey: "free", planName: "Free" });
    expect(p.can("tickets")).toBe(false);
    expect(p.can("checkin")).toBe(true);
    expect(p.can("threads")).toBe(true);
    // A flag the server did not send is one it does not gate.
    expect(p.can("something_new")).toBe(true);
    expect(p.featureLock("checkin")).toBeNull();
    expect(p.featureLock("tickets")).toMatchObject({ kind: "feature", key: "tickets", label: "Paid tickets with Razorpay", requiredPlan: "basic", requiredPlanName: "Basic", planName: "Free" });
    expect(p.featureLock("roles")).toMatchObject({ requiredPlanName: "Pro" });
  });

  it("falls back to the seeded tiers when the catalogue is not to hand", () => {
    const p = planState(ent(), null);
    expect(p.featureLock("tickets")).toMatchObject({ label: "Paid tickets", requiredPlanName: "Starter" });
    expect(p.featureLock("finance")).toMatchObject({ requiredPlanName: "Campus" });
  });

  it("reads caps and counts, and is at a limit only at or past its cap", () => {
    const p = planState(ent(), catalog);
    expect(p.limit("events_per_month")).toBe(2);
    expect(p.used("events_per_month")).toBe(2);
    expect(p.atLimit("events_per_month")).toBe(true);
    expect(p.atLimit("announcements_per_month")).toBe(false);
    // The screen's own count wins when it has one (a store's items).
    expect(p.atLimit("merch_items_per_event", 4)).toBe(false);
    expect(p.atLimit("merch_items_per_event", 5)).toBe(true);
    // Not counted by the server and none given: never at the limit.
    expect(p.atLimit("merch_items_per_event")).toBe(false);
    // Unlimited (null) and unknown keys never lock.
    expect(planState(ent({ limits: { ...FREE_ENFORCED.limits, events_per_month: null } }), catalog).atLimit("events_per_month")).toBe(false);
    expect(p.limit("storage_gb")).toBeNull();
    // Zero is none at all, used or not.
    expect(planState(ent({ limits: { ...FREE_ENFORCED.limits, committee_seats: 0 } }), catalog).atLimit("committee_seats")).toBe(true);
  });

  it("names the first plan with more room for a limit", () => {
    const p = planState(ent(), catalog);
    expect(p.limitLock("events_per_month")).toMatchObject({ kind: "limit", key: "events_per_month", limitValue: 2, used: 2, requiredPlanName: "Basic", planName: "Free" });
    // Basic has the same five items, so Growth is the one that lifts it.
    expect(p.limitLock("merch_items_per_event", 5)).toMatchObject({ limitValue: 5, used: 5, requiredPlanName: "Growth" });
    expect(p.limitLock("announcements_per_month")).toBeNull();
  });

  it("exempts a grandfathered event from every event-scoped lock, and keeps its counts", () => {
    const p = exemptState(planState(ent(), catalog));
    for (const f of ["tickets", "merch", "swag", "quiz", "polls", "qa", "links", "report", "badges", "teams", "judging", "rounds"]) {
      expect(p.can(f)).toBe(true);
      expect(p.featureLock(f)).toBeNull();
    }
    expect(p.limitLock("merch_items_per_event", 5)).toBeNull();
    expect(p.atLimit("merch_items_per_event", 5)).toBe(false);
    // The meter still has its figures.
    expect(p.limit("merch_items_per_event")).toBe(5);
    expect(p.used("events_per_month")).toBe(2);
  });

  it("locks nothing while enforcement is off, plans are not configured, or nothing has loaded", () => {
    for (const p of [planState(ent({ enforced: false }), catalog), planState(ent({ configured: false }), catalog), planState(undefined, catalog)]) {
      expect(p.enforced).toBe(false);
      expect(p.can("tickets")).toBe(true);
      expect(p.featureLock("finance")).toBeNull();
      expect(p.limit("events_per_month")).toBeNull();
      expect(p.limitLock("events_per_month")).toBeNull();
    }
    // A server from before enforcement sends no `enforced` at all: the same.
    const { enforced: _drop, ...older } = FREE_ENFORCED;
    void _drop;
    expect(planState(entitlementsSchema.parse(older), catalog).can("tickets")).toBe(true);
  });

  it("words a meter and each kind of lock", () => {
    expect(meterText("events_per_month", 2, 2, "Free")).toBe("2 of 2 events this month · Free");
    expect(meterText("committee_seats", 2, 2, "Free")).toBe("2 of 2 seats · Free");
    expect(meterText("merch_items_per_event", 5, 5, "Free")).toBe("5 of 5 items · Free");
    const p = planState(ent(), catalog);
    expect(lockCopy(p.featureLock("tickets")!)).toEqual({
      title: "Paid tickets with Razorpay is part of Basic and up",
      body: "You're on Free. Upgrade to use it. Everything you've already made stays here for you to look at.",
    });
    expect(lockCopy(p.limitLock("events_per_month")!)).toEqual({
      title: "You've used 2 of 2 events this month",
      body: "That's all Free includes this month. Basic and up include more, or it starts again next month.",
    });
    expect(lockCopy(p.limitLock("website_templates", 1)!).title).toBe("Free includes one website template");
  });
});

// ─── The server's refusals ───────────────────────────────────────────────

describe("refusals", () => {
  it("reads a PLAN_FEATURE_LOCKED and a PLAN_LIMIT_REACHED body, and nothing else", async () => {
    expect(planLockFromError(await refusal(FEATURE_REFUSAL))).toMatchObject({ kind: "feature", key: "website", label: "The club website", requiredPlan: "basic", requiredPlanName: "Basic", message: "The club website is not on your plan." });
    expect(planLockFromError(await refusal(LIMIT_REFUSAL))).toMatchObject({ kind: "limit", key: "announcements_per_month", limitValue: 4, used: 4, requiredPlanName: "Basic" });
    // A role refusal is a 403 too, and not the plan's.
    const role = new ApiError({ status: 403, message: "Only the owner", errorCode: "ROLE_FORBIDDEN" });
    expect(planLockFromError(role)).toBeNull();
    expect(isPlanLockError(role)).toBe(false);
    expect(planLockFromError(new Error("network"))).toBeNull();
    // A body missing its details still opens the dialog, in general words.
    expect(planLockFromError(new ApiError({ status: 403, message: "Locked", errorCode: "PLAN_FEATURE_LOCKED" }))).toMatchObject({ kind: "feature", requiredPlanName: null });
  });

  it("never toasts a plan refusal; other failures still toast their own words", async () => {
    const spy = vi.spyOn(toast, "error");
    toastError(await refusal(LIMIT_REFUSAL));
    expect(spy).not.toHaveBeenCalled();
    toastError(new ApiError({ status: 422, message: "Pick an event" }));
    expect(spy).toHaveBeenCalledWith("Pick an event");
  });
});

function PublishSite() {
  const publish = usePublishSite();
  return (
    <button type="button" onClick={() => publish.mutate()}>
      Publish
    </button>
  );
}

function SendOne() {
  const send = useSendAnnouncement();
  return (
    <button type="button" onClick={() => send.mutate({ eventId: 37, input: { title: "Hall B", body: "We moved to Hall B.", audience: "all" } })}>
      Send
    </button>
  );
}

describe("the upgrade dialog from a refusal (global interception)", () => {
  it("opens for a locked feature, whichever screen's mutation it was, and no toast is shown", async () => {
    const spy = vi.spyOn(toast, "error");
    const err = await refusal(FEATURE_REFUSAL);
    state.post = () => {
      throw err;
    };
    render(
      <>
        <PlanLockHost />
        <PublishSite />
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("The club website is part of Basic and up")).toBeInTheDocument();
    expect(within(dialog).getByText(/You're on Free\. Upgrade to use it/)).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "See plans" })).toHaveAttribute("href", "/billing");
    expect(spy).not.toHaveBeenCalled();
    // The counts are behind once the server refused: they are read again.
    await waitFor(() => expect(calls.filter((c) => c.path === "/api/v1/clubs/entitlements").length).toBeGreaterThanOrEqual(2));
  });

  it("opens for a reached limit with the figures the server sent", async () => {
    const spy = vi.spyOn(toast, "error");
    const err = await refusal(LIMIT_REFUSAL);
    state.post = () => {
      throw err;
    };
    render(
      <>
        <PlanLockHost />
        <SendOne />
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("You've used 4 of 4 announcements this month")).toBeInTheDocument();
    expect(within(dialog).getByText(/Basic and up include more/)).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Not now" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("leaves any other failure to its toast", async () => {
    const spy = vi.spyOn(toast, "error");
    state.post = () => {
      throw new ApiError({ status: 500, message: "Something went wrong on our side." });
    };
    render(
      <>
        <PlanLockHost />
        <PublishSite />
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    await waitFor(() => expect(spy).toHaveBeenCalledWith("Something went wrong on our side."));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

// ─── The fee toggle and the grandfather rule ─────────────────────────────

function Entry({ eventId, hasFee = false }: { eventId?: number; hasFee?: boolean }) {
  const form = useForm({ defaultValues: { ...emptyEventForm, has_fee: hasFee, reg_fee: hasFee ? 100 : undefined } });
  const fee = useWatch({ control: form.control, name: "has_fee" });
  return (
    <Form {...form}>
      <form>
        <EntryStep eventId={eventId} />
        <output aria-label="has fee">{String(fee)}</output>
      </form>
    </Form>
  );
}

const feeSwitch = () => screen.getByRole("switch", { name: "Paid entry" });
const waitForPlan = () => waitFor(() => expect(calls.some((c) => c.path === "/api/v1/plans")).toBe(true));

describe("the fee toggle", () => {
  it("is locked on a plan without paid tickets: it opens the upgrade dialog and stays off", async () => {
    render(
      <>
        <PlanLockHost />
        <Entry />
      </>,
    );
    await waitForPlan();
    expect(await screen.findByLabelText("Locked: part of Basic and up")).toBeInTheDocument();
    fireEvent.click(feeSwitch());
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Paid tickets with Razorpay is part of Basic and up")).toBeInTheDocument();
    expect(screen.getByLabelText("has fee")).toHaveTextContent("false");
    // Merchandise and swag are locked the same way.
    expect(screen.getAllByLabelText(/^Locked: part of/).length).toBeGreaterThanOrEqual(3);
  });

  it("is not locked for an event the server grandfathers, and neither are merchandise and swag", async () => {
    render(
      <>
        <PlanLockHost />
        <Entry eventId={37} hasFee />
      </>,
    );
    await waitForPlan();
    await waitFor(() => expect(calls.some((c) => c.path === "/api/v1/events/info/37")).toBe(true));
    await waitFor(() => expect(screen.queryAllByLabelText(/^Locked: part of/)).toHaveLength(0));
    expect(screen.getByRole("spinbutton", { name: /Fee per person/ })).not.toBeDisabled();
    fireEvent.click(feeSwitch());
    expect(screen.getByLabelText("has fee")).toHaveTextContent("false");
    fireEvent.click(feeSwitch());
    expect(screen.getByLabelText("has fee")).toHaveTextContent("true");
    fireEvent.click(screen.getByRole("switch", { name: "Merchandise for sale" }));
    expect(screen.getByRole("switch", { name: "Merchandise for sale" })).toBeChecked();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("is locked for a paid event the server does not grandfather: it can be turned off, not back on, and its fee is fixed", async () => {
    render(
      <>
        <PlanLockHost />
        <Entry eventId={38} hasFee />
      </>,
    );
    await waitForPlan();
    expect(await screen.findByRole("spinbutton", { name: /Fee per person/ })).toBeDisabled();
    fireEvent.click(feeSwitch());
    expect(screen.getByLabelText("has fee")).toHaveTextContent("false");
    fireEvent.click(feeSwitch());
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("has fee")).toHaveTextContent("false");
  });

  it("is locked for an event from a server that does not say, whatever its age", async () => {
    render(
      <>
        <PlanLockHost />
        <Entry eventId={39} hasFee />
      </>,
    );
    await waitFor(() => expect(calls.some((c) => c.path === "/api/v1/events/info/39")).toBe(true));
    expect(await screen.findByRole("spinbutton", { name: /Fee per person/ })).toBeDisabled();
  });

  it("is plain when the plan has paid tickets", async () => {
    state.ent = { ...FREE_ENFORCED, features: { ...FREE_ENFORCED.features, tickets: true } };
    render(
      <>
        <PlanLockHost />
        <Entry />
      </>,
    );
    await waitForPlan();
    fireEvent.click(feeSwitch());
    expect(screen.getByLabelText("has fee")).toHaveTextContent("true");
    expect(screen.queryByLabelText("Locked: part of Basic and up")).not.toBeInTheDocument();
  });
});

// ─── Grandfathered events: exempt from every event-scoped lock ──────────

const EVENT_FEATURES = ["quiz", "polls", "qa", "links", "report", "merch", "swag", "badges", "teams", "judging", "rounds"];

function Probe({ eventId }: { eventId?: number }) {
  const gates = {
    quiz: useFeatureGate("quiz", { eventId }),
    polls: useFeatureGate("polls", { eventId }),
    qa: useFeatureGate("qa", { eventId }),
    links: useFeatureGate("links", { eventId }),
    report: useFeatureGate("report", { eventId }),
    merch: useFeatureGate("merch", { eventId }),
    swag: useFeatureGate("swag", { eventId }),
    badges: useFeatureGate("badges", { eventId }),
    teams: useFeatureGate("teams", { eventId }),
    judging: useFeatureGate("judging", { eventId }),
    rounds: useFeatureGate("rounds", { eventId }),
  };
  const items = useLimitGate("merch_items_per_event", 5, { eventId });
  const grandfathered = useEventGrandfathered(eventId);
  // Club-wide, whatever the event.
  const website = useFeatureGate("website");
  const finance = useFeatureGate("finance");
  return (
    <ul>
      {Object.entries(gates).map(([k, g]) => (
        <li key={k} aria-label={k}>
          {g.locked ? "locked" : "open"}
        </li>
      ))}
      <li aria-label="items">{items.locked ? "locked" : "open"}</li>
      <li aria-label="grandfathered">{String(grandfathered)}</li>
      <li aria-label="website">{website.locked ? "locked" : "open"}</li>
      <li aria-label="finance">{finance.locked ? "locked" : "open"}</li>
    </ul>
  );
}

/** Waits until both the plan and event 37's grandfathering are known, so a missing lock means exempt, not "not loaded yet". */
async function known37() {
  await waitFor(() => expect(screen.getByLabelText("website")).toHaveTextContent("locked"));
  await waitFor(() => expect(screen.getByLabelText("grandfathered")).toHaveTextContent("true"));
}

describe("a grandfathered event", () => {
  it("has no event-scoped lock; the club-wide ones stay", async () => {
    render(<Probe eventId={37} />);
    // Both known: the plan (website locks) and the event (the server grandfathers it).
    await waitFor(() => expect(screen.getByLabelText("website")).toHaveTextContent("locked"));
    await waitFor(() => expect(screen.getByLabelText("grandfathered")).toHaveTextContent("true"));
    for (const f of EVENT_FEATURES) expect(screen.getByLabelText(f)).toHaveTextContent("open");
    expect(screen.getByLabelText("items")).toHaveTextContent("open");
    expect(screen.getByLabelText("website")).toHaveTextContent("locked");
    expect(screen.getByLabelText("finance")).toHaveTextContent("locked");
  });

  it("is told apart from one the server does not grandfather", async () => {
    render(<Probe eventId={38} />);
    await waitFor(() => expect(calls.some((c) => c.path === "/api/v1/events/info/38")).toBe(true));
    await waitFor(() => expect(screen.getByLabelText("quiz")).toHaveTextContent("locked"));
    expect(screen.getByLabelText("grandfathered")).toHaveTextContent("false");
    for (const f of EVENT_FEATURES) expect(screen.getByLabelText(f)).toHaveTextContent("locked");
    expect(screen.getByLabelText("items")).toHaveTextContent("locked");
  });

  it("shows its store items' count without the lock", async () => {
    render(
      <>
        <LimitMeter limitKey="merch_items_per_event" used={5} eventId={37} />
        <LimitMeter limitKey="merch_items_per_event" used={5} eventId={38} />
      </>,
    );
    await waitFor(() => expect(calls.filter((c) => c.path.startsWith("/api/v1/events/info/")).length).toBe(2));
    await waitFor(() => expect(screen.getAllByText("5 of 5 items · Free")).toHaveLength(2));
    const [mine, theirs] = screen.getAllByRole("status");
    await waitFor(() => expect(mine).not.toHaveAttribute("data-full"));
    expect(theirs).toHaveAttribute("data-full", "true");
  });

  it("keeps its live quiz, polls and Q&A", async () => {
    render(
      <>
        <Probe eventId={37} />
        <LivePage eventId={37} />
      </>,
    );
    await known37();
    expect(screen.getByRole("button", { name: /Quiz/ })).toBeInTheDocument();
    expect(screen.queryAllByLabelText("Locked")).toHaveLength(0);
    expect(screen.queryByText(/is part of/)).not.toBeInTheDocument();
  });

  it("locks them for an event that is not", async () => {
    render(<LivePage eventId={38} />);
    await waitFor(() => expect(screen.getAllByLabelText("Locked")).toHaveLength(3));
    expect(await screen.findByText(/is part of Growth and up\./)).toBeInTheDocument();
  });

  it("makes tracking links on its own tab; the club's page stays locked", async () => {
    render(
      <>
        <PlanLockHost />
        <Probe eventId={37} />
        <NewLinkDialog scope={{ kind: "event", eventId: 37 }} label="Event link" />
        <NewLinkDialog scope={{ kind: "club" }} label="Club link" />
      </>,
    );
    await known37();
    fireEvent.click(await screen.findByRole("button", { name: /Event link/ }));
    const made = await screen.findByRole("dialog");
    expect(within(made).queryByText(/is part of/)).not.toBeInTheDocument();
    fireEvent.keyDown(made, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /Club link/ }));
    expect(within(await screen.findByRole("dialog")).getByText("Tracking links is part of Growth and up")).toBeInTheDocument();
  });

  it("carries no lock on its event-scoped tabs; Finance stays locked, being the club's ledger", async () => {
    render(
      <>
        <Probe eventId={37} />
        <EventConsole eventId={37}>
          <p>Body</p>
        </EventConsole>
      </>,
    );
    const nav = await screen.findByRole("navigation", { name: "Event sections" });
    await known37();
    await waitFor(() => expect(within(within(nav).getByRole("link", { name: /Finance/ })).getByLabelText("Locked")).toBeInTheDocument());
    for (const tab of ["Links", "Competition", "Merchandise", "Swag", "ID cards"]) {
      expect(within(within(nav).getByRole("link", { name: new RegExp(`^${tab}`) })).queryByLabelText("Locked")).not.toBeInTheDocument();
    }
  });

  it("is not on the tabs of an event that is not grandfathered", async () => {
    render(
      <EventConsole eventId={38}>
        <p>Body</p>
      </EventConsole>,
    );
    const nav = await screen.findByRole("navigation", { name: "Event sections" });
    for (const tab of ["Links", "Finance", "Competition", "Merchandise", "Swag", "ID cards"]) {
      await waitFor(() => expect(within(within(nav).getByRole("link", { name: new RegExp(`^${tab}`) })).getByLabelText("Locked")).toBeInTheDocument());
    }
  });
});

// ─── What a copy left out ────────────────────────────────────────────────

function Duplicate() {
  const dup = useDuplicateEvent(37);
  return (
    <button type="button" onClick={() => dup.mutate({ name: "Hack Night 05", event_datetime: iso(7 * DAY), copy_merch: true, copy_doors: true, copy_team: false, copy_agenda: false })}>
      Duplicate
    </button>
  );
}

describe("duplicating on a smaller plan", () => {
  it("words what was left out", () => {
    expect(skippedNotice(["swag", "badges"])).toBe("Copied. Swag items and badge designs weren't copied on your plan.");
    expect(skippedNotice(["report"])).toBe("Copied. Report settings weren't copied on your plan.");
    expect(skippedNotice(["quiz"])).toBe("Copied. The quiz wasn't copied on your plan.");
    expect(skippedNotice(["teams", "judging", "rounds", "merch_items_per_event"])).toBe("Copied. The competition setup and merchandise items past your plan's limit weren't copied on your plan.");
    expect(skippedNotice(["swag", "badges", "report"])).toBe("Copied. Swag items, badge designs and report settings weren't copied on your plan.");
    expect(skippedNotice([])).toBeNull();
    expect(skippedNotice(undefined)).toBeNull();
  });

  it("says so after the copy is made, and says nothing when all of it was copied", async () => {
    const info = vi.spyOn(toast, "info");
    state.post = () => ({ id: 70, slug: "hack-night-05", name: "Hack Night 05", copied: { doors: 2 }, skipped: ["swag", "badges"] });
    const { unmount } = render(<Duplicate />);
    fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));
    await waitFor(() => expect(info).toHaveBeenCalledWith("Copied. Swag items and badge designs weren't copied on your plan."));
    expect(calls.find((c) => c.method === "POST")?.path).toBe("/api/v1/events/37/duplicate");
    unmount();

    info.mockClear();
    const success = vi.spyOn(toast, "success");
    // An older server sends no `skipped` at all.
    state.post = () => ({ id: 71, slug: "hack-night-06", name: "Hack Night 06", copied: {} });
    render(<Duplicate />);
    fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));
    await waitFor(() => expect(success).toHaveBeenCalledWith("Hack Night 06 created as a draft", expect.anything()));
    expect(info).not.toHaveBeenCalled();
  });
});

// ─── Meters and create buttons at a limit ────────────────────────────────

describe("limit meters", () => {
  it("say how many events are left this month, and New event opens the upgrade dialog at the cap", async () => {
    render(
      <>
        <PlanLockHost />
        <ClubEventsList />
      </>,
    );
    expect(await screen.findByText("2 of 2 events this month · Free")).toBeInTheDocument();
    // Not a link to a form that cannot be saved.
    expect(screen.queryByRole("link", { name: /New event/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /New event/ }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("You've used 2 of 2 events this month")).toBeInTheDocument();
    expect(within(dialog).getByText(/That's all Free includes this month/)).toBeInTheDocument();
  });

  it("let New event through under the cap", async () => {
    state.ent = { ...FREE_ENFORCED, usage: { ...FREE_ENFORCED.usage, events_per_month: 1 } };
    render(<ClubEventsList />);
    expect(await screen.findByText("1 of 2 events this month · Free")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /New event/ })).toHaveAttribute("href", "/events/new");
  });

  it("count the team's seats, lock the invite at the cap, and lock roles the plan lacks", async () => {
    render(
      <>
        <PlanLockHost />
        <AccessPage />
      </>,
    );
    expect(await screen.findByText("1 of 1 seats · Free")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Invite someone/ }));
    expect(within(await screen.findByRole("dialog")).getByText("You've used 1 of 1 seats")).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Not now" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    // Giving Ed a role other than the default is the plan's `roles`: nothing is sent.
    const select = screen.getByRole("combobox", { name: "Role for Ed" });
    expect(within(select).getByRole("option", { name: "Admin · Pro" })).toBeInTheDocument();
    fireEvent.change(select, { target: { value: "admin" } });
    expect(within(await screen.findByRole("dialog")).getByText(/^Team roles( and access)? is part of Pro and up$/)).toBeInTheDocument();
    expect(calls.some((c) => c.method === "PATCH")).toBe(false);
  });

  it("count the month's announcements, and the button opens the upgrade dialog at the cap", async () => {
    state.ent = { ...FREE_ENFORCED, usage: { ...FREE_ENFORCED.usage, announcements_per_month: 4 } };
    render(
      <>
        <PlanLockHost />
        <LimitMeter limitKey="announcements_per_month" />
        <NewAnnouncementDialog />
      </>,
    );
    expect(await screen.findByText("4 of 4 announcements this month · Free")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /New announcement/ }));
    expect(within(await screen.findByRole("dialog")).getByText("You've used 4 of 4 announcements this month")).toBeInTheDocument();
  });

  it("count a store's items from the screen's own figure", async () => {
    render(<LimitMeter limitKey="merch_items_per_event" used={5} />);
    expect(await screen.findByText("5 of 5 items · Free")).toBeInTheDocument();
  });
});

// ─── Wholly-locked areas ─────────────────────────────────────────────────

describe("locked areas", () => {
  it("keep their nav item navigable, with a lock", async () => {
    render(<SidebarNav />);
    await waitForPlan();
    const links = await screen.findByRole("link", { name: /Tracking links/ });
    expect(links).toHaveAttribute("href", "/links");
    expect(within(links).getByLabelText("Locked: part of Growth and up")).toBeInTheDocument();
    expect(within(screen.getByRole("link", { name: /Finance/ })).getByLabelText("Locked: part of Pro and up")).toBeInTheDocument();
    expect(within(screen.getByRole("link", { name: /Events/ })).queryByLabelText(/Locked/)).not.toBeInTheDocument();
  });

  it("say what is missing over the area, with the way to the plans", async () => {
    render(<LockedNotice feature="links" />);
    expect(await screen.findByText(/Tracking links is part of Growth and up\./)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See plans" })).toHaveAttribute("href", "/billing");
  });
});

// ─── The kill switch ─────────────────────────────────────────────────────

describe("with enforcement off", () => {
  beforeEach(() => {
    state.ent = NOT_ENFORCED;
  });

  it("shows no lock, no meter and no upgrade anywhere", async () => {
    render(
      <>
        <PlanLockHost />
        <ClubEventsList />
        <SidebarNav />
        <LockedNotice feature="links" />
        <LimitMeter limitKey="committee_seats" />
        <Entry />
      </>,
    );
    expect(await screen.findByRole("link", { name: /New event/ })).toHaveAttribute("href", "/events/new");
    await waitFor(() => expect(calls.some((c) => c.path === "/api/v1/clubs/entitlements")).toBe(true));
    expect(screen.queryByText(/events this month/)).not.toBeInTheDocument();
    expect(screen.queryByText(/seats/)).not.toBeInTheDocument();
    expect(screen.queryByText(/is part of/)).not.toBeInTheDocument();
    expect(screen.queryAllByLabelText(/^Locked/)).toHaveLength(0);
    fireEvent.click(feeSwitch());
    expect(screen.getByLabelText("has fee")).toHaveTextContent("true");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // Nothing asks for the catalogue while nothing is locked.
    expect(calls.some((c) => c.path === "/api/v1/plans")).toBe(false);
  });

  it("still answers a refusal from the server with the upgrade dialog", async () => {
    const err = await refusal(FEATURE_REFUSAL);
    state.post = () => {
      throw err;
    };
    render(
      <>
        <PlanLockHost />
        <PublishSite />
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    expect(within(await screen.findByRole("dialog")).getByText("The club website is part of Basic and up")).toBeInTheDocument();
  });
});

