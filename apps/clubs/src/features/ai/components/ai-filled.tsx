"use client";

import * as React from "react";
import { SparklesIcon } from "lucide-react";
import { cn } from "@moa/ui";

/**
 * Which fields AI filled, so the form can mark them until the organiser
 * changes them.
 *
 * The form hands over what AI put in each field and the values as they are
 * now; a field stays marked while the two are the same. Editing it (or
 * clearing it) drops the mark, with no event to listen for: the steps set
 * values in several ways (typing, pickers, setValue), and comparing is the
 * one test all of them pass.
 */
interface AiFilledValue {
  has: (name: string) => boolean;
}

const AiFilledContext = React.createContext<AiFilledValue>({ has: () => false });

function same(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a instanceof Blob || b instanceof Blob) return false;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

/** Reads `name` ("about", "speakers") from the form's values; only top-level names are marked. */
const read = (values: Record<string, unknown>, name: string) => values[name];

export function AiFilledProvider({ filled, values, children }: { filled: Record<string, unknown>; values: Record<string, unknown>; children: React.ReactNode }) {
  const value = React.useMemo<AiFilledValue>(() => ({ has: (name) => name in filled && same(read(values, name), filled[name]) }), [filled, values]);
  return <AiFilledContext.Provider value={value}>{children}</AiFilledContext.Provider>;
}

/** `has(name)`: AI filled the field and nobody has changed it since. */
export function useAiFilled(): AiFilledValue {
  return React.useContext(AiFilledContext);
}

/** The ring a filled field carries. On the field's FormItem; an outline, so nothing moves when it goes. */
export function aiFilledClass(on: boolean): string | undefined {
  return on ? "rounded-lg outline-2 outline-offset-4 outline-brand/40" : undefined;
}

/** "AI" beside a filled field's label; says "filled by AI" to a screen reader. */
export function AiFilledTag({ on, className }: { on: boolean; className?: string }) {
  if (!on) return null;
  return (
    <span
      data-slot="ai-filled"
      className={cn("bg-brand-soft text-brand ml-1.5 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 align-middle font-mono text-[10px] font-semibold tracking-[0.04em]", className)}
    >
      <SparklesIcon className="size-3" aria-hidden="true" />
      <span aria-hidden="true">AI</span>
      <span className="sr-only">filled by AI, check it</span>
    </span>
  );
}
