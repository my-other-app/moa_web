import { imageFieldSchema } from "@moa/app-kit";
import { z } from "zod";

/** The most people an event page lists as its organising team; the server refuses more. */
export const MAX_ORGANISERS = 24;
/** The same cap the club team's own role field has. */
export const ROLE_MAX = 80;

/**
 * GET /events/{id}/organisers: the club team members the event page lists
 * as its organising team, in display order. `role` is this event's role;
 * `club_role` is what they are on the club. The photo is tolerated as a URL
 * or an image object, since the panel draws the club team's own photos.
 */
export const organiserSchema = z.object({
  member_id: z.coerce.number(),
  name: z.string(),
  club_role: z.string().nullish(),
  role: z.string().nullish(),
  photo: z.union([z.string(), imageFieldSchema]).nullish().catch(null),
});
export type Organiser = z.infer<typeof organiserSchema>;

export const organisersSchema = z.array(organiserSchema);

/** One entry of PUT /events/{id}/organisers; the array's order is the page's. */
export interface OrganiserInput {
  member_id: number;
  role: string | null;
}

/**
 * What the panel edits: who is picked, in order, and the event role typed
 * for anyone. A role typed for someone then unticked is kept, so ticking
 * them again does not lose it; only the picked go to the server.
 */
export interface OrganiserDraft {
  picked: number[];
  roles: Record<number, string>;
}

/**
 * The saved selection as a draft, keeping only people still on the club
 * team: the server would refuse anyone else with a 422.
 */
export function draftFrom(saved: Organiser[], teamIds: number[]): OrganiserDraft {
  const known = new Set(teamIds);
  const kept = saved.filter((o) => known.has(o.member_id));
  return {
    picked: kept.map((o) => o.member_id),
    roles: Object.fromEntries(kept.map((o) => [o.member_id, o.role ?? ""])),
  };
}

/** The draft as the PUT body's members; an empty role means "use their club role". */
export function toOrganiserInput(draft: OrganiserDraft): OrganiserInput[] {
  return draft.picked.map((id) => ({
    member_id: id,
    role: draft.roles[id]?.trim() || null,
  }));
}

/** Whether saving `a` would change what `b` saved: the picked, their order, their roles. */
export function sameOrganisers(a: OrganiserDraft, b: OrganiserDraft) {
  const x = toOrganiserInput(a);
  const y = toOrganiserInput(b);
  return x.length === y.length && x.every((o, i) => o.member_id === y[i]!.member_id && o.role === y[i]!.role);
}

/** `list` with the item at `from` moved to `to`; out of range is a no-op. */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length || from === to) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}
