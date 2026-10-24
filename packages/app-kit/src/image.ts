import { z } from "zod";

/**
 * The API's S3ImageField, which serialises to a map of rendered variations.
 * Kept permissive (`passthrough`) because the variation set differs per field
 * -- avatars render different sizes from club logos -- and a missing key must
 * not fail a whole list parse.
 */
export const imageFieldSchema = z
  .object({
    original: z.string().nullish(),
    thumbnail: z.string().nullish(),
    medium: z.string().nullish(),
    large: z.string().nullish(),
  })
  .passthrough()
  .nullish();

export type ImageField = z.infer<typeof imageFieldSchema>;

/** Best available URL for display at the given preference order. */
export function pickImage(
  image: ImageField,
  order: Array<"thumbnail" | "medium" | "large" | "original"> = [
    "medium",
    "thumbnail",
    "large",
    "original",
  ]
): string | null {
  if (!image) return null;
  for (const key of order) {
    const value = image[key];
    if (typeof value === "string" && value) return value;
  }
  return null;
}

/**
 * A picture that must never fail the row it is on: anything malformed reads
 * as no picture. A list that refused to render over a bad thumbnail would
 * be a worse bug than a missing face.
 */
export const pictureSchema = imageFieldSchema.catch(null);

/**
 * A person's two pictures under `profile`, as the user endpoints send them:
 * the photo they uploaded and the preset avatar they picked (`{id, name,
 * image}`). Both can be set; the photo wins (PersonAvatar applies that).
 * Only the pictures are typed -- the rest of a profile passes through.
 */
export const profilePicturesSchema = z
  .object({
    profile_pic: pictureSchema,
    avatar: z.object({ image: pictureSchema }).passthrough().nullish().catch(null),
  })
  .passthrough()
  .nullish()
  .catch(null);

export type ProfilePictures = z.infer<typeof profilePicturesSchema>;

/** Minimal nested reference returned inside event rows. */
export const namedRefSchema = z
  .object({ id: z.coerce.number().nullish(), name: z.string().nullish() })
  .passthrough()
  .nullish();
