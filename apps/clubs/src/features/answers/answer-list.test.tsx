import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { DefinitionRows } from "@moa/ui";

import { AnswerList, answerParts } from "./components/answer-list";

/**
 * The answers on Review and in a guest's detail, from the owner's screenshot
 * of DevFest: a question that is a whole sentence came out one word a line
 * in a 92px uppercase column, and "Employee/Student/Others" (no spaces to
 * wrap at) ran out of that column and was painted over its own answer.
 */
const LONG = "Why are you interested in attending DevFest? Tell us about your passion for technology and what you hope to learn.";
const NO_SPACES = "Employee/Student/Others";

const items = [
  { key: "why", label: LONG, value: "I build Android apps at college.\nI want to learn Compose and meet the GDG team." },
  { key: "role", label: NO_SPACES, value: "Student" },
  { key: "college", label: "College/University Name", value: "Sree Narayana Gurukulam College of Engineering" },
  { key: "tracks", label: "Which tracks will you attend?", value: ["Android", "Cloud", "AI"] },
  { key: "github", label: "GitHub profile", value: "" },
];

describe("AnswerList", () => {
  it("shows each question as written, its answer under it, and nothing in the old key column", () => {
    const { container } = render(<AnswerList items={items} />);
    const list = container.querySelector("dl")!;
    const terms = [...list.querySelectorAll("dt")];
    const answers = [...list.querySelectorAll("dd")];
    expect(terms.map((t) => t.textContent)).toEqual([LONG, NO_SPACES, "College/University Name", "Which tracks will you attend?", "GitHub profile"]);
    expect(answers).toHaveLength(5);

    for (const [i, dt] of terms.entries()) {
      // The question and its answer share a row of their own: the answer is the question's next sibling.
      expect(dt.nextElementSibling).toBe(answers[i]);
      // Sentence case as the club wrote it, never the overview card's uppercase mono 92px key.
      expect(dt.className).not.toMatch(/uppercase|font-mono|w-\[92px\]|shrink-0/);
      // A label with nowhere to wrap breaks inside its own box rather than running over the answer.
      expect(dt.className).toContain("[overflow-wrap:anywhere]");
      expect(dt.className).toContain("min-w-0");
      expect(answers[i]!.className).toContain("[overflow-wrap:anywhere]");
    }

    // Stacked by default; a wide second column only when the list itself has the room.
    const row = terms[0]!.parentElement!;
    expect(row.className).toMatch(/^grid /);
    expect(row.className).toContain("@2xl:grid-cols-");
    expect(container.firstElementChild!.className).toContain("@container");
  });

  it("keeps a written answer's line breaks, chips several choices, and says a blank is not answered", () => {
    render(<AnswerList items={items} />);
    const written = screen.getByText(/I build Android apps at college\./);
    expect(written.textContent).toContain("\n");
    expect(written.className).toContain("whitespace-pre-line");

    const chosen = screen.getByRole("list", { name: "3 chosen" });
    expect(within(chosen).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Android", "Cloud", "AI"]);

    const blank = screen.getByText("not answered");
    expect(blank.className).toContain("text-ink-3");
    expect(screen.getByText("Sree Narayana Gurukulam College of Engineering")).toBeInTheDocument();
  });

  it("reads every shape an answer is stored in", () => {
    expect(answerParts(["veg", "", null, "no nuts"])).toEqual(["veg", "no nuts"]);
    expect(answerParts({ label: "Year", value: 2 })).toEqual(["2"]);
    expect(answerParts(true)).toEqual(["Yes"]);
    expect(answerParts("   ")).toEqual([]);
    expect(answerParts(undefined)).toEqual([]);
  });

  it("renders nothing for no answers", () => {
    const { container } = render(<AnswerList items={[]} />);
    expect(container.firstChild).toBeNull();
  });
});

describe("DefinitionRows", () => {
  it("breaks a long unbroken key inside its column, keeping short keys as they were", () => {
    const { container } = render(<DefinitionRows rows={[{ k: "Name", v: "Asha" }, { k: NO_SPACES, v: "Others" }]} />);
    const [short, long] = [...container.querySelectorAll("dt")];
    // Short keys keep the overview card's look.
    expect(short!.className).toMatch(/w-\[92px\]/);
    expect(short!.className).toContain("uppercase");
    // And nothing can leave its column.
    for (const dt of [short!, long!]) {
      expect(dt.className).toContain("min-w-0");
      expect(dt.className).toContain("[overflow-wrap:anywhere]");
    }
    expect(container.querySelectorAll("dd")[1]!.className).toContain("[overflow-wrap:anywhere]");
  });
});
