import { describe, expect, it } from "vitest";

import { SHARED_FORM as FORM } from "./fixtures";
import { hiddenWithAnswers, isBlankAnswer, isRequiredNow, matches, missingRequired, pruneHidden, requiredWhenShown, setAnswer, visibility, visibilityChange, visibleQuestions } from "./visibility";
import type { Question } from "./types";

const shown = (answers: Record<string, unknown>) => visibleQuestions(FORM, answers).map((q) => q.key);
const ALL = ["status", "college", "year", "degree_type", "pg_spec", "company", "experience", "tshirt"];

describe("matches (§3)", () => {
  it("a one-choice answer matches when it is one of the values", () => {
    expect(matches("Student", ["Student"])).toBe(true);
    expect(matches("Working", ["Student"])).toBe(false);
    expect(matches("Working", ["Student", "Working"])).toBe(true);
  });
  it("a several-choices answer matches when any tick is one of the values", () => {
    expect(matches(["AI", "Web"], ["Web"])).toBe(true);
    expect(matches(["AI"], ["Web", "Hardware"])).toBe(false);
    // One tick stored as the option itself.
    expect(matches("Web", ["Web"])).toBe(true);
  });
  it("a blank answer never matches", () => {
    for (const blank of [undefined, null, "", "   ", [], [""]]) expect(matches(blank, ["Student", ""])).toBe(false);
  });
  it("compares exactly, as picked from the options", () => {
    expect(matches("student", ["Student"])).toBe(false);
  });
});

describe("the shared form (§12)", () => {
  it("before anything is answered: only the always-shown questions", () => {
    expect(shown({})).toEqual(["status", "tshirt"]);
  });

  it("Student + UG: questions 1–4 and 8 shown; 5–7 hidden and not required", () => {
    const answers = { status: "Student", degree_type: "UG" };
    expect(shown(answers)).toEqual(["status", "college", "year", "degree_type", "tshirt"]);
    for (const key of ["pg_spec", "company", "experience"]) expect(isRequiredNow(FORM, answers, key)).toBe(false);
    for (const key of ["status", "college", "year", "degree_type", "tshirt"]) expect(isRequiredNow(FORM, answers, key)).toBe(true);
  });

  it("Student + PG: question 5 appears (nested)", () => {
    expect(shown({ status: "Student", degree_type: "PG" })).toEqual(["status", "college", "year", "degree_type", "pg_spec", "tshirt"]);
  });

  it("Working: questions 6–8 shown; 2–5 hidden", () => {
    expect(shown({ status: "Working" })).toEqual(["status", "company", "experience", "tshirt"]);
  });

  it("a nested question needs its parent visible too: PG left over from a Student answer stays hidden under Working", () => {
    const v = visibility(FORM, { status: "Working", degree_type: "PG" });
    expect(v.get("degree_type")).toBe(false);
    expect(v.get("pg_spec")).toBe(false);
  });

  it("switching Student → Working drops the answers to 2–5", () => {
    const filled = { status: "Student", college: "IIT Madras", year: "3", degree_type: "PG", pg_spec: "VLSI", tshirt: "M" };
    const switched = { ...filled, status: "Working" };
    expect(hiddenWithAnswers(FORM, switched)).toEqual(["college", "year", "degree_type", "pg_spec"]);
    expect(pruneHidden(FORM, switched)).toEqual({ status: "Working", tshirt: "M" });
  });

  it("switching PG → UG drops the answer to 5 while keeping 2–4", () => {
    const filled = { status: "Student", college: "IIT Madras", year: "3", degree_type: "PG", pg_spec: "VLSI", tshirt: "M" };
    const switched = { ...filled, degree_type: "UG" };
    expect(hiddenWithAnswers(FORM, switched)).toEqual(["pg_spec"]);
    expect(pruneHidden(FORM, switched)).toEqual({ status: "Student", college: "IIT Madras", year: "3", degree_type: "UG", tshirt: "M" });
  });

  it("an old-client submission with every question answered: hidden answers pruned, visible required ones enforced", () => {
    const everything = { status: "Working", college: "X", year: "1", degree_type: "PG", pg_spec: "Y", company: "Acme", experience: "3-5", tshirt: "L" };
    expect(pruneHidden(FORM, everything)).toEqual({ status: "Working", company: "Acme", experience: "3-5", tshirt: "L" });
    expect(missingRequired(FORM, everything)).toEqual([]);
    // The old app left a visible required one blank: named; a hidden one blank: not.
    expect(missingRequired(FORM, { status: "Working", experience: "3-5", tshirt: "L" })).toEqual(["company"]);
    expect(missingRequired(FORM, { status: "Student", college: "X", year: "1", degree_type: "UG", tshirt: "L" })).toEqual([]);
  });

  it("keeps answers that are not questions of the form", () => {
    expect(pruneHidden(FORM, { status: "Working", referral: "a friend" })).toEqual({ status: "Working", referral: "a friend" });
  });
});

