import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

import type { FakeState } from "@/test/fake-api";

/** Admin → Games: the platform totals, "connected now", the table per club and event, and the date range. */
const state = vi.hoisted<FakeState>(() => ({ role: "owner", ops: null, calls: [], handlers: {} }));

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  const { fakeApi } = await import("@/test/fake-api");
  return { ...actual, useSession: () => ({ data: { id: 1, username: "admin", user_type: "admin", admin_role: state.role } }), api: fakeApi(state) };
});

const { render } = await import("@/test/render");
const { freshState, callsOf, routeMissing } = await import("@/test/fake-api");
const { GamesPage, gamesOf, gamesOverviewSchema } = await import("./index");
const { FEATURE_LABELS } = await import("@/features/subscriptions");

const OVERVIEW = {
  totals: {
    cards: { events: 3, players: 520, reveals: 480, collects: 1900, decks_completed: 12 },
    hunt: { events: 2, players: 300, claims: 1200, hunts_completed: 9 },
    events: 4,
    players: 640,
    connected_now: 58,
  },
  rows: [
    { event_id: 10, event: 10, event_name: "DevFest 2026", slug: "devfest-2026", event_datetime: "2026-11-28T04:30:00Z", club_id: 1, club: 1, club_name: "Cloud Kochi", cards_on: true, hunt_on: true, players: 300, connected_now: 40, reveals: 280, collects: 1100, hunt_claims: 900, decks_completed: 7, hunts_completed: 6 },
    { event_id: 11, event: 11, event_name: "Build night", slug: "build-night", event_datetime: null, club_id: 2, club: 2, club_name: "Maker Circle", cards_on: true, hunt_on: false, players: 80, connected_now: 18, reveals: 70, collects: 200, hunt_claims: 0, decks_completed: 1, hunts_completed: 0 },
    { nonsense: true },
  ],
  plans: [
    { plan: "free", name: "Free", game_cards: false, game_hunt: false, clubs: 20 },
    { plan: "pro", name: "Pro", game_cards: true, game_hunt: true, clubs: 4 },
  ],
  clubs_with: { game_cards: 4, game_hunt: 3 },
};

beforeEach(() => {
  freshState(state);
  state.handlers["GET /api/v1/admin/games/overview"] = () => OVERVIEW;
});

describe("the games overview", () => {
  it("shows totals per game and the players connected now", async () => {
    render(<GamesPage />);
    expect(await screen.findByText("58")).toBeInTheDocument();
    const cards = screen.getByRole("region", { name: "Hero Cards totals" });
    expect(within(cards).getByText("480")).toBeInTheDocument();
    expect(within(cards).getByText("1,900")).toBeInTheDocument();
    const hunt = screen.getByRole("region", { name: "Scavenger Hunt totals" });
    expect(within(hunt).getByText("1,200")).toBeInTheDocument();
    // The documented totals have no per-game "connected now": it is one number for the platform.
    expect(within(cards).queryByText("Connected now")).toBeNull();
    expect(within(cards).getByText("520")).toBeInTheDocument();
  });

  it("counts clubs with each game from clubs_with, and names the plans that include them", async () => {
    render(<GamesPage />);
    expect(await screen.findByText(/4 with Hero Cards, 3 with Scavenger Hunt · Pro: 4/)).toBeInTheDocument();
    const parsed = gamesOverviewSchema.parse(OVERVIEW);
    expect(parsed.clubs_with).toEqual({ game_cards: 4, game_hunt: 3 });
    expect(parsed.plans[1]).toEqual({ plan: "pro", name: "Pro", game_cards: true, game_hunt: true, clubs: 4 });
    expect(parsed.rows[0]).toMatchObject({ slug: "devfest-2026", event_datetime: "2026-11-28T04:30:00Z" });
  });

  it("lists each club and event with its numbers, leaving out a row it cannot read", async () => {
    render(<GamesPage />);
    const table = await screen.findByRole("table");
    expect(within(table).getByText("DevFest 2026")).toBeInTheDocument();
    expect(within(table).getByText(/Cloud Kochi · Hero Cards and Scavenger Hunt/)).toBeInTheDocument();
    expect(within(table).getByText(/Maker Circle · Hero Cards$/)).toBeInTheDocument();
    for (const h of ["Players", "Connected now", "Reveals", "Collects", "Hunt claims", "Decks completed", "Hunts completed"]) {
      expect(within(table).getByRole("columnheader", { name: new RegExp(h) })).toBeInTheDocument();
    }
    expect(within(table).getAllByRole("row")).toHaveLength(3);
    expect(gamesOverviewSchema.parse(OVERVIEW).rows).toHaveLength(2);
  });

  it("asks again with the dates picked", async () => {
    render(<GamesPage />);
    await screen.findByRole("table");
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-11-01" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-11-30" } });
    await waitFor(() => expect(callsOf(state, "GET", "/api/v1/admin/games/overview").at(-1)!.query).toEqual({ from: "2026-11-01", to: "2026-11-30" }));
    expect(callsOf(state, "GET", "/api/v1/admin/games/overview")[0]!.query).toEqual({ from: undefined, to: undefined });
    fireEvent.click(screen.getByRole("button", { name: "All time" }));
    await waitFor(() => expect(callsOf(state, "GET", "/api/v1/admin/games/overview").at(-1)!.query).toEqual({ from: undefined, to: undefined }));
  });

  it("says so on an API without the games", async () => {
    state.handlers["GET /api/v1/admin/games/overview"] = () => {
      throw routeMissing();
    };
    render(<GamesPage />);
    expect(await screen.findByText("Games are not here yet")).toBeInTheDocument();
  });

  it("names the games in words, and the plan editor labels both features", () => {
    expect(gamesOf({ cards_on: false, hunt_on: true })).toBe("Scavenger Hunt");
    expect(gamesOf({ cards_on: false, hunt_on: false })).toBe("None on");
    expect(FEATURE_LABELS.game_cards).toBe("Hero card game");
    expect(FEATURE_LABELS.game_hunt).toBe("Scavenger hunt");
  });
});
