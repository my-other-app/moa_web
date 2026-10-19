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
const hostState = { status: "live", join_code: "4821", title: "Edge AI warm-up quiz", players: 0, current_index: -1, total: 2, question: null, leaderboard: [] };
/** What a start or a launch adds to its reply: `{ notified }` from a server that notifies the room, nothing from today's. */
const reply: { start: Record<string, unknown>; poll: Record<string, unknown> } = { start: {}, poll: {} };

// Node's own localStorage shadows jsdom's and has no backing file here; the screens read through a plain one.
const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
});

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
        if (path.endsWith("/quiz/host/start")) return { ...hostState, ...reply.start };
        if (path.includes("/quiz/host/")) return hostState;
        if (path.endsWith("/status")) return { ...polls[2], status: (body as { status: string }).status, ...reply.poll };
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
const { hostAction, setPollStatus } = await import("./api");
const { notifiedNote } = await import("./notify");
const { Toaster, toast } = await import("@moa/ui");

const success = vi.spyOn(toast, "success");
const warning = vi.spyOn(toast, "warning");

beforeEach(() => {
  calls.length = 0;
  store.clear();
  reply.start = {};
  reply.poll = {};
  success.mockClear();
  warning.mockClear();
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
    // A launch now says whether to notify the room (off for polls unless the host turns it on).
    await waitFor(() => expect(calls.find((c) => c.path.endsWith("/live/polls/p3/status"))?.body).toEqual({ status: "live", notify: false }));
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

describe("notifying the room", () => {
  const opened = "The quiz is open — players join with 4821";
  const up = "The poll is up on every phone";
  const notifySwitch = (name: string | RegExp = /^Notify checked-in attendees/) => screen.findByRole("switch", { name });
  const launchKeynote = async () => {
    const card = (await screen.findByText("Rate the keynote")).closest("div")!.parentElement!;
    const launch = within(card).getByRole("button", { name: /Launch/ });
    await waitFor(() => expect(launch).toBeEnabled());
    fireEvent.click(launch);
  };
  const openPolls = async () => {
    fireEvent.click(await screen.findByRole("button", { name: /Polls/ }));
    await screen.findByText("wake word");
  };

  it("is on beside Host live and off beside the polls, with the room's checked-in count", async () => {
    render(<LivePage eventId={37} />);
    const quiz = await notifySwitch("Notify checked-in attendees (88)");
    expect(quiz).toHaveAttribute("aria-checked", "true");
    expect(quiz).toHaveAccessibleDescription("A push to join, as the quiz opens");
    await openPolls();
    const poll = await notifySwitch("Notify checked-in attendees (88)");
    expect(poll).toHaveAttribute("aria-checked", "false");
    expect(poll).toHaveAccessibleDescription("A push to vote, as each poll launches");
  });

  it("remembers the host's last choice for the event, and only that event", async () => {
    const first = render(<LivePage eventId={37} />);
    fireEvent.click(await notifySwitch());
    expect(store.get("moa.live.37.notify.quiz")).toBe("0");
    await openPolls();
    fireEvent.click(await notifySwitch());
    expect(store.get("moa.live.37.notify.poll")).toBe("1");
    first.unmount();

    window.history.replaceState(null, "", "/events/37/live");
    const again = render(<LivePage eventId={37} />);
    expect(await notifySwitch()).toHaveAttribute("aria-checked", "false");
    await openPolls();
    expect(await notifySwitch()).toHaveAttribute("aria-checked", "true");
    again.unmount();

    // Another event keeps the defaults.
    window.history.replaceState(null, "", "/events/38/live");
    render(<LivePage eventId={38} />);
    expect(await notifySwitch()).toHaveAttribute("aria-checked", "true");
    await openPolls();
    expect(await notifySwitch()).toHaveAttribute("aria-checked", "false");
  });

  it("still works when the browser keeps nothing", async () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    });
    try {
      render(<LivePage eventId={37} />);
      const quiz = await notifySwitch();
      expect(quiz).toHaveAttribute("aria-checked", "true");
      fireEvent.click(quiz);
      expect(quiz).toHaveAttribute("aria-checked", "false");
    } finally {
      vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, String(v)), removeItem: (k: string) => void store.delete(k), clear: () => store.clear() });
    }
  });

  it("sends the switch with Host live and with Launch, and nothing new with any other move", async () => {
    render(<LivePage eventId={37} />);
    const host = await screen.findByRole("button", { name: "Host live" });
    fireEvent.click(host);
    await waitFor(() => expect(calls.find((c) => c.path.endsWith("/live/quiz/host/start"))?.body).toEqual({ notify: true }));
    calls.length = 0;
    fireEvent.click(await notifySwitch());
    await waitFor(() => expect(host).toBeEnabled());
    fireEvent.click(host);
    await waitFor(() => expect(calls.find((c) => c.path.endsWith("/live/quiz/host/start"))?.body).toEqual({ notify: false }));

    await openPolls();
    await launchKeynote();
    await waitFor(() => expect(calls.find((c) => c.path.endsWith("/live/polls/p3/status"))?.body).toEqual({ status: "live", notify: false }));
    calls.length = 0;
    fireEvent.click(await notifySwitch());
    await launchKeynote();
    await waitFor(() => expect(calls.find((c) => c.path.endsWith("/live/polls/p3/status"))?.body).toEqual({ status: "live", notify: true }));
    fireEvent.click(screen.getByRole("button", { name: /Close poll/ }));
    await waitFor(() => expect(calls.find((c) => c.path.endsWith("/live/polls/p1/status"))?.body).toEqual({ status: "closed" }));

    calls.length = 0;
    await hostAction(37, "next", true);
    await hostAction(37, "end", true);
    await hostAction(37, "reset");
    await setPollStatus(37, "p1", "closed", true);
    expect(calls.map((c) => c.body)).toEqual([{}, {}, {}, { status: "closed" }]);
  });

  it.each([
    ["sent", { sent: 42, skipped_reason: null }, success, "Sent to 42"],
    ["nobody checked in", { sent: 0, skipped_reason: "nobody_checked_in" }, success, "Nobody is checked in yet"],
    ["rate limited, with the wait", { sent: 0, skipped_reason: "rate_limited", retry_after: 90 }, warning, "Not notified — the room was notified recently; you can notify again in 2 min"],
    ["rate limited, under a minute to go", { sent: 0, skipped_reason: "rate_limited", retry_after: 30 }, warning, "Not notified — the room was notified recently; you can notify again in less than a minute"],
    ["rate limited, without a wait", { sent: 0, skipped_reason: "rate_limited" }, warning, "Not notified — the room was notified recently; try again in a few minutes"],
    ["everyone muted", { sent: 0, skipped_reason: "all_muted" }, success, "Not notified — everyone checked in has muted these notifications"],
    ["nobody to notify", { sent: 0, skipped_reason: null }, success, "Nobody to notify"],
  ] as const)("says what came of the push when the quiz opens: %s", async (_, notified, said, text) => {
    reply.start = { notified };
    render(<LivePage eventId={37} />);
    fireEvent.click(await screen.findByRole("button", { name: "Host live" }));
    await waitFor(() => expect(said).toHaveBeenCalledWith(opened, expect.objectContaining({ description: text })));
    // Only a rate limit is amber; the rest ride on the action's own toast.
    if (said === success) expect(warning).not.toHaveBeenCalled();
  });

  it("says what came of the push when a poll launches", async () => {
    store.set("moa.live.37.notify.poll", "1");
    reply.poll = { notified: { sent: 61, skipped_reason: null } };
    render(<LivePage eventId={37} />);
    await openPolls();
    await launchKeynote();
    await waitFor(() => expect(success).toHaveBeenCalledWith(up, { description: "Sent to 61" }));
  });

  it("puts the outcome on screen, in the toasts' live region", async () => {
    reply.start = { notified: { sent: 57, skipped_reason: null } };
    render(
      <>
        <Toaster theme="light" />
        <LivePage eventId={37} />
      </>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Host live" }));
    const line = await screen.findByText("Sent to 57");
    expect(line.closest("[aria-live]")).toHaveAttribute("aria-live", "polite");
    // Sonner keeps earlier tests' toasts in its own store, so look inside this one.
    expect(within(line.closest("[data-sonner-toast]") as HTMLElement).getByText(opened)).toBeInTheDocument();
  });

  it("says nothing more when the server has notifying switched off, or the host did", async () => {
    reply.start = { notified: { sent: 0, skipped_reason: "disabled" } };
    const first = render(<LivePage eventId={37} />);
    fireEvent.click(await screen.findByRole("button", { name: "Host live" }));
    await waitFor(() => expect(success).toHaveBeenCalled());
    expect(success.mock.calls).toEqual([[opened]]);
    first.unmount();

    success.mockClear();
    store.set("moa.live.37.notify.quiz", "0");
    reply.start = { notified: { sent: 0, skipped_reason: null } };
    render(<LivePage eventId={37} />);
    fireEvent.click(await screen.findByRole("button", { name: "Host live" }));
    await waitFor(() => expect(success).toHaveBeenCalled());
    expect(success.mock.calls).toEqual([[opened]]);
    expect(warning).not.toHaveBeenCalled();
  });

  it("against today's server, which sends no `notified`, toasts exactly as before", async () => {
    render(<LivePage eventId={37} />);
    fireEvent.click(await screen.findByRole("button", { name: "Host live" }));
    await waitFor(() => expect(success).toHaveBeenCalled());
    expect(success.mock.calls).toEqual([[opened]]);

    success.mockClear();
    store.set("moa.live.37.notify.poll", "1");
    await openPolls();
    await launchKeynote();
    await waitFor(() => expect(success).toHaveBeenCalled());
    expect(success.mock.calls).toEqual([[up]]);
    expect(warning).not.toHaveBeenCalled();
  });

  it("does not let a `notified` it cannot read fail the quiz that already opened", async () => {
    reply.start = { notified: { sent: "lots", skipped_reason: "on_holiday" } };
    render(<LivePage eventId={37} />);
    fireEvent.click(await screen.findByRole("button", { name: "Host live" }));
    await waitFor(() => expect(success).toHaveBeenCalled());
    expect(success.mock.calls).toEqual([[opened]]);
  });

  it("words each outcome", () => {
    expect(notifiedNote({ sent: 42, skipped_reason: null })).toEqual({ tone: "success", text: "Sent to 42" });
    expect(notifiedNote({ sent: 42 })).toEqual({ tone: "success", text: "Sent to 42" });
    expect(notifiedNote({ sent: 0, skipped_reason: "nobody_checked_in" })).toEqual({ tone: "success", text: "Nobody is checked in yet" });
    expect(notifiedNote({ sent: 0, skipped_reason: null })).toEqual({ tone: "success", text: "Nobody to notify" });
    expect(notifiedNote({ sent: 0, skipped_reason: "all_muted" })).toEqual({ tone: "success", text: "Not notified — everyone checked in has muted these notifications" });
    const limited = (retry_after?: number | null) => notifiedNote({ sent: 0, skipped_reason: "rate_limited", retry_after })?.text;
    expect(notifiedNote({ sent: 0, skipped_reason: "rate_limited" })?.tone).toBe("warning");
    expect(limited()).toBe("Not notified — the room was notified recently; try again in a few minutes");
    expect(limited(null)).toBe("Not notified — the room was notified recently; try again in a few minutes");
    expect(limited(0)).toBe("Not notified — the room was notified recently; you can notify again in less than a minute");
    expect(limited(59)).toBe("Not notified — the room was notified recently; you can notify again in less than a minute");
    expect(limited(60)).toBe("Not notified — the room was notified recently; you can notify again in 1 min");
    expect(limited(61)).toBe("Not notified — the room was notified recently; you can notify again in 2 min");
    expect(limited(180)).toBe("Not notified — the room was notified recently; you can notify again in 3 min");
    expect(notifiedNote({ sent: 0, skipped_reason: "disabled" })).toBeNull();
    expect(notifiedNote(undefined)).toBeNull();
    expect(notifiedNote(null)).toBeNull();
  });
});
