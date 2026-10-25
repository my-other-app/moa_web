import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { ApiError } from "@moa/api";

/**
 * The event row's menu, apart from delete: duplicating an event (the copy
 * itself — what is asked, what is sent, where the organiser lands) and the
 * public page, opened or copied. The "left out on your plan" wording has its
 * own tests in plan.test.tsx; here it is checked to reach the organiser.
 */
const calls: Array<{ method: string; path: string; body?: unknown }> = [];
const push = vi.fn();
let entitlements: unknown = null;
let refuse: Error | null = null;
let skipped: string[] = [];

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/events",
  useSearchParams: () => new URLSearchParams(),
}));

const FREE_AT_CAP = {
  plan_key: "free", plan_name: "Free", status: null, cycle: null, current_period_end: null,
  limits: { events_per_month: 2 }, features: { checkin: true }, configured: true,
  requested_plan: null, requested_cycle: null, subscription_status: null,
  usage: { events_per_month: 2 }, enforced: true, grandfathered_before: null,
};
const CATALOG = {
  currency: "INR", yearly_months_free: 2,
  plans: [
    { id: 1, key: "free", name: "Free", tagline: null, price_monthly_paise: 0, price_yearly_paise: 0, trial_days: 0, contact_sales: false, featured: false, limits: { events_per_month: 2 }, features: [] },
    { id: 2, key: "basic", name: "Basic", tagline: null, price_monthly_paise: 49900, price_yearly_paise: 499000, trial_days: 0, contact_sales: false, featured: false, limits: { events_per_month: 6 }, features: [] },
  ],
};

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        calls.push({ method: "GET", path });
        if (path === "/api/v1/clubs/access/me") throw new ApiError({ status: 404, message: "Not Found", routeMissing: true });
        if (path === "/api/v1/clubs/entitlements") {
          if (entitlements) return entitlements;
          throw new Error("no plan in this test");
        }
        if (path === "/api/v1/plans") return CATALOG;
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(async (path: string, body: { name: string }) => {
        calls.push({ method: "POST", path, body });
        if (refuse) throw refuse;
        return { id: 91, slug: "hack-night-05", name: body.name, copied: { doors: 2, merch: 3 }, skipped };
      }),
      patch: vi.fn(),
      put: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { toast } = await import("@moa/ui");
const { EventRowMenu } = await import("./components/event-row-menu");
const { PlanLockHost } = await import("@/features/plan");

const HACK = { id: 68, name: "Hack Night 04", slug: "hack-night-04", registration_count: 12 };

const openMenu = async (name = HACK.name) => {
  fireEvent.keyDown(await screen.findByRole("button", { name: `More for ${name}` }), { key: "Enter" });
};
const choose = async (item: RegExp) => fireEvent.click(await screen.findByRole("menuitem", { name: item }));
const posts = () => calls.filter((c) => c.method === "POST");

