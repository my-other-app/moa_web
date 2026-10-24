import { z } from "zod";
import { pictureSchema } from "@moa/app-kit";

/**
 * Attendee reviews for one event.
 *
 * The endpoint hand-serialises its rows and returns a pagination envelope with
 * `total` and `next` both null, so neither can be relied on: how many more
 * there are is inferred from whether a full page came back.
 */
export const reviewSchema = z.object({
  id: z.string(),
  rating: z.number(),
  review: z.string().nullish(),
  created_at: z.string().nullish(),
  user: z
    .object({
      id: z.coerce.number().nullish(),
      username: z.string().nullish(),
      full_name: z.string().nullish(),
      profile: z
        .object({
          full_name: z.string().nullish(),
          /* The avatar they picked: here the image itself, not `{id, name, image}`. */
          avatar: pictureSchema,
          /* The photo they uploaded, which wins over the avatar. */
          profile_pic: pictureSchema,
        })
        .nullish(),
    })
    .nullish(),
});

export const reviewPageSchema = z.object({
  items: z.array(reviewSchema).default([]),
  limit: z.number().nullish(),
  offset: z.number().nullish(),
  total: z.number().nullish(),
});

export type Review = z.infer<typeof reviewSchema>;
export type ReviewPage = z.infer<typeof reviewPageSchema>;

/** Counts per whole star, 5 down to 1. */
export function ratingDistribution(reviews: readonly Review[]): number[] {
  const buckets = [0, 0, 0, 0, 0];
  for (const review of reviews) {
    // Round rather than floor: a 4.5 belongs with the 5s, and flooring would
    // also push a stray 0 out of the array entirely.
    const star = Math.min(5, Math.max(1, Math.round(review.rating)));
    buckets[5 - star] = (buckets[5 - star] ?? 0) + 1;
  }
  return buckets;
}
