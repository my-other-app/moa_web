import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { ApiError } from "@moa/api";

/**
 * The quiz, as the host writes and runs it: questions and a title in the
 * editor, then the run from the same panel -- the lobby and its join code,
 * each question's tally, Next, End early, Run it again, Back to editing --
 * and the leaderboard beside it. The notify switch beside Host live has its
 * own tests in live.test.tsx; these are about everything else.
 */
const calls: Array<{ method: string; path: string; body?: unknown }> = [];

const QUESTIONS = [
  { id: "q1", prompt: "Roughly how much RAM does an ESP32-S3 have on-chip?", options: [{ key: "a", label: "512 KB" }, { key: "b", label: "8 MB" }], correct_key: "a", seconds: 20, sort_order: 0 },
  { id: "q2", prompt: "What does quantising a model to int8 mainly save?", options: [{ key: "a", label: "Training time" }, { key: "b", label: "Memory and compute" }], correct_key: "b", seconds: 20, sort_order: 1 },
];
const draftQuiz = { id: "qz1", title: "Edge AI warm-up quiz", intro: null, status: "draft", join_code: null, current_index: -1, players: 0, questions: QUESTIONS };
const lobby = { status: "live", join_code: "4821", title: "Edge AI warm-up quiz", players: 12, current_index: -1, total: 2, question: null, leaderboard: [] };
const asking = (index: number, patch: Record<string, unknown> = {}) => ({
  ...lobby,
  current_index: index,
  question: {
    id: QUESTIONS[index]!.id, prompt: QUESTIONS[index]!.prompt, options: QUESTIONS[index]!.options, correct_key: QUESTIONS[index]!.correct_key,
    seconds: 20, time_left: 14, answered: 9,
    counts: [{ key: "a", label: QUESTIONS[index]!.options[0]!.label, count: 6, correct: index === 0 }, { key: "b", label: QUESTIONS[index]!.options[1]!.label, count: 3, correct: index === 1 }],
    ...patch,
  },
  leaderboard: [{ rank: 1, name: "Ananya", score: 940 }, { rank: 2, name: "Rohan", score: 610 }],
});

const state: { quiz: Record<string, unknown>; host: Record<string, unknown>; refuse: Error | null } = { quiz: draftQuiz, host: lobby, refuse: null };

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  const write = (method: string) =>
    vi.fn(async (path: string, body?: unknown) => {
      calls.push({ method, path, body });
      if (state.refuse) throw state.refuse;
      if (path.endsWith("/quiz/questions")) return { id: "q3", sort_order: 2, ...(body as object) };
      if (/\/quiz\/questions\/q\d$/.test(path)) return { ...QUESTIONS[0], ...(body as object) };
      if (path.endsWith("/quiz/host/start")) return lobby;
      if (path.includes("/quiz/host/")) return state.host;
      if (path.endsWith("/quiz")) return { ...state.quiz, ...(body as object) };
      return {};
    });
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        calls.push({ method: "GET", path });
        if (path === "/api/v1/events/37/live/quiz") return state.quiz;
        if (path === "/api/v1/events/37/live/quiz/host") return state.host;
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: write("POST"),
      patch: write("PATCH"),
      put: write("PUT"),
      del: write("DELETE"),
    },
  };
});

// Node's own localStorage shadows jsdom's and has no backing file here; the notify choice reads through a plain one.
const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
});

const { toast } = await import("@moa/ui");
const { render } = await import("@/test/render");
const { QuizPanel } = await import("./components/quiz-panel");

beforeEach(() => {
  calls.length = 0;
  store.clear();
  state.quiz = draftQuiz;
  state.host = lobby;
  state.refuse = null;
  vi.restoreAllMocks();
});

const sentTo = (method: string, suffix: string) => calls.filter((c) => c.method === method && c.path.endsWith(suffix));
const refusal = (message: string) => new ApiError({ status: 409, message });

