import { describe, expect, it } from "vitest";

import { SHARED_FORM as FORM } from "./fixtures";
import { canBeParent, checkDefinition, checkOptionChange, checkTypeChange, depthOf } from "./rules";
import type { Question } from "./types";

const rules = (form: Question[]) => checkDefinition(form).map((p) => p.rule);

describe("definitions the server refuses (R1–R6)", () => {
  it("takes the shared form as it is", () => {
    expect(checkDefinition(FORM)).toEqual([]);
  });

  it("R1: a child before its parent", () => {
    const form = [FORM[4]!, ...FORM.slice(0, 4), ...FORM.slice(5)];
    const problems = checkDefinition(form);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ rule: "R1", key: "pg_spec", index: 0, message: "'PG specialisation' depends on 'Degree type', which must come before it." });
  });

  it("R1: a cycle", () => {
    const form: Question[] = [
      { key: "a", label: "A", field_type: "radio", options: ["x"], show_if: { key: "b", any_of: ["y"] } },
      { key: "b", label: "B", field_type: "radio", options: ["y"], show_if: { key: "a", any_of: ["x"] } },
    ];
    expect(rules(form)).toContain("R1");
    expect(checkDefinition(form)[0]!.message).toBe("'A' depends on 'B', which must come before it.");
  });

  it("R1: a question depending on itself, or on one not in the form", () => {
    expect(checkDefinition([{ key: "a", label: "A", field_type: "radio", options: ["x"], show_if: { key: "a", any_of: ["x"] } }])[0]!.message).toBe("'A' can't depend on itself.");
    expect(checkDefinition([{ key: "a", label: "A", field_type: "text", show_if: { key: "gone", any_of: ["x"] } }])[0]!.message).toBe("'A' depends on a question that isn't in this form.");
  });

  it("R2: a text question as a parent", () => {
    const form: Question[] = [
      { key: "name", label: "Name", field_type: "text" },
      { key: "nick", label: "Nickname", field_type: "text", show_if: { key: "name", any_of: ["x"] } },
    ];
    expect(checkDefinition(form)).toEqual([
      { rule: "R2", index: 1, key: "nick", message: "'Nickname' depends on 'Name', which isn't a choice question. Only a question with options can show or hide others." },
    ]);
  });

  it("R2: a lone checkbox without options cannot be a parent", () => {
    expect(canBeParent({ key: "agree", field_type: "checkbox" })).toBe(false);
    expect(canBeParent({ key: "agree", field_type: "radio", options: ["Yes", "No"] })).toBe(true);
  });

  it("R3: an any_of value that isn't an option", () => {
    const form = FORM.map((q) => (q.key === "college" ? { ...q, show_if: { key: "status", any_of: ["Teacher"] } } : q));
    expect(checkDefinition(form)).toEqual([{ rule: "R3", index: 1, key: "college", message: "'College name' is shown when 'Status' is 'Teacher', which isn't one of its options." }]);
  });

  it("R3: an empty any_of", () => {
    const form = FORM.map((q) => (q.key === "college" ? { ...q, show_if: { key: "status", any_of: [] } } : q));
    expect(checkDefinition(form)[0]).toMatchObject({ rule: "R3", message: "'College name' needs at least one answer to 'Status' that shows it." });
  });

  it("R4: depth 6 is refused, depth 5 is taken", () => {
    const chain = (n: number): Question[] =>
      Array.from({ length: n + 1 }, (_, i) => ({ key: `q${i}`, label: `Q${i}`, field_type: "radio", options: ["Yes", "No"], ...(i ? { show_if: { key: `q${i - 1}`, any_of: ["Yes"] } } : {}) }));
    expect(depthOf(chain(5), "q5")).toBe(5);
    expect(checkDefinition(chain(5))).toEqual([]);
    expect(checkDefinition(chain(6))).toEqual([{ rule: "R4", index: 6, key: "q6", message: "'Q6' is nested 6 deep. Questions can be nested at most 5 deep." }]);
  });

  it("R4: more than 50 questions", () => {
    const many = Array.from({ length: 51 }, (_, i) => ({ key: `q${i}`, field_type: "text" }));
    expect(checkDefinition(many)[0]).toMatchObject({ rule: "R4", index: -1, message: "A form can ask at most 50 questions; this one has 51." });
  });

  it("R5: keys are unique", () => {
    expect(checkDefinition([...FORM, { key: "status", label: "Status again", field_type: "text" }])).toEqual([
      { rule: "R5", index: 8, key: "status", message: "'Status again' has the same key as 'Status'. Every question needs its own." },
    ]);
  });

  it("R6: removing PG while question 5 depends on it is refused, naming it", () => {
    const at = FORM.findIndex((q) => q.key === "degree_type");
    expect(checkOptionChange(FORM, at, ["UG"])).toEqual({
      rule: "R6",
      index: at,
      key: "degree_type",
      message: "'PG' can't be removed or renamed: 'PG specialisation' is shown when 'Degree type' is 'PG'. Change that question's condition first.",
    });
    // Renaming is removing the old value.
    expect(checkOptionChange(FORM, at, ["UG", "Postgraduate"])?.rule).toBe("R6");
    // Adding, or removing an option nothing uses, is fine.
    expect(checkOptionChange(FORM, at, ["UG", "PG", "Diploma"])).toBeNull();
    expect(checkOptionChange(FORM, FORM.findIndex((q) => q.key === "tshirt"), ["S", "M"])).toBeNull();
  });

  it("R2 before the fact: a parent can't turn into a text question while others depend on it", () => {
    const at = FORM.findIndex((q) => q.key === "status");
    expect(checkTypeChange(FORM, at, "text")?.message).toBe("'Status' must stay a choice question: 'College name' depends on its answer. Change that question's condition first.");
    expect(checkTypeChange(FORM, at, "select")).toBeNull();
    expect(checkTypeChange(FORM, FORM.findIndex((q) => q.key === "tshirt"), "text")).toBeNull();
  });
});
