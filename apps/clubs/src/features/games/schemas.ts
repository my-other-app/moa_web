import { z } from "zod";

/**
 * Event → Games, the organiser's side (feature-register/games/CONTRACT.md
 * §3 and SPEC §8): two separate games, Hero Cards and the Scavenger Hunt,
 * each switched on per event and named by the club. Every field is read
 * leniently, so an answer with a field more or less never takes the page
 * down; a list item that can't be read is left out rather than failing the
 * list.
 */

const count = z.number().catch(0);
const text = z.string().catch("");
const maybeText = z.string().nullish().catch(null).transform((v) => v ?? null);
const when = maybeText;

const listOf = <T extends z.ZodTypeAny>(item: T) =>
  z
    .array(z.unknown())
    .catch([])
    .transform((rows) =>
      rows.flatMap((row): z.infer<T>[] => {
        const r = item.safeParse(row);
        return r.success ? [r.data] : [];
      }),
    );

// ─── The games and their names ───────────────────────────────────────────

export const GAME_KINDS = ["cards", "hunt"] as const;
export type GameKind = (typeof GAME_KINDS)[number];
/** The plan feature each game is part of. */
export const GAME_FEATURE: Record<GameKind, "game_cards" | "game_hunt"> = { cards: "game_cards", hunt: "game_hunt" };
export const DEFAULT_NAME: Record<GameKind, string> = { cards: "Hero Cards", hunt: "Scavenger Hunt" };
export const NAME_MAX = 40;

// ─── Look and screens ────────────────────────────────────────────────────

export const THEMES = ["neon_arcade", "sunset_pop", "ocean_glow", "mono_night"] as const;
export type ThemeKey = (typeof THEMES)[number];
export const THEME_LABEL: Record<ThemeKey, string> = {
  neon_arcade: "Neon Arcade",
  sunset_pop: "Sunset Pop",
  ocean_glow: "Ocean Glow",
  mono_night: "Mono Night",
};

/** What each theme draws with: the card, the board and the preview all read these. */
export interface ThemeColors {
  bg: string;
  panel: string;
  ink: string;
  mute: string;
  accent: string;
  accent2: string;
}
export const THEME_COLORS: Record<ThemeKey, ThemeColors> = {
  neon_arcade: { bg: "#0B0618", panel: "#17102E", ink: "#F5F1FF", mute: "#A99BD6", accent: "#2DF5C8", accent2: "#FF3DB8" },
  sunset_pop: { bg: "#2A0F1F", panel: "#3D1830", ink: "#FFF3E8", mute: "#E8B7A0", accent: "#FF9A3D", accent2: "#FF4D7E" },
  ocean_glow: { bg: "#06182B", panel: "#0C2842", ink: "#EAF6FF", mute: "#8FB8D6", accent: "#3DD6FF", accent2: "#5B7CFF" },
  mono_night: { bg: "#0A0A0A", panel: "#171717", ink: "#F5F5F5", mute: "#9A9A9A", accent: "#FFFFFF", accent2: "#BDBDBD" },
};

export const BOARD_LAYOUTS = ["podium", "list"] as const;
export type BoardLayout = (typeof BOARD_LAYOUTS)[number];
export const BOARD_ROWS = [5, 7, 10] as const;

export const settingsSchema = z.object({
  event_id: z.number().nullish().catch(null),
  cards_on: z.boolean().catch(false),
  cards_name: text,
  hunt_on: z.boolean().catch(false),
  hunt_name: text,
  theme: z.enum(THEMES).catch("neon_arcade"),
  accent: maybeText,
  logo_url: maybeText,
  board_layout: z.enum(BOARD_LAYOUTS).catch("podium"),
  board_rows: z
    .number()
    .catch(10)
    .transform((n) => ((BOARD_ROWS as readonly number[]).includes(n) ? n : 10)),
  ticker_on: z.boolean().catch(true),
  join_box_on: z.boolean().catch(true),
  screen_version: count,
  updated_at: when,
});
export type GameSettings = z.infer<typeof settingsSchema>;

