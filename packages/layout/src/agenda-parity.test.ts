import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { type AgendaEntry, layoutAgenda, sampleAgenda } from "./engine";
import { AGENDA_STARTERS, agendaStarter } from "./starters";
import { AgendaLayer, TicketLayoutFields } from "./ticket-layout";

/**
 * The agenda starters, layer for layer, and the agenda layout, piece for
 * piece, against the Python ones. Run with AGENDA_FIXTURE pointing at a JSON
 * dump made by the backend (scratchpad/dump_agenda_fixture.py); skipped
 * otherwise, since the fixture is not checked in.
 */
const fixture = process.env.AGENDA_FIXTURE;

const sortKeys = (v: unknown): unknown =>
  Array.isArray(v) ? v.map(sortKeys) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, sortKeys((v as Record<string, unknown>)[k])])) : v;
const measure = (s: string, size: number) => [...s].length * size * 0.5;
const M = { title: measure, detail: measure, time: measure };
const TZ = "Asia/Kolkata";

type Fixture = {
  starters: Record<string, unknown>;
  sample: AgendaEntry[];
  layouts: Record<string, { layer: unknown; entries: AgendaEntry[]; hour12: boolean; result: { size: number; dropped: number; height: number; pieces: { role: string; text: string; x: number; y: number; size: number; width: number }[] } }>;
};

describe.skipIf(!fixture)("the agenda matches the backend", () => {
  const f = fixture ? (JSON.parse(readFileSync(fixture, "utf8")) as Fixture) : ({ starters: {}, sample: [], layouts: {} } as Fixture);
  for (const kind of Object.keys(AGENDA_STARTERS) as (keyof typeof AGENDA_STARTERS)[]) {
    it(`starter ${kind}`, () => {
      const s = agendaStarter(kind);
      const parsed = TicketLayoutFields.parse({ canvas: s.canvas, layers: s.layers, page: s.page });
      expect(sortKeys(parsed)).toEqual(sortKeys(f.starters[kind]));
    });
  }
  it("the sample programme falls on the event's day in its zone", () => {
    const ours = sampleAgenda("2026-11-20T03:30:00Z", TZ).map((e) => ({ ...e, startsAt: new Date(e.startsAt).toISOString(), endsAt: e.endsAt ? new Date(e.endsAt).toISOString() : null }));
    const theirs = f.sample.map((e) => ({ ...e, startsAt: new Date(e.startsAt).toISOString(), endsAt: e.endsAt ? new Date(e.endsAt).toISOString() : null }));
    expect(ours).toEqual(theirs);
  });
  for (const [name, c] of Object.entries(f.layouts)) {
    it(`layout ${name}`, () => {
      const r = layoutAgenda(AgendaLayer.parse(c.layer), c.entries, TZ, M, c.hour12);
      expect(r.size).toBeCloseTo(c.result.size, 6);
      expect(r.dropped).toBe(c.result.dropped);
      expect(r.height).toBeCloseTo(c.result.height, 6);
      expect(r.pieces.length).toBe(c.result.pieces.length);
      r.pieces.forEach((p, i) => {
        const e = c.result.pieces[i]!;
        expect([p.role, p.text]).toEqual([e.role, e.text]);
        expect(p.x).toBeCloseTo(e.x, 6);
        expect(p.y).toBeCloseTo(e.y, 6);
        expect(p.size).toBeCloseTo(e.size, 6);
        expect(p.width).toBeCloseTo(e.width, 6);
      });
    });
  }
});
