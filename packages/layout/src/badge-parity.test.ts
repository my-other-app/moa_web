import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { BADGE_STARTERS, badgeStarter } from "./starters";
import { PAGE_PRESETS, TicketLayoutFields, type PageSpec } from "./ticket-layout";

/**
 * The badge starters, layer for layer against the Python ones. Run with
 * BADGE_FIXTURE pointing at a JSON dump made by the backend; skipped
 * otherwise, since the fixture is not checked in.
 */
const fixture = process.env.BADGE_FIXTURE;
const pages: Record<string, PageSpec | null> = {
  default: null,
  cr80_landscape: PAGE_PRESETS.cr80_landscape.page,
  badge_130x87: PAGE_PRESETS.badge_130x87.page,
  label_29x90: PAGE_PRESETS.label_29x90.page,
  label_54x90: PAGE_PRESETS.label_54x90.page,
};

const sortKeys = (v: unknown): unknown =>
  Array.isArray(v) ? v.map(sortKeys) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, sortKeys((v as Record<string, unknown>)[k])])) : v;

describe.skipIf(!fixture)("badge starters match the backend", () => {
  const expected = fixture ? (JSON.parse(readFileSync(fixture, "utf8")) as Record<string, unknown>) : {};
  for (const kind of Object.keys(BADGE_STARTERS) as (keyof typeof BADGE_STARTERS)[]) {
    for (const [pname, page] of Object.entries(pages)) {
      for (const seats of [false, true]) {
        it(`${kind} on ${pname}${seats ? " (seats)" : ""}`, () => {
          const s = badgeStarter(kind, { seats, page });
          const parsed = TicketLayoutFields.parse({ canvas: s.canvas, layers: s.layers, page: s.page });
          expect(sortKeys(parsed)).toEqual(sortKeys(expected[`${kind}|${pname}|${seats ? 1 : 0}`]));
        });
      }
    }
  }
});
