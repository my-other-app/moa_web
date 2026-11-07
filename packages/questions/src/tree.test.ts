import { describe, expect, it } from "vitest";

import { conditionText, orList } from "./describe";
import { SHARED_FORM as FORM } from "./fixtures";
import { checkDefinition } from "./rules";
import { canMove, descendantKeys, moveQuestion, parentIndexOf, removeQuestion, renameKey, setCondition, subtreeIndices } from "./tree";
import type { Question } from "./types";

const keys = (list: readonly Question[] | null) => list?.map((q) => q.key) ?? null;
const at = (key: string, list: readonly Question[] = FORM) => list.findIndex((q) => q.key === key);

describe("the tree of the shared form", () => {
  it("knows each question's subtree and parent", () => {
    expect([...descendantKeys(FORM, "status")].sort()).toEqual(["college", "company", "degree_type", "experience", "pg_spec", "year"]);
    expect(subtreeIndices(FORM, at("degree_type"))).toEqual([3, 4]);
    expect(parentIndexOf(FORM, at("pg_spec"))).toBe(at("degree_type"));
    expect(parentIndexOf(FORM, at("tshirt"))).toBe(-1);
  });
});

describe("moving questions (§7)", () => {
  it("moving a parent moves its whole subtree", () => {
    // Degree type (with PG specialisation) up past Year.
    expect(keys(moveQuestion(FORM, at("degree_type"), "up"))).toEqual(["status", "college", "degree_type", "pg_spec", "year", "company", "experience", "tshirt"]);
    // Status (with everything under it) down past the T-shirt.
    expect(keys(moveQuestion(FORM, at("status"), "down"))).toEqual(["tshirt", "status", "college", "year", "degree_type", "pg_spec", "company", "experience"]);
  });

  it("moving down steps over the next sibling's whole subtree", () => {
    expect(keys(moveQuestion(FORM, at("year"), "down"))).toEqual(["status", "college", "degree_type", "pg_spec", "year", "company", "experience", "tshirt"]);
  });

  it("a child can't move above its parent", () => {
    expect(moveQuestion(FORM, at("college"), "up")).toBeNull();
    expect(moveQuestion(FORM, at("pg_spec"), "up")).toBeNull();
    expect(canMove(FORM, at("college"), "up")).toBe(false);
    // Nor below its last sibling, out of its parent's branch.
    expect(canMove(FORM, at("experience"), "down")).toBe(false);
    expect(canMove(FORM, at("tshirt"), "down")).toBe(false);
  });

  it("every move keeps the form valid", () => {
    for (let i = 0; i < FORM.length; i++) {
      for (const dir of ["up", "down"] as const) {
        const moved = moveQuestion(FORM, i, dir);
        if (moved) expect(checkDefinition(moved)).toEqual([]);
      }
    }
  });
});

describe("setting and clearing a condition", () => {
  it("a question given a parent becomes its last child", () => {
    const form: Question[] = [...FORM, { key: "laptop", label: "Bringing a laptop?", field_type: "text" }];
    const next = setCondition(form, at("laptop", form), { key: "status", any_of: ["Student"] });
    expect(keys(next)).toEqual(["status", "college", "year", "degree_type", "pg_spec", "company", "experience", "laptop", "tshirt"]);
    expect(checkDefinition(next!)).toEqual([]);
  });

  it("changing only the values keeps the question where it is", () => {
    const next = setCondition(FORM, at("college"), { key: "status", any_of: ["Student", "Working"] });
    expect(keys(next)).toEqual(keys(FORM));
    expect(next![at("college")]!.show_if).toEqual({ key: "status", any_of: ["Student", "Working"] });
  });

  it("an always-shown question moves out of the branch it was in, taking its subtree", () => {
    const next = setCondition(FORM, at("degree_type"), null);
    expect(keys(next)).toEqual(["status", "college", "year", "company", "experience", "degree_type", "pg_spec", "tshirt"]);
    expect(next![at("degree_type", next!)]!.show_if).toBeNull();
    expect(checkDefinition(next!)).toEqual([]);
  });

  it("refuses a parent that comes after the question, or one under it", () => {
    expect(setCondition(FORM, at("status"), { key: "tshirt", any_of: ["S"] })).toBeNull();
    expect(setCondition(FORM, at("degree_type"), { key: "pg_spec", any_of: ["x"] })).toBeNull();
  });
});

describe("deleting a parent (§7)", () => {
  it("can take its children with it", () => {
    expect(keys(removeQuestion(FORM, at("status"), "delete"))).toEqual(["tshirt"]);
    expect(keys(removeQuestion(FORM, at("degree_type"), "delete"))).toEqual(["status", "college", "year", "company", "experience", "tshirt"]);
  });

  it("or keep them, always shown, in their order", () => {
    const kept = removeQuestion(FORM, at("status"), "keep");
    expect(keys(kept)).toEqual(["college", "year", "degree_type", "pg_spec", "company", "experience", "tshirt"]);
    expect(kept.filter((q) => q.show_if).map((q) => q.key)).toEqual(["pg_spec"]);
    expect(checkDefinition(kept)).toEqual([]);
  });

  it("a nested parent's kept children leave the branch", () => {
    const kept = removeQuestion(FORM, at("degree_type"), "keep");
    expect(keys(kept)).toEqual(["status", "college", "year", "company", "experience", "pg_spec", "tshirt"]);
    expect(kept[at("pg_spec", kept)]!.show_if).toBeNull();
  });
});

describe("renaming a parent's key", () => {
  it("its children's conditions follow", () => {
    const renamed = renameKey(FORM, "status", "are_you").map((q) => (q.key === "status" ? { ...q, key: "are_you" } : q));
    expect(renamed.filter((q) => q.show_if?.key === "are_you").map((q) => q.key)).toEqual(["college", "year", "degree_type", "company", "experience"]);
    expect(checkDefinition(renamed)).toEqual([]);
  });
});

describe("the condition in words", () => {
  it("reads as the chip says it", () => {
    expect(conditionText(FORM, FORM[at("college")]!)).toBe("Shown when Status is Student");
    expect(conditionText(FORM, FORM[at("pg_spec")]!)).toBe("Shown when Degree type is PG");
    expect(conditionText(FORM, FORM[at("tshirt")]!)).toBeNull();
    const tracks: Question[] = [{ key: "t", label: "Tracks", field_type: "checkbox", options: ["AI", "Web"] }, { key: "g", show_if: { key: "t", any_of: ["AI", "Web"] } }];
    expect(conditionText(tracks, tracks[1]!)).toBe("Shown when Tracks includes AI or Web");
    expect(orList(["UG", "PG", "Diploma"])).toBe("UG, PG or Diploma");
  });
});
