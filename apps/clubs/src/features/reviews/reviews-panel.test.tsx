import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";

import { shownPicture, stubImageLoading } from "@/test/images";

/**
 * A review beside the face of whoever wrote it. GET /events/ratings/{id}
 * sent the avatar a reviewer picked but never the photo they uploaded, which
 * wins over it everywhere else -- so anyone with a photo showed as initials.
 * The API now sends `profile_pic` too, and the photo comes first.
 */
const photo = { thumbnail: "https://cdn.test/users/profile_pic/meera.thumbnail.png" };
const fox = { thumbnail: "https://cdn.test/avatars/fox.thumbnail.png" };

const reviews = [
  { id: "r1", rating: 5, review: "Best hack night yet", created_at: "2026-10-12T10:00:00Z", user: { id: 1, username: "meera", full_name: "Meera Das", profile: { full_name: "Meera Das", avatar: fox, profile_pic: photo } } },
  { id: "r2", rating: 4, review: "Good snacks", created_at: "2026-10-12T11:00:00Z", user: { id: 2, username: "kiran", full_name: "Kiran Rao", profile: { full_name: "Kiran Rao", avatar: fox } } },
  { id: "r3", rating: 3, review: null, created_at: "2026-10-12T12:00:00Z", user: { id: 3, username: "noor", full_name: "Noor Ali", profile: null } },
];

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        if (path === "/api/v1/events/ratings/42") return { items: reviews, limit: 20, offset: 0, total: null, next: null };
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { EventReviewsPanel, reviewPageSchema } = await import("./index");

beforeEach(() => stubImageLoading());
afterEach(() => vi.unstubAllGlobals());

describe("an event's reviews", () => {
  it("keeps the reviewer's photo beside the avatar", () => {
    const page = reviewPageSchema.parse({ items: reviews });
    expect(page.items[0]!.user?.profile?.profile_pic?.thumbnail).toBe(photo.thumbnail);
    expect(page.items[0]!.user?.profile?.avatar?.thumbnail).toBe(fox.thumbnail);
  });

  it("shows the photo first, else the avatar, else initials", async () => {
    render(<EventReviewsPanel eventId={42} rating={4} totalRatings={3} finished />);
    const rowOf = async (name: string) => (await screen.findByText(name)).closest("li")!;

    await waitFor(async () => expect(shownPicture(await rowOf("Meera Das"))).toBe(photo.thumbnail));
    await waitFor(async () => expect(shownPicture(await rowOf("Kiran Rao"))).toBe(fox.thumbnail));
    const noor = await rowOf("Noor Ali");
    expect(shownPicture(noor)).toBeNull();
    expect(within(noor).getByText("NA")).toBeInTheDocument();
  });
});
