import { ApiError } from "@moa/api";
import { toast } from "@moa/ui";

import { isPlanLockError } from "@/features/plan/errors";

import { ART_MAX_BYTES, ART_MIN_H, ART_MIN_W, HEROES_MAX, HEROES_MIN } from "../schemas";

/**
 * What the API's games refusals (`error_code`, with details in `errors`) say
 * in plain words. A code not listed here falls back to the server's own message.
 */
export function gameErrorWords(code: string | null, details: unknown): string | null {
  const d = details && typeof details === "object" && !Array.isArray(details) ? (details as Record<string, unknown>) : {};
  switch (code) {
    case "HERO_REVEALED":
      return "Someone has already revealed this hero, so its tier can't change and it can't be deleted. You can still edit its name, tagline and art.";
    case "MIN_HEROES":
      return `A deck needs at least ${HEROES_MIN} heroes. Add more before removing this one.`;
    case "MAX_HEROES":
      return `A deck can have at most ${HEROES_MAX} heroes.`;
    case "ART_TOO_SMALL":
      return `That picture is too small. Cards need at least ${ART_MIN_W} × ${ART_MIN_H} pixels.`;
    case "ART_SHAPE":
      return "That picture is the wrong shape. Cards are 3:4 portrait, like 900 × 1200.";
    case "ART_TOO_BIG":
      return `That picture is over ${ART_MAX_BYTES / (1024 * 1024)} MB. Choose a smaller file.`;
    case "ART_NOT_IMAGE":
      return "That file can't be read as a picture.";
    case "ART_FORMAT":
      return "Use a PNG, JPG or WebP picture.";
    case "HUNT_STARTED":
      return "The hunt has started, so QR points can't be added or removed now.";
    case "HUNT_HAS_CLAIMS":
      return "Players have already found codes, so the clue order can't change now.";
    case "NO_POINTS":
      return "Add at least one QR point before starting the hunt.";
    case "SHARES_NOT_100":
      return typeof d.total === "number" ? `The four shares total ${d.total}%. They must total 100%.` : "The four shares must total 100%.";
    case "TIER_NEEDS_HERO":
      return "A tier with a share needs at least one hero. Add a hero for it first, or set its share to 0.";
    default:
      return null;
  }
}

/** The words to show for a failed games call: our plain wording for a known code, else the server's message. */
export function errorText(err: unknown, fallback = "Something went wrong."): string {
  if (err instanceof ApiError) {
    const words = gameErrorWords(err.errorCode, err.fieldErrors);
    if (words) return words;
  }
  return err instanceof Error && err.message ? err.message : fallback;
}

/** A mutation's `onError`: a plan refusal is the upgrade dialog's to answer; anything else is a toast in plain words. */
export function gameToastError(error: unknown): void {
  if (isPlanLockError(error)) return;
  toast.error(errorText(error, "That did not go through. Try again."));
}
