import { z } from "zod";

/**
 * The platform's view of the two event games (Hero Cards and the Scavenger
 * Hunt; feature-register/games/CONTRACT.md §3, GET /admin/games/overview).
 * Every number is read leniently: a missing field is zero, and a row that
 * cannot be read is left out, so one odd row never blanks the page.
 */

const count = z.number().catch(0);
const text = z.string().catch("");

const cardsTotals = z
  .object({ events: count, players: count, connected_now: count, reveals: count, collects: count, decks_completed: count })
  .catch({ events: 0, players: 0, connected_now: 0, reveals: 0, collects: 0, decks_completed: 0 });

const huntTotals = z
  .object({ events: count, players: count, connected_now: count, claims: count, hunts_completed: count })
  .catch({ events: 0, players: 0, connected_now: 0, claims: 0, hunts_completed: 0 });

export const gameRowSchema = z.object({
  club_id: z.union([z.number(), z.string()]).nullish().catch(null),
  club_name: text,
  event_id: z.union([z.number(), z.string()]),
  event_name: text,
  cards_on: z.boolean().catch(false),
  hunt_on: z.boolean().catch(false),
  players: count,
  connected_now: count,
  reveals: count,
  collects: count,
  hunt_claims: count,
  decks_completed: count,
  hunts_completed: count,
});
export type GameRow = z.infer<typeof gameRowSchema>;

const planCount = z.object({
  plan_key: text,
  plan_name: text,
  game_cards: count,
  game_hunt: count,
});

export const gamesOverviewSchema = z.object({
  totals: z
    .object({ cards: cardsTotals, hunt: huntTotals, connected_now: count })
    .catch({ cards: cardsTotals.parse({}), hunt: huntTotals.parse({}), connected_now: 0 }),
  rows: z
    .array(z.unknown())
    .catch([])
    .transform((rows) =>
      rows.flatMap((r): GameRow[] => {
        const p = gameRowSchema.safeParse(r);
        return p.success ? [p.data] : [];
      }),
    ),
  plans: z
    .array(z.unknown())
    .catch([])
    .transform((rows) =>
      rows.flatMap((r) => {
        const p = planCount.safeParse(r);
        return p.success ? [p.data] : [];
      }),
    ),
});
export type GamesOverview = z.infer<typeof gamesOverviewSchema>;

/** What the date range sends: whole days, either end open. */
export interface GamesRange {
  from: string;
  to: string;
}

/** Players connected anywhere right now: the card from the API, else the sum of both games' rows. */
export function connectedNow(o: GamesOverview): number {
  return o.totals.connected_now || o.rows.reduce((s, r) => s + r.connected_now, 0);
}

/** Which games an event runs, in words. */
export function gamesOf(r: Pick<GameRow, "cards_on" | "hunt_on">): string {
  if (r.cards_on && r.hunt_on) return "Hero Cards and Scavenger Hunt";
  if (r.cards_on) return "Hero Cards";
  if (r.hunt_on) return "Scavenger Hunt";
  return "None on";
}
