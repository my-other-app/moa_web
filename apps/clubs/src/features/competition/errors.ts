import { ApiError } from "@moa/api";
import { toast } from "@moa/ui";
import { z } from "zod";

import { toastError } from "@/features/plan/errors";

/**
 * The competition's own refusals, by code.
 *
 * TIE_AT_CUT (409, from rounds/advance): two or more teams level on the
 * score at the last place. Nothing moved; `errors.tied` names them and
 * `errors.places_left` says how many places they are after. The organiser
 * breaks the tie by moving one by hand, then advances again.
 *
 * TEAM_TOO_SMALL (409): a team under the competition's minimum cannot
 * submit. Only a guest's own submission (PUT /competition/me/submission)
 * says it today; the console words it if any write ever does.
 */
export const TIE_AT_CUT = "TIE_AT_CUT";
export const TEAM_TOO_SMALL = "TEAM_TOO_SMALL";

const tieSchema = z.object({
  tied: z.array(z.object({ team_id: z.number(), name: z.string(), score: z.number().nullish() })).min(1),
  places_left: z.number().int().min(1),
  score: z.number().nullish(),
});
export type TieAtCut = z.infer<typeof tieSchema>;

/** The tie a refused advance describes, or null when it is some other refusal. */
export function tieAtCut(error: unknown): TieAtCut | null {
  if (!(error instanceof ApiError) || error.status !== 409 || error.errorCode !== TIE_AT_CUT) return null;
  const parsed = tieSchema.safeParse(error.fieldErrors ?? {});
  return parsed.success ? parsed.data : null;
}

/** "Byte Benders and Tiny Tensors", "A, B and C". */
export const namesOf = (names: string[]) => (names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`);

/**
 * A competition write's onError: a tie is the rounds panel's to show (with
 * the teams to move), a team too small for a submission gets its own words,
 * and anything else the usual toast.
 */
export function competitionError(error: unknown): void {
  if (tieAtCut(error)) return;
  if (error instanceof ApiError && error.errorCode === TEAM_TOO_SMALL) {
    toast.error("Too few people on the team to submit", { description: error.message || "Add people to the team first." });
    return;
  }
  toastError(error);
}
