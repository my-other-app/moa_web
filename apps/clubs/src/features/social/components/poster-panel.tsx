"use client";

import * as React from "react";
import { ImageUpIcon, Loader2Icon } from "lucide-react";
import { Notice, Segmented, cn } from "@moa/ui";

import { fitImage } from "@/lib/images";

import { useSavePoster } from "../queries";
import { POSTER_SIZE, SIZES_FOR, cropWindow, imageProblem, type Platform, type PosterSize, type PosterVariant } from "../schemas";
import type { PreviewImage } from "./phone-preview";

/**
 * The poster for one platform: which size (where the platform takes two),
 * crop around a focus point dragged onto what matters, or fit the whole
 * poster on a background colour, or the club's own image instead. The
 * phone preview follows every change at once; the server makes the image
 * on Save, and that is what goes out.
 */
export interface PosterSettings {
  mode: "crop" | "fit";
  focus: { x: number; y: number };
  background: string;
}

const DEFAULT_BG = "#111111";

export function settingsOf(v: PosterVariant | null | undefined): PosterSettings {
  return { mode: v?.mode ?? "crop", focus: v?.focus ?? { x: 0.5, y: 0.5 }, background: v?.background ?? DEFAULT_BG };
}

const same = (a: PosterSettings, b: PosterSettings) =>
  a.mode === b.mode && Math.abs(a.focus.x - b.focus.x) < 0.005 && Math.abs(a.focus.y - b.focus.y) < 0.005 && a.background.toLowerCase() === b.background.toLowerCase();

/** What the preview shows for this size: the server's image, or the poster shown with unsaved settings. */
export function previewImageFor(size: PosterSize, variant: PosterVariant | null | undefined, poster: string | null, pending: PosterSettings | null, posterAspect: number | null): PreviewImage {
  const { width, height } = POSTER_SIZE[size];
  const aspect = width / height;
  if (pending && poster) {
    const win = cropWindow(posterAspect ?? aspect, aspect, pending.focus);
    return { src: poster, aspect, simulate: { mode: pending.mode, position: win.position, background: pending.background } };
  }
  return { src: variant?.url ?? poster, aspect, simulate: variant?.url ? null : { mode: "crop", position: { x: 0.5, y: 0.5 }, background: DEFAULT_BG } };
}

