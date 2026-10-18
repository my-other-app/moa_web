import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { TICKET_STARTERS, ticketStarter, type TicketStarter } from "./starters";
import { TicketLayoutFields } from "./ticket-layout";

/**
 * The ticket starters, layer for layer against the Python ones -- the code
 * under the QR above all, which is the ticket code the gate takes and not
 * the admission number. Run with TICKET_FIXTURE pointing at a JSON dump made
 * by the backend ({"<kind>|<0|1 seats>": dump(TicketLayoutFields(...))});
 * skipped otherwise, since the fixture is not checked in.
 */
const fixture = process.env.TICKET_FIXTURE;

const sortKeys = (v: unknown): unknown =>
  Array.isArray(v) ? v.map(sortKeys) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, sortKeys((v as Record<string, unknown>)[k])])) : v;

describe.skipIf(!fixture)("ticket starters match the backend", () => {
  const expected = fixture ? (JSON.parse(readFileSync(fixture, "utf8")) as Record<string, unknown>) : {};
  for (const kind of Object.keys(TICKET_STARTERS) as TicketStarter[]) {
    for (const seats of [false, true]) {
      it(`${kind}${seats ? " (seats)" : ""}`, () => {
        const s = ticketStarter(kind, { seats });
        const parsed = TicketLayoutFields.parse({ canvas: s.canvas, layers: s.layers, page: s.page });
        expect(sortKeys(parsed)).toEqual(sortKeys(expected[`${kind}|${seats ? 1 : 0}`]));
      });
    }
  }
});
