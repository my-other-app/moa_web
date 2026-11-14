import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, screen, waitFor, within } from "@testing-library/react";
import { focusManager } from "@tanstack/react-query";
import { ApiError } from "@moa/api";

import summaryFixture from "../__fixtures__/event-summary.json";
import topicsFixture from "../__fixtures__/topics.json";

/**
 * The Networking card against the contract (profiles-networking-contract.md,
 * "Events"): GET /events/{event_id}/networking/stats →
 * {checked_in, people_networked, saves, mutual_pairs, by_hour: [{hour, saves}]},
 * counts only. The dashboards may ship before the backend, so every way the
 * call can fail leaves the card off the page and the page as it was.
 */
const STATS = {
  checked_in: 120,
  people_networked: 48,
  saves: 96,
  mutual_pairs: 17,
  by_hour: [
    { hour: "2026-11-28T10:00:00+05:30", saves: 12 },
    { hour: "2026-11-28T11:00:00+05:30", saves: 40 },
    { hour: "2026-11-28T12:00:00+05:30", saves: 44 },
  ],
};

let answer: () => unknown = () => STATS;
const gets: string[] = [];

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        gets.push(path);
        if (/\/events\/\d+\/networking\/stats$/.test(path)) return answer();
        if (/\/events\/\d+\/summary$/.test(path)) return summaryFixture;
        if (path === "/api/v1/interests/list") return topicsFixture;
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(),
      put: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { networkingStatsSchema } = await import("@moa/api");
const { NetworkingCard, NETWORKING_POLL_MS } = await import("./index");
const { EventOverviewTab } = await import("@/features/console");

const statsCalls = () => gets.filter((p) => p.endsWith("/networking/stats"));
const card = () => screen.findByRole("region", { name: "Networking" });

beforeEach(() => {
  answer = () => STATS;
  gets.length = 0;
});

afterEach(() => {
  vi.useRealTimers();
  focusManager.setFocused(undefined);
});

describe("the shape", () => {
  it("reads the counts and the hours", () => {
    const s = networkingStatsSchema.parse(STATS);
    expect(s).toEqual(STATS);
  });

  it("reads an absent or odd count as 0 and drops an hour it cannot read, keeping the rest", () => {
    const s = networkingStatsSchema.parse({
      checked_in: "12",
      saves: null,
      mutual_pairs: -3,
      people_networked: 4.7,
      extra: "ignored",
      by_hour: [{ hour: "2026-11-28T10:00:00+05:30", saves: "5" }, { saves: 3 }, null, { hour: "2026-11-28T11:00:00+05:30" }],
    });
    expect(s).toEqual({
      checked_in: 12,
      people_networked: 4,
      saves: 0,
      mutual_pairs: 0,
      by_hour: [
        { hour: "2026-11-28T10:00:00+05:30", saves: 5 },
        { hour: "2026-11-28T11:00:00+05:30", saves: 0 },
      ],
    });
    expect(networkingStatsSchema.parse({}).by_hour).toEqual([]);
    expect(networkingStatsSchema.parse({ by_hour: "soon" }).by_hour).toEqual([]);
  });
});

describe("the card", () => {
  it("shows who is in, who networked, the saves, the mutual pairs and the saves by hour", async () => {
    render(<NetworkingCard eventId={37} live={false} timezone="Asia/Kolkata" />);
    const c = await card();
    expect(statsCalls()).toEqual(["/api/v1/events/37/networking/stats"]);
    expect(within(c).getByText("Checked in").nextSibling).toHaveTextContent("120");
    expect(within(c).getByText("Networked").nextSibling).toHaveTextContent("48");
    expect(within(c).getByText("40% of those in")).toBeInTheDocument();
    expect(within(c).getByText("Saves").nextSibling).toHaveTextContent("96");
    expect(within(c).getByText("Mutual pairs").nextSibling).toHaveTextContent("17");
    const chart = within(c).getByRole("img", { name: /Saves by hour/ });
    expect(chart).toHaveAccessibleName("Saves by hour. 10:00: 12 saves, 11:00: 40 saves, 12:00: 44 saves.");
    expect(chart.querySelectorAll("[data-hour]")).toHaveLength(3);
    // The busiest hour is the brand; the rest its tint.
    expect(chart.querySelector('[data-hour="2026-11-28T12:00:00+05:30"]')).toHaveClass("bg-brand");
    expect(chart.querySelector('[data-hour="2026-11-28T10:00:00+05:30"]')).toHaveClass("bg-brand-line");
    expect(within(c).getByText("busiest 12:00")).toBeInTheDocument();
    // Not live: nothing says it refreshes.
    expect(within(c).queryByText(/every minute/)).not.toBeInTheDocument();
    // Counts only: no name anywhere.
    expect(c).not.toHaveTextContent(/@|saved by/i);
  });

  it("says when nobody has saved anyone yet, without a chart", async () => {
    answer = () => ({ ...STATS, people_networked: 0, saves: 0, mutual_pairs: 0, by_hour: [] });
    render(<NetworkingCard eventId={37} live />);
    const c = await card();
    expect(within(c).getByText(/No saves yet/)).toBeInTheDocument();
    expect(within(c).queryByRole("img")).not.toBeInTheDocument();
    expect(within(c).getByText("Live · every minute")).toBeInTheDocument();
  });

  it("stays away before anyone is in", async () => {
    answer = () => ({ checked_in: 0, people_networked: 0, saves: 0, mutual_pairs: 0, by_hour: [] });
    render(<NetworkingCard eventId={37} live={false} />);
    await waitFor(() => expect(statsCalls()).toHaveLength(1));
    expect(screen.queryByRole("region", { name: "Networking" })).not.toBeInTheDocument();
  });

  const failures: Array<[string, () => unknown]> = [
    ["an API without the route (404)", () => {
      throw new ApiError({ status: 404, message: "Not Found", routeMissing: true });
    }],
    ["a coded 404", () => {
      throw new ApiError({ status: 404, message: "Event not found", errorCode: "NOT_FOUND" });
    }],
    ["a role that may not read it (403)", () => {
      throw new ApiError({ status: 403, message: "You do not have permission to do that.", errorCode: "FORBIDDEN" });
    }],
    ["the network", () => {
      throw new TypeError("Failed to fetch");
    }],
    ["a server error", () => {
      throw new ApiError({ status: 500, message: "Something went wrong on our side." });
    }],
  ];
  for (const [what, fail] of failures) {
    it(`is left off the page on ${what}`, async () => {
      answer = fail;
      const { container } = render(
        <div>
          <p>the rest of the page</p>
          <NetworkingCard eventId={37} live />
        </div>
      );
      await waitFor(() => expect(statsCalls()).toHaveLength(1));
      await act(async () => {});
      expect(screen.getByText("the rest of the page")).toBeInTheDocument();
      expect(screen.queryByRole("region", { name: "Networking" })).not.toBeInTheDocument();
      expect(container.querySelectorAll("p")).toHaveLength(1);
    });
  }
});

