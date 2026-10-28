import { GATEWAY_BODY_MAX, isPicture, normaliseImage, shrinkImage } from "@/lib/images";

/**
 * A poster photo from a phone is often 5 to 12 MB, and may be a HEIC, an
 * AVIF or an SVG. A picture is converted when the API does not keep its
 * format, then redrawn smaller when it is over budget (its longest side at
 * most 2,400 px, then less until it fits; lib/images) — plenty for reading
 * the words on it. A PDF is sent as it is. Anything that cannot be redrawn (no
 * canvas, a HEIC the browser cannot open) is sent unchanged: the API converts
 * what it can and says what it cannot.
 */
export const SEND_MAX_BYTES = GATEWAY_BODY_MAX;

export async function shrinkForUpload(file: File): Promise<File> {
  if (!isPicture(file)) return file;
  return shrinkImage(await normaliseImage(file), { maxBytes: SEND_MAX_BYTES, longestSide: 2400 });
}