describe("writing the quiz", () => {
  it("shows the questions written so far, with the count and the time they take", async () => {
    render(<QuizPanel eventId={37} />);
    expect(await screen.findByLabelText("Question 1")).toHaveValue(QUESTIONS[0]!.prompt);
    expect(screen.getByLabelText("Question 2")).toHaveValue(QUESTIONS[1]!.prompt);
    expect(screen.getByText(/2 questions · 40 seconds/)).toBeInTheDocument();
  });

  it("adds a question with only the answers filled in and the right one marked, then says so", async () => {
    const said = vi.spyOn(toast, "success");
    render(<QuizPanel eventId={37} />);
    fireEvent.click(await screen.findByRole("button", { name: /Add question/ }));
    fireEvent.change(screen.getByLabelText("Question 3"), { target: { value: "  Which board has a camera?  " } });
    const answers = screen.getAllByLabelText(/^Answer \d$/).slice(-4);
    fireEvent.change(answers[0]!, { target: { value: "ESP32-CAM" } });
    fireEvent.change(answers[1]!, { target: { value: "Arduino Uno" } });
    fireEvent.change(screen.getByLabelText("Seconds for question 3"), { target: { value: "30" } });
    // The right answer is the first by default; mark the first as right explicitly too.
    expect(screen.getAllByRole("button", { name: "Answer 1 is the right one" }).at(-1)).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Save question" }));

    await waitFor(() => expect(sentTo("POST", "/live/quiz/questions")).toHaveLength(1));
    expect(sentTo("POST", "/live/quiz/questions")[0]!.body).toEqual({
      prompt: "Which board has a camera?",
      options: [{ key: "a", label: "ESP32-CAM" }, { key: "b", label: "Arduino Uno" }],
      correct_key: "a",
      seconds: 30,
    });
    await waitFor(() => expect(said).toHaveBeenCalledWith("Question added"));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Save question" })).toBeNull());
  });

  it("will not save a question without wording and two answers, or with an empty answer marked right", async () => {
    render(<QuizPanel eventId={37} />);
    fireEvent.click(await screen.findByRole("button", { name: /Add question/ }));
    fireEvent.change(screen.getByLabelText("Question 3"), { target: { value: "Which board has a camera?" } });
    const answers = screen.getAllByLabelText(/^Answer \d$/).slice(-4);
    fireEvent.change(answers[0]!, { target: { value: "ESP32-CAM" } });
    fireEvent.click(screen.getByRole("button", { name: "Save question" }));
    expect(await screen.findByText("A question needs wording and at least two answers.")).toBeInTheDocument();

    fireEvent.change(answers[1]!, { target: { value: "Arduino Uno" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Mark answer 4 as right" }).at(-1)!);
    fireEvent.click(screen.getByRole("button", { name: "Save question" }));
    expect(await screen.findByText("Mark one of the filled answers as right.")).toBeInTheDocument();
    expect(sentTo("POST", "/live/quiz/questions")).toHaveLength(0);
  });

  it("keeps the new question open and says why when the server refuses it", async () => {
    const said = vi.spyOn(toast, "error");
    state.refuse = refusal("A quiz holds at most 20 questions");
    render(<QuizPanel eventId={37} />);
    fireEvent.click(await screen.findByRole("button", { name: /Add question/ }));
    fireEvent.change(screen.getByLabelText("Question 3"), { target: { value: "Which board has a camera?" } });
    const answers = screen.getAllByLabelText(/^Answer \d$/).slice(-4);
    fireEvent.change(answers[0]!, { target: { value: "ESP32-CAM" } });
    fireEvent.change(answers[1]!, { target: { value: "Arduino Uno" } });
    fireEvent.click(screen.getByRole("button", { name: "Save question" }));

    await waitFor(() => expect(said).toHaveBeenCalledWith("A quiz holds at most 20 questions"));
    expect(screen.getByLabelText("Question 3")).toHaveValue("Which board has a camera?");
    expect(screen.getByRole("button", { name: "Save question" })).toBeEnabled();
  });

  it("saves a reworded question when the field is left, and nothing when it did not change", async () => {
    render(<QuizPanel eventId={37} />);
    const first = await screen.findByLabelText("Question 1");
    fireEvent.blur(first);
    expect(sentTo("PATCH", "/live/quiz/questions/q1")).toHaveLength(0);

    fireEvent.change(first, { target: { value: "How much on-chip RAM does an ESP32-S3 have?" } });
    fireEvent.blur(first);
    await waitFor(() => expect(sentTo("PATCH", "/live/quiz/questions/q1")).toHaveLength(1));
    expect(sentTo("PATCH", "/live/quiz/questions/q1")[0]!.body).toEqual({
      prompt: "How much on-chip RAM does an ESP32-S3 have?",
      options: QUESTIONS[0]!.options,
      correct_key: "a",
      seconds: 20,
    });
  });

  it("does not save a question emptied of its wording, and says why", async () => {
    render(<QuizPanel eventId={37} />);
    const first = await screen.findByLabelText("Question 1");
    fireEvent.change(first, { target: { value: "   " } });
    fireEvent.blur(first);
    expect(await screen.findByText("A question needs wording and at least two answers.")).toBeInTheDocument();
    expect(sentTo("PATCH", "/live/quiz/questions/q1")).toHaveLength(0);
  });

  it("removes a question and says so", async () => {
    const said = vi.spyOn(toast, "success");
    render(<QuizPanel eventId={37} />);
    fireEvent.click(await screen.findByRole("button", { name: "Remove question 2" }));
    await waitFor(() => expect(sentTo("DELETE", "/live/quiz/questions/q2")).toHaveLength(1));
    await waitFor(() => expect(said).toHaveBeenCalledWith("Question removed"));
  });

  it("renames the quiz when the title is left, trimmed, and never to nothing", async () => {
    render(<QuizPanel eventId={37} />);
    const title = await screen.findByLabelText("Quiz title");
    fireEvent.change(title, { target: { value: "   " } });
    fireEvent.blur(title);
    expect(sentTo("PATCH", "/live/quiz")).toHaveLength(0);
    // The empty edit is dropped: the saved title comes back.
    expect(title).toHaveValue("Edge AI warm-up quiz");

    fireEvent.change(title, { target: { value: " Hack Night quiz " } });
    fireEvent.blur(title);
    await waitFor(() => expect(sentTo("PATCH", "/live/quiz")).toHaveLength(1));
    expect(sentTo("PATCH", "/live/quiz")[0]!.body).toEqual({ title: "Hack Night quiz" });
  });

  it("cannot go live with no questions, and offers to write the first", async () => {
    state.quiz = { ...draftQuiz, questions: [] };
    render(<QuizPanel eventId={37} />);
    expect(await screen.findByText("No questions yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Host live/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Write the first" }));
    expect(screen.getByLabelText("Question 1")).toHaveValue("");
  });
});

describe("hosting it live", () => {
  beforeEach(() => {
    state.quiz = { ...draftQuiz, status: "live", join_code: "4821" };
  });

  it("opens the lobby with the join code and who is in, and asks the first question", async () => {
    render(<QuizPanel eventId={37} />);
    expect(await screen.findByLabelText("Join code 4821")).toHaveTextContent("4821");
    expect(screen.getByText("12 players in")).toBeInTheDocument();
    expect(screen.getByText("Scores appear after the first question.")).toBeInTheDocument();
    // Writing is over while it runs.
    expect(screen.queryByRole("button", { name: /Add question/ })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Ask the first question/ }));
    await waitFor(() => expect(sentTo("POST", "/live/quiz/host/next")).toHaveLength(1));
  });

  it("cancels from the lobby by ending the quiz", async () => {
    const said = vi.spyOn(toast, "success");
    render(<QuizPanel eventId={37} />);
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(sentTo("POST", "/live/quiz/host/end")).toHaveLength(1));
    await waitFor(() => expect(said).toHaveBeenCalledWith("Quiz finished"));
  });

  it("shows the question, the time left and the tally, and moves to the next", async () => {
    state.host = asking(0);
    render(<QuizPanel eventId={37} />);
    expect(await screen.findByText("Question 1 of 2")).toBeInTheDocument();
    expect(screen.getByText(QUESTIONS[0]!.prompt)).toBeInTheDocument();
    expect(screen.getByText("14s")).toBeInTheDocument();
    expect(screen.getByText("9 of 12 answered")).toBeInTheDocument();
    expect(screen.getByText("512 KB")).toBeInTheDocument();
    expect(screen.getByText("6")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next question" }));
    await waitFor(() => expect(sentTo("POST", "/live/quiz/host/next")).toHaveLength(1));
  });

  it("says Time when the clock runs out", async () => {
    state.host = asking(0, { time_left: 0 });
    render(<QuizPanel eventId={37} />);
    expect(await screen.findByText("Time")).toBeInTheDocument();
  });

  it("finishes on the last question and shows the board", async () => {
    state.host = asking(1);
    render(<QuizPanel eventId={37} />);
    fireEvent.click(await screen.findByRole("button", { name: "Finish and show the board" }));
    await waitFor(() => expect(sentTo("POST", "/live/quiz/host/next")).toHaveLength(1));
  });

  it("ends early on request", async () => {
    state.host = asking(0);
    render(<QuizPanel eventId={37} />);
    fireEvent.click(await screen.findByRole("button", { name: "End early" }));
    await waitFor(() => expect(sentTo("POST", "/live/quiz/host/end")).toHaveLength(1));
  });

  it("ranks the players on the leaderboard and opens the big screen in a new tab", async () => {
    state.host = asking(0);
    render(<QuizPanel eventId={37} />);
    const board = (await screen.findByText("Leaderboard")).closest("div")!.parentElement!;
    const rows = within(board).getAllByRole("listitem").map((li) => li.textContent);
    expect(rows).toEqual(["1Ananya940", "2Rohan610"]);
    expect(screen.getByText("12 playing")).toBeInTheDocument();
    const big = screen.getByRole("link", { name: /Open the big screen/ });
    expect(big).toHaveAttribute("href", "/screen/37");
    expect(big).toHaveAttribute("target", "_blank");
  });

  it("runs it again or goes back to editing once it has finished", async () => {
    state.host = { ...asking(1), status: "ended", question: null };
    render(<QuizPanel eventId={37} />);
    expect(await screen.findByText("That is the quiz. The board on the right stands.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Run it again" }));
    await waitFor(() => expect(sentTo("POST", "/live/quiz/host/start")).toHaveLength(1));
    // The room is told by default when the quiz opens.
    expect(sentTo("POST", "/live/quiz/host/start")[0]!.body).toEqual({ notify: true });

    fireEvent.click(screen.getByRole("button", { name: "Back to editing" }));
    await waitFor(() => expect(sentTo("POST", "/live/quiz/host/reset")).toHaveLength(1));
  });

  it("sends the question it moves on from, and catches up quietly when the quiz has moved on already", async () => {
    const error = vi.spyOn(toast, "error");
    state.host = asking(0);
    render(<QuizPanel eventId={37} />);
    await screen.findByText("Question 1 of 2");
    fireEvent.click(screen.getByRole("button", { name: "Next question" }));
    await waitFor(() => expect(sentTo("POST", "/live/quiz/host/next")).toHaveLength(1));
    expect(sentTo("POST", "/live/quiz/host/next")[0]!.body).toEqual({ expected_index: 0 });

    // A double press, or another console: 409 QUIZ_MOVED_ON. No error toast; the host's view is read again.
    await waitFor(() => expect(screen.getByRole("button", { name: "Next question" })).toBeEnabled());
    calls.length = 0;
    state.refuse = new ApiError({ status: 409, message: "The quiz has already moved on.", errorCode: "QUIZ_MOVED_ON" });
    fireEvent.click(screen.getByRole("button", { name: "Next question" }));
    await waitFor(() => expect(sentTo("POST", "/live/quiz/host/next")).toHaveLength(1));
    state.refuse = null;
    await waitFor(() => expect(sentTo("GET", "/live/quiz/host").length).toBeGreaterThan(0));
    expect(error).not.toHaveBeenCalled();
  });

  it("says why when the server refuses a move, instead of doing nothing", async () => {
    const said = vi.spyOn(toast, "error");
    state.host = asking(0);
    render(<QuizPanel eventId={37} />);
    await screen.findByText("Question 1 of 2");
    state.refuse = refusal("The quiz has already ended");
    fireEvent.click(screen.getByRole("button", { name: "Next question" }));
    await waitFor(() => expect(said).toHaveBeenCalledWith("The quiz has already ended"));
    expect(screen.getByRole("button", { name: "Next question" })).toBeEnabled();
  });
});
