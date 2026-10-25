import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";

import { shownPicture, stubImageLoading } from "@/test/images";

import fixture from "../__fixtures__/threads.json";
import clubInfoFixture from "../__fixtures__/club-info.json";

const calls: Array<{ method: string; path: string; body?: unknown }> = [];
const insights = {
  posts: 3, posts_delta: 1, reach: 4100, reach_delta: 900, reach_per_follower: 1.06, engagement_rate: 4.2, engagement_rate_prev: 3.1, awaiting: 1,
  best: { id: "t1", body: "Hack Night 04 is tonight! 148 of you registered", views: 1840, engagement: 98, kind: "post" },
  weeks: Array.from({ length: 12 }, (_, k) => ({ week: `2026-${String(k + 1).padStart(2, "0")}-01`, posts: k > 8 ? 1 : 0, reach: k > 8 ? 1300 : 0, reactions: k > 8 ? 40 : 0 })),
  kinds: [{ kind: "poll", label: "Polls", posts: 1, avg_reach: 1290, avg_engagement: 348 }, { kind: "photo", label: "With a photo", posts: 0, avg_reach: null, avg_engagement: null }, { kind: "text", label: "Text only", posts: 2, avg_reach: 1400, avg_engagement: 60 }],
  notify: { told: { posts: 2, avg_reach: 1600 }, quiet: { posts: 1, avg_reach: 1290 } },
  followers: 1284, all_time: { posts: 3, reach: 4100, engagement: 170 }, generated_at: "2026-10-16T10:00:00+00:00",
};
let qs = "";
vi.mock("next/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/navigation")>();
  return { ...actual, useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }), usePathname: () => "/threads", useSearchParams: () => new URLSearchParams(qs) };
});

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        calls.push({ method: "GET", path });
        if (path.endsWith("/clubs/threads/insights")) return insights;
        if (path.endsWith("/clubs/threads/page")) return { ...fixture, items: fixture.items.map((t, k) => ({ ...t, awaiting_reply: k === 0, engagement: t.likes + t.comments })), counts: { all: 3, awaiting: 1, pinned: 1, polls: 1, photos: 0 } };
        if (path.endsWith("/clubs/threads")) return fixture;
        if (path.includes("/clubs/info")) return { ...clubInfoFixture, followers_count: 1284 };
        if (/\/threads\/t1\/comments$/.test(path)) return [{ id: "c1", body: "Can't wait!", author: { id: 9, name: "Ananya Iyer", is_club: false, avatar: { thumbnail: "https://cdn.test/users/profile_pic/ananya.thumbnail.png" } }, created_at: "2026-10-12T11:00:00+00:00" }];
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "POST", path, body });
        if (path.endsWith("/clubs/threads")) return { ...fixture.items[0], id: "t9", body: "New one", pinned: false, notify_followers: (body as FormData).get("notify_followers") === "true" };
        return { id: "c2", body: "See you there", author: { id: 5, name: "LetMeGoo", is_club: true }, created_at: "2026-10-12T11:05:00+00:00" };
      }),
      patch: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "PATCH", path, body });
        return { ...fixture.items[1], pinned: true };
      }),
      put: vi.fn(),
      del: vi.fn(async (path: string) => {
        calls.push({ method: "DELETE", path });
      }),
    },
  };
});

const { render } = await import("@/test/render");
const { ThreadsPage } = await import("./components/threads-page");
const { threadPageSchema, composeSchema } = await import("./schemas");

beforeEach(() => {
  calls.length = 0;
  qs = "";
});

