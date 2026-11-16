import { describe, expect, it } from "vitest";

import { safeHref } from "./safe-href";

describe("a link someone typed", () => {
  it("is kept when it is an http(s) or mailto address, or a path on this site", () => {
    for (const ok of [
      "https://example.org",
      "https://www.instagram.com/our.club/",
      "http://club.example.edu/events?id=4#top",
      "  https://padded.example  ",
      "mailto:hello@club.example",
      "/events/42",
    ]) {
      expect(safeHref(ok)).toBe(ok.trim());
    }
  });

  it("is no link for any other scheme, a protocol-relative address or text", () => {
    for (const no of ["javascript:alert(1)", " JavaScript:void(0)", "data:text/html,hi", "vbscript:x", "file:///etc/hosts", "//evil.example/x", "/\\evil.example", "example.org", "our.club", "", "   ", null, undefined]) {
      expect(safeHref(no)).toBeUndefined();
    }
  });
});
