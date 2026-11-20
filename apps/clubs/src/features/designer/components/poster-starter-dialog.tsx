"use client";

import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@moa/ui";
import { CopyIcon, LayoutTemplateIcon } from "lucide-react";
import * as React from "react";

import type { StarterMeta } from "../schemas";
import { Busy } from "./fields";

/**
 * A poster starter picked in the gallery. A poster design is three layouts
 * (square, portrait, story), so the starter can be used for all of them at
 * once, saved now; or a copy of the format on the board opened, unsaved,
 * the way every other kind's starters open.
 */
export const PosterStarterDialog = ({
  starter,
  variantLabel,
  format,
  busy,
  onClose,
  onApply,
  onCopy,
}: {
  starter: StarterMeta | null;
  variantLabel: string;
  /** The format on the board, as a word: "Square". */
  format: string;
  busy: boolean;
  onClose: () => void;
  onApply: () => void | Promise<void>;
  onCopy: () => void;
}) => (
  <Dialog open={starter !== null} onOpenChange={(o) => !o && !busy && onClose()}>
    <DialogContent className="sm:max-w-[520px]">
      <DialogHeader>
        <DialogTitle>Use {starter?.name ?? "this design"} for {variantLabel}?</DialogTitle>
        <DialogDescription>
          Using it saves its square, portrait and story layouts as this design now, replacing any saved here; guests&apos; posters follow it at once. Or open a
          copy of its {format.toLowerCase()} layout to change it first; nothing is saved until you save.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="ghost" disabled={busy} onClick={onCopy}>
          <CopyIcon /> Open a copy of the {format.toLowerCase()} layout
        </Button>
        <Button disabled={busy} onClick={() => void onApply()}>
          {busy ? <Busy on /> : <LayoutTemplateIcon />} Use it for every format
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
