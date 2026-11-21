import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

/**
 * Polls of every kind in the console: what a new poll sends (today's three
 * fields when nobody tuned it), how each kind's results read, how a poll
 * shows (changed any time), pictures on answers, and approving open text.
 */

type Call = { method: string; path: string; body?: unknown };
const calls: Call[] = [];

const base = { status: "draft", launched_at: null, closed_at: null, sort_order: 0, my_response: null, closes_at: null, option_images: [], results_hidden: false };
const POLLS = [
  { ...base, id: "p1", kind: "choice", prompt: "Pick tonight's pizza", options: ["Margherita", "Paneer tikka", "Veggie"], status: "live", closes_at: new Date(Date.now() + 90_000).toISOString(), results: { responses: 64, choices: [{ label: "Margherita", count: 21, pct: 33 }, { label: "Paneer tikka", count: 25, pct: 39 }, { label: "Veggie", count: 18, pct: 28 }] }, settings: { max_choices: 2, results: "closed", show: "both", chart: "bar", seconds: 120 } },
  { ...base, id: "p2", kind: "rating", prompt: "Score the demo", options: [], results: { responses: 10, rating: { average: 8.2, scale: 10, histogram: [{ value: 10, count: 4, pct: 40 }] } }, settings: { scale: 10, style: "numbers" } },
  { ...base, id: "p3", kind: "ranking", prompt: "Which talk first next time?", options: ["Keynote", "Demos"], results: { responses: 8, ranking: [{ label: "Demos", average: 1.2, points: 7, first: 6 }, { label: "Keynote", average: 1.8, points: 1, first: 2 }] }, settings: { hide_results: true } },
  { ...base, id: "p4", kind: "text", prompt: "One thing to change", options: [], status: "live", results: { responses: 5, texts: [{ id: "t1", text: "Longer breaks", name: null, at: "2026-11-29T13:00:00Z" }], pending: 2 }, settings: { moderate: true } },
];
const PENDING = [
  { id: "r1", text: "More chai", name: null, status: "pending", at: "2026-11-29T13:01:00Z" },
  { id: "r2", text: "A bigger hall", name: "Diya", status: "pending", at: "2026-11-29T13:02:00Z" },
];

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  const write = (method: string) =>
    vi.fn(async (path: string, body?: unknown) => {
      calls.push({ method, path, body });
      const rest = path.replace("/api/v1/events/37/live", "");
      if (method === "POST" && rest === "/polls") return { ...base, id: "p9", results: { responses: 0 }, ...(body as object) };
      if (method === "PATCH" && rest.startsWith("/polls/")) return { ...POLLS[0], ...(body as object) };
      if (/\/polls\/p4\/responses\/r\d$/.test(rest)) return { ...PENDING[0], status: (body as { action: string }).action === "approve" ? "approved" : "rejected" };
      if (method === "POST" && rest === "/media") return { id: "img1", kind: "option", thumbnail: "https://cdn.test/img1-t.png", medium: null, large: null, original: null };
      return {};
    });
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string, options?: { query?: Record<string, unknown> }) => {
        calls.push({ method: "GET", path, body: options?.query });
        const rest = path.replace("/api/v1/events/37/live", "");
        if (rest === "/polls") return POLLS;
        if (rest === "/polls/p4/responses") return PENDING;
        if (rest === "/media") return [];
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: write("POST"),
      put: write("PUT"),
      patch: write("PATCH"),
      del: write("DELETE"),
    },
  };
});

const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
});

const { render } = await import("@/test/render");
const { PollsPanel, settingsChanges, pollDefaults } = await import("./components/polls-panel");

beforeEach(() => {
  calls.length = 0;
  store.clear();
});

const sent = (method: string, suffix: string) => calls.filter((c) => c.method === method && c.path.endsWith(suffix));
const card = (prompt: string) => screen.getByText(prompt).closest<HTMLElement>("[data-slot=figure-panel]")!;

