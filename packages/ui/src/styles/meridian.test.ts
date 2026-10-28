import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/*
 * The Meridian palette against WCAG AA, in both modes, read from the sheet
 * itself so a token change that makes text unreadable fails here first.
 * Text needs 4.5:1. The pairs are the ones the screens use: the three inks
 * on every ground, the brand as text (links, ghost buttons, the current nav
 * item on its tint) and as a fill (primary buttons), and each tone on its
 * own soft ground.
 */
const css = readFileSync(new URL("./meridian.css", import.meta.url), "utf8");

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`\n${selector} {`);
  if (start < 0) throw new Error(`no ${selector} block`);
  const body = css.slice(css.indexOf("{", start) + 1, css.indexOf("\n}", start));
  const tokens: Record<string, string> = {};
  for (const m of body.matchAll(/(--[\w-]+):\s*([^;]+);/g)) tokens[m[1]!] = m[2]!.trim();
  return tokens;
}

const shared = block(":root,\n.dark");
const modes = { light: { ...shared, ...block(":root") }, dark: { ...shared, ...block(":root"), ...block(".dark") } };

function resolve(tokens: Record<string, string>, name: string): string {
  let value = tokens[name];
  for (let i = 0; value && value.startsWith("var(") && i < 5; i++) value = tokens[value.slice(4, -1).trim()];
  if (!value || !/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`${name} is not a plain colour: ${value}`);
  return value;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const GROUNDS = ["--canvas", "--surface", "--sunken"];
const PAIRS: Array<[string, string[]]> = [
  ["--ink", [...GROUNDS, "--raised", "--brand-soft"]],
  ["--ink-2", [...GROUNDS, "--raised", "--brand-soft"]],
  ["--ink-3", [...GROUNDS, "--brand-soft"]],
  ["--brand", [...GROUNDS, "--brand-soft"]],
  ["--brand-foreground", ["--brand"]],
  ["--refuse-foreground", ["--refuse"]],
  ["--destructive-foreground", ["--destructive"]],
  ["--admit", ["--surface", "--admit-soft"]],
  ["--caution", ["--surface", "--caution-soft"]],
  ["--refuse", ["--surface", "--refuse-soft"]],
  ["--info", ["--surface", "--info-soft"]],
];

describe.each(Object.entries(modes))("Meridian %s", (_mode, tokens) => {
  it.each(PAIRS)("%s reads at 4.5:1 or better on its grounds", (fg, grounds) => {
    for (const ground of grounds) {
      const r = ratio(resolve(tokens, fg), resolve(tokens, ground));
      expect.soft(Math.round(r * 100) / 100, `${fg} on ${ground}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("the button tones", () => {
  it("each sets its own text colour, so no tone leaves text the colour of another's fill", () => {
    for (const tone of ["primary", "secondary", "ghost", "quiet", "destructive"]) {
      const at = css.indexOf(`.btn-${tone} {`);
      expect(at, `.btn-${tone}`).toBeGreaterThan(-1);
      expect(css.slice(at, css.indexOf("}", at)), `.btn-${tone}`).toMatch(/\bcolor:/);
    }
  });
});
