import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";

import { shownPicture, stubImageLoading } from "@/test/images";

import badgesFixture from "../__fixtures__/user-badges.json";
import clubsFixture from "../__fixtures__/user-clubs.json";
import detailFixture from "../__fixtures__/user-detail.json";
import eventsFixture from "../__fixtures__/user-events.json";

/**
 * The admin dashboard could list users but not open one, so "how many clubs
 * does this person follow" had no answer in the product. These cover the page
 * that answers it, and the query shapes it depends on.
 */
const calls: string[] = [];
let detail: unknown = detailFixture;

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string, init?: { query?: Record<string, unknown> }) => {
        const query = new URLSearchParams(
          Object.entries(init?.query ?? {})
            .filter(([, v]) => v !== undefined)
            .map(([k, v]) => [k, String(v)])
        ).toString();
        calls.push(query ? `${path}?${query}` : path);

        if (/\/user\/admin\/\d+\/clubs/.test(path)) return clubsFixture;
        if (/\/user\/admin\/\d+\/events/.test(path)) return eventsFixture;
        if (/\/badges\/user\/\d+/.test(path)) return badgesFixture;
        if (/\/user\/admin\/\d+$/.test(path)) return detail;
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(),
      put: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { UserDetail } = await import("./components/user-detail");
const { adminUserDetailSchema } = await import("./schemas");
const { fetchUserEvents } = await import("./api");

describe("user detail schema", () => {
  it("parses the response including its stats block", () => {
    const user = adminUserDetailSchema.parse(detailFixture);
    expect(user.stats.clubs_following).toBe(4);
    expect(user.stats.events_attended).toBe(7);
    expect(user.stats.total_paid).toBe(750);
  });

  it("tolerates a user with no profile or interests", () => {
    const bare = {
      ...detailFixture,
      profile: null,
      interests: null,
    };
    expect(adminUserDetailSchema.safeParse(bare).success).toBe(true);
  });

  it("defaults missing stats to zero rather than failing the page", () => {
    const partial = { ...detailFixture, stats: {} };
    const user = adminUserDetailSchema.parse(partial);
    expect(user.stats.events_won).toBe(0);
  });
});

describe("user detail page", () => {
  it("renders without throwing", () => {
    expect(() => render(<UserDetail userId={412} />)).not.toThrow();
  });

  it("shows the person's identity", async () => {
    render(<UserDetail userId={412} />);
    expect(
      await screen.findByRole("heading", { name: "Test Person" })
    ).toBeInTheDocument();
    expect(await screen.findByText("@testperson")).toBeInTheDocument();
  });

  it("answers the question the dashboard could not: activity counts", async () => {
    render(<UserDetail userId={412} />);
    // "Clubs followed" is both a stat label and a tab, so match all of them.
    expect((await screen.findAllByText("Clubs followed")).length).toBeGreaterThan(0);
    expect(await screen.findByText("Events attended")).toBeInTheDocument();
    expect(await screen.findByText("Events won")).toBeInTheDocument();
    expect(await screen.findByText("Badges earned")).toBeInTheDocument();
    expect(await screen.findByText("Total paid")).toBeInTheDocument();
    // The figures themselves, not just the labels.
    expect(await screen.findByText("4")).toBeInTheDocument();
    expect(await screen.findByText("11")).toBeInTheDocument();
    expect(await screen.findByText("7")).toBeInTheDocument();
  });

  it("lists the clubs the user follows", async () => {
    render(<UserDetail userId={412} />);
    expect(await screen.findByText("IEDC CET")).toBeInTheDocument();
    expect(await screen.findByText("TinkerHub")).toBeInTheDocument();
  });

  it("offers all three sub-lists", async () => {
    render(<UserDetail userId={412} />);
    for (const tab of ["Clubs followed", "Events", "Badges"]) {
      expect(await screen.findByRole("tab", { name: tab })).toBeInTheDocument();
    }
  });

  it("shows the user's interests", async () => {
    render(<UserDetail userId={412} />);
    expect(await screen.findByText("Coding")).toBeInTheDocument();
    expect(await screen.findByText("UI/UX")).toBeInTheDocument();
  });

});

describe("the person's picture", () => {
  const photo = { thumbnail: "https://cdn.test/users/profile_pic/p.thumbnail.png", medium: "https://cdn.test/users/profile_pic/p.medium.png" };
  const fox = { thumbnail: "https://cdn.test/avatars/fox.thumbnail.png", medium: "https://cdn.test/avatars/fox.medium.png" };
  const withProfile = (profile: Record<string, unknown>) => ({
    ...detailFixture,
    profile: { ...detailFixture.profile, ...profile },
  });

  beforeEach(() => {
    stubImageLoading();
    detail = detailFixture;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    detail = detailFixture;
  });

  it("shows the photo they uploaded, at the header's larger size", async () => {
    detail = withProfile({ profile_pic: photo, avatar: { id: 2, name: "Fox", image: fox } });
    const { container } = render(<UserDetail userId={412} />);
    await waitFor(() => expect(shownPicture(container)).toBe(photo.medium));
  });

  it("shows the avatar they picked when there is no photo", async () => {
    detail = withProfile({ profile_pic: null, avatar: { id: 2, name: "Fox", image: fox } });
    const { container } = render(<UserDetail userId={412} />);
    await waitFor(() => expect(shownPicture(container)).toBe(fox.medium));
  });

  it("shows initials for someone with neither", async () => {
    const { container } = render(<UserDetail userId={412} />);
    expect(await screen.findByText("@testperson")).toBeInTheDocument();
    expect(screen.getByText("TP")).toBeInTheDocument();
    expect(shownPicture(container)).toBeNull();
  });

  it("still opens the page when a picture is malformed", () => {
    const odd = withProfile({ profile_pic: "not an image", avatar: { id: "x" } });
    const parsed = adminUserDetailSchema.parse(odd);
    expect(parsed.profile?.profile_pic).toBeNull();
    expect(parsed.profile?.avatar).toBeNull();
  });
});

describe("event list filters", () => {
  /*
   * The endpoint reads a present `false` as "only rows where the flag is
   * off", so sending one for the All tab would hide every attended event --
   * the same trap the self-service /my-events endpoint fell into.
   */
  it("omits the flags entirely when nothing is filtered", async () => {
    calls.length = 0;
    await fetchUserEvents(412, { offset: 0, limit: 10 });

    expect(calls).toHaveLength(1);
    expect(calls[0]).not.toContain("is_attended");
    expect(calls[0]).not.toContain("is_won");
    expect(calls[0]).not.toContain("is_paid");
  });

  it("sends a flag only when it is actually set", async () => {
    calls.length = 0;
    await fetchUserEvents(412, { offset: 0, limit: 10, isAttended: true });

    expect(calls[0]).toContain("is_attended=true");
    expect(calls[0]).not.toContain("is_won");
  });
});
