import { z } from "zod";

/** The competition on an event, as the console reads it. */
export const STAGES = ["entered", "shortlisted", "finalist"] as const;
export type Stage = (typeof STAGES)[number];
export const STAGE_LABEL: Record<Stage, string> = { entered: "Entered", shortlisted: "Shortlisted", finalist: "Finalist" };

export const requirementSchema = z.object({ key: z.string(), label: z.string(), required: z.boolean() });
export const criterionSchema = z.object({ key: z.string(), label: z.string(), weight: z.number() });

export const settingsSchema = z.object({
  enabled: z.boolean(),
  team_min: z.number(),
  team_max: z.number(),
  teams_locked: z.boolean(),
  submissions_close_at: z.string().nullable(),
  submissions_closed_at: z.string().nullable(),
  submissions_open: z.boolean(),
  requirements: z.array(requirementSchema),
  rubric: z.array(criterionSchema),
  leaderboard_public: z.boolean(),
  shortlist_size: z.number(),
  final_size: z.number(),
  slot_minutes: z.number(),
});

export const trackSchema = z.object({ id: z.number(), name: z.string(), description: z.string().nullable(), sponsor: z.string().nullable(), prize: z.string().nullable(), sort_order: z.number(), teams: z.number() });

export const submissionSchema = z.object({
  fields: z.record(z.string(), z.string()),
  status: z.enum(["nothing", "in_progress", "complete"]),
  missing: z.array(z.string()),
  completed_at: z.string().nullable(),
  updated_at: z.string().nullable(),
});

export const memberSchema = z.object({ registration_id: z.string(), name: z.string(), email: z.string().nullish() });

export const teamSchema = z.object({
  id: z.number(),
  name: z.string(),
  track_id: z.number().nullable(),
  track: z.string().nullable(),
  stage: z.enum(STAGES),
  members: z.array(memberSchema),
  open_spots: z.number(),
  submission: submissionSchema,
  score: z.number().nullable(),
  judges_scored: z.number(),
  created_at: z.string(),
});

export const seekerSchema = z.object({ registration_id: z.string(), name: z.string(), skills: z.array(z.string()), note: z.string().nullable() });
export const judgeSchema = z.object({ id: z.number(), name: z.string(), email: z.string().nullable(), sort_order: z.number(), scored: z.number() });
export const scoreSchema = z.object({ judge_id: z.number(), team_id: z.number(), scores: z.record(z.string(), z.number()), note: z.string().nullable(), total: z.number().nullable() });
export const boardRowSchema = z.object({ rank: z.number().nullable(), team_id: z.number(), name: z.string(), track: z.string().nullable(), stage: z.enum(STAGES), score: z.number().nullable(), judges_scored: z.number(), judges_total: z.number() });
export const slotSchema = z.object({ id: z.number(), starts_at: z.string(), minutes: z.number(), team_id: z.number().nullable(), team: z.string().nullable() });
export const mentorSchema = z.object({ id: z.number(), name: z.string(), topic: z.string().nullable(), sort_order: z.number(), slots: z.array(slotSchema) });

export const competitionSchema = z.object({
  event_id: z.number(),
  settings: settingsSchema,
  figures: z.object({ teams: z.number(), people: z.number(), seekers: z.number(), submitted: z.number(), judges: z.number(), scored_pairs: z.number() }),
  tracks: z.array(trackSchema),
  teams: z.array(teamSchema),
  seekers: z.array(seekerSchema),
  judges: z.array(judgeSchema),
  scores: z.array(scoreSchema),
  board: z.array(boardRowSchema),
  rounds: z.object({ entered: z.array(boardRowSchema), shortlisted: z.array(boardRowSchema), finalists: z.array(boardRowSchema) }),
  mentors: z.array(mentorSchema),
  generated_at: z.string(),
});

export type Competition = z.infer<typeof competitionSchema>;
export type CompetitionSettings = z.infer<typeof settingsSchema>;
export type Track = z.infer<typeof trackSchema>;
export type Team = z.infer<typeof teamSchema>;
export type Seeker = z.infer<typeof seekerSchema>;
export type Judge = z.infer<typeof judgeSchema>;
export type Score = z.infer<typeof scoreSchema>;
export type BoardRow = z.infer<typeof boardRowSchema>;
export type Mentor = z.infer<typeof mentorSchema>;
export type Slot = z.infer<typeof slotSchema>;
export type Requirement = z.infer<typeof requirementSchema>;
export type Criterion = z.infer<typeof criterionSchema>;

export type SettingsPatch = Partial<{
  enabled: boolean;
  team_min: number;
  team_max: number;
  teams_locked: boolean;
  submissions_close_at: string | null;
  requirements: Requirement[];
  rubric: Criterion[];
  leaderboard_public: boolean;
  shortlist_size: number;
  final_size: number;
  slot_minutes: number;
}>;

export const VIEWS = ["tracks", "teams", "submissions", "judging", "rounds", "leaderboard", "hours"] as const;
export type View = (typeof VIEWS)[number];
export const VIEW_LABEL: Record<View, string> = { tracks: "Tracks", teams: "Teams", submissions: "Submissions", judging: "Judging", rounds: "Rounds", leaderboard: "Leaderboard", hours: "Office hours" };

/** A judge's total for a team on the rubric, out of a hundred; null until every criterion is scored. */
export function totalOf(rubric: Criterion[], scores: Record<string, number>): number | null {
  const weight = rubric.reduce((n, c) => n + c.weight, 0);
  if (!rubric.length || !weight) return null;
  if (rubric.some((c) => scores[c.key] === undefined)) return null;
  return Math.round((rubric.reduce((n, c) => n + (c.weight * (scores[c.key] ?? 0)) / 10, 0) / weight) * 1000) / 10;
}
