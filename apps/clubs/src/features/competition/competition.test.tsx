import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

const calls: Array<{ method: string; path: string; body?: unknown }> = [];

const board = [{ rank: 1, team_id: 10, name: "Byte Benders", track: "Wake word on a ₹300 chip", stage: "entered", score: 77.0, judges_scored: 2, judges_total: 2 }, { rank: 2, team_id: 11, name: "Tiny Tensors", track: "Sensors for good", stage: "entered", score: 60.0, judges_scored: 1, judges_total: 2 }];

const base = {
  event_id: 37,
  settings: {
    enabled: true, team_min: 1, team_max: 4, teams_locked: false, submissions_close_at: "2099-10-07T15:45:00Z", submissions_closed_at: null, submissions_open: true,
    requirements: [{ key: "repo", label: "Code repository link", required: true }, { key: "video", label: "Demo video (2 min max)", required: true }, { key: "deck", label: "Pitch deck", required: false }],
    rubric: [{ key: "technical", label: "Technical depth", weight: 35 }, { key: "innovation", label: "Innovation", weight: 25 }, { key: "demo", label: "Demo", weight: 25 }, { key: "impact", label: "Impact", weight: 15 }],
    leaderboard_public: false, shortlist_size: 4, final_size: 3, slot_minutes: 15,
  },
  figures: { teams: 2, people: 5, seekers: 1, submitted: 1, judges: 2, scored_pairs: 3 },
  tracks: [{ id: 1, name: "Wake word on a ₹300 chip", description: "Under 100 KB of model.", sponsor: "Kinetic Labs", prize: "₹3,000 + dev kits", sort_order: 0, teams: 1 }, { id: 2, name: "Sensors for good", description: null, sponsor: null, prize: null, sort_order: 1, teams: 1 }],
  teams: [
    { id: 10, name: "Byte Benders", track_id: 1, track: "Wake word on a ₹300 chip", stage: "entered", members: [{ registration_id: "r1", name: "Aarav Kulkarni", email: "a@x.in" }, { registration_id: "r2", name: "Diya Kapoor", email: "d@x.in" }, { registration_id: "r3", name: "Neel Gokhale", email: "n@x.in" }], open_spots: 1, submission: { fields: { repo: "https://github.com/x/y", video: "https://youtu.be/a" }, status: "complete", missing: [], completed_at: "2099-10-07T10:00:00Z", updated_at: "2099-10-07T10:00:00Z" }, score: 77.0, judges_scored: 2, created_at: "2099-10-01T00:00:00Z" },
    { id: 11, name: "Tiny Tensors", track_id: 2, track: "Sensors for good", stage: "entered", members: [{ registration_id: "r4", name: "Vihaan Shinde", email: null }, { registration_id: "r5", name: "Meera Iyer", email: null }], open_spots: 2, submission: { fields: { repo: "https://github.com/t/t" }, status: "in_progress", missing: ["video"], completed_at: null, updated_at: "2099-10-07T11:00:00Z" }, score: 60.0, judges_scored: 1, created_at: "2099-10-02T00:00:00Z" },
  ],
  seekers: [{ registration_id: "r9", name: "Sneha Joshi", skills: ["ML", "Python"], note: null }],
  judges: [{ id: 1, name: "Dr. Neha Kulkarni", email: null, sort_order: 0, scored: 2 }, { id: 2, name: "Arjun Menon", email: null, sort_order: 1, scored: 1 }],
  scores: [{ judge_id: 1, team_id: 10, scores: { technical: 8, innovation: 7, demo: 9, impact: 6 }, note: null, total: 77.0 }, { judge_id: 2, team_id: 10, scores: { technical: 8, innovation: 7, demo: 9, impact: 6 }, note: null, total: 77.0 }, { judge_id: 1, team_id: 11, scores: { technical: 6, innovation: 7, demo: 5, impact: 6 }, note: null, total: 60.0 }],
  board,
  rounds: { entered: board, shortlisted: [] as typeof board, finalists: [] as typeof board },
  mentors: [{ id: 5, name: "Arjun Menon", topic: "Firmware, debugging", sort_order: 0, slots: [{ id: 50, starts_at: "2099-10-07T14:30:00Z", minutes: 15, team_id: 11, team: "Tiny Tensors" }, { id: 51, starts_at: "2099-10-07T14:45:00Z", minutes: 15, team_id: null, team: null }] }],
  generated_at: "2099-10-07T12:00:00Z",
};

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        calls.push({ method: "GET", path });
        if (path.endsWith("/events/37/competition")) return base;
        if (path.includes("/registrations")) return { items: [], total: 0 };
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "POST", path, body });
        if (path.endsWith("/tracks")) return { ...base, tracks: [...base.tracks, { id: 3, name: (body as { name: string }).name, description: null, sponsor: null, prize: null, sort_order: 2, teams: 0 }] };
        if (path.endsWith("/rounds/advance")) return { ...base, rounds: { entered: [base.board[1]!], shortlisted: [base.board[0]!], finalists: [] } };
        return base;
      }),
      patch: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "PATCH", path, body });
        const b = body as Record<string, unknown>;
        return { ...base, settings: { ...base.settings, ...b } };
      }),
      put: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "PUT", path, body });
        return base;
      }),
      del: vi.fn(async (path: string) => {
        calls.push({ method: "DELETE", path });
        return base;
      }),
    },
  };
});

const { render } = await import("@/test/render");
const { CompetitionPage } = await import("./components/competition-page");
const { totalOf } = await import("./schemas");

