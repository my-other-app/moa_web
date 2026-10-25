import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { ApiError } from "@moa/api";
import { toast } from "@moa/ui";

/**
 * Results: 1st, 2nd and 3rd, guest by guest (the winners route the server
 * always had) and team by team within each competition track (the new
 * results route). Placings print on certificates and earn the winner badges,
 * so this is the only place they are made. Door staff see them, and change
 * nothing; a backend without results shows nothing.
 */
const calls: Array<{ method: string; path: string; body?: unknown }> = [];
let me: unknown = null;
let server: "old" | "new" = "new";
let results: Record<string, unknown>;
let refuse: Error | null = null;

const GUESTS = {
  items: [
    { id: "r-asha", ticket_id: "MOA-1", full_name: "Asha Menon", email: "asha@example.com", is_paid: false, is_attended: true, is_won: false },
    { id: "r-ravi", ticket_id: "MOA-2", full_name: "Ravi Das", email: "ravi@example.com", is_paid: false, is_attended: true, is_won: false },
  ],
  total: 2,
  limit: 8,
  offset: 0,
  next: null,
};

const plain = () => ({
  event_id: 37,
  has_competition: false,
  tracks: [],
  winners: [{ registration_id: "r-meera", ticket_id: "MOA-9", full_name: "Meera N", email: null, position: 1, team_id: null, team_name: null, track_id: null, track_name: null }],
});

const competition = () => ({
  event_id: 37,
  has_competition: true,
  tracks: [
    {
      id: 3,
      name: "Hardware",
      teams: [
        { id: 11, name: "Team Nova", position: 1, members: [{ registration_id: "r-asha", full_name: "Asha Menon" }] },
        { id: 12, name: "Circuit Breakers", position: null, members: [{ registration_id: "r-ravi", full_name: "Ravi Das" }] },
      ],
    },
    { id: 4, name: "Software", teams: [] },
  ],
  winners: [{ registration_id: "r-asha", ticket_id: "MOA-1", full_name: "Asha Menon", email: "asha@example.com", position: 1, team_id: 11, team_name: "Team Nova", track_id: 3, track_name: "Hardware" }],
});

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        calls.push({ method: "GET", path });
        if (path === "/api/v1/clubs/access/me") {
          if (me) return me;
          throw new ApiError({ status: 401, message: "Not signed in" });
        }
        if (path === "/api/v1/events/37/results") {
          if (server === "old") throw new ApiError({ status: 404, message: "Not Found", routeMissing: true });
          return results;
        }
        if (path === "/api/v1/events/registration/37/list") return GUESTS;
        throw new Error(`unstubbed GET ${path}`);
      }),
      put: vi.fn(async (path: string, body: { position: number | null }) => {
        calls.push({ method: "PUT", path, body });
        if (refuse) throw refuse;
        const team = path.match(/\/results\/teams\/(\d+)$/);
        if (team) {
          const next = competition();
          for (const t of next.tracks[0]!.teams) if (t.id === Number(team[1])) t.position = body.position;
          return next;
        }
        return { id: "r-asha", position: body.position, is_won: body.position !== null };
      }),
      post: vi.fn(),
      patch: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { ResultsPanel } = await import("./components/results-panel");

beforeEach(() => {
  calls.length = 0;
  me = null;
  server = "new";
  refuse = null;
  results = plain();
  vi.restoreAllMocks();
});

const puts = () => calls.filter((c) => c.method === "PUT");

describe("results without a competition", () => {
  it("shows each place with who holds it, and says what placings do", async () => {
    render(<ResultsPanel eventId={37} />);
    const first = await screen.findByTestId("place-1");
    expect(within(first).getByText("Meera N")).toBeInTheDocument();
    expect(screen.getByText(/Certificates print each guest's placing/)).toBeInTheDocument();
    expect(screen.queryByText("Hardware")).not.toBeInTheDocument();
  });

  it("finds a guest on the list and gives them 2nd place through the winners route", async () => {
    const success = vi.spyOn(toast, "success");
    render(<ResultsPanel eventId={37} />);
    fireEvent.click(await screen.findByRole("button", { name: /Add a 2nd place/ }));
    fireEvent.change(screen.getByLabelText("Find a guest for 2nd place"), { target: { value: "asha" } });
    fireEvent.click(await screen.findByRole("button", { name: /Asha Menon/ }));
    await waitFor(() => expect(puts()).toEqual([{ method: "PUT", path: "/api/v1/events/registration/37/winners/r-asha", body: { position: 2 } }]));
    await waitFor(() => expect(success).toHaveBeenCalledWith("Asha Menon placed Second"));
  });

  it("takes a place away", async () => {
    render(<ResultsPanel eventId={37} />);
    fireEvent.click(await screen.findByRole("button", { name: "Take 1st place from Meera N" }));
    await waitFor(() => expect(puts()).toEqual([{ method: "PUT", path: "/api/v1/events/registration/37/winners/r-meera", body: { position: null } }]));
  });

  it("says why when the server refuses", async () => {
    const error = vi.spyOn(toast, "error");
    refuse = new ApiError({ status: 404, message: "Registration not found" });
    render(<ResultsPanel eventId={37} />);
    fireEvent.click(await screen.findByRole("button", { name: "Take 1st place from Meera N" }));
    await waitFor(() => expect(error).toHaveBeenCalledWith("Registration not found"));
  });
});

describe("results with a competition", () => {
  beforeEach(() => {
    results = competition();
  });

  it("places teams track by track, and the server's answer is what shows", async () => {
    render(<ResultsPanel eventId={37} />);
    const breakers = await screen.findByRole("radiogroup", { name: "Placing of Circuit Breakers" });
    expect(within(screen.getByRole("radiogroup", { name: "Placing of Team Nova" })).getByRole("radio", { name: "1st" })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(within(breakers).getByRole("radio", { name: "2nd" }));
    await waitFor(() => expect(puts()).toEqual([{ method: "PUT", path: "/api/v1/events/37/results/teams/12", body: { position: 2 } }]));
    await waitFor(() => expect(within(breakers).getByRole("radio", { name: "2nd" })).toHaveAttribute("aria-checked", "true"));
    expect(screen.getByText("No teams in this track yet.")).toBeInTheDocument();
  });

  it("lists only guests placed on their own under Winners, not the team members", async () => {
    render(<ResultsPanel eventId={37} />);
    const first = await screen.findByTestId("place-1");
    expect(within(first).queryByText("Asha Menon")).not.toBeInTheDocument();
  });
});

describe("who may change results", () => {
  it("lets door staff look, and change nothing", async () => {
    results = competition();
    me = {
      role: "door", role_label: "Door", role_description: "", club_id: 5, club_name: "Circuit Society", member: null,
      can: { manage_access: false, see_access: false, money: false, club_profile: false, edit_events: false, delete_events: false, door: true },
    };
    render(<ResultsPanel eventId={37} />);
    expect(await screen.findByText(/Your role can see the results/)).toBeInTheDocument();
    for (const radio of within(screen.getByRole("radiogroup", { name: "Placing of Team Nova" })).getAllByRole("radio")) expect(radio).toBeDisabled();
    expect(screen.queryByRole("button", { name: /Add a 1st place/ })).not.toBeInTheDocument();
  });

  it("says results aren't there yet on a backend without them", async () => {
    server = "old";
    render(<ResultsPanel eventId={37} />);
    expect(await screen.findByText(/Results aren't available yet/)).toBeInTheDocument();
  });
});
