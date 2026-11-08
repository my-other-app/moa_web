import { describe, expect, it } from "vitest";

import { SHARED_FORM } from "./fixtures";
import { KEY_MAX, formChanged, keyFromLabel, relabel, uniqueKey } from "./keys";

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

describe("a label changed in an editor (§1.1)", () => {
  const keys = (list: { key: string }[]) => list.map((q) => q.key);

  it("keeps a saved question's key whatever its label becomes, and its children's conditions with it", () => {
    const next = relabel(SHARED_FORM, 0, "Are you working or a student?", false);
    expect(next[0]).toMatchObject({ key: "status", label: "Are you working or a student?" });
    expect(keys(next)).toEqual(keys(SHARED_FORM));
    expect(next[1]!.show_if).toEqual({ key: "status", any_of: ["Student"] });
  });

  it("gives a question not saved yet its key from its label, never one another question has, and its children follow", () => {
    const next = relabel(SHARED_FORM, 0, "Work status", true);
    expect(next[0]!.key).toBe("work_status");
    expect(next.filter((q) => q.show_if?.key === "work_status").map((q) => q.key)).toEqual(["college", "year", "degree_type", "company", "experience"]);
    expect(next.some((q) => q.show_if?.key === "status")).toBe(false);
    // Only its own children: pg_spec still depends on degree_type.
    expect(next[4]!.show_if).toEqual({ key: "degree_type", any_of: ["PG"] });
    // A label whose key another question has: _2.
    expect(relabel(SHARED_FORM, 7, "Company", true)[7]!.key).toBe("company_2");
    // Its own key is not a clash.
    expect(relabel(SHARED_FORM, 7, "Tshirt", true)[7]!.key).toBe("tshirt");
  });

  it("keeps the key while a label is cleared to be retyped, and leaves the list as it was otherwise", () => {
    const cleared = relabel(SHARED_FORM, 0, "  ", true);
    expect(cleared[0]).toMatchObject({ key: "status", label: "  " });
    expect(cleared[1]!.show_if?.key).toBe("status");
    expect(relabel(SHARED_FORM, 99, "x", true)).toEqual(SHARED_FORM);
    // A new question with no key yet takes one once it has a label.
    expect(relabel([{ key: "", label: "" }], 0, "Why join", true)[0]!.key).toBe("why_join");
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