describe("reading each kind", () => {
  it("says what kind each poll is, when it closes and who sees the results", async () => {
    render(<PollsPanel eventId={37} />);
    const pizza = card(await screen.findByText("Pick tonight's pizza").then((el) => el.textContent!));
    expect(pizza).toHaveTextContent(/Multiple choice, up to 2 · 64 responses · closes in 1:(2\d|30)/);
    expect(within(pizza).getByText("Guests see the results once it closes")).toBeInTheDocument();
    expect(within(pizza).getByText("39%")).toBeInTheDocument();
    expect(within(card("Score the demo")).getByText("Average 8.2 of 10")).toBeInTheDocument();
    expect(card("Score the demo")).toHaveTextContent("Score out of 10");
    const ranking = card("Which talk first next time?");
    expect(within(ranking).getByText("Guests never see the results")).toBeInTheDocument();
    expect(within(ranking).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["1Demosavg 1.2", "2Keynoteavg 1.8"]);
    expect(within(card("One thing to change")).getByText("Longer breaks")).toBeInTheDocument();
  });

  it("approves and rejects open-text answers before anyone sees them", async () => {
    render(<PollsPanel eventId={37} />);
    const text = card(await screen.findByText("One thing to change").then((el) => el.textContent!));
    expect(await within(text).findByText("More chai")).toBeInTheDocument();
    expect(within(text).getByText(/A bigger hall/)).toHaveTextContent("A bigger hall — Diya");
    fireEvent.click(within(text).getByRole("button", { name: 'Approve "More chai"' }));
    await waitFor(() => expect(sent("POST", "/live/polls/p4/responses/r1")[0]?.body).toEqual({ action: "approve" }));
    fireEvent.click(within(text).getByRole("button", { name: 'Reject "A bigger hall"' }));
    await waitFor(() => expect(sent("POST", "/live/polls/p4/responses/r2")[0]?.body).toEqual({ action: "reject" }));
    expect(calls.find((c) => c.path.endsWith("/polls/p4/responses"))?.body).toEqual({ status: "pending", limit: 100 });
  });
});

