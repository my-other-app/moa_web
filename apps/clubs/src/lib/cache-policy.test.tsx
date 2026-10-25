import * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@moa/api";

/**
 * The cache every page reads through: the browser's one QueryClient from
 * @moa/app-kit, which the admin portal's providers hand out too. Data loaded
 * in the last 30 seconds is reused rather than fetched again, reference lists
 * (the topic tree) for 10 minutes, a window regaining focus fetches nothing,
 * a refusal is never retried, and a mutation never repeats itself.
 *
 * These use the real client, not a test one, so they hold the policy the
 * dashboards actually run with.
 */
const gets: string[] = [];
const answers: Record<string, () => unknown> = {};

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        gets.push(path);
        const answer = answers[path];
        if (!answer) throw new Error(`unstubbed GET ${path}`);
        return answer();
      }),
      post: vi.fn(async (path: string) => {
        gets.push(`POST ${path}`);
        throw new ApiError({ status: 500, message: "Server error" });
      }),
      put: vi.fn(),
      patch: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { api, getQueryClient, staleTimes } = await import("@moa/app-kit");
const { useTopicTree } = await import("@/features/topics/queries");
const { Providers } = await import("@/app/providers");

const client = getQueryClient();
const EVENTS = "/api/v1/club/events";
const TOPICS = "/api/v1/interests/list";

function EventsList() {
  const q = useQuery({ queryKey: ["events", "list"], queryFn: () => api.get<string[]>(EVENTS) });
  return <p>{q.data ? `${q.data.length} events` : q.isError ? "failed" : "loading"}</p>;
}
function Topics() {
  const q = useTopicTree();
  return <p>{q.data ? "topics ready" : "loading"}</p>;
}
const withClient = (ui: React.ReactElement) => render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
const count = (path: string) => gets.filter((g) => g === path).length;

let now = Date.parse("2026-10-16T13:00:00Z");
beforeEach(() => {
  client.clear();
  gets.length = 0;
  answers[EVENTS] = () => ["Hack Night 04", "Demo Day"];
  answers[TOPICS] = () => [];
  now = Date.parse("2026-10-16T13:00:00Z");
  // Only the clock is moved; React Query's own timers stay real.
  vi.spyOn(Date, "now").mockImplementation(() => now);
});
afterEach(() => vi.restoreAllMocks());

/** Leave the page and come back `seconds` later. */
async function revisit(ui: React.ReactElement, seconds: number) {
  const first = withClient(ui);
  await screen.findByText(/events|topics ready/);
  first.unmount();
  now += seconds * 1000;
  withClient(ui);
  await screen.findByText(/events|topics ready/);
}

describe("the dashboards' cache", () => {
  it("is one client for the whole browser tab, and the providers hand out that one", async () => {
    expect(getQueryClient()).toBe(client);
    // next-themes asks the OS for its scheme.
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
    function Probe() {
      return <p>{useQueryClient() === client ? "the browser's client" : "another client"}</p>;
    }
    render(
      <Providers>
        <Probe />
      </Providers>
    );
    expect(screen.getByText("the browser's client")).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("reuses a page's data loaded under 30 seconds ago instead of fetching it again", async () => {
    await revisit(<EventsList />, 29);
    expect(screen.getByText("2 events")).toBeInTheDocument();
    // Give a background refetch every chance to start.
    await act(() => new Promise((r) => setTimeout(r, 50)));
    expect(count(EVENTS)).toBe(1);
  });

  it("fetches it again once it is older than 30 seconds", async () => {
    await revisit(<EventsList />, 31);
    await waitFor(() => expect(count(EVENTS)).toBe(2));
    expect(staleTimes.volatile).toBe(30_000);
  });

  it("keeps a reference list such as the topic tree for 10 minutes", async () => {
    await revisit(<Topics />, 9 * 60);
    await act(() => new Promise((r) => setTimeout(r, 50)));
    expect(count(TOPICS)).toBe(1);

    now += 2 * 60 * 1000;
    withClient(<Topics />);
    await waitFor(() => expect(count(TOPICS)).toBe(2));
    expect(staleTimes.reference).toBe(10 * 60_000);
  });

  it("fetches nothing when the window regains focus", async () => {
    withClient(<EventsList />);
    await screen.findByText("2 events");
    now += 60_000;
    act(() => {
      window.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("focus"));
    });
    await act(() => new Promise((r) => setTimeout(r, 50)));
    expect(count(EVENTS)).toBe(1);
  });

  it("never retries a refusal, so a dead session goes straight to sign-in", async () => {
    answers[EVENTS] = () => {
      throw new ApiError({ status: 401, message: "Not signed in" });
    };
    withClient(<EventsList />);
    expect(await screen.findByText("failed")).toBeInTheDocument();
    expect(count(EVENTS)).toBe(1);
  });

  it("retries a server failure or a dropped connection twice, and no more", () => {
    const retry = client.getDefaultOptions().queries!.retry as (n: number, e: unknown) => boolean;
    for (const status of [401, 403, 404, 422]) expect(retry(0, new ApiError({ status, message: "No" }))).toBe(false);
    expect(retry(0, new ApiError({ status: 502, message: "Bad gateway" }))).toBe(true);
    expect(retry(1, new TypeError("Failed to fetch"))).toBe(true);
    expect(retry(2, new ApiError({ status: 502, message: "Bad gateway" }))).toBe(false);
  });

  it("never repeats a mutation that failed, so nothing is sent twice", async () => {
    function Save() {
      const m = useMutation({ mutationFn: () => api.post("/api/v1/club/events/37/duplicate") });
      return (
        <button type="button" onClick={() => m.mutate()}>
          {m.isError ? "refused" : "save"}
        </button>
      );
    }
    withClient(<Save />);
    act(() => screen.getByRole("button", { name: "save" }).click());
    expect(await screen.findByRole("button", { name: "refused" })).toBeInTheDocument();
    expect(count("POST /api/v1/club/events/37/duplicate")).toBe(1);
  });
});