beforeEach(() => {
  calls.length = 0;
  window.history.replaceState(null, "", "/events/37/competition");
});

describe("the competition tab", () => {
  it("scores a judge's sheet the way the server does", () => {
    const rubric = base.settings.rubric;
    expect(totalOf(rubric, { technical: 8, innovation: 7, demo: 9, impact: 6 })).toBe(77);
    expect(totalOf(rubric, { technical: 8 })).toBeNull();
    expect(totalOf([], {})).toBeNull();
  });

  it("reads the line, the pills with their numbers, and the tracks; adds a track", async () => {
    render(<CompetitionPage eventId={37} />);
    expect(await screen.findByText("2 teams · 5 people · 1 of 2 submitted · 2 judges")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Teams.*2 · 1 looking/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Submissions.*1\/2/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Judging.*3\/4 scored/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Leaderboard.*private/ })).toBeInTheDocument();
    expect(screen.getByLabelText("Wake word on a ₹300 chip sponsor")).toHaveValue("Kinetic Labs");
    expect(screen.getAllByText("1 team on this track")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: /Add track/ }));
    fireEvent.change(screen.getByLabelText("New track name"), { target: { value: "Open track" } });
    fireEvent.click(screen.getByRole("button", { name: "Save track" }));
    await waitFor(() => expect(calls.find((c) => c.method === "POST")).toMatchObject({ path: "/api/v1/events/37/competition/tracks", body: { name: "Open track", description: null, sponsor: null, prize: null } }));
    expect(await screen.findByLabelText("Open track name")).toBeInTheDocument();
  });

  it("shows the teams with their people and who is looking, and locks teams", async () => {
    render(<CompetitionPage eventId={37} />);
    fireEvent.click(await screen.findByRole("button", { name: /^Teams/ }));
    expect(await screen.findByLabelText("Byte Benders name")).toHaveValue("Byte Benders");
    expect(screen.getByText("Open · 1 spot")).toBeInTheDocument();
    expect(screen.getByText("Neel Gokhale")).toBeInTheDocument();
    expect(screen.getByText("Sneha Joshi")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Take Neel Gokhale off Byte Benders" }));
    await waitFor(() => expect(calls.find((c) => c.method === "DELETE")).toMatchObject({ path: "/api/v1/events/37/competition/teams/10/members/r3" }));
    fireEvent.click(screen.getByRole("switch", { name: "Lock teams" }));
    await waitFor(() => expect(calls.find((c) => c.method === "PATCH")).toMatchObject({ path: "/api/v1/events/37/competition", body: { teams_locked: true } }));
    expect(await screen.findByText(/Teams are locked/)).toBeInTheDocument();
  });

  it("reads the submissions table and closes submissions", async () => {
    render(<CompetitionPage eventId={37} />);
    fireEvent.click(await screen.findByRole("button", { name: /^Submissions/ }));
    expect(await screen.findByText("1 of 2 teams have everything in")).toBeInTheDocument();
    expect(screen.getAllByText("Added")).toHaveLength(3);
    expect(screen.getByText("Missing")).toBeInTheDocument();
    expect(screen.getByText("In progress")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Close submissions now/ }));
    await waitFor(() => expect(calls.find((c) => c.method === "POST")).toMatchObject({ path: "/api/v1/events/37/competition/submissions/close" }));
  });

  it("scores as a judge on the rubric and the total follows", async () => {
    render(<CompetitionPage eventId={37} />);
    fireEvent.click(await screen.findByRole("button", { name: /^Judging/ }));
    expect(await screen.findByText("77.0 / 100")).toBeInTheDocument();
    expect(screen.getByText("2/2 scored")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "Score as" }), { target: { value: "2" } });
    const card = screen.getByText("Tiny Tensors").closest("div")!.parentElement!;
    expect(within(card).getByText("Not scored")).toBeInTheDocument();
    const slider = within(card).getByLabelText("Tiny Tensors · Technical depth");
    fireEvent.change(slider, { target: { value: "9" } });
    fireEvent.mouseUp(slider);
    await waitFor(() => expect(calls.find((c) => c.method === "PUT")).toMatchObject({ path: "/api/v1/events/37/competition/judges/2/scores/11", body: { scores: { technical: 9 } } }));
  });

  it("advances the top of the entered to the shortlist, and makes the board public", async () => {
    render(<CompetitionPage eventId={37} />);
    fireEvent.click(await screen.findByRole("button", { name: /^Rounds/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Advance to shortlist/ }));
    await waitFor(() => expect(calls.find((c) => c.method === "POST")).toMatchObject({ path: "/api/v1/events/37/competition/rounds/advance", body: { to: "shortlisted" } }));
    fireEvent.click(screen.getByRole("button", { name: /^Leaderboard/ }));
    expect(await screen.findByText(/Private — only your committee/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Public" }));
    await waitFor(() => expect(calls.find((c) => c.method === "PATCH")).toMatchObject({ body: { leaderboard_public: true } }));
  });

  it("shows the mentor grid and frees a booked slot", async () => {
    render(<CompetitionPage eventId={37} />);
    fireEvent.click(await screen.findByRole("button", { name: /Office hours/ }));
    const slot = await screen.findByRole("button", { name: /Arjun Menon at .*: booked by Tiny Tensors/ });
    fireEvent.click(slot);
    await waitFor(() => expect(calls.find((c) => c.method === "PATCH")).toMatchObject({ path: "/api/v1/events/37/competition/slots/50", body: { team_id: null } }));
  });
});
