import { GATEWAY_BODY_MAX, shrinkImage } from "@/lib/images";

/**
 * A poster photo from a phone is often 5 to 12 MB. The gateway runs as a
 * Vercel function, which refuses a request body over 4.5 MB before it
 * reaches the API, so a large image is redrawn smaller here (its longest
 * side at most 2,400 px, then less until it fits; lib/images) — plenty for
 * reading the words on it. A PDF is sent as it is. Anything that cannot be
 * redrawn (no canvas, an image the browser cannot decode) is sent unchanged
 * and the server says.
 */
export const SEND_MAX_BYTES = GATEWAY_BODY_MAX;

export function shrinkForUpload(file: File): Promise<File> {
  return shrinkImage(file, { maxBytes: SEND_MAX_BYTES, longestSide: 2400 });
}
