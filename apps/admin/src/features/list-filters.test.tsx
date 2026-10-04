import { beforeEach, describe, expect, it, vi } from "vitest";

import usersFixture from "./__fixtures__/users.json";
import clubsFixture from "./__fixtures__/clubs.json";
import eventsFixture from "./__fixtures__/events.json";

/**
 * Every admin table shipped with a search box and nothing else. These cover
 * the part most easily got wrong on the way to the API: the query string
 * holds strings, the endpoints want booleans and numbers, and a filter that
 * silently sends the wrong type narrows a list to nothing.
 */
const calls: string[] = [];

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string, init?: { query?: Record<string, unknown> }) => {
        const q = new URLSearchParams(
          Object.entries(init?.query ?? {})
            .filter(([, v]) => v !== undefined)
            .map(([k, v]) => [k, String(v)])
        ).toString();
        calls.push(q ? `${path}?${q}` : path);
        if (path.includes("/user/")) return usersFixture;
        if (path.includes("/clubs/")) return clubsFixture;
        if (path.includes("/events/")) return eventsFixture;
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(),
      put: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { fetchUsers } = await import("./users/api");
const { fetchClubs } = await import("./clubs/api");
const { fetchEvents } = await import("./events/api");

beforeEach(() => {
  calls.length = 0;
});

describe("users list query", () => {
  it("sends nothing extra when no filter is set", async () => {
    await fetchUsers({ offset: 0, limit: 10 });
    expect(calls[0]).not.toContain("user_type");
    expect(calls[0]).not.toContain("sort");
  });

  it("sends the type and provider filters", async () => {
    await fetchUsers({ offset: 0, limit: 10, userType: "club", provider: "google" });
    expect(calls[0]).toContain("user_type=club");
    expect(calls[0]).toContain("provider=google");
  });

  it("sends the sort key and direction", async () => {
    await fetchUsers({ offset: 0, limit: 10, sort: "name", order: "asc" });
    expect(calls[0]).toContain("sort=name");
    expect(calls[0]).toContain("order=asc");
  });
});

describe("clubs list query", () => {
  it("sends is_verified=false, not an empty value", async () => {
    // `false` is a real filter here. Dropping it because it is falsy would
    // silently show every club when the admin asked for pending ones.
    await fetchClubs({ offset: 0, limit: 10, isVerified: false });
    expect(calls[0]).toContain("is_verified=false");
  });

  it("sends is_verified=true", async () => {
    await fetchClubs({ offset: 0, limit: 10, isVerified: true });
    expect(calls[0]).toContain("is_verified=true");
  });

  it("omits is_verified entirely when unset", async () => {
    await fetchClubs({ offset: 0, limit: 10 });
    expect(calls[0]).not.toContain("is_verified");
  });

  it("scopes by organisation", async () => {
    await fetchClubs({ offset: 0, limit: 10, orgId: 3 });
    expect(calls[0]).toContain("org_id=3");
  });
});

describe("events list query", () => {
  it("sends the upcoming filter as is_ended=false", async () => {
    await fetchEvents({ offset: 0, limit: 10, isEnded: false });
    expect(calls[0]).toContain("is_ended=false");
  });

  it("sends the free filter as has_fee=false", async () => {
    await fetchEvents({ offset: 0, limit: 10, hasFee: false });
    expect(calls[0]).toContain("has_fee=false");
  });

  it("omits both when neither is chosen", async () => {
    await fetchEvents({ offset: 0, limit: 10 });
    expect(calls[0]).not.toContain("is_ended");
    expect(calls[0]).not.toContain("has_fee");
  });

  it("sends the sort key", async () => {
    await fetchEvents({ offset: 0, limit: 10, sort: "date", order: "asc" });
    expect(calls[0]).toContain("sort=date");
    expect(calls[0]).toContain("order=asc");
  });
});