describe("threads", () => {
  it("parses the page and checks a poll", () => {
    expect(threadPageSchema.parse(fixture).items).toHaveLength(3);
    expect(composeSchema.safeParse({ body: "Q?", notify_followers: true, poll_options: ["A", ""] }).success).toBe(false);
    expect(composeSchema.safeParse({ body: "Q?", notify_followers: true, poll_options: ["A", "a"] }).success).toBe(false);
    expect(composeSchema.safeParse({ body: "Q?", notify_followers: true, poll_options: ["A", "B"] }).success).toBe(true);
  });

  it("shows the posts with their figures, the pinned one and the poll", async () => {
    render(<ThreadsPage />);
    expect((await screen.findAllByText(/Hack Night 04 is tonight/))[0]).toBeInTheDocument();
    expect(screen.getByText("Pinned")).toBeInTheDocument();
    expect(screen.getByText("1,840")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Robotics 44%" })).toHaveAttribute("aria-valuenow", "44");
    expect(screen.getByText("293 votes")).toBeInTheDocument();
    expect(await screen.findByPlaceholderText(/Share an update with your 1,284 followers/)).toBeInTheDocument();
    expect(calls[0]).toMatchObject({ method: "GET" });
    // The month above the list, and what waits.
    expect(await screen.findByText("3 posts in 30 days · seen 4,100 times · 3 all time")).toBeInTheDocument();
    expect(screen.getByText("4.2%")).toBeInTheDocument();
    expect(screen.getAllByText("Awaiting your reply").length).toBeGreaterThan(0);
    expect(screen.getByText("What works")).toBeInTheDocument();
    expect(screen.getByText(/Telling followers: 1,600 seen on average against 1,290/)).toBeInTheDocument();
    expect(screen.getByText("Best this month")).toBeInTheDocument();
    expect(screen.getAllByText("Awaiting a reply 1")).toHaveLength(1);
  });

  it("narrows to the posts awaiting a reply and opens their comments", async () => {
    qs = "scope=awaiting";
    render(<ThreadsPage />);
    expect(await screen.findByText("Can't wait!")).toBeInTheDocument();
    expect(calls.find((c) => c.path.endsWith("/clubs/threads/page"))).toBeTruthy();
  });

  it("shows a commenter's picture beside their comment", async () => {
    qs = "scope=awaiting";
    stubImageLoading();
    try {
      render(<ThreadsPage />);
      const comment = (await screen.findByText("Can't wait!")).closest("li")!;
      await waitFor(() => expect(shownPicture(comment)).toBe("https://cdn.test/users/profile_pic/ananya.thumbnail.png"));
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("posts text with a poll and the notify switch, as one multipart request", async () => {
    render(<ThreadsPage />);
    await screen.findAllByText(/Hack Night 04 is tonight/);
    fireEvent.change(screen.getByLabelText("Share an update"), { target: { value: "Theme for Hack Night 05?" } });
    fireEvent.click(screen.getByRole("button", { name: /^Poll$/ }));
    fireEvent.change(screen.getByLabelText("Option 1"), { target: { value: "Robotics" } });
    fireEvent.change(screen.getByLabelText("Option 2"), { target: { value: "Wearables" } });
    fireEvent.click(screen.getByRole("switch", { name: "Notify followers" }));
    fireEvent.click(screen.getByRole("button", { name: /^Post$/ }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
    const form = calls.find((c) => c.method === "POST")!.body as FormData;
    expect(form.get("body")).toBe("Theme for Hack Night 05?");
    expect(form.get("poll_options")).toBe(JSON.stringify(["Robotics", "Wearables"]));
    expect(form.get("notify_followers")).toBe("false");
    expect(form.get("image")).toBeNull();
  });

  it("redraws a photo too big for the gateway smaller before posting it", async () => {
    // jsdom has no canvas: one is stood in whose redraw weighs a byte per pixel.
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 4000, height: 3000, close: vi.fn() })));
    const ctx = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      () => ({ drawImage: vi.fn(), fillRect: vi.fn(), clearRect: vi.fn(), fillStyle: "" }) as unknown as CanvasRenderingContext2D,
    );
    const blob = vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (this: HTMLCanvasElement, done, type = "image/png") {
      const out = new Blob(["x"], { type });
      Object.defineProperty(out, "size", { value: this.width * this.height });
      done(out);
    });
    try {
      const { container } = render(<ThreadsPage />);
      await screen.findAllByText(/Hack Night 04 is tonight/);
      fireEvent.change(screen.getByLabelText("Share an update"), { target: { value: "From the stage" } });
      const phone = new File(["x"], "stage.jpeg", { type: "image/jpeg" });
      Object.defineProperty(phone, "size", { value: 11 * 1024 * 1024 });
      fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [phone] } });
      expect(await screen.findByRole("button", { name: "Remove photo" })).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /^Post$/ }));
      await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
      const image = (calls.find((c) => c.method === "POST")!.body as FormData).get("image") as File;
      expect(image.name).toBe("stage.jpg");
      expect(image.size).toBeLessThanOrEqual(4 * 1024 * 1024);
    } finally {
      ctx.mockRestore();
      blob.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it("pins, removes on a second click, and opens the comments to reply or remove", async () => {
    render(<ThreadsPage />);
    await screen.findAllByText(/Hack Night 04 is tonight/);
    fireEvent.click(screen.getAllByRole("button", { name: "Pin to top" })[0]!);
    await waitFor(() => expect(calls.some((c) => c.method === "PATCH")).toBe(true));
    expect(calls.find((c) => c.method === "PATCH")).toMatchObject({ path: "/api/v1/clubs/threads/t2", body: { pinned: true } });

    fireEvent.click(screen.getAllByRole("button", { name: "Remove this post" })[2]!);
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Confirm removing this post" }));
    await waitFor(() => expect(calls.some((c) => c.method === "DELETE")).toBe(true));
    expect(calls.find((c) => c.method === "DELETE")).toMatchObject({ path: "/api/v1/clubs/threads/t3" });

    fireEvent.click(screen.getAllByRole("button", { expanded: false })[0]!);
    expect(await screen.findByText("Can't wait!")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Reply as the club"), { target: { value: "See you there" } });
    fireEvent.click(screen.getByRole("button", { name: "Reply" }));
    await waitFor(() => expect(calls.some((c) => c.path.endsWith("/threads/t1/comments") && c.method === "POST")).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "Remove comment by Ananya Iyer" }));
    await waitFor(() => expect(calls.some((c) => c.path.endsWith("/threads/t1/comments/c1"))).toBe(true));
  });
});