describe("polling", () => {
  it("reads again every minute while the event is live", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<NetworkingCard eventId={37} live />);
    await card();
    expect(NETWORKING_POLL_MS).toBe(60_000);
    expect(statsCalls()).toHaveLength(1);
    answer = () => ({ ...STATS, saves: 101 });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(NETWORKING_POLL_MS / 2);
    });
    // Never more often than a minute.
    expect(statsCalls()).toHaveLength(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(NETWORKING_POLL_MS / 2 + 100);
    });
    await waitFor(() => expect(statsCalls()).toHaveLength(2));
    expect(await screen.findByText("101")).toBeInTheDocument();
  });

  it("reads once when the event is not live", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<NetworkingCard eventId={37} live={false} />);
    await card();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(NETWORKING_POLL_MS * 3);
    });
    expect(statsCalls()).toHaveLength(1);
  });

  it("keeps the last counts when a refresh fails, and goes only when the API says no", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<NetworkingCard eventId={37} live />);
    await card();
    expect(screen.getByText("96")).toBeInTheDocument();
    // One minute's read fails (the network, a 500): the card stays, with what it had.
    answer = () => {
      throw new TypeError("Failed to fetch");
    };
    await act(async () => {
      await vi.advanceTimersByTimeAsync(NETWORKING_POLL_MS + 100);
    });
    await waitFor(() => expect(statsCalls()).toHaveLength(2));
    await act(async () => {});
    expect(screen.getByRole("region", { name: "Networking" })).toBeInTheDocument();
    expect(screen.getByText("96")).toBeInTheDocument();
    answer = () => {
      throw new ApiError({ status: 500, message: "Something went wrong on our side." });
    };
    await act(async () => {
      await vi.advanceTimersByTimeAsync(NETWORKING_POLL_MS + 100);
    });
    await waitFor(() => expect(statsCalls()).toHaveLength(3));
    await act(async () => {});
    expect(screen.getByText("96")).toBeInTheDocument();
    // The next read is refused (the person lost access): now it goes.
    answer = () => {
      throw new ApiError({ status: 403, message: "You do not have permission to do that.", errorCode: "FORBIDDEN" });
    };
    await act(async () => {
      await vi.advanceTimersByTimeAsync(NETWORKING_POLL_MS + 100);
    });
    await waitFor(() => expect(screen.queryByRole("region", { name: "Networking" })).not.toBeInTheDocument());
  });

  it("holds while the tab is hidden", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<NetworkingCard eventId={37} live />);
    await card();
    act(() => focusManager.setFocused(false));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(NETWORKING_POLL_MS * 3);
    });
    expect(statsCalls()).toHaveLength(1);
  });
});

describe("on the event's Overview", () => {
  it("sits on the console's overview of a live event", async () => {
    render(<EventOverviewTab eventId={37} event={undefined} />);
    const c = await card();
    expect(within(c).getByText("Live · every minute")).toBeInTheDocument();
    expect(screen.getByText("Arrival curve")).toBeInTheDocument();
  });

  it("leaves the overview whole on an API without networking", async () => {
    answer = () => {
      throw new ApiError({ status: 404, message: "Not Found", routeMissing: true });
    };
    render(<EventOverviewTab eventId={37} event={undefined} />);
    expect(await screen.findByText("Arrival curve")).toBeInTheDocument();
    await waitFor(() => expect(statsCalls()).toHaveLength(1));
    expect(screen.queryByRole("region", { name: "Networking" })).not.toBeInTheDocument();
    expect(screen.getByText("About")).toBeInTheDocument();
  });
});
