"use client";

import * as React from "react";
import { toast } from "@moa/ui";
import { useObjectUrl } from "@moa/ui/hooks";

import { IMAGE_ACCEPT, IMAGE_FORMATS_LABEL, fitImage, isPicture } from "@/lib/images";

/**
 * A hidden file input and a way to open it. The picked image is handed
 * to the caller and previewed while it uploads. A picture only, in any
 * common format: one the API does not keep (an SVG, a HEIC, an AVIF...) is
 * converted first, and one over its budget redrawn smaller (lib/images); one
 * that cannot be sent is refused with a word, sending nothing.
 *
 * When `onFile` returns a promise (an upload), a rejection takes the preview
 * down again: a picture the server refused must not stay up as if saved.
 */
export function usePick(onFile: (f: File) => void | Promise<unknown>, what: string) {
  const ref = React.useRef<HTMLInputElement>(null);
  const [picked, setPicked] = React.useState<File | null>(null);
  // While a big picture is being redrawn smaller: a form that sends it with
  // something else waits for it rather than going without it.
  const [preparing, setPreparing] = React.useState(false);
  const preview = useObjectUrl(picked);
  const onChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!isPicture(file)) return void toast.error(`Choose a picture for the ${what}: ${IMAGE_FORMATS_LABEL}`);
    let ready: File;
    setPreparing(true);
    try {
      ready = await fitImage(file, what);
    } catch (error) {
      return void toast.error(error instanceof Error ? error.message : `The ${what} is too big to send`);
    } finally {
      setPreparing(false);
    }
    setPicked(ready);
    // The refusal itself is said by the caller (its mutation toasts it); here only the preview goes.
    void Promise.resolve(onFile(ready)).catch(() => setPicked((current) => (current === ready ? null : current)));
  };
  const input = <input ref={ref} type="file" accept={IMAGE_ACCEPT} onChange={(e) => void onChange(e)} className="sr-only" tabIndex={-1} aria-hidden="true" />;
  return { open: () => ref.current?.click(), preview, input, preparing, clear: () => setPicked(null) };
}
