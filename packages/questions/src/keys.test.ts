import { describe, expect, it } from "vitest";

import { SHARED_FORM } from "./fixtures";
import { KEY_MAX, formChanged, keyFromLabel, uniqueKey } from "./keys";

describe("keys from labels (missing-answers §1.1)", () => {
  it("makes a snake_case key from a label", () => {
    expect(keyFromLabel("T-shirt size")).toBe("t_shirt_size");
    expect(keyFromLabel("  Why do you want to come?  ")).toBe("why_do_you_want_to_come");
    expect(keyFromLabel("!!!")).toBe("");
    expect(keyFromLabel("x".repeat(60))).toHaveLength(KEY_MAX);
  });

  it("gives a new question a key no other question has: _2, _3, …", () => {
    expect(uniqueKey("College", [])).toBe("college");
    expect(uniqueKey("College", ["college"])).toBe("college_2");
    expect(uniqueKey("College", ["college", "college_2"])).toBe("college_3");
    expect(uniqueKey("", ["question"])).toBe("question_2");
  });

  it("keeps a suffixed key within the limit", () => {
    const long = "a".repeat(60);
    const first = uniqueKey(long, []);
    const second = uniqueKey(long, [first]);
    expect(second).toHaveLength(KEY_MAX);
    expect(second.endsWith("_2")).toBe(true);
  });
});

describe("whether a form changed", () => {
  it("is false for the same form, whatever builder-only fields ride along", () => {
    const rows = SHARED_FORM.map((q) => ({ ...q, fresh: false, id: "rhf" }));
    expect(formChanged(SHARED_FORM, rows)).toBe(false);
    // An empty option row in the builder is not a choice.
    expect(formChanged(SHARED_FORM, SHARED_FORM.map((q) => (q.options ? { ...q, options: [...q.options, " "] } : q)))).toBe(false);
  });

  it("is true for a reword, a new requirement, a removed option, a condition, an order", () => {
    const [first, ...rest] = SHARED_FORM;
    expect(formChanged(SHARED_FORM, [{ ...first!, label: "Are you a student?" }, ...rest])).toBe(true);
    expect(formChanged(SHARED_FORM, SHARED_FORM.map((q) => (q.key === "tshirt" ? { ...q, required: false } : q)))).toBe(true);
    expect(formChanged(SHARED_FORM, SHARED_FORM.map((q) => (q.key === "tshirt" ? { ...q, options: ["S", "M", "L"] } : q)))).toBe(true);
    expect(formChanged(SHARED_FORM, SHARED_FORM.map((q) => (q.key === "company" ? { ...q, show_if: null } : q)))).toBe(true);
    expect(formChanged(SHARED_FORM, [...rest, first!])).toBe(true);
    expect(formChanged(SHARED_FORM, SHARED_FORM.slice(0, -1))).toBe(true);
  });
});