/** What a settings save sends: any part of them. */
export type SettingsPatch = Partial<
  Pick<GameSettings, "cards_on" | "cards_name" | "hunt_on" | "hunt_name" | "theme" | "logo_url" | "board_layout" | "board_rows" | "ticker_on" | "join_box_on">
>;

export const screenSchema = z.object({ url: text });
export type ScreenLink = z.infer<typeof screenSchema>;

// ─── Hero Cards: rules ───────────────────────────────────────────────────

export const TIERS = ["common", "uncommon", "rare", "legendary"] as const;
export type Tier = (typeof TIERS)[number];
export const TIER_LABEL: Record<Tier, string> = { common: "Common", uncommon: "Uncommon", rare: "Rare", legendary: "Legendary" };

export type Shares = Record<Tier, number>;
export const PRESETS = ["easy", "medium", "hard"] as const;
export type PresetKey = (typeof PRESETS)[number];
export const PRESET_LABEL: Record<PresetKey, string> = { easy: "Easy", medium: "Medium", hard: "Hard" };
/** SPEC §4: the share of attendees each tier gets, per difficulty. */
export const PRESET_SHARES: Record<PresetKey, Shares> = {
  easy: { common: 40, uncommon: 30, rare: 20, legendary: 10 },
  medium: { common: 52, uncommon: 30, rare: 13, legendary: 5 },
  hard: { common: 60, uncommon: 28, rare: 10, legendary: 2 },
};

export const FLOOR_MIN = 1;
export const FLOOR_DEFAULT = 4;
/** SPEC §4: the organiser is warned when fewer attendees than this meet Hard. */
export const SMALL_EVENT = 20;

const shareNumber = z.coerce.number().catch(0);

/** The four shares, as the server sends them: an object, or four flat fields. */
const sharesOf = (raw: Record<string, unknown>): Shares => {
  const nested = raw.shares && typeof raw.shares === "object" ? (raw.shares as Record<string, unknown>) : null;
  const pick = (t: Tier) => shareNumber.parse(nested ? nested[t] : raw[`share_${t}`]);
  return { common: pick("common"), uncommon: pick("uncommon"), rare: pick("rare"), legendary: pick("legendary") };
};

export const cardConfigSchema = z
  .record(z.string(), z.unknown())
  .catch({})
  .transform((raw) => ({
    preset: (["easy", "medium", "hard", "custom"] as const).includes(raw.preset as never) ? (raw.preset as PresetKey | "custom") : ("medium" as const),
    shares: sharesOf(raw),
    legendary_floor: z.number().catch(FLOOR_DEFAULT).parse(raw.legendary_floor),
    pin_required: z.boolean().catch(true).parse(raw.pin_required),
    collect_on: z.boolean().catch(true).parse(raw.collect_on),
    two_way: z.boolean().catch(true).parse(raw.two_way),
    show_holders: z.boolean().catch(true).parse(raw.show_holders),
  }));
export type CardConfig = z.infer<typeof cardConfigSchema>;

export type CardConfigPatch = Partial<CardConfig>;

// ─── Hero Cards: live monitor (SPEC §8.1) ────────────────────────────────

export const cardLiveSchema = z.object({
  revealed: count,
  checked_in: count,
  registered: z.number().nullish().catch(null).transform((v) => v ?? null),
  legendary_revealed: count,
  legendary_target: count,
  full_decks: count,
  collects: count,
  tiers: listOf(z.object({ tier: z.enum(TIERS), revealed: count, expected: z.number().catch(0) })),
});
export type CardLive = z.infer<typeof cardLiveSchema>;

// ─── Hero Cards: the designer ────────────────────────────────────────────

export const HEROES_MIN = 4;
export const HEROES_MAX = 20;
export const HERO_NAME_MAX = 18;
export const HERO_TAGLINE_MAX = 60;
export const ART_MIN_W = 900;
export const ART_MIN_H = 1200;
export const ART_MAX_BYTES = 5 * 1024 * 1024;
export const ART_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

