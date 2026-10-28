import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { ApiError } from "@moa/api";

import clubDetailFixture from "../__fixtures__/club-detail.json";
import clubLifetimeFixture from "../__fixtures__/club-lifetime.json";
import topicsFixture from "../__fixtures__/topics.json";

/**
 * Co-hosted events in the main portal (feature-register/cohosts-contract.md
 * §11): an event's host and every club invited to co-host it, in every
 * status; a club's events tab marking the ones it co-hosts. On a server
 * from before co-hosts, none of it shows.
 */
const calls: string[] = [];
let server: "old" | "new" = "new";

const HOST = { club_id: 1, name: "Design Society", slug: "design-society", logo: null };
const ROBOTICS = { club_id: 9, name: "Robotics Club", slug: "robotics-club", logo: { thumbnail: "https://media.test/9.thumbnail.png", medium: "https://media.test/9.medium.png" } };
const QUIZ = { club_id: 10, name: "Quiz Club", slug: "quiz-club", logo: null };
const CHESS = { club_id: 11, name: "Chess Circle", slug: "chess-circle", logo: null };
const invite = (over: Record<string, unknown> = {}) => ({
  id: 7, event_id: 42, club: ROBOTICS, status: "accepted", note: null,
  invited_at: "2026-10-20T10:00:00+00:00", expires_at: "2026-11-03T10:00:00+00:00", responded_at: "2026-10-21T10:00:00+00:00", ended_at: null, invited_by: "Asha (admin)",
  ...over,
});
let listing: Record<string, unknown>;

const CLUB_ID = (clubDetailFixture as { id: number }).id;
const clubEvents = {
  limit: 10, offset: 0, total: 2, next: null,
  items: [
    { id: 37, name: "SF Sea Hackathon", slug: "sf-sea-hackathon", poster: null, event_datetime: "2026-06-09T08:20:00", location_name: "Honam area", registration_count: 24, attended_count: 18, club: { id: CLUB_ID, name: "IEDC CET", slug: "iedc-cet", logo: null }, cohosts: [] },
    { id: 42, name: "Hack the Campus", slug: "hack-the-campus", poster: null, event_datetime: "2026-11-14T12:30:00", location_name: "Main hall", registration_count: 80, attended_count: 0, club: { id: 1, name: "Design Society", slug: "design-society", logo: null }, cohosts: [{ club_id: CLUB_ID, name: "IEDC CET", slug: "iedc-cet", logo: null }] },
  ],
};

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        calls.push(path);
        if (path === "/api/v1/events/42/cohosts") {
          if (server === "old") throw new ApiError({ status: 404, message: "Not Found", routeMissing: true });
          return listing;
        }
        if (/\/clubs\/\d+\/events/.test(path)) {
          if (server === "old") return { ...clubEvents, items: clubEvents.items.map(({ club: _c, cohosts: _h, ...row }) => row) };
          return clubEvents;
        }
        if (/\/clubs\/admin\/\d+\/lifetime$/.test(path)) return clubLifetimeFixture;
        if (/\/clubs\/admin\/\d+$/.test(path)) return clubDetailFixture;
        if (path === "/api/v1/interests/list") return topicsFixture;
        throw new Error(`unstubbed GET ${path}`);
      }),
      put: vi.fn(),
      post: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { EventCohostsCard, cohostCardRows, inviteLine } = await import("./index");
const { ClubDetail } = await import("@/features/clubs");
const { adminEventSchema, adminEventDetailSchema } = await import("./schemas");
const { clubEventSchema, cohostedBy } = await import("@/features/clubs/schemas");
const kit = await import("@moa/app-kit");

beforeEach(() => {
  calls.length = 0;
  server = "new";
  listing = {
    event_id: 42, host: HOST, viewer_role: "admin", can_manage: true, limit: 5, slots_left: 3,
    items: [
      invite({ id: 6, club: CHESS, status: "removed", ended_at: "2026-10-25T10:00:00+00:00" }),
      invite({ id: 8, club: QUIZ, status: "invited", responded_at: null, note: "Want to run this together?" }),
      invite(),
    ],
  };
});

