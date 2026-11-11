import { saveBlob } from "@moa/app-kit";
import { toast } from "@moa/ui";

import { PLATFORM_LABEL, type Platform } from "./schemas";

/** The text on the clipboard; false when the browser refused (the caller then shows it to select by hand). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

/**
 * The poster saved as a file. Fetched and saved as a blob so it downloads
 * rather than opening; where the CDN won't let the page read it (CORS), it
 * opens in a new tab to save from there.
 */
export async function downloadImage(url: string, basename: string): Promise<"saved" | "opened"> {
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) throw new Error(String(res.status));
    const blob = await res.blob();
    const ext = EXT[blob.type] ?? (url.split("?")[0]!.split(".").pop() || "jpg");
    saveBlob(blob, `${basename}.${ext}`);
    return "saved";
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
    return "opened";
  }
}

/** A name for a downloaded poster: "devfest-2026-instagram". */
export function posterName(event: { slug?: string | null; name?: string | null; id?: number }, platform: Platform): string {
  const base = (event.slug || event.name || `event-${event.id ?? ""}`)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return `${base || "event"}-${platform.replace("_", "-")}`;
}

/**
 * Share manually: the text on the clipboard and the right poster saved, so
 * the club posts it in the platform's own app. Says what happened in one toast.
 */
export async function shareManually({ platform, text, imageUrl, filename }: { platform: Platform; text: string; imageUrl: string | null; filename: string }) {
  const copied = await copyText(text);
  const image = imageUrl ? await downloadImage(imageUrl, filename) : null;
  const name = PLATFORM_LABEL[platform];
  const parts = [copied ? "Text copied" : "Couldn't copy the text — select it and copy by hand", image === "saved" ? "poster downloaded" : image === "opened" ? "poster opened in a new tab to save" : null].filter(Boolean);
  const say = `${parts.join(", ")}. Paste it in ${name}${platform === "instagram" ? " with the poster" : ""}.`;
  if (copied) toast.success(say);
  else toast.warning(say);
  return { copied, image };
}