function readSize(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve({ width: 0, height: 0 });
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

export function PosterPanel({
  eventId,
  platform,
  size,
  onSize,
  variants,
  poster,
  pending,
  onPending,
  onPosterAspect,
  canEdit,
}: {
  eventId: number;
  platform: Platform;
  size: PosterSize;
  onSize: (s: PosterSize) => void;
  variants: PosterVariant[];
  /** The event's own poster: what every size is made from. */
  poster: string | null;
  /** Unsaved settings for this size, or null. */
  pending: PosterSettings | null;
  onPending: (s: PosterSettings | null) => void;
  onPosterAspect: (a: number) => void;
  canEdit: boolean;
}) {
  const save = useSavePoster(eventId);
  const variant = variants.find((v) => v.size === size) ?? null;
  const saved = settingsOf(variant);
  const s = pending ?? saved;
  const sizes = SIZES_FOR[platform];
  const [aspect, setAspect] = React.useState<number | null>(null);
  const [problem, setProblem] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const target = POSTER_SIZE[size].width / POSTER_SIZE[size].height;

  const change = (next: Partial<PosterSettings>) => {
    const merged = { ...s, ...next };
    onPending(same(merged, saved) ? null : merged);
  };

  const commit = () =>
    save.mutate(
      { size, body: { mode: s.mode, focus: s.mode === "crop" ? s.focus : undefined, background: s.mode === "fit" ? s.background : undefined } },
      { onSuccess: () => onPending(null) },
    );

  const upload = async (picked: File | undefined) => {
    setProblem(null);
    if (!picked) return;
    const dims = await readSize(picked);
    const wrong = imageProblem(platform, { type: picked.type, ...dims });
    if (wrong) return setProblem(wrong);
    let ready: File;
    try {
      ready = await fitImage(picked, "image");
    } catch (err) {
      return setProblem(err instanceof Error ? err.message : "That image is too big to send.");
    }
    save.mutate({ size, file: ready }, { onSuccess: () => onPending(null) });
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="eyebrow">Poster</span>
        {sizes.length > 1 ? (
          <Segmented label="Poster size" value={size} onChange={onSize} options={sizes.map((v) => ({ value: v, label: POSTER_SIZE[v].label }))} className="w-auto" />
        ) : (
          <span className="text-ink-3 font-mono text-[11px]">
            {POSTER_SIZE[size].label} · {POSTER_SIZE[size].width} × {POSTER_SIZE[size].height}
          </span>
        )}
      </div>

      {canEdit ? (
        <>
          <Segmented
            label="Crop or fit"
            value={s.mode}
            onChange={(mode) => change({ mode })}
            options={[
              { value: "crop", label: "Crop around a point" },
              { value: "fit", label: "Fit on a colour" },
            ]}
          />
          {poster ? (
            s.mode === "crop" ? (
              <FocusPicker
                poster={poster}
                focus={s.focus}
                target={target}
                aspect={aspect}
                onAspect={(a) => {
                  setAspect(a);
                  onPosterAspect(a);
                }}
                onFocus={(focus) => change({ focus })}
              />
            ) : (
              <label className="text-ink-2 flex items-center gap-2 text-[12.5px]">
                <input type="color" value={s.background} onChange={(e) => change({ background: e.target.value })} className="border-line size-8 cursor-pointer rounded-lg border bg-transparent p-0.5" aria-label="Background colour" />
                Background <span className="text-ink-3 font-mono text-[11px] uppercase">{s.background}</span>
              </label>
            )
          ) : (
            <p className="text-ink-3 m-0 text-[12px]">Add a poster to the event under Settings to make these from it.</p>
          )}
          {problem ? (
            <Notice tone="refuse" tag="Image">
              {problem}
            </Notice>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            {pending ? (
              <button type="button" className="btn btn-primary btn-sm" onClick={commit} disabled={save.isPending}>
                {save.isPending ? <Loader2Icon className="size-3.5 animate-spin" /> : null} Save poster
              </button>
            ) : null}
            {pending ? (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => onPending(null)} disabled={save.isPending}>
                Undo
              </button>
            ) : null}
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => fileRef.current?.click()} disabled={save.isPending}>
              <ImageUpIcon className="size-3.5" /> Use my own image
            </button>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} aria-label="Own image" onChange={(e) => void upload(e.target.files?.[0] ?? undefined).finally(() => (e.target.value = ""))} />
          </div>
          {pending ? <p className="text-ink-3 m-0 text-[11.5px]">The preview shows it now; Save poster makes the image every post of this size uses.</p> : null}
        </>
      ) : null}
    </div>
  );
}

/** The event's poster with the part a crop keeps lit, and a point to drag onto what matters. Arrow keys move it too. */
function FocusPicker({ poster, focus, target, aspect, onAspect, onFocus }: { poster: string; focus: { x: number; y: number }; target: number; aspect: number | null; onAspect: (a: number) => void; onFocus: (f: { x: number; y: number }) => void }) {
  const box = React.useRef<HTMLDivElement>(null);
  const dragging = React.useRef(false);
  const win = cropWindow(aspect ?? target, target, focus);

  const at = (e: React.PointerEvent) => {
    const r = box.current?.getBoundingClientRect();
    if (!r || r.width === 0) return;
    onFocus({ x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) });
  };

  const key = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 0.1 : 0.02;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const m = moves[e.key];
    if (!m) return;
    e.preventDefault();
    onFocus({ x: Math.min(1, Math.max(0, focus.x + m[0])), y: Math.min(1, Math.max(0, focus.y + m[1])) });
  };

  return (
    <div className="flex justify-center">
      <div
        ref={box}
        className="relative inline-block max-w-full cursor-crosshair touch-none overflow-hidden rounded-xl select-none"
        onPointerDown={(e) => {
          dragging.current = true;
          (e.target as Element).setPointerCapture?.(e.pointerId);
          at(e);
        }}
        onPointerMove={(e) => dragging.current && at(e)}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- the event's own poster, measured for its shape */}
        <img
          src={poster}
          alt="The event's poster"
          draggable={false}
          className="block max-h-[220px] w-auto max-w-full"
          onLoad={(e) => {
            const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
            if (w && h) onAspect(w / h);
          }}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute border-2 border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]"
          style={{ left: `${win.left * 100}%`, top: `${win.top * 100}%`, width: `${win.width * 100}%`, height: `${win.height * 100}%` }}
        />
        <button
          type="button"
          onKeyDown={key}
          aria-label={`Focus point, ${Math.round(focus.x * 100)}% across and ${Math.round(focus.y * 100)}% down. Drag it, or move it with the arrow keys.`}
          className={cn("absolute size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-brand shadow-md focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none")}
          style={{ left: `${focus.x * 100}%`, top: `${focus.y * 100}%` }}
        />
      </div>
    </div>
  );
}
