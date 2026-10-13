import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

const calls: Array<{ method: string; path: string; body?: unknown }> = [];

const quiz = {
  id: "qz1", title: "Edge AI warm-up quiz", intro: null, status: "draft", join_code: null, current_index: -1, players: 0,
  questions: [
    { id: "q1", prompt: "Roughly how much RAM does an ESP32-S3 have on-chip?", options: [{ key: "a", label: "512 KB" }, { key: "b", label: "8 MB" }, { key: "c", label: "64 KB" }, { key: "d", label: "2 GB" }], correct_key: "a", seconds: 20, sort_order: 0 },
    { id: "q2", prompt: "What does quantising a model to int8 mainly save?", options: [{ key: "a", label: "Training time" }, { key: "b", label: "Memory and compute" }], correct_key: "b", seconds: 20, sort_order: 1 },
  ],
};
const board = {
  approve_first: true,
  to_review: [{ id: "x1", text: "Is there a power bank station? My laptop is at 12%", author_name: "Sneha J.", status: "pending", pinned: false, votes: 3, created_at: "2026-10-13T13:00:00Z", answered_at: null }],
  board: [{ id: "x2", text: "Can we use TensorFlow Lite Micro or does it have to be Edge Impulse?", author_name: "Rohan P.", status: "approved", pinned: false, votes: 14, created_at: "2026-10-13T12:55:00Z", answered_at: null }],
  answered: [{ id: "x3", text: "How are the demos judged — accuracy or creativity?", author_name: null, status: "answered", pinned: false, votes: 11, created_at: "2026-10-13T12:50:00Z", answered_at: "2026-10-13T12:58:00Z" }],
  rejected: 0,
};
const polls = [
  { id: "p1", kind: "words", prompt: "What are you building tonight?", options: [], status: "live", launched_at: "2026-10-13T13:00:00Z", closed_at: null, sort_order: 0, results: { responses: 64, words: [{ word: "wake word", count: 12 }, { word: "gesture control", count: 9 }] } },
  { id: "p2", kind: "choice", prompt: "How comfortable are you with embedded C?", options: ["Never touched it", "A little"], status: "closed", launched_at: "2026-10-13T12:00:00Z", closed_at: "2026-10-13T12:30:00Z", sort_order: 1, results: { responses: 95, choices: [{ label: "Never touched it", count: 21, pct: 22 }, { label: "A little", count: 38, pct: 40 }] } },
  { id: "p3", kind: "rating", prompt: "Rate the keynote", options: [], status: "draft", launched_at: null, closed_at: null, sort_order: 2, results: { responses: 0, rating: { average: null, histogram: [1, 2, 3, 4, 5].map((v) => ({ value: v, count: 0, pct: 0 })) } } },
];
const feedback = {
  auto_send: true, delay_minutes: 60, sent_at: null, sent_count: 0, sends_at: "2026-10-13T18:00:00Z", checked_in: 88,
  questions: [{ key: "overall", kind: "rating", label: "How was the event overall?" }, { key: "recommend", kind: "nps", label: "How likely are you to recommend us to a friend?" }, { key: "change", kind: "text", label: "What should we change next time?" }],
  results: { responses: 0, invited: 88, nps: null, averages: [], texts: [] },
  previous: { event_id: 3, event_name: "Hack Night 03", responses: 74, invited: 88, nps: { score: 52, promoters: 61, passives: 30, detractors: 9, count: 74 }, averages: [{ key: "overall", label: "Overall", average: 4.6, count: 74 }], texts: ["More time for hacking, less for talks."] },
};
const updates = { audience: { registered: 148, checked_in: 88 }, items: [{ id: "u1", kind: "general", text: "Doors are open — collect your board at the front desk", audience: "registered", recipients: 148, pushed: 120, sent_at: "2026-10-13T13:00:00Z" }] };
const agenda = { items: [{ id: "a1", event_id: 37, starts_at: "2026-10-13T13:30:00Z", ends_at: "2026-10-13T14:00:00Z", title: "Keynote", description: null, speaker: null, speaker_photo_key: null, speaker_photo_url: null, location: null, sort_order: 0, parallel: false }], timezone: "Asia/Kolkata", has_programme: false };

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        calls.push({ method: "GET", path });
        if (path.endsWith("/live/quiz")) return quiz;
        if (path.endsWith("/live/questions")) return board;
        if (path.endsWith("/live/polls")) return polls;
        if (path.endsWith("/live/feedback")) return feedback;
        if (path.endsWith("/live/updates")) return updates;
        if (path.endsWith("/agenda")) return agenda;
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "POST", path, body });
        if (path.includes("/questions/")) return { ...board.to_review[0], status: "approved" };
        if (path.endsWith("/status")) return { ...polls[2], status: "live" };
        if (path.endsWith("/updates")) return { ...updates.items[0], id: "u2", text: (body as { text: string }).text, recipients: 88 };
        if (path.endsWith("/schedule/shift")) return { update: { ...updates.items[0], id: "u3", kind: "schedule", text: "Keynote now starts at 7:10 PM (+10 min)." }, items: [] };
        return {};
      }),
      patch: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "PATCH", path, body });
        if (path.endsWith("/questions/settings")) return { ...board, approve_first: false };
        return {};
      }),
      put: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "PUT", path, body });
        return { ...feedback, ...(body as object) };
      }),
      del: vi.fn(async (path: string) => {
        calls.push({ method: "DELETE", path });
      }),
    },
  };
});