describe("a new poll", () => {
  const open = async () => {
    render(<PollsPanel eventId={37} />);
    fireEvent.click(await screen.findByRole("button", { name: /New poll/ }));
  };

  it("sends today's three fields when nobody tuned it", async () => {
    await open();
    fireEvent.change(screen.getByLabelText("Question"), { target: { value: "Tea or coffee?" } });
    fireEvent.change(screen.getByLabelText("Answers, one per line"), { target: { value: "Tea\nCoffee" } });
    fireEvent.click(screen.getByRole("button", { name: "Save as draft" }));
    await waitFor(() => expect(sent("POST", "/live/polls")).toHaveLength(1));
    expect(sent("POST", "/live/polls")[0]!.body).toEqual({ kind: "choice", prompt: "Tea or coffee?", options: ["Tea", "Coffee"] });
  });

  it("sends a multiple choice of up to N, with a timer and results once it closes", async () => {
    await open();
    fireEvent.change(screen.getByLabelText("Question"), { target: { value: "Which snacks?" } });
    fireEvent.change(screen.getByLabelText("Answers, one per line"), { target: { value: "Samosa\nVada\nPuff\nCake" } });
    fireEvent.change(screen.getByLabelText("How many answers people can pick"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Results, timer and more" }));
    fireEvent.click(screen.getByRole("radio", { name: "Once it closes" }));
    fireEvent.click(screen.getByRole("radio", { name: "Donut" }));
    fireEvent.change(screen.getByLabelText("Poll timer"), { target: { value: "60" } });
    fireEvent.click(screen.getByRole("switch", { name: "Guests can change their answer" }));
    fireEvent.click(screen.getByRole("button", { name: "Save as draft" }));
    await waitFor(() => expect(sent("POST", "/live/polls")).toHaveLength(1));
    expect(sent("POST", "/live/polls")[0]!.body).toEqual({
      kind: "choice",
      prompt: "Which snacks?",
      options: ["Samosa", "Vada", "Puff", "Cake"],
      settings: { max_choices: 3, results: "closed", chart: "donut", seconds: 60, change_vote: false },
    });
  });

  it("sends a score out of 10, a ranking, and open text shown with names and no approval", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Rating" }));
    fireEvent.change(screen.getByLabelText("Question"), { target: { value: "Score the keynote" } });
    fireEvent.click(screen.getByRole("radio", { name: "Out of 10" }));
    fireEvent.click(screen.getByRole("button", { name: "Save as draft" }));
    await waitFor(() => expect(sent("POST", "/live/polls")).toHaveLength(1));
    expect(sent("POST", "/live/polls")[0]!.body).toEqual({ kind: "rating", prompt: "Score the keynote", options: [], settings: { scale: 10, style: "numbers" } });

    calls.length = 0;
    fireEvent.click(await screen.findByRole("button", { name: /New poll/ }));
    fireEvent.click(screen.getByRole("button", { name: "Ranking" }));
    fireEvent.change(screen.getByLabelText("Question"), { target: { value: "Best demo?" } });
    fireEvent.change(screen.getByLabelText("Answers, one per line"), { target: { value: "Rover\nDrone" } });
    fireEvent.click(screen.getByRole("button", { name: "Save as draft" }));
    await waitFor(() => expect(sent("POST", "/live/polls")).toHaveLength(1));
    expect(sent("POST", "/live/polls")[0]!.body).toEqual({ kind: "ranking", prompt: "Best demo?", options: ["Rover", "Drone"] });

    calls.length = 0;
    fireEvent.click(await screen.findByRole("button", { name: /New poll/ }));
    fireEvent.click(screen.getByRole("button", { name: "Open text" }));
    fireEvent.change(screen.getByLabelText("Question"), { target: { value: "Your one-line review" } });
    expect(screen.queryByLabelText("Answers, one per line")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Results, timer and more" }));
    fireEvent.click(screen.getByRole("switch", { name: "Approve answers before they show" }));
    fireEvent.click(screen.getByRole("switch", { name: "Show who wrote each answer" }));
    fireEvent.click(screen.getByRole("button", { name: "Save as draft" }));
    await waitFor(() => expect(sent("POST", "/live/polls")).toHaveLength(1));
    expect(sent("POST", "/live/polls")[0]!.body).toEqual({ kind: "text", prompt: "Your one-line review", options: [], settings: { moderate: false, anonymous: false } });
  });

  it("asks a ranking for two answers at least", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Ranking" }));
    fireEvent.change(screen.getByLabelText("Question"), { target: { value: "Best demo?" } });
    fireEvent.change(screen.getByLabelText("Answers, one per line"), { target: { value: "Rover" } });
    fireEvent.click(screen.getByRole("button", { name: "Save as draft" }));
    expect(await screen.findByText("Give a ranking at least two answers to put in order, one per line.")).toBeInTheDocument();
    expect(sent("POST", "/live/polls")).toHaveLength(0);
  });
});

describe("how a poll shows", () => {
  it("changes while it runs, sending only what changed", async () => {
    render(<PollsPanel eventId={37} />);
    fireEvent.click(await screen.findByRole("button", { name: "How Pick tonight's pizza shows" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("radio", { name: "As votes come in" }));
    fireEvent.click(within(dialog).getByRole("radio", { name: "%" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(sent("PATCH", "/live/polls/p1")).toHaveLength(1));
    expect(sent("PATCH", "/live/polls/p1")[0]!.body).toEqual({ settings: { results: "live", show: "percent" } });
  });

  it("puts a picture on an answer", async () => {
    render(<PollsPanel eventId={37} />);
    fireEvent.click(await screen.findByRole("button", { name: "How Pick tonight's pizza shows" }));
    const dialog = await screen.findByRole("dialog");
    const row = within(dialog).getByText("Paneer tikka").closest("li")!;
    const input = row.querySelector<HTMLInputElement>('input[type="file"]')!;
    fireEvent.change(input, { target: { files: [new File([new Uint8Array([137, 80, 78, 71])], "paneer.png", { type: "image/png" })] } });
    await waitFor(() => expect(sent("POST", "/live/media")).toHaveLength(1));
    expect((sent("POST", "/live/media")[0]!.body as FormData).get("kind")).toBe("option");
    expect(await within(row).findByRole("button", { name: "Remove the picture for Paneer tikka" })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(sent("PATCH", "/live/polls/p1")).toHaveLength(1));
    expect(sent("PATCH", "/live/polls/p1")[0]!.body).toEqual({ settings: { option_images: [null, "img1", null] } });
  });
});

describe("settings a poll sends", () => {
  it("are only what differs from the kind's defaults", () => {
    expect(settingsChanges("choice", pollDefaults("choice"))).toEqual({});
    expect(settingsChanges("words", { ...pollDefaults("words"), chart: "cloud" })).toEqual({});
    expect(settingsChanges("rating", { ...pollDefaults("rating"), scale: 10, style: "numbers" })).toEqual({ scale: 10, style: "numbers" });
  });
});
