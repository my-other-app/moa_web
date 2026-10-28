"use client";

/* eslint-disable @next/next/no-img-element -- a local picture being cropped, never a served one */

import * as React from "react";
import { MinusIcon, MoveIcon, PlusIcon } from "lucide-react";
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, cn } from "@moa/ui";

import { MAX_ZOOM, centred, drawCrop, moveBy, planCrop, planWhole, scaleOf, zoomTo, WHOLE_PADDING, type Frame, type Natural, type Placement } from "../crop";
import { PICTURE_SPECS, hasShape, type PictureKind } from "../picture-specs";

/**
 * The crop step. A logo, a banner, a partner's or an organisation's logo
 * and a person's photo each have one shape (picture-specs); a picture of
 * another shape is placed in it here before it is sent, so what the club
 * uploads is exactly what every app and page shows:
 *
 *     const file = await cropToShape(picked, "logo", "logo");
 *     if (!file) return; // they cancelled: nothing is sent
 *
 * A picture already within 1% of its shape goes as it is, with no dialog.
 * So does one the browser cannot open here (no decoder, no canvas), and one
 * picked where no CropHost is mounted (the app's providers mount one): the
 * API keeps any shape, and the frames show it whole or filled.
 */

export interface LoadedPicture {
  width: number;
  height: number;
  /** What the canvas draws from. */
  source: CanvasImageSource;
  /** What the dialog shows. */
  url: string;
  close: () => void;
}

/** Opens the picked file; null when this browser cannot. */
async function loadPicture(file: File): Promise<LoadedPicture | null> {
  if (typeof createImageBitmap !== "function" || typeof URL.createObjectURL !== "function") return null;
  try {
    const bitmap = await createImageBitmap(file);
    const url = URL.createObjectURL(file);
    return {
      width: bitmap.width,
      height: bitmap.height,
      source: bitmap,
      url,
      close: () => {
        bitmap.close?.();
        URL.revokeObjectURL(url);
      },
    };
  } catch {
    return null;
  }
}

export interface CropDeps {
  load: (file: File) => Promise<LoadedPicture | null>;
  draw: typeof drawCrop;
}

const defaults: CropDeps = { load: loadPicture, draw: drawCrop };

interface Request {
  file: File;
  kind: PictureKind;
  what: string;
  picture: LoadedPicture;
  draw: CropDeps["draw"];
  resolve: (file: File | null) => void;
}

let host: ((request: Request) => void) | null = null;

/**
 * The picked picture in its kind's exact shape: as it is when it already
 * has it; else as placed in the crop dialog; null when the club cancelled.
 */
export async function cropToShape(file: File, kind: PictureKind, what: string, deps: Partial<CropDeps> = {}): Promise<File | null> {
  const show = host;
  if (!show) return file;
  const { load, draw } = { ...defaults, ...deps };
  const picture = await load(file);
  if (!picture) return file;
  if (hasShape(picture.width, picture.height, PICTURE_SPECS[kind].ratio)) {
    picture.close();
    return file;
  }
  return new Promise<File | null>((resolve) => {
    show({
      file,
      kind,
      what,
      picture,
      draw,
      resolve: (out) => {
        picture.close();
        resolve(out);
      },
    });
  });
}

/** Mounted once, in each app's providers: where the crop dialog opens. */
export function CropHost() {
  const [request, setRequest] = React.useState<Request | null>(null);
  React.useEffect(() => {
    host = (next) =>
      setRequest((current) => {
        // One at a time: a second pick while one is open sends nothing.
        if (current) {
          next.resolve(null);
          return current;
        }
        return next;
      });
    return () => {
      host = null;
    };
  }, []);
  if (!request) return null;
  const finish = (file: File | null) => {
    request.resolve(file);
    setRequest(null);
  };
  return <CropDialog key={request.picture.url} request={request} onDone={finish} />;
}

/** The frame's size on screen: a 1:1 square, a 3:1 band. */
function frameFor(kind: PictureKind): Frame {
  const ratio = PICTURE_SPECS[kind].ratio;
  if (ratio >= 1.5) {
    const width = typeof window === "undefined" ? 456 : Math.max(240, Math.min(456, window.innerWidth - 64));
    return { width, height: Math.round(width / ratio) };
  }
  return { width: 264, height: Math.round(264 / ratio) };
}

const SHAPE_WORD: Record<PictureKind, string> = {
  logo: "square",
  icon: "square",
  photo: "square",
  poster: "4:5 frame",
  banner: "3:1 banner",
};

