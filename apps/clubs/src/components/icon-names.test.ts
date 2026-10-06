import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Every `<Icon name="..." />` has an SVG behind it.
 *
 * `Icon` takes a plain string and renders a file from /public/icons, so a
 * typo or a renamed export produces a silently blank button -- lint,
 * typecheck and the build all pass. The nav used to work this way and adding
 * Followers with a name that had no file shipped exactly that; the nav now
 * uses components, but these remaining call sites still do not.
 *
 * Source-scanning rather than a hand-maintained list, so a new call site is
 * covered the moment it is written rather than when someone remembers.
 */
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const iconsDir = join(here, "../../public/icons");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) && !entry.name.endsWith(".test.tsx")
      ? [full]
      : [];
  });
}

const used = new Map<string, string>();
for (const file of sourceFiles(root)) {
  for (const match of readFileSync(file, "utf8").matchAll(
    /<Icon\s[^>]*name=["']([a-z0-9-]+)["']/g
  )) {
    used.set(match[1]!, file.replace(root, "src"));
  }
}

const available = new Set(
  readdirSync(iconsDir)
    .filter((f) => f.endsWith(".svg"))
    .map((f) => f.replace(/\.svg$/, ""))
);

describe("sprite icon names", () => {
  it("finds the call sites at all, so a passing suite means something", () => {
    // If the regex stops matching, every assertion below vacuously passes.
    expect(used.size).toBeGreaterThan(0);
  });

  it.each([...used.entries()])("%s exists (used in %s)", (name) => {
    expect(available.has(name)).toBe(true);
  });
});
