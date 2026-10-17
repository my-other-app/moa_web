import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";

import detailFixture from "../__fixtures__/club-detail.json";
import eventsFixture from "../__fixtures__/club-events.json";
import followersFixture from "../__fixtures__/club-followers.json";
import pendingFixture from "../__fixtures__/club-pending.json";
import lifetimeFixture from "../__fixtures__/club-lifetime.json";

const calls: Array<{ method: string; path: string; body?: unknown }> = [];
let detail: unknown = detailFixture;

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        calls.push({ method: "GET", path });
        if (/\/clubs\/followers\//.test(path)) return followersFixture;
        if (/\/clubs\/\d+\/events/.test(path)) return eventsFixture;
        if (/\/clubs\/admin\/\d+\/lifetime$/.test(path)) return lifetimeFixture;
        if (/\/clubs\/admin\/\d+$/.test(path)) return detail;
        throw new Error(`unstubbed GET ${path}`);
      }),
      put: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "PUT", path, body });
      }),
      post: vi.fn(async (path: string) => {
        calls.push({ method: "POST", path });
      }),
      del: vi.fn(async (path: string) => {
        calls.push({ method: "DELETE", path });
      }),
    },
  };
});

const { render } = await import("@/test/render");
const { ClubDetail } = await import("./components/club-detail");
const { adminClubDetailSchema } = await import("./schemas");
const { updateClub } = await import("./api");

beforeEach(() => {
  calls.length = 0;
  detail = detailFixture;
});

describe("club detail schema", () => {
  it("parses a verified club with its admin stats", () => {
    const club = adminClubDetailSchema.parse(detailFixture);
    expect(club.admin_stats.total_registrations).toBe(340);
    expect(club.admin_stats.total_revenue).toBe(18500);
    expect(club.is_verified).toBe(true);
  });

  it("parses a pending club with nothing filled in", () => {
    const club = adminClubDetailSchema.parse(pendingFixture);
    expect(club.is_verified).toBe(false);
    expect(club.interests).toEqual([]);
    expect(club.org).toBeNull();
  });

  it("defaults admin_stats when the field is absent", () => {
    const { admin_stats: _omitted, ...withoutStats } = detailFixture as Record<
      string,
      unknown
    >;
    const club = adminClubDetailSchema.parse(withoutStats);
    expect(club.admin_stats.total_revenue).toBe(0);
  });
});

describe("club detail page", () => {
  it("renders without throwing", () => {
    expect(() => render(<ClubDetail clubId={5} />)).not.toThrow();
  });

  it("shows the club and its performance figures", async () => {
    render(<ClubDetail clubId={5} />);
    expect(await screen.findByRole("heading", { name: "IEDC CET" })).toBeInTheDocument();
    expect(await screen.findByText("Registrations")).toBeInTheDocument();
    expect(await screen.findByText("340")).toBeInTheDocument();
    // "Followers" is both a stat label and a tab.
    expect((await screen.findAllByText("Followers")).length).toBeGreaterThan(0);
    expect(await screen.findByText("128")).toBeInTheDocument();
    expect(await screen.findByText("Revenue")).toBeInTheDocument();
  });

  it("shows the lifetime figures from their own endpoint", async () => {
    render(<ClubDetail clubId={5} />);
    expect(await screen.findByText("Events run")).toBeInTheDocument();
    expect(await screen.findByText("Guests admitted")).toBeInTheDocument();
    expect(await screen.findByText("388")).toBeInTheDocument();
    expect(await screen.findByText("63%")).toBeInTheDocument();
    expect(calls.some((c) => c.path.endsWith("/clubs/admin/5/lifetime"))).toBe(true);
  });

  it("names the account owner, which the list cannot show", async () => {
    render(<ClubDetail clubId={5} />);
    expect(await screen.findByText(/Owner iedc@example.com/)).toBeInTheDocument();
  });

  it("reads the admin endpoint, not the public one", async () => {
    // /clubs/info/{id} enforces is_verified and 404s on a pending club.
    render(<ClubDetail clubId={5} />);
    await screen.findByRole("heading", { name: "IEDC CET" });
    expect(calls.some((c) => c.path.includes("/clubs/admin/5"))).toBe(true);
    expect(calls.some((c) => c.path.includes("/clubs/info/"))).toBe(false);
  });

  it("offers Approve only while the club is pending", async () => {
    render(<ClubDetail clubId={5} />);
    await screen.findByRole("heading", { name: "IEDC CET" });
    expect(screen.queryByRole("button", { name: /Approve/ })).not.toBeInTheDocument();
  });

  it("offers Approve for a pending club", async () => {
    detail = pendingFixture;
    render(<ClubDetail clubId={14} />);
    expect(
      await screen.findByRole("button", { name: /Approve/ })
    ).toBeInTheDocument();
  });

  it("shows the plan a club asked for on its application", async () => {
    detail = pendingFixture;
    render(<ClubDetail clubId={14} />);
    expect(await screen.findByText("Requested plan: Pro · monthly")).toBeInTheDocument();
    expect(adminClubDetailSchema.parse(pendingFixture)).toMatchObject({ requested_plan: "pro", requested_cycle: "monthly" });
  });

  it("shows the three sub-tabs", async () => {
    render(<ClubDetail clubId={5} />);
    for (const tab of ["Events", "Followers", "Edit"]) {
      expect(await screen.findByRole("tab", { name: tab })).toBeInTheDocument();
    }
  });
});

describe("club update payload", () => {
  /*
   * PUT /clubs/admin/{id} assigns every column from the request and deletes
   * the interest links before re-adding the ids it was given, so an omitted
   * field is cleared rather than left alone -- the same trap that silently
   * wiped club interests from the clubs dashboard.
   */
  function entries(body: unknown): Record<string, string> {
    expect(body).toBeInstanceOf(FormData);
    const out: Record<string, string> = {};
    for (const [k, v] of (body as FormData).entries()) out[k] = String(v);
    return out;
  }

  const base = {
    name: "IEDC CET",
    about: "About",
    location_name: "Trivandrum",
    location_link: "",
    contact_email: "iedc@example.com",
    contact_phone: "9000000005",
    instagram: "",
    youtube: "",
    linkedin: "",
    website: "",
    org_id: 1,
    interest_ids: [6, 7],
  };

  it("sends the interest ids and org so saving does not wipe them", async () => {
    await updateClub(5, base);
    const sent = entries(calls[0]!.body);
    expect(sent.interest_ids).toBe("6,7");
    expect(sent.org_id).toBe("1");
  });

  it("omits org_id entirely when the club has no organisation", async () => {
    // The field is `int | None` server-side; an empty string is a 422.
    await updateClub(5, { ...base, org_id: null });
    expect(entries(calls[0]!.body)).not.toHaveProperty("org_id");
  });

  it("sends an empty interest list rather than dropping the field", async () => {
    await updateClub(5, { ...base, interest_ids: [] });
    expect(entries(calls[0]!.body).interest_ids).toBe("");
  });
});
