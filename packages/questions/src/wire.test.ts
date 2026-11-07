import { describe, expect, it } from "vitest";

import { SHARED_FORM, SHARED_FORM_WIRE } from "./fixtures";
import { questionFromWire, questionToWire, questionsFromWire, readShowIf } from "./wire";

describe("the wire format (§5)", () => {
  it("reads a conditional question's required from required_when_shown, not the flat required:false", () => {
    expect(questionFromWire({ key: "college", label: "College", field_type: "text", required: false, required_when_shown: true, show_if: { key: "status", any_of: ["Student"] } })).toEqual({
      key: "college",
      label: "College",
      field_type: "text",
      required: true,
      show_if: { key: "status", any_of: ["Student"] },
    });
  });

  it("reads an always-shown question exactly as before", () => {
    expect(questionFromWire({ key: "tshirt", label: "T-shirt", field_type: "select", required: false, options: ["S"] })).toEqual({ key: "tshirt", label: "T-shirt", field_type: "select", required: false, options: ["S"] });
  });

  it("writes a conditional question with show_if and required_when_shown", () => {
    expect(questionToWire({ key: "college", label: "College", field_type: "text", required: true, show_if: { key: "status", any_of: ["Student"] } })).toEqual({
      key: "college",
      label: "College",
      field_type: "text",
      required: true,
      required_when_shown: true,
      show_if: { key: "status", any_of: ["Student"] },
    });
    expect(questionToWire({ key: "c", label: "C", field_type: "text", required: false, show_if: { key: "s", any_of: ["A"] } }).required_when_shown).toBe(false);
  });

  it("writes an always-shown question with no required_when_shown and no show_if", () => {
    const wire = questionToWire({ key: "tshirt", label: "T-shirt", field_type: "select", required: true, options: ["S", "M"], show_if: null });
    expect(wire).toEqual({ key: "tshirt", label: "T-shirt", field_type: "select", required: true, options: ["S", "M"] });
    expect("required_when_shown" in wire).toBe(false);
    expect("show_if" in wire).toBe(false);
  });

  it("a round trip of the shared form keeps every condition and every required", () => {
    const read = questionsFromWire(SHARED_FORM_WIRE);
    expect(read).toEqual(SHARED_FORM);
    const written = read.map(questionToWire);
    // Through the server (which reads required_when_shown) and back out.
    const stored = written.map((q) => ({ ...q, required: q.required_when_shown ?? q.required }));
    const again = questionsFromWire(stored.map((q) => (q.show_if ? { ...q, required: false, required_when_shown: q.required } : q)));
    expect(again).toEqual(SHARED_FORM);
    for (const q of written) if (q.show_if) expect(q.required_when_shown).toBe(true);
  });

  it("ignores a show_if that is not one", () => {
    expect(readShowIf(null)).toBeNull();
    expect(readShowIf({ any_of: ["x"] })).toBeNull();
    expect(readShowIf({ key: "s", any_of: ["A", 3] })).toEqual({ key: "s", any_of: ["A"] });
    expect(questionsFromWire("nope")).toEqual([]);
    expect(questionsFromWire([null, { label: "no key" }, { key: "k" }])).toEqual([{ key: "k", label: null, field_type: null, required: true }]);
  });
});
