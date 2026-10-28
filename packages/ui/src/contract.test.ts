import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/*
 * The controls' contract (docs/UI_CONTROLS.md), checked over every screen in
 * both dashboards and the shared packages:
 *
 *  - one tone per button. Two tones in one class string put one tone's text
 *    on the other's fill: Save changes on the club profile and the event
 *    editor rendered white on white (light) and near-black on charcoal (dark).
 *  - no white text on a fill that turns light in dark mode. The brand and
 *    the refuse tone are pale in dark mode, so white on them read at about
 *    2:1; their `-foreground` tokens are the text colour that reads on each.
 */
const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const TONES = ["primary", "secondary", "ghost", "quiet", "destructive"];

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === "node_modules" || name === ".next" || name.startsWith(".")) return [];
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const files = ["apps", "packages"].flatMap((top) =>
  readdirSync(join(ROOT, top))
    .map((pkg) => join(ROOT, top, pkg, "src"))
    .filter((src) => {
      try {
        return statSync(src).isDirectory();
      } catch {
        return false;
      }
    })
    .flatMap(sources),
);

/** Every string literal in a file, with the line it starts on. */
function literals(file: string): Array<{ line: number; text: string }> {
  const code = readFileSync(file, "utf8");
  return [...code.matchAll(/"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g)].map((m) => ({
    line: code.slice(0, m.index).split("\n").length,
    text: m[1] ?? m[2] ?? m[3] ?? "",
  }));
}

describe("the controls' contract", () => {
  it("finds the screens to check", () => {
    expect(files.length).toBeGreaterThan(200);
  });

  it("never gives one button two tones in a class string", () => {
    const found = files.flatMap((file) =>
      literals(file)
        .filter(({ text }) => TONES.filter((t) => new RegExp(`(^|\\s)btn-${t}(\\s|$)`).test(text)).length > 1)
        .map(({ line, text }) => `${relative(ROOT, file)}:${line}  ${text}`),
    );
    expect(found).toEqual([]);
  });

  it("never puts white text on a fill that is pale in dark mode", () => {
    const pale = /(^|\s)bg-(brand|primary|refuse|destructive)(\s|$)/;
    const found = files.flatMap((file) =>
      literals(file)
        .filter(({ text }) => pale.test(text) && /(^|\s)text-white(\s|$)/.test(text))
        .map(({ line, text }) => `${relative(ROOT, file)}:${line}  ${text}`),
    );
    expect(found).toEqual([]);
  });
});
