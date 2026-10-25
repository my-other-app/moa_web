"use client";

import * as React from "react";
import { toast } from "@moa/ui";
import { useObjectUrl } from "@moa/ui/hooks";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * A hidden file input and a way to open it. The picked image is handed
 * to the caller at once and previewed while it uploads. An image only,
 * under 5 MB; anything else is refused with a word.
 *
 * When `onFile` returns a promise (an upload), a rejection takes the preview
 * down again: a picture the server refused must not stay up as if saved.
 */
export function usePick(onFile: (f: File) => void | Promise<unknown>, what: string) {
  const ref = React.useRef<HTMLInputElement>(null);
  const [picked, setPicked] = React.useState<File | null>(null);
  const preview = useObjectUrl(picked);
  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return void toast.error(`Choose an image file for the ${what}`);
    if (file.size > MAX_IMAGE_BYTES) return void toast.error(`The ${what} must be under 5 MB`);
    setPicked(file);
    // The refusal itself is said by the caller (its mutation toasts it); here only the preview goes.
    void Promise.resolve(onFile(file)).catch(() => setPicked((current) => (current === file ? null : current)));
  };
  const input = <input ref={ref} type="file" accept="image/*" onChange={onChange} className="sr-only" tabIndex={-1} aria-hidden="true" />;
  return { open: () => ref.current?.click(), preview, input, clear: () => setPicked(null) };
}
