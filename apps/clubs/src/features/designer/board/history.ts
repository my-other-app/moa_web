"use client";

import * as React from "react";

/**
 * Undo and redo for the board: every change is a step, except that a run of
 * changes with the same group (a drag, a burst of nudges, typing in one
 * field) inside a second and a bit is one step. 200 steps are kept.
 */

export const HISTORY_LIMIT = 200;
const GROUP_MS = 1200;

export interface History<T> {
  past: T[];
  present: T;
  future: T[];
  group: string | null;
  at: number;
}

export type Update<T> = T | ((current: T) => T);

export type HistoryAction<T> =
  | { type: "set"; next: Update<T>; group?: string; now?: number }
  | { type: "replace"; next: T }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "seal" };

export const startHistory = <T>(present: T): History<T> => ({ past: [], present, future: [], group: null, at: 0 });

export function reduce<T>(h: History<T>, a: HistoryAction<T>): History<T> {
  switch (a.type) {
    case "set": {
      const next = typeof a.next === "function" ? (a.next as (c: T) => T)(h.present) : a.next;
      if (next === h.present) return h;
      const now = a.now ?? Date.now();
      if (a.group && a.group === h.group && now - h.at < GROUP_MS) return { ...h, present: next, at: now };
      return { past: [...h.past, h.present].slice(-HISTORY_LIMIT), present: next, future: [], group: a.group ?? null, at: now };
    }
    case "replace":
      // What the server saved, in place of what was sent: not a step of its own.
      return { ...h, present: a.next, group: null };
    case "undo": {
      const prev = h.past.at(-1);
      return prev === undefined ? h : { past: h.past.slice(0, -1), present: prev, future: [h.present, ...h.future], group: null, at: 0 };
    }
    case "redo": {
      const next = h.future[0];
      return next === undefined ? h : { past: [...h.past, h.present], present: next, future: h.future.slice(1), group: null, at: 0 };
    }
    case "seal":
      return h.group === null ? h : { ...h, group: null };
  }
}

export function useHistory<T>(initial: T) {
  const [h, dispatch] = React.useReducer(reduce<T>, initial, startHistory);
  const set = React.useCallback((next: Update<T>, group?: string) => dispatch({ type: "set", next, group }), []);
  const replace = React.useCallback((next: T) => dispatch({ type: "replace", next }), []);
  const undo = React.useCallback(() => dispatch({ type: "undo" }), []);
  const redo = React.useCallback(() => dispatch({ type: "redo" }), []);
  const seal = React.useCallback(() => dispatch({ type: "seal" }), []);
  return { value: h.present, set, replace, undo, redo, seal, canUndo: h.past.length > 0, canRedo: h.future.length > 0 };
}
