import type { ArtSize } from "../schemas";

/** A picture's pixel size, read in the browser; null when it can't be read as a picture. */
export function readImageSize(file: Blob): Promise<ArtSize | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    const done = (v: ArtSize | null) => {
      URL.revokeObjectURL(url);
      resolve(v);
    };
    img.onload = () => done(img.naturalWidth && img.naturalHeight ? { width: img.naturalWidth, height: img.naturalHeight } : null);
    img.onerror = () => done(null);
    img.src = url;
  });
}