/** The built-in emblems a hero can wear until art is uploaded. */
export const EMBLEMS = [
  { key: "bolt", label: "Bolt" },
  { key: "shield", label: "Shield" },
  { key: "star", label: "Star" },
  { key: "flame", label: "Flame" },
  { key: "moon", label: "Moon" },
  { key: "crown", label: "Crown" },
] as const;

export const heroSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  number: count,
  name: text,
  tagline: text,
  tier: z.enum(TIERS).catch("common"),
  art_url: maybeText,
  emblem_key: maybeText,
  holders: count,
  /** How many attendees have revealed this hero: any, and it cannot be deleted or change tier. */
  reveals: z.number().nullish().catch(null).transform((v) => v ?? null),
  revealed: z.boolean().nullish().catch(null).transform((v) => v ?? null),
});
export type Hero = z.infer<typeof heroSchema>;

/** A hero somebody has revealed: its name, tagline and art stay editable, nothing else. */
export const isRevealed = (h: Pick<Hero, "reveals" | "revealed" | "holders">): boolean => h.revealed ?? ((h.reveals ?? h.holders) > 0);

export interface HeroInput {
  name: string;
  tagline: string;
  tier: Tier;
  emblem_key: string | null;
}

export interface HeroProblems {
  name?: string;
  tagline?: string;
  tier?: string;
}

/** What is wrong with a hero as written. */
export function heroProblems(input: HeroInput, original?: Hero | null): HeroProblems {
  const out: HeroProblems = {};
  const name = input.name.trim();
  if (!name) out.name = "Give the hero a name.";
  else if (name.length > HERO_NAME_MAX) out.name = `At most ${HERO_NAME_MAX} characters.`;
  if (input.tagline.trim().length > HERO_TAGLINE_MAX) out.tagline = `At most ${HERO_TAGLINE_MAX} characters.`;
  if (original && isRevealed(original) && input.tier !== original.tier) out.tier = "Someone has revealed this hero, so its tier can't change.";
  return out;
}

/** What is missing from the whole set, said once each. */
export function deckGaps(heroes: readonly Hero[], shares: Shares): string[] {
  const out: string[] = [];
  if (heroes.length < HEROES_MIN) out.push(`Add at least ${HEROES_MIN} heroes (you have ${heroes.length}).`);
  if (heroes.length > HEROES_MAX) out.push(`At most ${HEROES_MAX} heroes (you have ${heroes.length}).`);
  for (const t of TIERS) {
    if (shares[t] > 0 && !heroes.some((h) => h.tier === t)) out.push(`${TIER_LABEL[t]} has a share of ${shares[t]}% but no hero: add one.`);
  }
  return out;
}

export interface ArtSize {
  width: number;
  height: number;
}

/** Why a picture can't be a card's art, or null. The server checks the same again. */
export function artProblem(file: { type: string; size: number }, size: ArtSize | null): string | null {
  if (!(ART_TYPES as readonly string[]).includes(file.type)) return "Use a PNG, JPG or WebP picture.";
  if (file.size > ART_MAX_BYTES) return "The picture is over 5 MB.";
  if (!size) return "That file can't be read as a picture.";
  if (size.width < ART_MIN_W || size.height < ART_MIN_H) return `The picture is ${size.width} × ${size.height}. It needs to be at least ${ART_MIN_W} × ${ART_MIN_H}.`;
  // 3:4 portrait, give or take 2%.
  if (Math.abs(size.width / size.height - 3 / 4) > 0.02 * (3 / 4)) return `The picture is ${size.width} × ${size.height}. Cards are 3:4 portrait, like 900 × 1200.`;
  return null;
}

// ─── Shares ──────────────────────────────────────────────────────────────

/** Hundredths of a percent, so 52 + 30 + 13 + 5 is exactly 100 and 33.33 × 3 is not. */
const hundredths = (n: number) => Math.round(n * 100);

export const sharesTotal = (s: Shares): number => TIERS.reduce((sum, t) => sum + hundredths(s[t]), 0) / 100;
export const sharesTotalOk = (s: Shares): boolean => TIERS.reduce((sum, t) => sum + hundredths(s[t]), 0) === 10000;

