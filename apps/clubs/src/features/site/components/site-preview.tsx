"use client";

import * as React from "react";
import { Loader2Icon, MonitorIcon, SmartphoneIcon, TabletIcon } from "lucide-react";
import { FigurePanel, Segmented, Skeleton, cn } from "@moa/ui";

/**
 * The page as the current choices make it (POST /preview, debounced by the
 * caller), drawn at a real device's width and scaled down to fit: the
 * desktop page at 1440 px, a tablet's at 768, a phone's at 390, so what is
 * seen is the layout that width gets, not a squeezed desktop.
 */
export const DEVICES = {
  desktop: { width: 1440, label: "Desktop", Icon: MonitorIcon },
  tablet: { width: 768, label: "Tablet", Icon: TabletIcon },
  mobile: { width: 390, label: "Mobile", Icon: SmartphoneIcon },
} as const;
export type Device = keyof typeof DEVICES;

const HEIGHT = 720;

function useWidth(ref: React.RefObject<HTMLElement | null>): number {
  const [w, setW] = React.useState(0);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    setW(el.clientWidth);
    const ro = new ResizeObserver((entries) => setW(entries[0]?.contentRect.width ?? el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

export function SitePreview({ html, address, updating, failed }: { html: string | undefined; address: string; updating: boolean; failed: boolean }) {
  const [device, setDevice] = React.useState<Device>("desktop");
  const box = React.useRef<HTMLDivElement>(null);
  const room = useWidth(box);
  const { width, Icon } = DEVICES[device];
  const pad = device === "desktop" ? 0 : 32;
  // Scaled to fit; never up (an unmeasured box, as in tests, draws at 1).
  const scale = room > 0 ? Math.min(1, (room - pad) / width) : 1;
  return (
    <div className="grid content-start gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-ink-3 flex items-center gap-1.5 text-[12.5px]">
          Live preview · updates as you edit
          {updating ? <Loader2Icon className="size-3.5 animate-spin" aria-label="Updating the preview" /> : null}
        </span>
        <Segmented
          label="Preview width"
          value={device}
          options={(Object.keys(DEVICES) as Device[]).map((k) => ({ value: k, label: DEVICES[k].label }))}
          onChange={(v) => setDevice(v)}
        />
      </div>
      <FigurePanel className="overflow-hidden p-0">
        <div className="border-line-soft bg-sunken flex items-center gap-1.5 border-b px-3 py-2">
          <span className="bg-ink-3/40 size-2.5 rounded-full" />
          <span className="bg-ink-3/40 size-2.5 rounded-full" />
          <span className="bg-ink-3/40 size-2.5 rounded-full" />
          <span className="text-ink-3 mx-auto truncate font-mono text-[11px]">{address}</span>
          <span className="text-ink-3 flex items-center gap-1 font-mono text-[10.5px]">
            <Icon className="size-3.5" /> {width}px
          </span>
        </div>
        <div ref={box} className={cn("bg-sunken flex justify-center overflow-hidden", device !== "desktop" && "py-4")} style={{ height: HEIGHT + (device !== "desktop" ? 32 : 0) }}>
          {html !== undefined ? (
            <div style={{ width: width * scale, height: HEIGHT }} className={cn("shrink-0 overflow-hidden", device !== "desktop" && "rounded-[18px] shadow-lg ring-1 ring-black/10")}>
              <iframe
                title="Site preview"
                srcDoc={html}
                sandbox="allow-same-origin"
                data-width={width}
                className="origin-top-left border-0 bg-white"
                style={{ width, height: HEIGHT / scale, transform: scale === 1 ? undefined : `scale(${scale})` }}
              />
            </div>
          ) : (
            <Skeleton className="h-full w-full" />
          )}
        </div>
        {failed ? <p className="text-ink-3 border-line-soft border-t px-3 py-2 text-[11.5px]">The preview could not update just now; it catches up with your next change.</p> : null}
      </FigurePanel>
    </div>
  );
}
