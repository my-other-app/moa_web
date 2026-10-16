"use client";

import { type AgendaEntry, canvasForPage, type PageSpec, type TicketLayer, ticketArea } from "@moa/layout";
import {
  Button,
  ChoiceCard,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  InitialsAvatar,
  SearchInput,
  Skeleton,
} from "@moa/ui";
import { Loader2Icon, ScanEyeIcon } from "lucide-react";
import * as React from "react";

import { useRegistrations } from "@/features/registrations";

import type { DesignerConfig } from "../config";
import { Busy } from "./fields";
import type { Layout } from "./kit";
import { type StageColors, TicketStage } from "./stage";

// ─── Designing in Figma ─────────────────────────────────────────────────

/** What a template-based design needs, said once, next to the upload. */
export const FigmaGuide = ({ config, page }: { config: DesignerConfig; page: PageSpec }) => {
  const px = canvasForPage(page, config.dpi);
  return (
    <div className="text-ink-2 flex flex-col gap-3 text-[13px] leading-[1.55]">
      <ol className="m-0 list-decimal space-y-1.5 pl-5">
        <li>
          Design the {config.noun} as one frame
          {page.heightMm ? ` of ${page.widthMm} × ${page.heightMm} mm (${px.width} × ${px.height} px at ${config.dpi} dpi)` : ""}. Leave the
          spaces for the guest name, codes and the QR code empty — those are layers here.
        </li>
        <li>
          Export the frame as PNG (keeps transparency) or JPG{page.heightMm ? "" : ", at 1× or 2×"}. Anything up to 6000 px wide is accepted;
          it is stored at 2400 px so files stay light.
        </li>
        <li>
          Upload it as the template. The canvas takes the file&apos;s pixel size, so the X and Y you read in Figma (at the same export scale)
          are the X and Y here.
        </li>
        <li>
          Add a text layer for each field and type its token, e.g. <code className="text-ink font-mono">{"{{name}}"}</code> or{" "}
          <code className="text-ink font-mono">{"{{ticket_code}}"}</code>. Give it a width and a number of lines so long names wrap or
          shrink instead of running off.
        </li>
        <li>Place the QR code over a plain light area. Keep it at least the size shown under the canvas.</li>
        <li>Check the stage with sample data, then Preview as issued — for a sample guest or a real one with a long name.</li>
      </ol>
      <p className="text-ink-3 m-0 text-[12px]">
        Templates built for other ticketing tools usually work as they are: {"{{name}}"}, {"{{ticket_code}}"}, {"{{event_title}}"},{" "}
        {"{{event_date}}"}, {"{{event_start_time}}"} and {"{% if … %}"} blocks are understood. Anything that is not a known token is flagged
        before you can save.
      </p>
    </div>
  );
};