export function sharesProblem(s: Shares): string | null {
  for (const t of TIERS) {
    if (!Number.isFinite(s[t]) || s[t] < 0 || s[t] > 100) return `${TIER_LABEL[t]} must be between 0 and 100.`;
  }
  if (!sharesTotalOk(s)) return `The four shares total ${sharesTotal(s)}%. They must total 100%.`;
  return null;
}

/** Which preset these shares are, or "custom". */
export function presetOf(s: Shares): PresetKey | "custom" {
  return PRESETS.find((p) => TIERS.every((t) => hundredths(PRESET_SHARES[p][t]) === hundredths(s[t]))) ?? "custom";
}

export function floorProblem(n: number): string | null {
  return Number.isInteger(n) && n >= FLOOR_MIN ? null : `A whole number, at least ${FLOOR_MIN}.`;
}

/** The warning for a small event on Hard, or null (SPEC §4: warn, don't hide). */
export function smallHardWarning(preset: PresetKey | "custom", attendees: number | null | undefined): string | null {
  if (preset !== "hard" || attendees == null || attendees >= SMALL_EVENT) return null;
  return `Hard is built for bigger crowds: with fewer than ${SMALL_EVENT} attendees, few people will pull a Rare or Legendary. Easy or Medium suits ${attendees === 1 ? "one attendee" : `${attendees} attendees`} better.`;
}

// ─── The Scavenger Hunt ──────────────────────────────────────────────────

export const HUNT_STATUSES = ["draft", "scheduled", "live", "paused", "ended"] as const;
export type HuntStatus = (typeof HUNT_STATUSES)[number];
export const STATUS_LABEL: Record<HuntStatus, string> = { draft: "Not started", scheduled: "Scheduled", live: "Live", paused: "Paused", ended: "Ended" };
export const HUNT_MODES = ["ordered", "free"] as const;
export type HuntMode = (typeof HUNT_MODES)[number];

export const CLUE_MAX = 140;
export const HINT_MAX = 100;
export const LABEL_MAX = 80;
export const ZONE_MAX = 40;
export const POINTS_MIN = 30;
export const POINTS_MAX = 100;
export const DURATION_MIN = 5;
export const DURATION_MAX = 720;

export const huntSchema = z.object({
  status: z.enum(HUNT_STATUSES).catch("draft"),
  starts_at: when,
  ends_at: when,
  duration_minutes: z.number().nullish().catch(null).transform((v) => v ?? null),
  mode: z.enum(HUNT_MODES).catch("ordered"),
  bonus_n: z.number().catch(10),
  bonus_pts: z.number().catch(20),
  hint_cost: z.number().catch(10),
  server_now: when,
});
export type Hunt = z.infer<typeof huntSchema>;

/** The length in minutes: as sent, else the span from start to end. */
export function durationOf(h: Pick<Hunt, "duration_minutes" | "starts_at" | "ends_at">): number | null {
  if (h.duration_minutes != null) return h.duration_minutes;
  if (!h.starts_at || !h.ends_at) return null;
  const m = Math.round((new Date(h.ends_at).getTime() - new Date(h.starts_at).getTime()) / 60_000);
  return Number.isFinite(m) && m > 0 ? m : null;
}

export interface HuntPatch {
  duration_minutes?: number;
  starts_at?: string | null;
  mode?: HuntMode;
  bonus_n?: number;
  bonus_pts?: number;
  hint_cost?: number;
}

export const pointSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  number: count,
  label: text,
  clue: text,
  zone: text,
  base_points: z.number().catch(30),
  hint: text,
  scans: count,
});
export type HuntPoint = z.infer<typeof pointSchema>;

export interface PointInput {
  label: string;
  clue: string;
  zone: string;
  base_points: number;
  hint: string;
}

export interface PointProblems {
  label?: string;
  clue?: string;
  zone?: string;
  base_points?: string;
  hint?: string;
}