beforeEach(() => {
  calls.length = 0;
  push.mockClear();
  entitlements = null;
  refuse = null;
  skipped = [];
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("duplicating an event", () => {
  it("offers a copy named after the event, a week out on the hour, with merch and doors ticked", async () => {
    render(<EventRowMenu event={HACK} />);
    await openMenu();
    await choose(/Duplicate/);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Duplicate Hack Night 04")).toBeInTheDocument();
    expect(within(dialog).getByText(/The venue, the guest list and every record of the day stay behind/)).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Name")).toHaveValue("Hack Night 04 (copy)");

    const starts = (within(dialog).getByLabelText("Starts") as HTMLInputElement).value;
    const weekOut = new Date();
    weekOut.setDate(weekOut.getDate() + 7);
    expect(starts.slice(0, 10)).toBe(`${weekOut.getFullYear()}-${String(weekOut.getMonth() + 1).padStart(2, "0")}-${String(weekOut.getDate()).padStart(2, "0")}`);
    expect(starts.slice(13)).toBe(":00");

    expect(within(dialog).getByRole("checkbox", { name: /Merchandise and swag/ })).toBeChecked();
    expect(within(dialog).getByRole("checkbox", { name: /Doors/ })).toBeChecked();
    expect(within(dialog).getByRole("checkbox", { name: /Team/ })).not.toBeChecked();
    expect(within(dialog).getByRole("checkbox", { name: /Agenda/ })).not.toBeChecked();
    expect(posts()).toEqual([]);
  });

  it("sends the name, the new start and what to copy, then opens the copy as a draft", async () => {
    const success = vi.spyOn(toast, "success");
    const info = vi.spyOn(toast, "info");
    render(<EventRowMenu event={HACK} />);
    await openMenu();
    await choose(/Duplicate/);
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "  Hack Night 05 " } });
    fireEvent.change(within(dialog).getByLabelText("Starts"), { target: { value: "2026-12-04T18:30" } });
    fireEvent.click(within(dialog).getByRole("checkbox", { name: /Merchandise and swag/ }));
    fireEvent.click(within(dialog).getByRole("checkbox", { name: /Team/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Create the copy" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/events/91"));
    expect(posts()).toEqual([
      {
        method: "POST",
        path: "/api/v1/events/68/duplicate",
        body: { name: "Hack Night 05", event_datetime: new Date("2026-12-04T18:30").toISOString(), copy_merch: false, copy_doors: true, copy_team: true, copy_agenda: false },
      },
    ]);
    expect(success).toHaveBeenCalledWith("Hack Night 05 created as a draft", { description: "Set its venue and dates, then publish it." });
    // Nothing was held back, so nothing more is said.
    expect(info).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("tells the organiser what their plan kept out of the copy", async () => {
    const info = vi.spyOn(toast, "info");
    skipped = ["swag", "badges"];
    render(<EventRowMenu event={HACK} />);
    await openMenu();
    await choose(/Duplicate/);
    fireEvent.click(await screen.findByRole("button", { name: "Create the copy" }));
    await waitFor(() => expect(info).toHaveBeenCalledWith("Copied. Swag items and badge designs weren't copied on your plan."));
    expect(push).toHaveBeenCalledWith("/events/91");
  });

  it("will not copy without a name", async () => {
    render(<EventRowMenu event={HACK} />);
    await openMenu();
    await choose(/Duplicate/);
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "   " } });
    const create = within(dialog).getByRole("button", { name: "Create the copy" });
    expect(create).toBeDisabled();
    fireEvent.submit(create.closest("form")!);
    expect(posts()).toEqual([]);
  });

  it("stays on the dialog with the server's words when the copy is refused", async () => {
    const error = vi.spyOn(toast, "error");
    refuse = new ApiError({ status: 422, message: "Pick a start after today" });
    render(<EventRowMenu event={HACK} />);
    await openMenu();
    await choose(/Duplicate/);
    fireEvent.click(await screen.findByRole("button", { name: "Create the copy" }));
    await waitFor(() => expect(error).toHaveBeenCalledWith("Pick a start after today"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("closes on Cancel without copying", async () => {
    render(<EventRowMenu event={HACK} />);
    await openMenu();
    await choose(/Duplicate/);
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(posts()).toEqual([]);
  });

  it("opens the upgrade dialog instead at the month's event limit, and copies nothing", async () => {
    entitlements = FREE_AT_CAP;
    render(
      <>
        <PlanLockHost />
        <EventRowMenu event={HACK} />
      </>,
    );
    // Let the plan load before reaching for the menu.
    await waitFor(() => expect(calls.some((c) => c.path === "/api/v1/plans")).toBe(true));
    await openMenu();
    await choose(/Duplicate/);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("You've used 2 of 2 events this month")).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Create the copy" })).not.toBeInTheDocument();
    expect(posts()).toEqual([]);
  });
});

describe("the event's public page from the menu", () => {
  let open: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    open = vi.fn();
    vi.stubGlobal("open", open);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("opens the public page, never the dashboard, in a new tab", async () => {
    render(<EventRowMenu event={HACK} />);
    await openMenu();
    await choose(/Open public page/);
    expect(open).toHaveBeenCalledWith("https://myotherapp.in/events/hack-night-04", "_blank", "noopener,noreferrer");
  });

  it("opens the id address for an event that has no slug yet, which the site redirects", async () => {
    render(<EventRowMenu event={{ ...HACK, slug: null }} />);
    await openMenu();
    await choose(/Open public page/);
    expect(open).toHaveBeenCalledWith("https://myotherapp.in/68", "_blank", "noopener,noreferrer");
  });

  it("copies the public link and says so", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const success = vi.spyOn(toast, "success");
    render(<EventRowMenu event={{ ...HACK, slug: "hack night/04" }} />);
    await openMenu();
    await choose(/Copy public link/);
    await waitFor(() => expect(success).toHaveBeenCalledWith("Public event link copied"));
    expect(writeText).toHaveBeenCalledWith("https://myotherapp.in/events/hack%20night%2F04");
    expect(open).not.toHaveBeenCalled();
  });

  it("opens the page instead when the browser will not let it copy", async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn(async () => Promise.reject(new DOMException("denied", "NotAllowedError"))) } });
    const success = vi.spyOn(toast, "success");
    render(<EventRowMenu event={HACK} />);
    await openMenu();
    await choose(/Copy public link/);
    await waitFor(() => expect(open).toHaveBeenCalledWith("https://myotherapp.in/events/hack-night-04", "_blank", "noopener,noreferrer"));
    expect(success).not.toHaveBeenCalled();
  });
});
