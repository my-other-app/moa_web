import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { navItems } from "./nav-items";

/**
 * Every nav icon has a file behind it.
 *
 * The rail is icon-only, so a name with no matching SVG is not a broken image
 * -- it is an invisible, unlabelled destination. Adding Followers with
 * `users-01` before that file existed would have shipped exactly that, and
 * nothing in lint, typecheck or the build would have said a word.
 */
describe("nav icons", () => {
  // Resolved from this file, not process.cwd(): under turbo the working
  // directory is the monorepo root, not the app.
  const iconsDir = join(dirname(fileURLToPath(import.meta.url)), "../../public/icons");
  const available = new Set(
    readdirSync(iconsDir)
      .filter((f) => f.endsWith(".svg"))
      .map((f) => f.replace(/\.svg$/, ""))
  );

  it.each(navItems.map((item) => [item.label, item.icon] as const))(
    "%s has an icon file (%s.svg)",
    (_label, icon) => {
      expect(available.has(icon)).toBe(true);
    }
  );
});
