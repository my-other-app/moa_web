"use client";

import * as React from "react";

/**
 * Undo and redo over a value the caller already owns.
 *
 * The designer's state lives in the host -- the club form or the event
 * workspace -- so this cannot own it. It keeps a stack of past values
 * instead, and hands back a `commit` the editor calls in place of the raw
 * setter.
 *
 * Why this matters here: every other control in the product is a form field
 * you can retype. A design is not. Dragging a layer somewhere wrong loses a
 * position that took a minute to get right, and without undo the only way
 * back is to remember the numbers.
 */
export interface History<T> {
  commit: (next: T, options?: { coalesce?: string }) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  reset: () => void;
}

const LIMIT = 50;

export function useHistory<T>(
  value: T,
  onChange: (next: T) => void
): History<T> {
  /*
   * State, not refs: the undo button has to enable itself when the first edit
   * lands, and reading a ref during render to decide that is exactly what it
   * sounds like -- a value React has not agreed to re-render for.
   */
  const [past, setPast] = React.useState<T[]>([]);
  const [future, setFuture] = React.useState<T[]>([]);

  /*
   * A drag fires a change per pointer move. Without coalescing, undo would
   * step back one pixel at a time through a hundred entries -- so successive
   * commits carrying the same key replace each other instead of stacking.
   * A ref is right here because nothing renders from it.
   */
  const lastKey = React.useRef<string | null>(null);

  /*
   * Plain closures over the current props rather than memoised callbacks
   * reading a ref. The ref version had to be written during render to stay
   * fresh, which is the thing refs are not for; these are only ever called
   * from event handlers, so recreating them each render costs nothing.
   */
  const commit = (next: T, options?: { coalesce?: string }) => {
    const key = options?.coalesce ?? null;
    const continuing = key !== null && key === lastKey.current;

    if (!continuing) {
      setPast((stack) => [...stack, value].slice(-LIMIT));
      setFuture([]);
    }
    lastKey.current = key;
    onChange(next);
  };

  const undo = () => {
    const previous = past[past.length - 1];
    if (previous === undefined) return;
    setPast((stack) => stack.slice(0, -1));
    setFuture((ahead) => [value, ...ahead]);
    // Cleared so the next drag starts its own entry rather than merging into
    // the one just undone.
    lastKey.current = null;
    onChange(previous);
  };

  const redo = () => {
    const next = future[0];
    if (next === undefined) return;
    setFuture((ahead) => ahead.slice(1));
    setPast((stack) => [...stack, value]);
    lastKey.current = null;
    onChange(next);
  };

  const reset = () => {
    setPast([]);
    setFuture([]);
    lastKey.current = null;
  };

  return {
    commit,
    undo,
    redo,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    reset,
  };
}
