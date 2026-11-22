import { api } from "@moa/app-kit";
import { GATEWAY_PREFIX } from "@moa/auth";
import { z } from "zod";

import {
  cardConfigSchema,
  cardLiveSchema,
  heroSchema,
  huntLiveSchema,
  huntSchema,
  playersSchema,
  pointSchema,
  screenSchema,
  settingsSchema,
  type CardConfigPatch,
  type GameKind,
  type HeroInput,
  type HuntAction,
  type HuntPatch,
  type PointInput,
  type SettingsPatch,
} from "./schemas";

const base = (eventId: number) => `/api/v1/events/${eventId}/games`;
const id = encodeURIComponent;
const heroes = z.array(z.unknown()).catch([]);
const listOf = <T extends z.ZodTypeAny>(item: T, rows: unknown) =>
  heroes.parse(rows).flatMap((r): z.infer<T>[] => {
    const p = item.safeParse(r);
    return p.success ? [p.data] : [];
  });
/** A list as a bare array, or under `items`. */
const rowsOf = (raw: unknown) => (Array.isArray(raw) ? raw : raw && typeof raw === "object" && "items" in raw ? (raw as { items: unknown }).items : []);

// ─── Settings, look and screens ──────────────────────────────────────────

export async function fetchSettings(eventId: number) {
  return settingsSchema.parse(await api.get<unknown>(`${base(eventId)}/settings`));
}

export async function saveSettings(eventId: number, patch: SettingsPatch) {
  return settingsSchema.parse(await api.patch<unknown>(`${base(eventId)}/settings`, patch));
}

/** The logo (square): multipart, answered with the settings. */
export async function uploadLogo(eventId: number, file: File) {
  const form = new FormData();
  form.append("logo", file);
  return settingsSchema.parse(await api.post<unknown>(`${base(eventId)}/settings/logo`, form));
}

export async function fetchScreen(eventId: number) {
  return screenSchema.parse(await api.get<unknown>(`${base(eventId)}/screen`));
}

/** A new venue-screen address: the old one stops working at once. */
export async function rotateScreen(eventId: number) {
  return screenSchema.parse(await api.post<unknown>(`${base(eventId)}/screen/rotate`, {}));
}

// ─── Hero Cards ──────────────────────────────────────────────────────────

export async function fetchCardConfig(eventId: number) {
  return cardConfigSchema.parse(await api.get<unknown>(`${base(eventId)}/cards/config`));
}

export async function saveCardConfig(eventId: number, patch: CardConfigPatch) {
  return cardConfigSchema.parse(await api.patch<unknown>(`${base(eventId)}/cards/config`, patch));
}

export async function fetchCardLive(eventId: number) {
  return cardLiveSchema.parse(await api.get<unknown>(`${base(eventId)}/cards/live`));
}

export async function fetchHeroes(eventId: number) {
  return listOf(heroSchema, rowsOf(await api.get<unknown>(`${base(eventId)}/cards/heroes`)));
}

export async function createHero(eventId: number, body: HeroInput) {
  return heroSchema.parse(await api.post<unknown>(`${base(eventId)}/cards/heroes`, body));
}

export async function updateHero(eventId: number, heroId: string, body: Partial<HeroInput>) {
  return heroSchema.parse(await api.patch<unknown>(`${base(eventId)}/cards/heroes/${id(heroId)}`, body));
}

export async function deleteHero(eventId: number, heroId: string) {
  await api.del<unknown>(`${base(eventId)}/cards/heroes/${id(heroId)}`);
}

export async function orderHeroes(eventId: number, ids: string[]) {
  return listOf(heroSchema, rowsOf(await api.put<unknown>(`${base(eventId)}/cards/heroes/order`, { ids })));
}

/** A hero's picture: multipart; the server checks type, size and shape again. */
export async function uploadHeroArt(eventId: number, heroId: string, file: File) {
  const form = new FormData();
  form.append("file", file);
  return heroSchema.parse(await api.post<unknown>(`${base(eventId)}/cards/heroes/${id(heroId)}/art`, form));
}

// ─── The Scavenger Hunt ──────────────────────────────────────────────────

export async function fetchHunt(eventId: number) {
  return huntSchema.parse(await api.get<unknown>(`${base(eventId)}/hunt`));
}

export async function saveHunt(eventId: number, patch: HuntPatch) {
  return huntSchema.parse(await api.put<unknown>(`${base(eventId)}/hunt`, patch));
}

export async function huntAction(eventId: number, action: HuntAction, minutes?: number) {
  return huntSchema.parse(await api.post<unknown>(`${base(eventId)}/hunt/${action}`, action === "extend" ? { minutes } : {}));
}

export async function fetchPoints(eventId: number) {
  return listOf(pointSchema, rowsOf(await api.get<unknown>(`${base(eventId)}/hunt/points`)));
}

export async function createPoint(eventId: number, body: PointInput) {
  return pointSchema.parse(await api.post<unknown>(`${base(eventId)}/hunt/points`, body));
}

export async function updatePoint(eventId: number, pointId: string, body: Partial<PointInput>) {
  return pointSchema.parse(await api.patch<unknown>(`${base(eventId)}/hunt/points/${id(pointId)}`, body));
}

export async function deletePoint(eventId: number, pointId: string) {
  await api.del<unknown>(`${base(eventId)}/hunt/points/${id(pointId)}`);
}

export async function fetchHuntLive(eventId: number) {
  return huntLiveSchema.parse(await api.get<unknown>(`${base(eventId)}/hunt/live`));
}

/** One QR per page with its label and number, never the clue. */
export const pointsPdfUrl = (eventId: number) => `${GATEWAY_PREFIX}${base(eventId)}/hunt/points.pdf`;

// ─── Players ─────────────────────────────────────────────────────────────

export async function fetchPlayers(eventId: number, q: { q: string; optedOut: boolean }) {
  return playersSchema.parse(await api.get<unknown>(`${base(eventId)}/players`, { query: { q: q.q || undefined, public: q.optedOut ? "false" : undefined, limit: 25 } }));
}

export async function resetPin(eventId: number, registrationId: string) {
  await api.post<unknown>(`${base(eventId)}/players/${id(registrationId)}/reset-pin`, {});
}

/** A board's top 20, or everyone with `all`. */
export const exportUrl = (eventId: number, game: GameKind, all: boolean) => `${GATEWAY_PREFIX}${base(eventId)}/export.csv?game=${game}${all ? "&all=1" : ""}`;
