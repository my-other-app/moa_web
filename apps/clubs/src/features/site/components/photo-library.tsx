"use client";

import * as React from "react";
import { ArrowLeftIcon, ArrowRightIcon, ImagePlusIcon, Loader2Icon, Trash2Icon, XIcon } from "lucide-react";
import { useObjectUrl } from "@moa/ui/hooks";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  CardLabel,
  FigurePanel,
  IconButton,
  ProgressBar,
  buttonVariants,
  cn,
} from "@moa/ui";

import { IMAGE_ACCEPT } from "@/lib/images";

import { listWords, moved, usedIn } from "../layout";
import { useDeleteImage, useImageAlt, useOrderImages } from "../queries";
import { ALT_MAX, type Layout, type SiteImage, type SiteTemplate } from "../schemas";
import { useDragReorder } from "../use-drag-reorder";
import type { UploadItem, UploadQueue } from "../uploads";

/**
 * The club's photo library: up to 20 photos the template's places draw on
 * (the cover, the about block, the gallery). Add many at once (each shows
 * its progress), drag them into the order the gallery fills in (or move
 * them with the arrows), give each its alt text, delete one (saying where
 * the page uses it first). Every change here is saved at once; the page,
 * if published, follows.
 */

function UploadRow({ item, onDismiss }: { item: UploadItem; onDismiss: () => void }) {
  const preview = useObjectUrl(item.file);
  const words =
    item.state === "failed" ? item.error : item.state === "waiting" ? "Waiting" : item.state === "preparing" ? "Getting it ready" : `Uploading · ${Math.round(item.progress * 100)}%`;
  return (
    <li className="border-line-soft bg-sunken flex items-center gap-3 rounded-xl border p-2" data-testid="upload-row">
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element -- the picked file, before it is sent
        <img src={preview} alt="" className="size-10 shrink-0 rounded-md object-cover" />
      ) : (
        <span className="bg-surface size-10 shrink-0 rounded-md" />
      )}
      <div className="grid min-w-0 flex-1 gap-1">
        <span className="text-ink truncate text-[12.5px]">{item.file.name}</span>
        {item.state === "failed" ? (
          <span className="text-refuse text-[11.5px]" role="alert">
            {words}
          </span>
        ) : (
          <>
            <ProgressBar value={Math.round(item.progress * 100)} max={100} height={5} label={`Uploading ${item.file.name}`} />
            <span className="text-ink-3 text-[11px]">{words}</span>
          </>
        )}
      </div>
      {item.state === "failed" ? (
        <IconButton label={`Dismiss ${item.file.name}`} size="xs" variant="ghost" onClick={onDismiss}>
          <XIcon className="size-3.5" />
        </IconButton>
      ) : (
        <Loader2Icon className="text-ink-3 size-4 shrink-0 animate-spin" aria-hidden="true" />
      )}
    </li>
  );
}

