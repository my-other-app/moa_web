import { describe, expect, it } from "vitest";
import { ApiError } from "@moa/api";

import { answerForApi, answerForForm, answersPayload, answerText, inputTypeOf, invalidAnswers, isMultiChoice } from "./answers";

const sizes = { key: "tshirt", label: "T-shirt", field_type: "radio", options: ["S", "M", "L"] };
const tracks = { key: "tracks", label: "Tracks", field_type: "checkbox", options: ["AI", "Web", "Hardware"] };
const agree = { key: "agree", label: "I agree", field_type: "checkbox", options: [] };
const year = { key: "year", label: "Year", field_type: "number" };

describe("answers to an event's own questions", () => {
  it("sends one tick as the option itself and several as a list, in the question's order", () => {
    expect(answerForApi(tracks, ["Web"])).toBe("Web");
    expect(answerForApi(tracks, ["Hardware", "AI", "AI"])).toEqual(["AI", "Hardware"]);
    expect(answerForApi(tracks, [])).toBeUndefined();
    expect(answerForApi(sizes, "M")).toBe("M");
    expect(answerForApi(year, "  3 ")).toBe("3");
    expect(answerForApi(year, "  ")).toBeUndefined();
  });

  it("leaves blanks out of what is sent", () => {
    expect(answersPayload([sizes, tracks, year], { tshirt: "L", tracks: ["AI", "Web"], year: "" })).toEqual({ tshirt: "L", tracks: ["AI", "Web"] });
  });

  it("reads a stored answer back into the form, a lone tick from before as a list of one", () => {
    expect(answerForForm(tracks, "Web")).toEqual(["Web"]);
    expect(answerForForm(tracks, ["AI", "Web"])).toEqual(["AI", "Web"]);
    expect(answerForForm(tracks, null)).toEqual([]);
    expect(answerForForm(sizes, "S")).toBe("S");
    expect(answerForForm(year, 3)).toBe("3");
  });

  it("tells a several-choices question from a lone tick box, and asks typed ones with their input", () => {
    expect(isMultiChoice(tracks)).toBe(true);
    expect(isMultiChoice(agree)).toBe(false);
    expect(isMultiChoice(sizes)).toBe(false);
    expect(inputTypeOf(year)).toBe("number");
    expect(inputTypeOf({ key: "d", field_type: "date" })).toBe("date");
    expect(inputTypeOf({ key: "w", field_type: "url" })).toBe("url");
    expect(inputTypeOf({ key: "x", field_type: "text" })).toBe("text");
  });

  it("reads a list as its options joined", () => {
    expect(answerText(["AI", "Web"])).toBe("AI, Web");
    expect(answerText("Web")).toBe("Web");
    expect(answerText(null)).toBe("");
  });

  it("reads the API's refusal question by question", () => {
    const refusal = new ApiError({ message: "Check your answers: Year, Website.", status: 400, errorCode: "INVALID_ANSWERS", fieldErrors: { year: "Enter a number.", site: "Enter a web address, like example.com." } as unknown as Record<string, string[]> });
    expect(invalidAnswers(refusal)).toEqual({ year: "Enter a number.", site: "Enter a web address, like example.com." });
    expect(invalidAnswers(new ApiError({ message: "Event is full", status: 400, errorCode: "EVENT_FULL" }))).toBeNull();
  });
});
