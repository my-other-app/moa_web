import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The door screens — the gate console, the kiosk, the phone check-in and
 * the merch hand-over — are drawn in Meridian tokens only. They used to
 * carry their own hex palette and Tailwind ramps, which is how they drifted
 * from the rest of the product; this keeps them from drifting back.
 */
const here = dirname(fileURLToPath(import.meta.url));
const features = join(here, "..");
const files = [
  ...readdirSync(join(here, "components")).map((f) => join(here, "components", f)),
  ...readdirSync(join(features, "kiosk/components")).map((f) => join(features, "kiosk/components", f)),
  ...readdirSync(join(features, "self-check-in/components")).map((f) => join(features, "self-check-in/components", f)),
  join(features, "merch/components/merch-panel.tsx"),
].filter((f) => f.endsWith(".tsx"));

const BANNED: [string, RegExp][] = [
  ["a raw hex colour", /#[0-9a-fA-F]{3,8}\b/],
  ["an rgb() colour", /rgba?\(/],
  ["a Tailwind colour ramp", /\b(?:bg|text|border|ring|from|to)-(?:emerald|green|amber|yellow|red|sky|blue|black)\b/],
  // Solid white is allowed behind a QR code, where scanners need it; nowhere else.
  ["white outside a QR code", /\b(?:text|border|ring|from|to)-white\b|\bbg-white\//],
  ["a pre-Meridian token", /\b(?:text-muted-foreground|text-foreground|bg-muted|bg-card|border-border|bg-primary|text-primary|border-primary|text-destructive|border-destructive)\b/],
  ["a retired button name", /variant="(?:outline|default|link|display)"/],
];

describe("the door screens are drawn in tokens", () => {
  it("finds the files, so a passing suite means something", () => {
    expect(files.length).toBeGreaterThan(8);
  });

  it.each(files.map((f) => [f.replace(features, "features"), f]))("%s has no colour or control outside the system", (_name, file) => {
    const source = readFileSync(file, "utf8");
    for (const [what, pattern] of BANNED) expect(source, `uses ${what}`).not.toMatch(pattern);
  });
});