function AltField({ image, n }: { image: SiteImage; n: number }) {
  const alt = useImageAlt();
  const saved = image.alt ?? "";
  const [value, setValue] = React.useState(saved);
  const [shown, setShown] = React.useState(saved);
  if (shown !== saved) {
    setShown(saved);
    setValue(saved);
  }
  const save = () => {
    const next = value.trim();
    if (next === saved.trim()) return;
    alt.mutate({ id: image.id, alt: next || null });
  };
  return (
    <input
      aria-label={`Alt text for photo ${n}`}
      className="input input-sm w-full"
      value={value}
      placeholder="Describe the photo"
      maxLength={ALT_MAX}
      onChange={(e) => setValue(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

export function PhotoLibrary({
  images,
  limit,
  maxMb,
  queue,
  template,
  layout,
  onDeleted,
}: {
  images: SiteImage[];
  limit: number;
  maxMb: number;
  /** The uploads, kept by the editor so they go on while another tab is open. */
  queue: UploadQueue;
  template: SiteTemplate | undefined;
  layout: Layout;
  /** The photo is gone: the draft lets go of it too. */
  onDeleted: (id: number) => void;
}) {
  const input = React.useRef<HTMLInputElement>(null);
  const order = useOrderImages();
  const remove = useDeleteImage();
  const [doomed, setDoomed] = React.useState<SiteImage | null>(null);
  const [dropping, setDropping] = React.useState(false);
  const full = images.length + queue.pending >= limit;

  const moveTo = (from: number, to: number) => {
    const ids = moved(
      images.map((i) => i.id),
      from,
      to,
    );
    if (ids.join() !== images.map((i) => i.id).join()) order.mutate(ids);
  };
  const drag = useDragReorder(moveTo);

  const pick = (files: FileList | null) => {
    if (files?.length) queue.add(Array.from(files));
  };
  const doomedWhere = doomed ? usedIn(doomed, template, layout) : [];

  return (
    <FigurePanel className="p-4">
      <CardLabel right={<span className="text-ink-3 font-mono text-[11px] tabular-nums">{`${images.length} of ${limit}`}</span>}>Photo library</CardLabel>
      <p className="text-ink-3 mt-2 text-[11.5px]">
        Up to {limit} photos for the cover, the about block and the gallery. JPG, PNG or WebP, up to {maxMb} MB each. The gallery fills in this order.
      </p>

      <div
        className={cn("border-line mt-3 grid place-items-center gap-2 rounded-xl border border-dashed p-4 text-center transition-colors", dropping && "border-brand bg-brand-soft")}
        onDragOver={(e) => {
          if (drag.dragging || full || !e.dataTransfer?.types?.includes("Files")) return;
          e.preventDefault();
          setDropping(true);
        }}
        onDragLeave={() => setDropping(false)}
        onDrop={(e) => {
          if (drag.dragging || !e.dataTransfer?.files?.length) return;
          e.preventDefault();
          setDropping(false);
          pick(e.dataTransfer.files);
        }}
      >
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => input.current?.click()} disabled={full}>
          <ImagePlusIcon /> Add photos
        </button>
        <span className="text-ink-3 text-[11.5px]">{full ? `The library is full (${limit} photos). Delete one to add another.` : "Or drop them here. Pick several at once."}</span>
        <input ref={input} type="file" accept={IMAGE_ACCEPT} multiple className="sr-only" tabIndex={-1} aria-label="Photos to add" onChange={(e) => {
          pick(e.target.files);
          e.target.value = "";
        }} />
      </div>

      {queue.items.length ? (
        <ul className="mt-3 grid gap-2" aria-label="Uploads">
          {queue.items.map((item) => (
            <UploadRow key={item.id} item={item} onDismiss={() => queue.dismiss(item.id)} />
          ))}
        </ul>
      ) : null}

      {images.length ? (
        <ol className="mt-3 grid grid-cols-2 gap-2" aria-label="Photos in order">
          {images.map((img, i) => {
            const where = usedIn(img, template, layout);
            const item = drag.itemProps(i);
            return (
              <li
                key={img.id}
                {...item}
                data-testid={`photo-${img.id}`}
                className={cn(
                  "border-line bg-surface grid gap-1.5 rounded-xl border p-1.5 transition-colors",
                  item["data-dragging"] !== undefined && "opacity-50",
                  item["data-over"] !== undefined && "border-brand",
                )}
              >
                <div {...drag.handleProps(i)} className="relative cursor-grab overflow-hidden rounded-lg active:cursor-grabbing" title="Drag to move">
                  {/* eslint-disable-next-line @next/next/no-img-element -- the library's own small variant, as kept */}
                  <img src={img.url} srcSet={img.srcset ?? undefined} sizes="200px" alt={img.alt ?? ""} className="bg-sunken aspect-[4/3] w-full object-cover" draggable={false} />
                  <span className="absolute top-1 left-1 rounded-md bg-black/60 px-1.5 font-mono text-[10.5px] text-white tabular-nums">{i + 1}</span>
                  {where.length ? <span className="bg-brand text-brand-foreground absolute right-1 bottom-1 max-w-[90%] truncate rounded-md px-1.5 text-[10.5px]">{listWords(where)}</span> : null}
                </div>
                <AltField image={img} n={i + 1} />
                <div className="flex items-center justify-between gap-1">
                  <div className="flex items-center gap-0.5">
                    <IconButton label={`Move photo ${i + 1} earlier`} size="xs" variant="ghost" disabled={i === 0 || order.isPending} onClick={() => moveTo(i, i - 1)}>
                      <ArrowLeftIcon className="size-3.5" />
                    </IconButton>
                    <IconButton label={`Move photo ${i + 1} later`} size="xs" variant="ghost" disabled={i === images.length - 1 || order.isPending} onClick={() => moveTo(i, i + 1)}>
                      <ArrowRightIcon className="size-3.5" />
                    </IconButton>
                  </div>
                  <IconButton label={`Delete photo ${i + 1}`} size="xs" variant="ghost" danger onClick={() => setDoomed(img)}>
                    <Trash2Icon className="size-3.5" />
                  </IconButton>
                </div>
              </li>
            );
          })}
        </ol>
      ) : !queue.items.length ? (
        <p className="text-ink-3 mt-3 text-[12px]">No photos yet. Until you add some, the template shows its own placeholders where photos go.</p>
      ) : null}

      <AlertDialog open={!!doomed} onOpenChange={(open) => (open ? null : setDoomed(null))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this photo?</AlertDialogTitle>
            <AlertDialogDescription>
              {doomedWhere.length
                ? `It is used in ${listWords(doomedWhere)}. Those places go empty (gallery places fill from the library), and a published page changes with them.`
                : "It isn't chosen for any place on the page. It leaves the library for good."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              className={cn(buttonVariants({ variant: "destructive" }))}
              onClick={() => {
                const img = doomed;
                if (!img) return;
                remove.mutate(img.id, { onSuccess: () => onDeleted(img.id) });
              }}
            >
              Delete photo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </FigurePanel>
  );
}
