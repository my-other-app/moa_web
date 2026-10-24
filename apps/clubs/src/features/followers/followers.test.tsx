import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

import { shownPicture, stubImageLoading } from "@/test/images";

const calls: Array<{ path: string; query?: Record<string, unknown> }> = [];
const NOW = Date.now();
const DAY = 86_400_000;
const iso = (ms: number) => new Date(NOW + ms).toISOString();

const rows = [
  { user: { id: 9, full_name: "Ananya Iyer", username: "ananya", avatar: { thumbnail: "https://cdn.test/users/profile_pic/ananya.thumbnail.png" } as { thumbnail: string } | null }, org: "COEP Technological University", interests: ["Robotics", "IoT"], followed_at: iso(-200 * DAY), source: null, registrations: 3, attended: 2, last_registered_at: iso(-2 * DAY), upcoming: 1, segments: ["regulars"] },
  { user: { id: 10, full_name: "Rohan Patil", username: "rohan", avatar: null }, org: null, interests: [], followed_at: iso(-50 * DAY), source: "Instagram bio", registrations: 1, attended: 1, last_registered_at: iso(-40 * DAY), upcoming: 0, segments: ["once"] },
  { user: { id: 11, full_name: "Old Timer", username: "old", avatar: null }, org: null, interests: ["AI"], followed_at: iso(-300 * DAY), source: null, registrations: 0, attended: 0, last_registered_at: null, upcoming: 0, segments: ["never", "quiet"] },
];
const insights = {
  total: 3, new: 0, new_delta: -1, came: 2, regulars: 1, registered_ahead: 1, quiet: 1,
  next_event: { id: 68, name: "Hack Night 04" },
  growth: Array.from({ length: 12 }, (_, k) => ({ month: `2026-${String(k + 1).padStart(2, "0")}`, joined: k === 9 ? 2 : k === 3 ? 1 : 0, total: k >= 9 ? 3 : k >= 3 ? 1 : 0 })),
  by_org: [{ name: "COEP Technological University", count: 1 }, { name: "Not given", count: 2 }],
  interests: [{ name: "Robotics", count: 1 }, { name: "IoT", count: 1 }, { name: "AI", count: 1 }],
  sources: [{ name: "On the app", count: 2 }, { name: "Instagram bio", count: 1 }],
  segments: { all: 3, new: 0, regulars: 1, once: 1, never: 1, quiet: 1 },
  generated_at: iso(0),
};

let qs = "";
vi.mock("next/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/navigation")>();
  return { ...actual, useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }), usePathname: () => "/followers", useSearchParams: () => new URLSearchParams(qs) };
});

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string, init?: { query?: Record<string, unknown> }) => {
        calls.push({ path, query: init?.query });
        if (path.endsWith("/followers/insights")) return insights;
        if (path.endsWith("/followers/list")) {
          const seg = init?.query?.segment as string;
          const items = seg === "all" ? rows : rows.filter((r) => r.segments.includes(seg));
          return { items, total: items.length, limit: 24, offset: 0, counts: insights.segments };
        }
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(),
      patch: vi.fn(),
      put: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { FollowersPage } = await import("./components/followers-page");

beforeEach(() => {
  calls.length = 0;
  qs = "";
});

describe("the followers page", () => {
  it("shows each follower's picture, and initials for one without, never a broken image", async () => {
    stubImageLoading();
    try {
      render(<FollowersPage />);
      const ananya = (await screen.findByRole("link", { name: "Open Ananya Iyer" })) as HTMLElement;
      await waitFor(() => expect(shownPicture(ananya)).toBe("https://cdn.test/users/profile_pic/ananya.thumbnail.png"));
      const rohan = screen.getByRole("link", { name: "Open Rohan Patil" });
      expect(shownPicture(rohan)).toBeNull();
      expect(within(rohan).getByText("RP")).toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("reads the audience, its make-up, and each person's record with the club", async () => {
    render(<FollowersPage />);
    expect(await screen.findByText("3 people · 67% have been to an event · 0 new this month")).toBeInTheDocument();
    expect(screen.getByText("Have come to an event")).toBeInTheDocument();
    expect(screen.getByText("67%")).toBeInTheDocument();
    expect(screen.getByText("Hack Night 04")).toBeInTheDocument();
    expect(screen.getByText("Followers over the year")).toBeInTheDocument();
    expect(screen.getByText("Which link brought them")).toBeInTheDocument();
    expect(screen.getByText("Instagram bio")).toBeInTheDocument();
    expect(screen.getByText("Robotics")).toBeInTheDocument();
    expect(screen.queryByText("Not given")).toBeNull();

    const row = (await screen.findByRole("link", { name: "Open Ananya Iyer" })) as HTMLElement;
    expect(within(row).getByText("2 of 3 events attended")).toBeInTheDocument();
    expect(within(row).getByText("In for the next")).toBeInTheDocument();
    expect(within(row).getByText(/COEP Technological University · Robotics, IoT/)).toBeInTheDocument();
    const old = screen.getByRole("link", { name: "Open Old Timer" });
    expect(within(old).getByText("Gone quiet")).toBeInTheDocument();
    expect(within(old).getByText("No events yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Export all/ })).toHaveAttribute("href", "/api/gateway/api/v1/clubs/followers/export.csv?segment=all");
    expect(calls.find((c) => c.path.endsWith("/followers/list"))?.query).toMatchObject({ segment: "all", sort: "newest", limit: 24, offset: 0 });
  });

  it("narrows to a segment from the URL and says what it means", async () => {
    qs = "segment=quiet";
    render(<FollowersPage />);
    expect(await screen.findByRole("link", { name: "Open Old Timer" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open Ananya Iyer" })).toBeNull();
    expect(screen.getByText("Nothing in 90 days and not in for anything ahead.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Export gone quiet/ })).toHaveAttribute("href", expect.stringContaining("segment=quiet"));
    await waitFor(() => expect(calls.find((c) => c.path.endsWith("/followers/list"))?.query).toMatchObject({ segment: "quiet" }));
    fireEvent.click(screen.getByRole("button", { name: /Regulars/ }));
  });
});
