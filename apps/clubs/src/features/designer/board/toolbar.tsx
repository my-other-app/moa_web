"use client";

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconButton,
  NativeSelect,
} from "@moa/ui";
import {
  AlignCenterHorizontalIcon,
  AlignCenterVerticalIcon,
  AlignEndHorizontalIcon,
  AlignEndVerticalIcon,
  AlignHorizontalDistributeCenterIcon,
  AlignStartHorizontalIcon,
  AlignStartVerticalIcon,
  AlignVerticalDistributeCenterIcon,
  BringToFrontIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CircleIcon,
  ImageIcon,
  PlusIcon,
  QrCodeIcon,
  Redo2Icon,
  SendToBackIcon,
  SparklesIcon,
  SquareIcon,
  TypeIcon,
  Undo2Icon,
  UserRoundIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "lucide-react";
import * as React from "react";

import type { Alignment, OrderMove } from "./geometry";
import type { NewLayer } from "./model";

/** The zoom steps the buttons and keys move through. */
export const ZOOM_STEPS = [0.1, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2, 3, 4] as const;
export const nextZoom = (z: number, dir: 1 | -1) =>
  dir > 0 ? (ZOOM_STEPS.find((s) => s > z + 0.001) ?? ZOOM_STEPS.at(-1)!) : ([...ZOOM_STEPS].reverse().find((s) => s < z - 0.001) ?? ZOOM_STEPS[0]);

const Rule = () => <span className="bg-line mx-0.5 h-5 w-px shrink-0" aria-hidden="true" />;

const ALIGN: { how: Alignment; label: string; icon: React.ReactNode }[] = [
  { how: "left", label: "Align left", icon: <AlignStartVerticalIcon /> },
  { how: "hcentre", label: "Align centres across", icon: <AlignCenterVerticalIcon /> },
  { how: "right", label: "Align right", icon: <AlignEndVerticalIcon /> },
  { how: "top", label: "Align top", icon: <AlignStartHorizontalIcon /> },
  { how: "vcentre", label: "Align middles", icon: <AlignCenterHorizontalIcon /> },
  { how: "bottom", label: "Align bottom", icon: <AlignEndHorizontalIcon /> },
];

const ORDER: { move: OrderMove; label: string; icon: React.ReactNode }[] = [
  { move: "front", label: "Bring to front (⇧⌘])", icon: <BringToFrontIcon /> },
  { move: "forward", label: "Bring forward (⌘])", icon: <ChevronUpIcon /> },
  { move: "backward", label: "Send backward (⌘[)", icon: <ChevronDownIcon /> },
  { move: "back", label: "Send to back (⇧⌘[)", icon: <SendToBackIcon /> },
];

/** Align, spread and restack: for a selection of layers. Used in the toolbar and in the panel for several layers. */
export const ArrangeButtons = ({
  count,
  onAlign,
  onDistribute,
  onOrder,
}: {
  count: number;
  onAlign: (how: Alignment) => void;
  onDistribute: (axis: "x" | "y") => void;
  onOrder?: (move: OrderMove) => void;
}) => (
  <>
    <div role="group" aria-label="Align" className="flex items-center gap-0.5">
      {ALIGN.map((a) => (
        <IconButton key={a.how} label={count > 1 ? a.label : `${a.label} on the canvas`} variant="quiet" disabled={!count} onClick={() => onAlign(a.how)}>
          {a.icon}
        </IconButton>
      ))}
    </div>
    <div role="group" aria-label="Spread" className="flex items-center gap-0.5">
      <IconButton label="Spread across evenly" variant="quiet" disabled={count < 3} onClick={() => onDistribute("x")}>
        <AlignHorizontalDistributeCenterIcon />
      </IconButton>
      <IconButton label="Spread down evenly" variant="quiet" disabled={count < 3} onClick={() => onDistribute("y")}>
        <AlignVerticalDistributeCenterIcon />
      </IconButton>
    </div>
    {onOrder ? (
      <div role="group" aria-label="Order" className="flex items-center gap-0.5">
        {ORDER.map((o) => (
          <IconButton key={o.move} label={o.label} variant="quiet" disabled={!count} onClick={() => onOrder(o.move)}>
            {o.icon}
          </IconButton>
        ))}
      </div>
    ) : null}
  </>
);

export const BoardToolbar = ({
  onAdd,
  onPickSvg,
  canAddQr,
  guestPhoto,
  hasLogo,
  selection,
  onAlign,
  onDistribute,
  onOrder,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  zoom,
  fit,
  onZoom,
  right,
}: {
  onAdd: (spec: NewLayer) => void;
  onPickSvg: () => void;
  canAddQr: boolean;
  guestPhoto: boolean;
  hasLogo: boolean;
  selection: number;
  onAlign: (how: Alignment) => void;
  onDistribute: (axis: "x" | "y") => void;
  onOrder: (move: OrderMove) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  zoom: number;
  /** The zoom that fits the canvas in the stage. */
  fit: number;
  onZoom: (z: number | "fit") => void;
  right?: React.ReactNode;
}) => (
  <div role="toolbar" aria-label="Design tools" className="border-line-soft flex flex-wrap items-center gap-1.5 border-b px-3 py-2">
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="secondary">
          <PlusIcon /> Add <ChevronDownIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[220px]">
        <DropdownMenuItem onSelect={() => onAdd({ kind: "text" })}>
          <TypeIcon /> Text
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onAdd({ kind: "shape", shape: "rect" })}>
          <SquareIcon /> Rectangle
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onAdd({ kind: "shape", shape: "ellipse" })}>
          <CircleIcon /> Circle
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onAdd({ kind: "image", source: hasLogo ? "org_logo" : "upload" })}>
          <ImageIcon /> {hasLogo ? "Club logo" : "Image"}
        </DropdownMenuItem>
        {hasLogo ? (
          <DropdownMenuItem onSelect={() => onAdd({ kind: "image", source: "upload" })}>
            <ImageIcon /> Image
          </DropdownMenuItem>
        ) : null}
        {guestPhoto ? (
          <DropdownMenuItem onSelect={() => onAdd({ kind: "image", source: "guest_photo" })}>
            <UserRoundIcon /> Guest photo
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onSelect={onPickSvg}>
          <SparklesIcon /> Artwork (SVG)
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={!canAddQr} onSelect={() => onAdd({ kind: "qr" })}>
          <QrCodeIcon /> QR code
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <Rule />
    <IconButton label="Undo (⌘Z)" variant="quiet" disabled={!canUndo} onClick={onUndo}>
      <Undo2Icon />
    </IconButton>
    <IconButton label="Redo (⇧⌘Z)" variant="quiet" disabled={!canRedo} onClick={onRedo}>
      <Redo2Icon />
    </IconButton>
    <Rule />
    <ArrangeButtons count={selection} onAlign={onAlign} onDistribute={onDistribute} onOrder={onOrder} />
    <Rule />
    <IconButton label="Zoom out (⌘−)" variant="quiet" onClick={() => onZoom(nextZoom(zoom, -1))}>
      <ZoomOutIcon />
    </IconButton>
    <NativeSelect
      size="sm"
      aria-label="Zoom"
      value={Math.abs(zoom - fit) < 0.001 ? "fit" : String(zoom)}
      onChange={(e) => onZoom(e.target.value === "fit" ? "fit" : Number(e.target.value))}
      className="w-[104px]"
    >
      <option value="fit">Fit · {Math.round(fit * 100)}%</option>
      {ZOOM_STEPS.map((z) => (
        <option key={z} value={z}>
          {Math.round(z * 100)}%
        </option>
      ))}
      {!ZOOM_STEPS.some((z) => Math.abs(z - zoom) < 0.001) && Math.abs(zoom - fit) >= 0.001 ? <option value={String(zoom)}>{Math.round(zoom * 100)}%</option> : null}
    </NativeSelect>
    <IconButton label="Zoom in (⌘+)" variant="quiet" onClick={() => onZoom(nextZoom(zoom, 1))}>
      <ZoomInIcon />
    </IconButton>
    <span className="flex-1" />
    {right}
  </div>
);
