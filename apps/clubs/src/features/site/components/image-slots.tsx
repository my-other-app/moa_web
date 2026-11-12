"use client";

import * as React from "react";
import { CheckIcon, ImageIcon, SparklesIcon, XIcon } from "lucide-react";
import { CardLabel, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, FigurePanel, IconButton, cn } from "@moa/ui";

import { galleryIndex, sizeHint, slotFills, type SlotFill } from "../layout";
import type { Layout, SiteImage, SiteTemplate, SlotMeta } from "../schemas";

/**
 * The places the chosen template has for photos, each with the size it is
 * drawn at and a picker from the library. Gallery places left empty take
 * the next library photos in order (shown as Auto); the others stay as the
 * template draws them empty. Events bring their own posters; the team,
 * speakers and sponsors their own photos and logos, from Club profile and
 * Events.
 */

function Picker({ slot, images, current, onPick, onClose }: { slot: SlotMeta; images: SiteImage[]; current: number | null; onPick: (id: number | null) => void; onClose: () => void }) {
  const hint = sizeHint(slot);
  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Photo for {slot.label}</DialogTitle>
          <DialogDescription>{hint ? `Drawn at ${hint} px; a photo of another shape is cropped to fit.` : "Pick one from the library."}</DialogDescription>
        </DialogHeader>
        {images.length ? (
          <ul className="grid max-h-[60vh] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4" aria-label="Library photos">
            {images.map((img, i) => {
              const on = img.id === current;
              return (
                <li key={img.id}>
                  <button
                    type="button"
                    aria-pressed={on}
                    aria-label={`Photo ${i + 1}${img.alt ? `: ${img.alt}` : ""}`}
                    onClick={() => onPick(img.id)}
                    className={cn("relative block w-full overflow-hidden rounded-lg border-2 p-0", on ? "border-brand" : "hover:border-line border-transparent")}
                  >
                    {img.url ? (
                      // eslint-disable-next-line @next/next/no-img-element -- the library's own small variant
                      <img src={img.url} srcSet={img.srcset ?? undefined} sizes="140px" alt="" className="aspect-[4/3] w-full object-cover" />
                    ) : (
                      <span className="bg-sunken block aspect-[4/3] w-full" />
                    )}
                    {on ? (
                      <span className="bg-brand text-brand-foreground absolute top-1 right-1 grid size-5 place-items-center rounded-full">
                        <CheckIcon className="size-3" />
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-ink-3 text-[12.5px]">The library is empty. Add photos above, then choose one here.</p>
        )}
        <div className="flex justify-end gap-2">
          {current !== null ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onPick(null)}>
              Leave empty
            </button>
          ) : null}
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Close
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Thumb({ fill }: { fill: SlotFill | undefined }) {
  const img = fill?.image;
  return (
    <span className="bg-sunken border-line-soft relative grid h-12 w-16 shrink-0 place-items-center overflow-hidden rounded-md border">
      {img?.url ? (
        // eslint-disable-next-line @next/next/no-img-element -- the library's own small variant
        <img src={img.url} alt="" className={cn("h-full w-full object-cover", fill?.auto && "opacity-70")} />
      ) : (
        <ImageIcon className="text-ink-3 size-4" aria-hidden="true" />
      )}
    </span>
  );
}

export function ImageSlots({ template, layout, images, onChange }: { template: SiteTemplate | undefined; layout: Layout; images: SiteImage[]; onChange: (next: Layout) => void }) {
  const [open, setOpen] = React.useState<SlotMeta | null>(null);
  const slots = template?.slots ?? [];
  const fills = slotFills(template, layout, images);
  const position = new Map(images.map((img, i) => [img.id, i + 1]));
  const hasGallery = slots.some((s) => galleryIndex(s.key) !== null);

  const assign = (key: string, id: number | null) => {
    const next = { ...layout.slots };
    if (id === null) delete next[key];
    else next[key] = id;
    onChange({ ...layout, slots: next });
  };

  if (!slots.length) {
    return (
      <FigurePanel className="p-4">
        <CardLabel>Where photos go</CardLabel>
        <p className="text-ink-3 mt-2 text-[12px]">{template?.name ?? "This template"} has no places for library photos: it shows your events&apos; posters and your people&apos;s photos.</p>
      </FigurePanel>
    );
  }

  return (
    <FigurePanel className="p-4">
      <CardLabel>Where photos go</CardLabel>
      <p className="text-ink-3 mt-2 text-[11.5px]">
        The places {template?.name ?? "the template"} has for your photos. Events show their own posters; team, speakers and sponsors their own photos and logos.
        {hasGallery ? " Gallery places you leave empty take the next library photos, in order." : ""}
      </p>
      <ul className="mt-3 grid gap-2" aria-label="Photo places">
        {slots.map((s) => {
          const fill = fills[s.key];
          const chosen = layout.slots[s.key] ?? null;
          const hint = sizeHint(s);
          const n = fill?.image ? position.get(fill.image.id) : undefined;
          return (
            <li key={s.key} className="border-line-soft flex items-center gap-3 rounded-xl border p-2" data-testid={`slot-${s.key}`}>
              <Thumb fill={fill} />
              <div className="grid min-w-0 flex-1">
                <span className="text-ink text-[12.5px] font-medium">{s.label}</span>
                <span className="text-ink-3 text-[11px]">
                  {hint ? `${hint} px · ` : ""}
                  {fill?.image ? (
                    fill.auto ? (
                      <span className="inline-flex items-center gap-1">
                        <SparklesIcon className="size-3" aria-hidden="true" /> Auto: photo {n}
                      </span>
                    ) : (
                      `Photo ${n}`
                    )
                  ) : s.key === "hero.cover" ? (
                    "Empty: your club's cover shows"
                  ) : (
                    "Empty"
                  )}
                </span>
              </div>
              <button type="button" className="btn btn-secondary btn-sm" aria-label={`Choose a photo for ${s.label}`} onClick={() => setOpen(s)}>
                Choose
              </button>
              {chosen !== null ? (
                <IconButton label={`Clear ${s.label}`} size="xs" variant="ghost" onClick={() => assign(s.key, null)}>
                  <XIcon className="size-3.5" />
                </IconButton>
              ) : (
                // Room for Clear, so every row's Choose lines up.
                <span className="w-7 shrink-0" aria-hidden="true" />
              )}
            </li>
          );
        })}
      </ul>
      {open ? (
        <Picker
          slot={open}
          images={images}
          current={layout.slots[open.key] ?? null}
          onPick={(id) => {
            assign(open.key, id);
            setOpen(null);
          }}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </FigurePanel>
  );
}
