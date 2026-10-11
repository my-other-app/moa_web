import { describe, expect, it } from "vitest";

import { previewNumber } from "./schemas";

describe("the admission number preview", () => {
  it("reads like the backend's: prefix, padded sequence, and the event code when asked", () => {
    expect(previewNumber("", 4, true, "E42")).toBe("MOA-0001-E42");
    expect(previewNumber("gddb", 3, false, "E42", 7)).toBe("GDDB-007");
    expect(previewNumber("ADM", 1, true, "E7", 12)).toBe("ADM-12-E7");
  });
});
