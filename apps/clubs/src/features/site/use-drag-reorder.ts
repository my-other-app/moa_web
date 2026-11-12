"use client";

import * as React from "react";

/**
 * Drag-to-reorder for a list, with the browser's own drag and drop (the
 * repo's way, as on the leads board: no library). A row is draggable only
 * while its handle is held, so text in its fields can still be selected;
 * every list using this also has Move buttons, for the keyboard.
 */
export function useDragReorder(onMove: (from: number, to: number) => void) {
  const [armed, setArmed] = React.useState<number | null>(null);
  const [from, setFrom] = React.useState<number | null>(null);
  const [over, setOver] = React.useState<number | null>(null);

  const reset = () => {
    setArmed(null);
    setFrom(null);
    setOver(null);
  };

  /** On the grip (or the picture): holding it makes the row draggable. */
  const handleProps = (index: number) => ({
    onPointerDown: () => setArmed(index),
    onPointerUp: () => setArmed(null),
  });

  const itemProps = (index: number) => ({
    draggable: armed === index,
    onDragStart: (e: React.DragEvent) => {
      setFrom(index);
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(index));
      }
    },
    onDragOver: (e: React.DragEvent) => {
      if (from === null) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
      if (over !== index) setOver(index);
    },
    onDrop: (e: React.DragEvent) => {
      if (from === null) return;
      e.preventDefault();
      e.stopPropagation();
      if (from !== index) onMove(from, index);
      reset();
    },
    onDragEnd: reset,
    "data-dragging": from === index ? "" : undefined,
    "data-over": over === index && from !== null && from !== index ? (from < index ? "after" : "before") : undefined,
  });

  return { handleProps, itemProps, dragging: from !== null };
}