function CropDialog({ request, onDone }: { request: Request; onDone: (file: File | null) => void }) {
  const { kind, picture, what } = request;
  const spec = PICTURE_SPECS[kind];
  const frame = React.useMemo(() => frameFor(kind), [kind]);
  const natural: Natural = { width: picture.width, height: picture.height };
  const [place, setPlace] = React.useState<Placement>(() => centred(frame, natural));
  // A wordmark (or anything this far from square) would lose most of itself to a crop: kept whole to begin with.
  const [whole, setWhole] = React.useState(() => {
    const stretch = natural.width / natural.height / spec.ratio;
    return spec.whole && Math.max(stretch, 1 / stretch) >= 1.5;
  });
  const [busy, setBusy] = React.useState(false);
  const drag = React.useRef<{ x: number; y: number; id: number } | null>(null);

  const scale = scaleOf(frame, natural, place.zoom);
  const zoomPct = Math.round(place.zoom * 100);
  const setZoom = (z: number) => setPlace((p) => zoomTo(frame, natural, p, z));

  const onKey = (e: React.KeyboardEvent) => {
    if (whole) return;
    const step = e.shiftKey ? 20 : 4;
    const moves: Record<string, [number, number]> = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    const move = moves[e.key];
    if (move) {
      e.preventDefault();
      setPlace((p) => moveBy(frame, natural, p, move[0], move[1]));
    } else if (e.key === "+" || e.key === "=") {
      e.preventDefault();
      setZoom(place.zoom + 0.1);
    } else if (e.key === "-" || e.key === "_") {
      e.preventDefault();
      setZoom(place.zoom - 0.1);
    }
  };

  const use = async () => {
    setBusy(true);
    const plan = whole ? planWhole(kind, natural) : planCrop(kind, frame, natural, place);
    const out = await request.draw(picture.source, plan, request.file);
    setBusy(false);
    // A browser that could not draw it sends the picture as picked: the frames show it whole or filled.
    onDone(out ?? request.file);
  };

  const inner = 1 - 2 * WHOLE_PADDING;
  const wholeScale = Math.min((frame.width * inner) / natural.width, (frame.height * inner) / natural.height);
  const shown = whole
    ? { left: (frame.width - natural.width * wholeScale) / 2, top: (frame.height - natural.height * wholeScale) / 2, width: natural.width * wholeScale, height: natural.height * wholeScale }
    : { left: place.x, top: place.y, width: natural.width * scale, height: natural.height * scale };
  const round = kind === "logo" || kind === "photo";

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onDone(null)}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Fit the {what} to its {SHAPE_WORD[kind]}</DialogTitle>
          <DialogDescription>
            {spec.label}. {whole ? "The whole logo, on white, with room around it." : "Drag the picture to move it; zoom to fill the frame."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid justify-items-center gap-3">
          <div
            role="group"
            aria-label={`The ${what}, as it will show. Arrow keys move it, plus and minus zoom.`}
            tabIndex={0}
            onKeyDown={onKey}
            onPointerDown={(e) => {
              if (whole) return;
              e.currentTarget.setPointerCapture?.(e.pointerId);
              drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
            }}
            onPointerMove={(e) => {
              const d = drag.current;
              if (!d || d.id !== e.pointerId) return;
              const dx = e.clientX - d.x;
              const dy = e.clientY - d.y;
              drag.current = { ...d, x: e.clientX, y: e.clientY };
              setPlace((p) => moveBy(frame, natural, p, dx, dy));
            }}
            onPointerUp={() => (drag.current = null)}
            onPointerCancel={() => (drag.current = null)}
            onWheel={(e) => {
              if (whole) return;
              setZoom(place.zoom * (e.deltaY < 0 ? 1.06 : 1 / 1.06));
            }}
            data-crop-frame={kind}
            className={cn(
              "ring-line focus-visible:ring-brand relative touch-none overflow-hidden rounded-xl ring-1 outline-none select-none focus-visible:ring-2",
              whole ? "bg-white" : "bg-sunken cursor-grab active:cursor-grabbing",
            )}
            style={{ width: frame.width, height: frame.height }}
          >
            <img src={picture.url} alt="" draggable={false} className="pointer-events-none absolute max-w-none" style={shown} />
            {/* Where a round crop (the app's club rows, a profile) cuts: a guide, not part of the picture. */}
            {round && !whole ? <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_9999px_rgba(0,0,0,0.28)] ring-1 ring-white/80" /> : null}
          </div>

          {!whole ? (
            <div className="flex w-full max-w-[360px] items-center gap-2">
              <button type="button" className="btn btn-quiet btn-icon btn-xs" aria-label="Zoom out" onClick={() => setZoom(place.zoom - 0.25)} disabled={place.zoom <= 1}>
                <MinusIcon className="size-3.5" />
              </button>
              <input
                type="range"
                min={100}
                max={MAX_ZOOM * 100}
                step={1}
                value={zoomPct}
                aria-label="Zoom"
                aria-valuetext={`${zoomPct}%`}
                className="accent-brand w-full"
                onChange={(e) => setZoom(Number(e.target.value) / 100)}
              />
              <button type="button" className="btn btn-quiet btn-icon btn-xs" aria-label="Zoom in" onClick={() => setZoom(place.zoom + 0.25)} disabled={place.zoom >= MAX_ZOOM}>
                <PlusIcon className="size-3.5" />
              </button>
              <span className="text-ink-3 w-11 text-right font-mono text-[11px] tabular-nums">{zoomPct}%</span>
            </div>
          ) : null}

          {spec.whole ? (
            <label className="flex cursor-pointer items-start gap-2.5 self-stretch text-[13px]">
              <input type="checkbox" className="accent-brand mt-0.5 size-4" checked={whole} onChange={(e) => setWhole(e.target.checked)} />
              <span>
                <span className="text-ink block">Show the whole logo</span>
                <span className="text-ink-3 block text-[12px]">For a wide wordmark: nothing is cut off, and the rest of the square is white.</span>
              </span>
            </label>
          ) : (
            <p className="text-ink-3 flex items-center gap-1.5 text-[12px]">
              <MoveIcon className="size-3.5" aria-hidden="true" /> Drag, scroll or use the arrow keys.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onDone(null)} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void use()} disabled={busy}>
            Use this
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * A picked file kept in state, put through the crop step on the way in:
 * `set(file)` opens the dialog when the picture is not of `kind`'s shape,
 * and keeps what was there when it is cancelled. `set(null)` clears it.
 */
export function useShapedFile(kind: PictureKind, what: string): [File | null, (file: File | null) => void] {
  const [file, setFile] = React.useState<File | null>(null);
  const set = React.useCallback(
    (next: File | null) => {
      if (!next) return setFile(null);
      void cropToShape(next, kind, what).then((shaped) => {
        if (shaped) setFile(shaped);
      });
    },
    [kind, what],
  );
  return [file, set];
}
