import { describe, expect, it } from "vitest";

import { ratingDistribution, reviewPageSchema } from "./schemas";
import { followersPerDay, followerPageSchema } from "../followers/schemas";

/**
 * Reviews and followers.
 *
 * Both endpoints hand-serialise their rows and the ratings one returns a
 * pagination envelope whose `total` and `next` are always null, so the parsing
 * has to tolerate what is actually sent rather than what the envelope implies.
 */
describe("review parsing", () => {
  it("accepts the envelope with null total and next", () => {
    // The endpoint literally returns these as null, every time.
    const page = reviewPageSchema.parse({
      items: [{ id: "1", rating: 4, review: "Good", user: null, created_at: null }],
      limit: 20,
      offset: 0,
      total: null,
      next: null,
    });
    expect(page.items).toHaveLength(1);
    expect(page.total).toBeNull();
  });

  it("keeps a rating with no written review", () => {
    // A score without words is still signal and must not be dropped.
    const page = reviewPageSchema.parse({
      items: [{ id: "2", rating: 5, review: null, user: null }],
    });
    expect(page.items[0]!.review).toBeNull();
  });

  it("tolerates a missing user, which the serialiser can emit", () => {
    // Its serialiser catches per-row errors and can leave user null.
    const page = reviewPageSchema.parse({ items: [{ id: "3", rating: 3 }] });
    expect(page.items[0]!.user).toBeUndefined();
  });
});

describe("rating distribution", () => {
  it("buckets from five down to one", () => {
    const counts = ratingDistribution([
      { id: "a", rating: 5 },
      { id: "b", rating: 5 },
      { id: "c", rating: 3 },
    ] as never);
    expect(counts).toEqual([2, 0, 1, 0, 0]);
  });

  it("rounds a half star up rather than discarding it", () => {
    // Flooring would file a 4.5 with the 4s and, worse, push a 0 out of range.
    expect(ratingDistribution([{ id: "a", rating: 4.5 }] as never)).toEqual([
      1, 0, 0, 0, 0,
    ]);
  });

  it("clamps an out-of-range score instead of writing outside the array", () => {
    const counts = ratingDistribution([
      { id: "a", rating: 0 },
      { id: "b", rating: 9 },
    ] as never);
    expect(counts).toEqual([1, 0, 0, 0, 1]);
    expect(counts).toHaveLength(5);
  });
});

describe("followers", () => {
  it("parses a follower with no profile", () => {
    const page = followerPageSchema.parse({
      items: [{ user: { id: 3, username: "someone" }, is_following: true }],
      total: 1,
    });
    expect(page.items[0]!.user.id).toBe(3);
  });

  it("groups joins per day, oldest first", () => {
    const series = followersPerDay([
      { user: { id: 1 }, is_following: true, created_at: "2026-06-02T10:00:00Z" },
      { user: { id: 2 }, is_following: true, created_at: "2026-06-01T10:00:00Z" },
      { user: { id: 3 }, is_following: true, created_at: "2026-06-01T23:00:00Z" },
    ] as never);
    expect(series).toEqual([
      { date: "2026-06-01", count: 2 },
      { date: "2026-06-02", count: 1 },
    ]);
  });

  it("skips rows with a missing or unparseable date", () => {
    const series = followersPerDay([
      { user: { id: 1 }, is_following: true, created_at: null },
      { user: { id: 2 }, is_following: true, created_at: "not a date" },
    ] as never);
    expect(series).toEqual([]);
  });
});