describe("an event's host and co-hosts", () => {
  it("shows the host, then co-hosts, the invited and the rest, each with its status", async () => {
    render(<EventCohostsCard eventId={42} />);
    const section = await screen.findByRole("region", { name: "Host and co-hosts" });
    expect(section).toHaveTextContent("Hosted by Design Society and Robotics Club · 3 of 5 places left");
    expect(within(section).getByRole("link", { name: "Design Society" })).toHaveAttribute("href", "/clubs/1");
    const rows = within(screen.getByRole("list", { name: "Invited clubs" })).getAllByRole("listitem");
    expect(rows.map((r) => r.getAttribute("data-testid"))).toEqual(["admin-cohost-7", "admin-cohost-8", "admin-cohost-6"]);
    expect(rows[0]).toHaveTextContent("Co-hosting");
    expect(rows[1]).toHaveTextContent("Invited");
    expect(rows[1]).toHaveTextContent("“Want to run this together?”");
    expect(rows[2]).toHaveTextContent("Removed");
    expect(within(rows[0]!).getByRole("link", { name: "Robotics Club" })).toHaveAttribute("href", "/clubs/9");
  });

  it("is nothing when no club was ever invited", async () => {
    listing = { ...listing, items: [] };
    const { container } = render(<EventCohostsCard eventId={42} />);
    await waitFor(() => expect(calls).toContain("/api/v1/events/42/cohosts"));
    expect(container).toBeEmptyDOMElement();
  });

  it("is nothing on a server without co-hosts", async () => {
    server = "old";
    const { container } = render(<EventCohostsCard eventId={42} />);
    await waitFor(() => expect(calls).toContain("/api/v1/events/42/cohosts"));
    expect(container).toBeEmptyDOMElement();
  });

  it("orders and words each invite", () => {
    const parsed = kit.cohostListingSchema.parse(listing);
    const { cohosts, rows } = cohostCardRows(parsed);
    expect(cohosts.map((c) => c.name)).toEqual(["Robotics Club"]);
    expect(rows.map((r) => r.status)).toEqual(["accepted", "invited", "removed"]);
    expect(inviteLine(rows[1]!)).toMatch(/^Invited .+ by Asha \(admin\) · expires .+$/);
    expect(inviteLine(rows[2]!)).toMatch(/· removed /);
  });

  it("reads the co-hosts on rows and the detail, and null from an older server", () => {
    const row = { id: 42, name: "Hack the Campus", poster: null, category: null, club: { id: 1, name: "Design Society" } };
    expect(adminEventSchema.parse({ ...row, cohosts: [ROBOTICS] }).cohosts?.map((c) => c.club_id)).toEqual([9]);
    expect(adminEventSchema.parse(row).cohosts).toBeNull();
    expect(adminEventDetailSchema.parse({ ...row, cohosts: [ROBOTICS] }).cohosts).toHaveLength(1);
    expect(adminEventDetailSchema.parse(row).cohosts).toBeNull();
  });
});

describe("a club's events", () => {
  it("knows a co-hosted row by its host", () => {
    expect(cohostedBy(clubEventSchema.parse(clubEvents.items[1]), CLUB_ID)).toBe("Design Society");
    expect(cohostedBy(clubEventSchema.parse(clubEvents.items[0]), CLUB_ID)).toBeNull();
    // A row from an older server has no club: the club's own.
    expect(cohostedBy(clubEventSchema.parse({ id: 1, name: "Old", poster: null }), CLUB_ID)).toBeNull();
  });

  it("marks the events the club co-hosts, with whose they are", async () => {
    render(<ClubDetail clubId={CLUB_ID} />);
    const own = (await screen.findByText("SF Sea Hackathon")).closest("div.rounded-lg") as HTMLElement;
    const cohosted = screen.getByText("Hack the Campus").closest("div.rounded-lg") as HTMLElement;
    expect(within(cohosted).getByText("Co-host")).toBeInTheDocument();
    expect(cohosted).toHaveTextContent("Hosted by Design Society");
    expect(within(own).queryByText("Co-host")).not.toBeInTheDocument();
  });

  it("marks nothing on a server without co-hosts", async () => {
    server = "old";
    render(<ClubDetail clubId={CLUB_ID} />);
    await screen.findByText("Hack the Campus");
    expect(screen.queryByText("Co-host")).not.toBeInTheDocument();
  });
});