export const GuideDialog = ({ open, onClose, config, page }: { open: boolean; onClose: () => void; config: DesignerConfig; page: PageSpec }) => (
  <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
    <DialogContent className="sm:max-w-[560px]">
      <DialogHeader>
        <DialogTitle>{config.guideTitle}</DialogTitle>
        <DialogDescription>Six steps from a Figma frame to a {config.noun} that fills itself in for every guest.</DialogDescription>
      </DialogHeader>
      <FigmaGuide config={config} page={page} />
      <DialogFooter>
        <Button onClick={onClose}>Got it</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

// ─── Layouts ────────────────────────────────────────────────────────────

/** What the stage needs to draw a design other than the open one: the same colours, samples and fonts. */
export interface StageLook {
  colors: StageColors;
  values: Record<string, string>;
  qrValue: string;
  imageUrl: (l: Extract<TicketLayer, { kind: "image" }>) => string | null;
  fontsReady: boolean;
  agenda?: AgendaEntry[];
  timezone?: string;
}

const NOOP = () => {};
const NO_PROBLEMS = new Set<string>();
const THUMB = { w: 280, h: 124 };

/** A layout drawn by the stage itself, as it would print: what you pick is what you get. */
const LayoutThumb = ({ layout, look }: { layout: Layout; look: StageLook }) => {
  const area = ticketArea(layout.canvas);
  const zoom = Math.min(THUMB.w / area.width, THUMB.h / area.height);
  return (
    <span aria-hidden="true" className="bg-sunken grid h-[140px] place-items-center overflow-hidden rounded-[var(--radius-md)]">
      <TicketStage
        layout={layout}
        mode="preview"
        zoom={zoom}
        selected={null}
        onSelect={NOOP}
        onChange={NOOP}
        onSettle={NOOP}
        colors={look.colors}
        values={look.values}
        qrValue={look.qrValue}
        templateUrl={null}
        imageUrl={look.imageUrl}
        fontsReady={look.fontsReady}
        problemIds={NO_PROBLEMS}
        agenda={look.agenda}
        timezone={look.timezone}
      />
    </span>
  );
};

/** The choices, mounted with the dialog so a pick never lingers from the last time it was open. */
const LayoutChooser = ({
  config,
  page,
  look,
  onCancel,
  onPick,
}: {
  config: DesignerConfig;
  page: PageSpec;
  look: StageLook;
  onCancel: () => void;
  onPick: (name: string) => void;
}) => {
  const [picked, setPicked] = React.useState<string | null>(null);
  const layouts = React.useMemo(
    () => Object.keys(config.starters).map((name) => ({ name, ...config.starters[name]!, layout: config.starter(name, { seats: false, page }) })),
    [config, page]
  );
  return (
    <>
      <div role="radiogroup" aria-label="Layouts" className="scroll-thin -mx-1 grid max-h-[60vh] gap-2 overflow-y-auto px-1 py-0.5 sm:grid-cols-2">
        {layouts.map((s) => (
          <ChoiceCard
            key={s.name}
            checked={picked === s.name}
            onClick={() => setPicked(s.name)}
            title={
              <span className="flex flex-col gap-2">
                <LayoutThumb layout={s.layout} look={look} />
                {s.label}
              </span>
            }
            hint={s.note}
          />
        ))}
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button disabled={!picked} onClick={() => picked && onPick(picked)}>
          Replace the design
        </Button>
      </DialogFooter>
    </>
  );
};

export const LayoutsDialog = ({
  open,
  onClose,
  config,
  page,
  look,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  config: DesignerConfig;
  page: PageSpec;
  look: StageLook;
  onPick: (name: string) => void;
}) => (
  <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
    <DialogContent className="sm:max-w-[720px]">
      <DialogHeader>
        <DialogTitle>Start from a layout</DialogTitle>
        <DialogDescription>
          A layout replaces the canvas and every layer, template included, drawn here in your club&apos;s colours. You can undo it until you leave
          the page.
        </DialogDescription>
      </DialogHeader>
      <LayoutChooser config={config} page={page} look={look} onCancel={onClose} onPick={onPick} />
    </DialogContent>
  </Dialog>
);

// ─── Preview ────────────────────────────────────────────────────────────

/** The rendered PNG, at the size the dialog allows. */
const PreviewImage = ({ blob, onBack }: { blob: Blob; onBack: () => void }) => {
  const url = React.useMemo(() => URL.createObjectURL(blob), [blob]);
  React.useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return (
    <div className="flex flex-col gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="The rendered design" className="border-line bg-sunken max-h-[70vh] w-full rounded-[var(--radius-md)] border object-contain" />
      <DialogFooter>
        <Button variant="secondary" onClick={onBack}>
          Preview another
        </Button>
      </DialogFooter>
    </div>
  );
};

/** Sample guest, or a real one from the list -- long names are the ones worth checking. */
const PreviewPicker = ({ eventId, busy, onPick }: { eventId: number; busy: string | null; onPick: (ticketId?: string) => Promise<void> }) => {
  const [q, setQ] = React.useState("");
  const [search, setSearch] = React.useState("");
  const list = useRegistrations({ eventId, search: search.trim() || undefined, offset: 0, limit: 10 });
  const items = list.data?.items ?? [];
  return (
    <div className="flex flex-col gap-3">
      <Button disabled={!!busy} onClick={() => void onPick()} className="self-start">
        {busy === "sample" ? <Busy on /> : <ScanEyeIcon />}
        Preview with the sample guest
      </Button>
      <div>
        <span className="eyebrow mb-1.5 block">Or a registered guest</span>
        <SearchInput
          value={q}
          onChange={setQ}
          onDebouncedChange={setSearch}
          delayMs={250}
          placeholder="Search a name — try the longest one"
          aria-label="Search attendees to preview"
        />
      </div>
      <ul className="border-line divide-line-soft scroll-thin m-0 max-h-[260px] list-none divide-y overflow-y-auto rounded-[var(--radius-md)] border p-0">
        {!list.data
          ? Array.from({ length: 3 }, (_, i) => (
              <li key={i} className="px-3 py-2.5">
                <Skeleton className="h-8 w-full" />
              </li>
            ))
          : items.map((r) => {
              const name = r.full_name || r.name || r.email || r.id;
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => r.ticket_id && void onPick(r.ticket_id)}
                    disabled={!!busy || !r.ticket_id}
                    className="hover:bg-sunken flex w-full items-center gap-3 px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <InitialsAvatar name={String(name)} size={28} />
                    <span className="min-w-0 flex-1">
                      <span className="text-ink block truncate text-[13px] font-medium">{name}</span>
                      <span className="text-ink-3 block truncate font-mono text-[10.5px]">
                        {r.role} · {r.ticket_id ?? "no ticket yet"}
                      </span>
                    </span>
                    {!r.ticket_id ? (
                      <span className="text-ink-3 shrink-0 text-[12px]">No ticket</span>
                    ) : (
                      <span className="text-brand inline-flex shrink-0 items-center gap-1.5 text-[12.5px] font-medium">
                        {busy === r.ticket_id ? (
                          <>
                            <Loader2Icon className="size-3.5 animate-spin" /> Rendering…
                          </>
                        ) : (
                          "Preview"
                        )}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
        {list.data && !items.length ? (
          <li className="text-ink-3 px-3 py-5 text-center text-[12.5px]">{search.trim() ? "Nobody matches that name." : "Nobody has registered yet."}</li>
        ) : null}
      </ul>
    </div>
  );
};

export const PreviewDialog = ({
  open,
  onClose,
  config,
  eventId,
  image,
  busy,
  onPick,
  onBack,
}: {
  open: boolean;
  onClose: () => void;
  config: DesignerConfig;
  /** The event whose guests can be previewed; none on the club's templates. */
  eventId: number | null;
  image: Blob | null;
  busy: string | null;
  onPick: (ticketId?: string) => Promise<void>;
  onBack: () => void;
}) => (
  <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
    <DialogContent className={image ? "sm:max-w-[min(96vw,1100px)]" : "sm:max-w-[520px]"}>
      <DialogHeader>
        <DialogTitle>{image ? `The ${config.noun}, as it is issued` : `Preview the real ${config.noun}`}</DialogTitle>
        <DialogDescription>{config.previewNote}</DialogDescription>
      </DialogHeader>
      {image ? (
        <PreviewImage blob={image} onBack={onBack} />
      ) : eventId ? (
        <PreviewPicker eventId={eventId} busy={busy} onPick={onPick} />
      ) : (
        <Button disabled={!!busy} onClick={() => void onPick()} className="self-start">
          {busy === "sample" ? <Busy on /> : <ScanEyeIcon />}
          Preview with the sample guest
        </Button>
      )}
    </DialogContent>
  </Dialog>
);

// ─── Confirmations ──────────────────────────────────────────────────────

export const ResetDialog = ({
  open,
  onClose,
  title,
  body,
  confirm,
  busy,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  body: string;
  confirm: string;
  busy: boolean;
  onConfirm: () => void;
}) => (
  <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{body}</DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Keep it
        </Button>
        <Button variant="destructive" disabled={busy} onClick={onConfirm}>
          <Busy on={busy} />
          {confirm}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

/** Asked before switching away from unsaved work: to another kind, or another audience. */
export const LeaveDialog = ({ open, what, onStay, onLeave }: { open: boolean; what: string; onStay: () => void; onLeave: () => void }) => (
  <Dialog open={open} onOpenChange={(o) => !o && onStay()}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Leave this design?</DialogTitle>
        <DialogDescription>The changes you have not saved to the {what} will be lost.</DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="ghost" onClick={onStay}>
          Keep editing
        </Button>
        <Button variant="destructive" onClick={onLeave}>
          Discard changes
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
