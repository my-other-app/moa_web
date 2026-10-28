import { describe, expect, it } from "vitest";

import { cn } from "./cn";

/*
 * A button has one tone and one size. The tones are plain classes in
 * meridian.css, so the browser applies both when an element carries two:
 * `btn btn-secondary btn-primary` took the secondary's white fill and the
 * primary's white text, and Save changes on the club profile and the event
 * editor went blank in light mode (and near-black on charcoal in dark).
 */
describe("cn keeps one button tone and one size", () => {
  it("lets the last tone win, as it does for any other utility", () => {
    expect(cn("btn btn-secondary", "btn-primary")).toBe("btn btn-primary");
    expect(cn("btn btn-primary", "btn-secondary")).toBe("btn btn-secondary");
    const dirty: boolean = false;
    expect(cn("btn btn-secondary", dirty && "btn-primary")).toBe("btn btn-secondary");
    expect(cn("btn btn-ghost", "btn-destructive")).toBe("btn btn-destructive");
    expect(cn("btn btn-quiet", "btn-ghost")).toBe("btn btn-ghost");
  });

  it("lets the last size win", () => {
    expect(cn("btn btn-xs", "btn-sm")).toBe("btn btn-sm");
    expect(cn("btn btn-sm", "btn-lg")).toBe("btn btn-lg");
  });

  it("leaves the modifiers and the base class alone", () => {
    expect(cn("btn btn-secondary btn-danger btn-icon btn-round btn-sm", "btn-ghost")).toBe("btn btn-danger btn-icon btn-round btn-sm btn-ghost");
    expect(cn("btn btn-primary", "w-full")).toBe("btn btn-primary w-full");
  });

  it("still merges Tailwind utilities", () => {
    expect(cn("px-2 text-ink-3", "px-4")).toBe("text-ink-3 px-4");
  });
});
