"use client";

import * as React from "react";

/**
 * A design filled in by the server, drawn by the browser: one HTML page in a
 * frame sandboxed to scripts only. The scripts are the design's own fit
 * script, which shrinks long names once the fonts load; without
 * `allow-same-origin` the page is an opaque origin and can reach nothing of
 * the dashboard -- no cookies, no storage, no parent. It is a picture, so it
 * takes no pointer and no focus.
 *
 * The page is a fixed size (1280 × 600 for a ticket, 384 × 576 for a card);
 * the frame is that size, scaled down to the room it has, never past
 * `maxHeight` so a tall card does not run off the screen.
 */
export const PreviewFrame = ({
  html,
  width,
  height,
  title,
  maxHeight = 640,
}: {
  html: string | null;
  width: number;
  height: number;
  title: string;
  maxHeight?: number;
}) => {
  const box = React.useRef<HTMLDivElement>(null);
  const [room, setRoom] = React.useState(0);

  React.useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setRoom(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scale = room > 0 ? Math.min(room / width, maxHeight / height, 2) : 0;
  return (
    <div ref={box} className="flex w-full justify-center">
      <div
        className="relative overflow-hidden"
        style={{ width: Math.round(width * scale), height: Math.round(height * scale) }}
        data-scale={scale.toFixed(3)}
      >
        {html ? (
          <iframe
            title={title}
            sandbox="allow-scripts"
            srcDoc={html}
            tabIndex={-1}
            referrerPolicy="no-referrer"
            className="pointer-events-none absolute top-0 left-0 origin-top-left border-0 bg-white"
            style={{ width, height, transform: `scale(${scale})` }}
          />
        ) : null}
      </div>
    </div>
  );
};
