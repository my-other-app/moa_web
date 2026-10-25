import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, screen, waitFor, within } from "@testing-library/react";

import doorsFixture from "../__fixtures__/platform-doors.json";

/**
 * Every door open on the platform, on the admin Overview: how many are open
 * and across how many clubs, what retention is due, what needs a decision
 * anywhere, and each live event's turnout. An admin cannot run a door, so it
 * must never offer the gate console the clubs dashboard does.
 */
let doors: unknown;
let fail = false;
const gets: string[] = [];

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        gets.push(path);
        if (path === "/api/v1/admin/doors") {
          if (fail) throw new Error("Bad Gateway");
          return doors;
        }
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(),
      put: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { PlatformDoorsPanel } = await import("./components/platform-doors-panel");

const inThreeHours = () => new Date(Date.now() + 3 * 3600_000).toISOString();
const card = (title: string) => screen.getByText(title).parentElement!.parentElement!;

beforeEach(() => {
  doors = { ...doorsFixture, stats: { ...doorsFixture.stats, next_retention_at: inThreeHours() } };
  fail = false;
  gets.length = 0;
});
afterEach(() => {
  vi.useRealTimers();
});

describe("the platform's doors on the Overview", () => {
  it("counts the doors open and the clubs they belong to", async () => {
    render(<PlatformDoorsPanel />);
    const open = (await screen.findByText("Doors open")).parentElement!.parentElement!;
    expect(within(open).getByText("2")).toBeInTheDocument();
    expect(within(open).getByText("across 2 clubs")).toBeInTheDocument();
  });

  it("breaks the events down by state and links to the list", async () => {
    render(<PlatformDoorsPanel />);
    const events = await screen.findByRole("link", { name: "Events: 42. Open events" });
    expect(events).toHaveAttribute("href", "/events");
    expect(within(events).getByText("2 live · 7 published · 3 draft · 30 closed")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "On file: 1,480. Open events" })).toBeInTheDocument();
  });

  it("says how much retention is due and when it next runs", async () => {
    render(<PlatformDoorsPanel />);
    const retention = (await screen.findByText("Retention due")).parentElement!.parentElement!;
    expect(within(retention).getByText("2")).toBeInTheDocument();
    expect(within(retention).getByText("next run in 3 h")).toBeInTheDocument();
  });

  it("lists what needs a decision, linking only what belongs to an event", async () => {
    render(<PlatformDoorsPanel />);
    const failed = await screen.findByRole("link", { name: /Retention failed for Demo Day/ });
    expect(failed).toHaveAttribute("href", "/events/12");
    expect(failed).toHaveTextContent("SES refused the report.");
    // Platform-wide: there is no event to open.
    expect(screen.getByText("No email provider is configured").closest("a")).toBeNull();
  });

  it("shows each live event's turnout, gates and volunteers, with its club", async () => {
    render(<PlatformDoorsPanel />);
    const hackathon = await screen.findByRole("link", { name: "SF Sea Hackathon · Yukthi" });
    expect(hackathon).toHaveAttribute("href", "/events/37");
    const row = hackathon.parentElement!.parentElement!;
    expect(within(row).getByText("3 / 24")).toBeInTheDocument();
    expect(within(row).getByText("13% TURNOUT")).toBeInTheDocument();
    expect(within(row).getByText("Gate A · 2 volunteers")).toBeInTheDocument();

    const chess = screen.getByRole("link", { name: "Chess Night · Chess Club" }).parentElement!.parentElement!;
    expect(within(chess).getByText("Main door + Side door · 3 volunteers")).toBeInTheDocument();
    expect(within(chess).getByText("78% TURNOUT")).toBeInTheDocument();
  });

  it("never offers the gate console: an admin cannot run a door", async () => {
    render(<PlatformDoorsPanel />);
    await screen.findByText("Doors open now");
    expect(screen.queryByText(/Open gate console/)).not.toBeInTheDocument();
  });

  it("says plainly when nothing is open and nothing is waiting", async () => {
    doors = {
      ...doorsFixture,
      stats: { ...doorsFixture.stats, doors_open: 0, retention_due: 0, next_retention_at: null },
      attention: [],
      live: [],
      clubs_live: 0,
    };
    render(<PlatformDoorsPanel />);
    expect(await screen.findByText("no event is live right now")).toBeInTheDocument();
    expect(screen.getByText("nothing scheduled this week")).toBeInTheDocument();
    expect(screen.getByText("No event is live anywhere on the platform right now.")).toBeInTheDocument();
    expect(
      screen.getByText("Nothing is waiting on anyone. Every open event has its tickets out and a working provider.")
    ).toBeInTheDocument();
    expect(within(card("Doors open now")).queryByText("LIVE")).not.toBeInTheDocument();
  });

  it("stays out of the Overview's way when the request fails", async () => {
    fail = true;
    const { container } = render(<PlatformDoorsPanel />);
    await waitFor(() => expect(gets).toHaveLength(1));
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("refreshes every 15 seconds while a door is open", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<PlatformDoorsPanel />);
    await screen.findByText("Doors open now");
    expect(gets).toHaveLength(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    await waitFor(() => expect(gets).toHaveLength(2));
  });
});
