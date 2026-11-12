import { describe, expect, it } from "vitest";

import { HISTORY_LIMIT, reduce, startHistory } from "./history";

/** Undo and redo: a step per change, a drag or a run of typing as one, and at least a hundred steps back. */

describe("the board's history", () => {
  it("undoes and redoes each change", () => {
    let h = startHistory(0);
    h = reduce(h, { type: "set", next: 1 });
    h = reduce(h, { type: "set", next: (n) => n + 1 });
    expect(h.present).toBe(2);
    h = reduce(h, { type: "undo" });
    expect(h.present).toBe(1);
    h = reduce(h, { type: "undo" });
    expect(h.present).toBe(0);
    h = reduce(h, { type: "redo" });
    expect(h.present).toBe(1);
    // A new change drops what could be redone.
    h = reduce(h, { type: "set", next: 9 });
    expect(h.future).toEqual([]);
  });

  it("keeps a run of one group as one step, until it is sealed", () => {
    let h = startHistory("a");
    h = reduce(h, { type: "set", next: "ab", group: "text", now: 1000 });
    h = reduce(h, { type: "set", next: "abc", group: "text", now: 1500 });
    h = reduce(h, { type: "set", next: "abcd", group: "text", now: 2000 });
    expect(h.past).toEqual(["a"]);
    h = reduce(h, { type: "seal" });
    h = reduce(h, { type: "set", next: "abcde", group: "text", now: 2100 });
    expect(h.past).toEqual(["a", "abcd"]);
    // Too long a pause starts a new step too.
    h = reduce(h, { type: "set", next: "abcdef", group: "text", now: 9000 });
    expect(h.past).toHaveLength(3);
  });

  it("keeps at least a hundred steps", () => {
    let h = startHistory(0);
    for (let i = 1; i <= 250; i++) h = reduce(h, { type: "set", next: i });
    expect(HISTORY_LIMIT).toBeGreaterThanOrEqual(100);
    expect(h.past).toHaveLength(HISTORY_LIMIT);
    for (let i = 0; i < 150; i++) h = reduce(h, { type: "undo" });
    expect(h.present).toBe(100);
  });

  it("takes what the server saved without making it a step", () => {
    let h = startHistory({ v: 1 });
    h = reduce(h, { type: "set", next: { v: 2 } });
    h = reduce(h, { type: "replace", next: { v: 2.5 } });
    expect(h.present).toEqual({ v: 2.5 });
    expect(h.past).toEqual([{ v: 1 }]);
  });
});
