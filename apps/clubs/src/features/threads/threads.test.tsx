import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";

import fixture from "../__fixtures__/threads.json";
import clubInfoFixture from "../__fixtures__/club-info.json";

const calls: Array<{ method: string; path: string; body?: unknown }> = [];

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        calls.push({ method: "GET", path });
        if (path.endsWith("/clubs/threads")) return fixture;
        if (path.includes("/clubs/info")) return { ...clubInfoFixture, followers_count: 1284 };
        if (/\/threads\/t1\/comments$/.test(path)) return [{ id: "c1", body: "Can't wait!", author: { id: 9, name: "Ananya Iyer", is_club: false }, created_at: "2026-10-12T11:00:00+00:00" }];
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
    expect(await screen.findByText(/Hack Night 04 is tonight/)).toBeInTheDocument();
    expect(screen.getByText("Pinned")).toBeInTheDocument();
    expect(screen.getByText("1,840")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Robotics 44%" })).toHaveAttribute("aria-valuenow", "44");
    expect(screen.getByText("293 votes")).toBeInTheDocument();
    expect(await screen.findByPlaceholderText(/Share an update with your 1,284 followers/)).toBeInTheDocument();
    expect(calls[0]).toMatchObject({ method: "GET" });
  });

  it("posts text with a poll and the notify switch, as one multipart request", async () => {
    render(<ThreadsPage />);
    await screen.findByText(/Hack Night 04 is tonight/);
    fireEvent.change(screen.getByLabelText("Share an update"), { target: { value: "Theme for Hack Night 05?" } });
    fireEvent.click(screen.getByRole("button", { name: /Poll/ }));
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

  it("pins, removes on a second click, and opens the comments to reply or remove", async () => {
    render(<ThreadsPage />);
    await screen.findByText(/Hack Night 04 is tonight/);
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