const { render } = await import("@/test/render");
const { LivePage } = await import("./components/live-page");

beforeEach(() => {
  calls.length = 0;
  window.history.replaceState(null, "", "/events/37/live");
});

describe("the live room", () => {
  it("opens on the quiz with its questions, and the pills carry the night's numbers", async () => {
    render(<LivePage eventId={37} />);
    expect(await screen.findByDisplayValue("Edge AI warm-up quiz")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Roughly how much RAM does an ESP32-S3 have on-chip?")).toBeInTheDocument();
    expect(screen.getByText("2 Qs")).toBeInTheDocument();
    expect(await screen.findByText("1 to review")).toBeInTheDocument();
    expect(screen.getByText("live")).toBeInTheDocument(); // a poll is up
    expect(screen.getByText("1 sent")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Host live" })).toBeEnabled();
  });

  it("moves a question from review to the board, and switches approval off", async () => {
    render(<LivePage eventId={37} />);
    fireEvent.click(await screen.findByRole("button", { name: /Q&A/ }));
    expect(await screen.findByText(/power bank station/)).toBeInTheDocument();
    expect(screen.getByText(/TensorFlow Lite Micro/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(calls.find((c) => c.method === "POST" && c.path.endsWith("/live/questions/x1"))?.body).toEqual({ action: "approve" }));
    fireEvent.click(screen.getByRole("switch", { name: "Approve before showing" }));
    await waitFor(() => expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ approve_first: false }));
  });

  it("draws each kind of poll its own way and launches a draft", async () => {
    render(<LivePage eventId={37} />);
    fireEvent.click(await screen.findByRole("button", { name: /Polls/ }));
    expect(await screen.findByText("wake word")).toBeInTheDocument();
    expect(screen.getByText("40%")).toBeInTheDocument();
    const card = screen.getByText("Rate the keynote").closest("div")!.parentElement!;
    fireEvent.click(within(card).getByRole("button", { name: /Launch/ }));
    await waitFor(() => expect(calls.find((c) => c.path.endsWith("/live/polls/p3/status"))?.body).toEqual({ status: "live" }));
  });

  it("shows last time's results until this event's replies arrive", async () => {
    render(<LivePage eventId={37} />);
    fireEvent.click(await screen.findByRole("button", { name: /Feedback/ }));
    expect(await screen.findByText("Results from Hack Night 03")).toBeInTheDocument();
    expect(screen.getByText("+52")).toBeInTheDocument();
    expect(screen.getByText("61% would recommend")).toBeInTheDocument();
    expect(screen.getByText(/Goes out/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Send now/ }));
    fireEvent.click(screen.getByRole("button", { name: "Send to 88 now" }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.path.endsWith("/feedback/send"))).toBe(true));
  });

  it("pushes an update and shifts the schedule", async () => {
    render(<LivePage eventId={37} />);
    fireEvent.click(await screen.findByRole("button", { name: /Live updates/ }));
    expect(await screen.findByText(/Doors are open/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("The update"), { target: { value: "Demos move to Lab 3B — same time" } });
    fireEvent.click(screen.getByRole("button", { name: /Push now/ }));
    await waitFor(() => expect(calls.find((c) => c.method === "POST" && c.path.endsWith("/live/updates"))?.body).toEqual({ kind: "schedule", text: "Demos move to Lab 3B — same time", audience: "checked_in" }));
    expect(await screen.findByText("Keynote")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Push Keynote/ }));
    await waitFor(() => expect(calls.find((c) => c.path.endsWith("/schedule/shift"))?.body).toEqual({ item_id: "a1", minutes: 10 }));
  });
});
