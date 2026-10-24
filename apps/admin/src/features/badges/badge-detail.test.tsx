import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";

import { shownPicture, stubImageLoading } from "@/test/images";

import recipientsFixture from "../__fixtures__/badge-recipients.json";
import statsFixture from "../__fixtures__/badge-stats.json";

const calls: Array<{ method: string; path: string; body?: unknown }> = [];

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        calls.push({ method: "GET", path });
        if (path.includes("/stats")) return statsFixture;
        if (path.includes("/recipients")) return recipientsFixture;
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "POST", path, body });
      }),
      put: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "PUT", path, body });
      }),
      del: vi.fn(async (path: string) => {
        calls.push({ method: "DELETE", path });
      }),
    },
  };
});

const { render } = await import("@/test/render");
const { BadgeDetail } = await import("./components/badge-detail");
const { badgeFormSchema, CLUB_METRICS, USER_METRICS } = await import("./schemas");
const { createBadge, updateBadge, awardBadge, revokeBadge } = await import("./api");

beforeEach(() => {
  calls.length = 0;
});

describe("badge form schema", () => {
  const valid = {
    slug: "serial-attendee",
    name: "Regular",
    description: "Attended five events",
    emoji: "🔥",
    badge_type: "user" as const,
    trigger_metric: "events_attended",
    threshold: 5,
  };

  it("accepts a well-formed badge", () => {
    expect(badgeFormSchema.parse(valid).threshold).toBe(5);
  });

  it("rejects a slug with spaces or capitals", () => {
    expect(badgeFormSchema.safeParse({ ...valid, slug: "Serial Attendee" }).success).toBe(
      false
    );
  });

  it("rejects a badge type the backend enum does not have", () => {
    expect(badgeFormSchema.safeParse({ ...valid, badge_type: "org" }).success).toBe(
      false
    );
  });

  it("coerces a threshold typed into a number input", () => {
    // Number inputs hand back strings.
    expect(badgeFormSchema.parse({ ...valid, threshold: "10" }).threshold).toBe(10);
  });

  it("keeps the user and club metric lists disjoint", () => {
    // A club badge triggered on a user metric would never fire: the checker
    // computes one set or the other and finds no value for it.
    const overlap = USER_METRICS.filter((m) =>
      (CLUB_METRICS as readonly string[]).includes(m)
    );
    expect(overlap).toEqual([]);
  });
});

describe("badge detail page", () => {
  it("renders without throwing", () => {
    expect(() => render(<BadgeDetail badgeId={4} />)).not.toThrow();
  });

  it("shows the badge and its award counts", async () => {
    // Both /stats and /recipients existed from the start and nothing called
    // either; this is the page they were written for.
    render(<BadgeDetail badgeId={4} />);
    expect(await screen.findByRole("heading", { name: "Regular" })).toBeInTheDocument();
    expect(await screen.findByText("Total awarded")).toBeInTheDocument();
    expect(await screen.findByText("38")).toBeInTheDocument();
    expect(await screen.findByText("Last 30 days")).toBeInTheDocument();
    expect(await screen.findByText("9")).toBeInTheDocument();
  });

  it("explains the automatic trigger", async () => {
    render(<BadgeDetail badgeId={4} />);
    expect(await screen.findByText(/Awarded automatically at/)).toBeInTheDocument();
  });

  it("lists holders and links them to their user page", async () => {
    render(<BadgeDetail badgeId={4} />);
    const holder = await screen.findByRole("link", { name: "Test Person" });
    expect(holder).toHaveAttribute("href", "/users/412");
  });

  it("shows each holder's picture, and initials for one without", async () => {
    stubImageLoading();
    try {
      render(<BadgeDetail badgeId={4} />);
      const rowOf = async (name: string) => (await screen.findByRole("link", { name })).closest<HTMLElement>("div.flex")!;
      await waitFor(async () =>
        expect(shownPicture(await rowOf("Test Person"))).toBe(
          "https://cdn.test/users/profile_pic/test-person.thumbnail.png"
        )
      );
      const second = await rowOf("Second Person");
      expect(shownPicture(second)).toBeNull();
      expect(within(second).getByText("SP")).toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("offers a revoke control per holder", async () => {
    render(<BadgeDetail badgeId={4} />);
    expect(
      await screen.findByRole("button", { name: /Revoke from Test Person/ })
    ).toBeInTheDocument();
  });

  it("offers the manual award form", async () => {
    render(<BadgeDetail badgeId={4} />);
    expect(await screen.findByLabelText("User ID")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /Award/ })).toBeInTheDocument();
  });
});

describe("badge mutations", () => {
  it("awards by entity id", async () => {
    await awardBadge(4, 412);
    expect(calls[0]!.path).toContain("/badges/admin/4/award");
    expect(calls[0]!.body).toEqual({ entity_id: 412 });
  });

  it("revokes by entity id", async () => {
    await revokeBadge(4, 412);
    expect(calls[0]!.method).toBe("DELETE");
    expect(calls[0]!.path).toContain("/badges/admin/4/revoke/412");
  });

  it("sends slug and badge_type when creating", async () => {
    await createBadge({
      slug: "new-badge",
      name: "New",
      description: "Desc",
      emoji: "✨",
      badge_type: "club",
      trigger_metric: "events_hosted",
      threshold: 3,
    });
    expect(calls[0]!.body).toMatchObject({ slug: "new-badge", badge_type: "club" });
  });

  it("omits slug and badge_type when editing", async () => {
    // BadgeDefinitionUpdate has no badge_type field, and changing a slug
    // would orphan anything referencing it.
    await updateBadge(4, {
      slug: "serial-attendee",
      name: "Renamed",
      description: "Desc",
      emoji: "🔥",
      badge_type: "user",
      trigger_metric: "events_attended",
      threshold: 5,
    });
    const body = calls[0]!.body as Record<string, unknown>;
    expect(body).not.toHaveProperty("slug");
    expect(body).not.toHaveProperty("badge_type");
    expect(body.name).toBe("Renamed");
  });
});
