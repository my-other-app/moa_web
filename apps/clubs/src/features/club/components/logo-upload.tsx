"use client";

import * as React from "react";
import Image from "next/image";
import { Loader2Icon } from "lucide-react";
import { toast } from "@moa/ui";
import { cn } from "@moa/ui";
import { pressable } from "@moa/ui/motion";
import { useObjectUrl } from "@moa/ui/hooks";

import { Icon } from "@/components/icon";
import { useUpdateClubLogo } from "../queries";

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Logo control from the design (node 368:322): a 100px circle with the
 * image-plus glyph and a two-line caption.
 *
 * The logo has its own endpoint (PUT /clubs/logo), so it uploads as soon as a
 * file is chosen instead of waiting for the form submit. That keeps the two
 * concerns separate -- a failed logo upload does not block saving the rest of
 * the profile, and vice versa.
 */
export function LogoUpload({ currentLogo }: { currentLogo: string | null }) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const upload = useUpdateClubLogo();
  const [picked, setPicked] = React.useState<File | null>(null);
  // Shared hook: creates the blob URL and revokes the previous one, so a
  // repeated pick cannot leak blobs for the life of the page.
  const preview = useObjectUrl(picked);

  function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Reset first: picking the same file twice otherwise fires no change event.
    event.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Choose an image file");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Logo must be under 5 MB");
      return;
    }

    setPicked(file);
    upload.mutate(file);
  }

  const shown = preview ?? currentLogo;

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={upload.isPending}
        aria-label={shown ? "Change club logo" : "Add club logo"}
        className={cn(
          "relative grid size-[100px] place-items-center overflow-hidden rounded-full border border-border bg-muted transition-colors",
          "focus-visible:ring-ring/60 focus-visible:outline-none focus-visible:ring-[3px]",
          "hover:border-foreground/40 disabled:opacity-60",
          pressable
        )}
      >
        {shown ? (
          <Image
            src={shown}
            alt=""
            fill
            sizes="100px"
            className="object-cover"
            unoptimized
          />
        ) : (
          <Icon name="image-plus" size={48} className="text-muted-foreground" />
        )}

        {upload.isPending ? (
          <span className="absolute inset-0 grid place-items-center bg-black/40 text-white">
            <Loader2Icon className="size-6 animate-spin" />
          </span>
        ) : null}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={onPick}
        className="sr-only"
        tabIndex={-1}
      />

      <p className="text-center text-xs text-foreground">
        {shown ? "Change Club Logo" : "Add Club Logo"}
        <br />
        <span className="text-muted-foreground">(1:1 ratio, under 5 MB)</span>
      </p>
    </div>
  );
}
