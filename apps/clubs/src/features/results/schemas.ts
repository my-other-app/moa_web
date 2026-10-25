import { z } from "zod";

/** The three placings the dashboard gives. The server takes them per guest, or per competition team. */
export const PLACES = [1, 2, 3] as const;
export type Place = (typeof PLACES)[number];
export const PLACE_LABEL: Record<number, string> = { 1: "1st", 2: "2nd", 3: "3rd" };
export const PLACE_NAME: Record<number, string> = { 1: "First", 2: "Second", 3: "Third" };

const positionSchema = z.number().int().nullable().catch(null);

export const resultTeamSchema = z.object({
  id: z.number(),
  name: z.string(),
  position: positionSchema,
  members: z.array(z.object({ registration_id: z.string(), full_name: z.string().catch("") })).default([]),
});
export type ResultTeam = z.infer<typeof resultTeamSchema>;

export const resultTrackSchema = z.object({
  id: z.number().nullable(),
  name: z.string(),
  teams: z.array(resultTeamSchema).default([]),
});
export type ResultTrack = z.infer<typeof resultTrackSchema>;

export const winnerSchema = z.object({
  registration_id: z.string(),
  ticket_id: z.string().nullable().catch(null),
  full_name: z.string().catch(""),
  email: z.string().nullable().catch(null),
  position: z.number().int(),
  team_id: z.number().nullable().catch(null),
  team_name: z.string().nullable().catch(null),
  track_id: z.number().nullable().catch(null),
  track_name: z.string().nullable().catch(null),
});
export type Winner = z.infer<typeof winnerSchema>;

/** GET /events/{id}/results. */
export const resultsSchema = z.object({
  event_id: z.number(),
  has_competition: z.boolean().catch(false),
  tracks: z.array(resultTrackSchema).default([]),
  winners: z.array(winnerSchema).default([]),
});
export type Results = z.infer<typeof resultsSchema>;