describe("visibility edge cases", () => {
  it("a several-choices parent reveals on any matching tick", () => {
    const form: Question[] = [
      { key: "tracks", field_type: "checkbox", options: ["AI", "Web", "Hardware"] },
      { key: "gpu", field_type: "text", show_if: { key: "tracks", any_of: ["AI", "Hardware"] } },
    ];
    expect(visibility(form, { tracks: ["Web"] }).get("gpu")).toBe(false);
    expect(visibility(form, { tracks: ["Web", "Hardware"] }).get("gpu")).toBe(true);
  });

  it("a missing parent, or one after its child, hides the child (the one pass has not seen it)", () => {
    const form: Question[] = [
      { key: "child", field_type: "text", show_if: { key: "later", any_of: ["Yes"] } },
      { key: "later", field_type: "radio", options: ["Yes", "No"] },
      { key: "orphan", field_type: "text", show_if: { key: "nowhere", any_of: ["Yes"] } },
    ];
    const v = visibility(form, { later: "Yes", nowhere: "Yes" });
    expect(v.get("child")).toBe(false);
    expect(v.get("orphan")).toBe(false);
    expect(v.get("later")).toBe(true);
  });

  it("an empty any_of reveals nothing", () => {
    const form: Question[] = [
      { key: "status", field_type: "radio", options: ["A"] },
      { key: "x", field_type: "text", show_if: { key: "status", any_of: [] } },
    ];
    expect(visibility(form, { status: "A" }).get("x")).toBe(false);
  });

  it("blank answers", () => {
    expect(isBlankAnswer(undefined)).toBe(true);
    expect(isBlankAnswer(["", " "])).toBe(true);
    expect(isBlankAnswer(0)).toBe(false);
    expect(isBlankAnswer(["a"])).toBe(false);
  });
});

describe("required when shown (§5)", () => {
  it("a conditional question reads required_when_shown, never the flat required:false", () => {
    expect(requiredWhenShown({ key: "c", required: false, required_when_shown: true, show_if: { key: "s", any_of: ["A"] } })).toBe(true);
    expect(requiredWhenShown({ key: "c", required: false, required_when_shown: false, show_if: { key: "s", any_of: ["A"] } })).toBe(false);
  });
  it("an always-shown question reads required, as before", () => {
    expect(requiredWhenShown({ key: "c", required: false })).toBe(false);
    expect(requiredWhenShown({ key: "c", required: true, required_when_shown: false })).toBe(true);
    expect(requiredWhenShown({ key: "c" })).toBe(true);
  });
  it("every question of the shared form is required when shown", () => {
    expect(FORM.map(requiredWhenShown)).toEqual(ALL.map(() => true));
  });
});

describe("what changed", () => {
  it("names the questions that appeared and those that went, in list order", () => {
    const student = visibility(FORM, { status: "Student", degree_type: "PG" });
    const working = visibility(FORM, { status: "Working", degree_type: "PG" });
    const change = visibilityChange(FORM, student, working);
    expect(change.shown.map((q) => q.key)).toEqual(["company", "experience"]);
    expect(change.hidden.map((q) => q.key)).toEqual(["college", "year", "degree_type", "pg_spec"]);
  });
});

describe("answering as a form does", () => {
  it("clears what the new answer hides, at once, nested ones included", () => {
    let a = setAnswer(FORM, {}, "status", "Student");
    a = setAnswer(FORM, a, "degree_type", "PG");
    a = setAnswer(FORM, a, "pg_spec", "VLSI");
    a = setAnswer(FORM, a, "college", "IIT Madras");
    expect(setAnswer(FORM, a, "degree_type", "UG")).toEqual({ status: "Student", degree_type: "UG", college: "IIT Madras" });
    expect(setAnswer(FORM, a, "status", "Working")).toEqual({ status: "Working" });
  });
});