export function pointProblems(p: PointInput): PointProblems {
  const out: PointProblems = {};
  if (!p.label.trim()) out.label = "Say where the code is placed.";
  else if (p.label.trim().length > LABEL_MAX) out.label = `At most ${LABEL_MAX} characters.`;
  if (!p.clue.trim()) out.clue = "Write the clue players see.";
  else if (p.clue.trim().length > CLUE_MAX) out.clue = `At most ${CLUE_MAX} characters.`;
  if (p.zone.trim().length > ZONE_MAX) out.zone = `At most ${ZONE_MAX} characters.`;
  if (!Number.isInteger(p.base_points) || p.base_points < POINTS_MIN || p.base_points > POINTS_MAX) out.base_points = `A whole number from ${POINTS_MIN} to ${POINTS_MAX}.`;
  if (p.hint.trim().length > HINT_MAX) out.hint = `At most ${HINT_MAX} characters.`;
  return out;
}

export interface HuntDraft {
  duration: string;
  starts: string;
  mode: HuntMode;
  bonusN: string;
  bonusPts: string;
  hintCost: string;
}

export function huntProblems(d: HuntDraft): Partial<Record<keyof HuntDraft, string>> {
  const out: Partial<Record<keyof HuntDraft, string>> = {};
  const dur = Number(d.duration);
  if (!Number.isInteger(dur) || dur < DURATION_MIN || dur > DURATION_MAX) out.duration = `A whole number of minutes, ${DURATION_MIN} to ${DURATION_MAX}.`;
  for (const [k, label] of [["bonusN", "players"], ["bonusPts", "points"], ["hintCost", "points"]] as const) {
    const n = Number(d[k]);
    if (!Number.isInteger(n) || n < 0 || n > 100) out[k] = `A whole number of ${label}, 0 to 100.`;
  }
  return out;
}

/** The buttons the hunt's state allows, in the order they read. */
export type HuntAction = "start" | "pause" | "resume" | "end" | "extend";
export const ACTION_LABEL: Record<HuntAction, string> = { start: "Start the hunt", pause: "Pause", resume: "Resume", end: "End the hunt", extend: "Extend" };
export function huntActions(status: HuntStatus): HuntAction[] {
  switch (status) {
    case "draft":
    case "scheduled":
      return ["start"];
    case "live":
      return ["pause", "extend", "end"];
    case "paused":
      return ["resume", "extend", "end"];
    case "ended":
      return ["extend"];
  }
}

export const huntLiveSchema = z.object({
  scans: count,
  claims: count,
  players: count,
  points: listOf(z.object({ point_id: z.union([z.string(), z.number()]).transform(String), scans: count })),
  flags: listOf(
    z.object({
      registration_id: z.union([z.string(), z.number()]).transform(String),
      name: text,
      player_no: z.number().nullish().catch(null).transform((v) => v ?? null),
      claims: count,
      zones: z.array(z.string()).catch([]),
      at: when,
    }),
  ),
  recent: listOf(z.object({ name: text, point: text, points: count, at: when })),
});
export type HuntLive = z.infer<typeof huntLiveSchema>;

// ─── Players ─────────────────────────────────────────────────────────────

export const playerSchema = z.object({
  registration_id: z.union([z.string(), z.number()]).transform(String),
  name: text,
  email: maybeText,
  player_no: z.number().nullish().catch(null).transform((v) => v ?? null),
  public: z.boolean().catch(true),
  pin_locked: z.boolean().catch(false),
});
export type Player = z.infer<typeof playerSchema>;

export const playersSchema = z.object({ items: listOf(playerSchema), total: count });
export type PlayerList = z.infer<typeof playersSchema>;

/** The name a board would show: first name and last initial, or "Player #n" for an opt-out. */
export function boardName(p: Pick<Player, "name" | "public" | "player_no">): string {
  if (!p.public) return p.player_no ? `Player #${p.player_no}` : "A player";
  const parts = p.name.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts[0] ?? "A player";
  return `${parts[0]} ${parts[parts.length - 1]![0]!.toUpperCase()}.`;
}
