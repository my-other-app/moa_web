import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { toast } from "@moa/ui";

/**
 * Duplicating, archiving and Razorpay-syncing a plan, and the side-by-side
 * comparison of every plan.
 *
 * Archiving is the dangerous one: a plan with subscribers must become Legacy
 * (they keep it, nobody new can pick it) and never be deleted out from under
 * them. The API makes that call; the dialog has to describe the right one and
 * the toast has to repeat what the API actually did.
 */
let role: string | null = "owner";
let plansResponse: Array<Record<string, unknown>> = [];
const calls: Array<{ method: string; path: string; body?: unknown }> = [];
let refuse: Error | null = null;
let postReply: (path: string) => unknown = () => undefined;

const FEATURE_GROUPS = {
  every_event: ["tickets", "certificates"],
  grow: ["quiz"],
  club: ["sso"],
};

function plan(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    key: "growth",
    name: "Growth",
    tagline: "For active clubs",
    price_monthly_paise: 149900,
    price_yearly_paise: 1499000,
    trial_days: 0,
    visibility: "public",
    sort_order: 1,
    billable: true,
    subscriber_count: 12,
    limits: { events_per_month: 10, announcements_per_month: null, coupons_per_event: 0 },
    features: { tickets: true, certificates: true, quiz: true, sso: false },
    feature_groups: FEATURE_GROUPS,
    ...overrides,
  };
}

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    useSession: () => ({
      data: { id: 1, username: "me", email: "me@example.com", full_name: "Me", user_type: "admin", admin_role: role },
    }),
    api: {
      get: vi.fn(async (path: string) => {
        calls.push({ method: "GET", path });
        if (path === "/api/v1/admin/plans") return plansResponse;
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(async (path: string, body?: unknown) => {
        calls.push({ method: "POST", path, body });
        if (refuse) throw refuse;
        return postReply(path);
      }),
      put: vi.fn(async (path: string, body?: unknown) => {
        calls.push({ method: "PUT", path, body });
        if (refuse) throw refuse;
        return plan(body as Record<string, unknown>);
      }),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { PlansTab } = await import("./components/plans-tab");
const { CompareTab } = await import("./components/compare-tab");

const writes = () => calls.filter((c) => c.method !== "GET");
const planReads = () => calls.filter((c) => c.method === "GET").length;
let success: MockInstance<typeof toast.success>;
let failure: MockInstance<typeof toast.error>;

beforeEach(() => {
  role = "owner";
  calls.length = 0;
  refuse = null;
  postReply = () => undefined;
  plansResponse = [
    plan(),
    plan({ id: 2, key: "starter", name: "Starter", price_monthly_paise: 49900, price_yearly_paise: 499000, subscriber_count: 0, billable: false }),
  ];
  success = vi.spyOn(toast, "success");
  failure = vi.spyOn(toast, "error");
});

afterEach(() => vi.restoreAllMocks());

/** Opens the editor on one plan. */
async function selectPlan(name: string) {
  render(<PlansTab />);
  const card = await screen.findByRole("button", { name: new RegExp(`^${name}`) });
  fireEvent.click(card);
  await waitFor(() => expect(screen.getByLabelText("Plan name")).toHaveValue(name));
}

describe("duplicate a plan", () => {
  it("copies it on the server and says the copy is hidden until published", async () => {
    postReply = () => plan({ id: 9, key: "growth-copy", name: "Growth (copy)", visibility: "hidden", subscriber_count: 0 });
    await selectPlan("Growth");
    const before = planReads();
    fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));

    await waitFor(() => expect(success).toHaveBeenCalledWith("Duplicated as “Growth (copy)” — hidden until you publish it"));
    expect(writes()).toEqual([{ method: "POST", path: "/api/v1/admin/plans/1/duplicate", body: undefined }]);
    // The catalogue is read again, so the copy appears.
    await waitFor(() => expect(planReads()).toBeGreaterThan(before));
  });

  it("says why when the server refuses", async () => {
    refuse = new Error("A plan with key growth-copy already exists");
    await selectPlan("Growth");
    fireEvent.click(screen.getByRole("button", { name: "Duplicate" }));
    await waitFor(() => expect(failure).toHaveBeenCalledWith("A plan with key growth-copy already exists"));
    expect(success).not.toHaveBeenCalled();
  });
});

describe("archive or delete a plan", () => {
  it("offers to archive a plan clubs are on, and says they keep it", async () => {
    await selectPlan("Growth");
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    const confirm = await screen.findByRole("dialog");
    expect(within(confirm).getByText("Archive Growth?")).toBeInTheDocument();
    expect(within(confirm).getByText(/It becomes Legacy: the 12 clubs on it keep it, but nobody new can choose it/)).toBeInTheDocument();
    expect(within(confirm).getByText(/cannot be deleted — deleting it would drop them to the free plan/)).toBeInTheDocument();
  });

  it("cancelling sends nothing", async () => {
    await selectPlan("Growth");
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    const confirm = await screen.findByRole("dialog");
    fireEvent.click(within(confirm).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(writes()).toEqual([]);
  });

  it("archives, repeats what the API did, and reloads the catalogue", async () => {
    postReply = () => ({ outcome: "archived", message: "Growth archived: 12 clubs keep it" });
    await selectPlan("Growth");
    const before = planReads();
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    const confirm = await screen.findByRole("dialog");
    fireEvent.click(within(confirm).getByRole("button", { name: "Archive plan" }));

    await waitFor(() => expect(success).toHaveBeenCalledWith("Growth archived: 12 clubs keep it"));
    expect(writes()).toEqual([{ method: "POST", path: "/api/v1/admin/plans/1/archive", body: undefined }]);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(planReads()).toBeGreaterThan(before));
  });

  it("offers to delete a plan nobody is on, through the same endpoint", async () => {
    postReply = () => ({ outcome: "deleted", message: "Starter deleted" });
    await selectPlan("Starter");
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    const confirm = await screen.findByRole("dialog");
    expect(within(confirm).getByText("Delete Starter?")).toBeInTheDocument();
    expect(within(confirm).getByText("Nobody is subscribed, so it is removed completely.")).toBeInTheDocument();
    fireEvent.click(within(confirm).getByRole("button", { name: "Delete plan" }));

    await waitFor(() => expect(success).toHaveBeenCalledWith("Starter deleted"));
    expect(writes()).toEqual([{ method: "POST", path: "/api/v1/admin/plans/2/archive", body: undefined }]);
  });

  it("keeps the dialog open and says why when the server refuses", async () => {
    refuse = new Error("Plan not found");
    await selectPlan("Growth");
    fireEvent.click(screen.getByRole("button", { name: "Archive" }));
    const confirm = await screen.findByRole("dialog");
    fireEvent.click(within(confirm).getByRole("button", { name: "Archive plan" }));

    await waitFor(() => expect(failure).toHaveBeenCalledWith("Plan not found"));
    expect(success).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("sync a plan to Razorpay", () => {
  it("is offered only on a plan that cannot be charged yet", async () => {
    await selectPlan("Growth");
    expect(screen.queryByRole("button", { name: "Register with Razorpay" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Starter/ }));
    expect(await screen.findByRole("button", { name: "Register with Razorpay" })).toBeInTheDocument();
    // The catalogue says so too, rather than leaving it to checkout.
    expect(screen.getByText("· not billable")).toBeInTheDocument();
  });

  it("registers it and says it can now be charged", async () => {
    postReply = () => plan({ id: 2, key: "starter", name: "Starter", billable: true, subscriber_count: 0 });
    await selectPlan("Starter");
    fireEvent.click(screen.getByRole("button", { name: "Register with Razorpay" }));

    await waitFor(() => expect(success).toHaveBeenCalledWith("Starter is registered with Razorpay and can be charged"));
    expect(writes()).toEqual([{ method: "POST", path: "/api/v1/admin/plans/2/sync", body: undefined }]);
  });

  it("says when Razorpay took it but it still cannot be charged", async () => {
    postReply = () => plan({ id: 2, key: "starter", name: "Starter", billable: false, subscriber_count: 0 });
    await selectPlan("Starter");
    fireEvent.click(screen.getByRole("button", { name: "Register with Razorpay" }));
    await waitFor(() =>
      expect(success).toHaveBeenCalledWith("Starter synced, but it still is not billable — check its prices")
    );
  });

  it("says Razorpay would not accept it when it refuses without a reason", async () => {
    refuse = new Error("");
    await selectPlan("Starter");
    fireEvent.click(screen.getByRole("button", { name: "Register with Razorpay" }));
    await waitFor(() => expect(failure).toHaveBeenCalledWith("Razorpay would not accept the plan"));
    expect(success).not.toHaveBeenCalled();
  });
});

describe("who can change plans", () => {
  it("shows support the plans read-only, with none of the actions", async () => {
    role = "support";
    render(<PlansTab />);
    expect(await screen.findByText(/Only owners can create or change plans/)).toBeInTheDocument();
    for (const name of ["Duplicate", "Archive", "Delete", "Register with Razorpay", "Save plan", "New plan"]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
    expect(screen.getByLabelText("Plan name")).toBeDisabled();
  });
});

describe("saving a plan the server refuses", () => {
  it("keeps the unsaved changes and says why", async () => {
    refuse = new Error("Key already taken");
    await selectPlan("Growth");
    fireEvent.change(screen.getByLabelText("Tagline"), { target: { value: "For busy clubs" } });
    fireEvent.click(screen.getByRole("button", { name: "Save plan" }));

    await waitFor(() => expect(failure).toHaveBeenCalledWith("Key already taken"));
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    expect(screen.getByLabelText("Tagline")).toHaveValue("For busy clubs");
  });
});

describe("compare every plan side by side", () => {
  /** The cells of one row, in plan order: the label's following siblings. */
  function row(label: string, plans: number) {
    let cell = screen.getByText(label).nextElementSibling;
    const cells: Element[] = [];
    while (cell && cells.length < plans) {
      cells.push(cell);
      cell = cell.nextElementSibling;
    }
    return cells;
  }

  beforeEach(() => {
    plansResponse = [
      plan({ id: 3, key: "free", name: "Free", price_monthly_paise: 0, price_yearly_paise: 0, limits: { events_per_month: 2, coupons_per_event: 0 }, features: { tickets: true } }),
      plan(),
      plan({ id: 4, key: "pro", name: "Pro", price_monthly_paise: 299900, limits: { events_per_month: null, coupons_per_event: null }, features: { tickets: true, certificates: true, quiz: true, sso: true } }),
      plan({ id: 5, key: "campus", name: "Campus", visibility: "legacy", subscriber_count: 0 }),
    ];
  });

  it("heads a column per plan on sale, with its monthly price, leaving out withdrawn plans", async () => {
    render(<CompareTab />);
    expect(await screen.findByText("Free · Free")).toBeInTheDocument();
    expect(screen.getByText("Growth · ₹1,499/mo")).toBeInTheDocument();
    expect(screen.getByText("Pro · ₹2,999/mo")).toBeInTheDocument();
    expect(screen.queryByText(/^Campus/)).toBeNull();
  });

  it("shows each limit per plan, keeping unlimited apart from none allowed", async () => {
    render(<CompareTab />);
    await screen.findByText("Free · Free");
    expect(row("Events · per month", 3).map((c) => c.textContent)).toEqual(["2", "10", "Unlimited"]);
    expect(row("Coupon codes · per event", 3).map((c) => c.textContent)).toEqual(["0", "0", "Unlimited"]);
  });

  it("ticks each feature a plan includes and dashes the rest", async () => {
    render(<CompareTab />);
    await screen.findByText("Free · Free");
    const ticks = (label: string) =>
      row(label, 3).map((c) => (c.querySelector("svg.lucide-check") ? "yes" : c.querySelector("svg.lucide-minus") ? "no" : "?"));
    expect(ticks("Live quiz")).toEqual(["no", "yes", "yes"]);
    expect(ticks("Student SSO")).toEqual(["no", "no", "yes"]);
    expect(screen.getByText("Every event")).toBeInTheDocument();
  });

  it("says when there is nothing to compare", async () => {
    plansResponse = [plan({ visibility: "legacy" })];
    render(<CompareTab />);
    expect(await screen.findByText("No plans to compare")).toBeInTheDocument();
  });
});
