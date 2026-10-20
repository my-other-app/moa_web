/**
 * A poster photo from a phone is often 5 to 12 MB. The gateway runs as a
 * Vercel function, which refuses a request body over 4.5 MB before it
 * reaches the API, so a large image is redrawn smaller here (its longest
 * side at most 2,400 px, as a JPEG) — plenty for reading the words on it.
 * A PDF is sent as it is. Anything that cannot be redrawn (no canvas, an
 * image the browser cannot decode) is sent unchanged and the server says.
 */
export const SEND_MAX_BYTES = 4 * 1024 * 1024;
const LONGEST_SIDE = 2400;

export async function shrinkForUpload(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size <= SEND_MAX_BYTES) return file;
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, LONGEST_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "poster"}.jpg`, { type: "image/jpeg" });
  } catch {
    return file;
  }
}
