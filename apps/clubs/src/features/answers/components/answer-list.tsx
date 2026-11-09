import * as React from "react";
import { cn } from "@moa/ui";

/** One question and what this person answered, as stored: text, a list of ticked options, a yes/no, or nothing. */
export interface AnswerItem {
  key: string;
  /** The question as the club wrote it: a sentence, shown as written. */
  label: string;
  value: unknown;
}

/**
 * An answer as the pieces to show: every ticked option of a several-choices
 * question, else the one value. Empty when they left it blank.
 */
export function answerParts(v: unknown): string[] {
  if (Array.isArray(v)) return v.flatMap((x) => answerParts(x));
  if (v === null || v === undefined) return [];
  if (typeof v === "boolean") return [v ? "Yes" : "No"];
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    return "value" in o ? answerParts(o.value) : [JSON.stringify(v)];
  }
  const text = String(v);
  return text.trim() ? [text] : [];
}

/** Anything long and unbroken — an address, a link, "Employee/Student/Others" — wraps inside its own box. */
const WRAP = "min-w-0 [overflow-wrap:anywhere]";

/**
 * A person's registration answers: each question as the club wrote it (a
 * sentence, in sentence case, never squeezed into an uppercase key column),
 * the answer under it. Where the list has the room (42rem and up of its own
 * width, not the window's) the answer moves to a wide second column.
 *
 * Long words and links break inside their box, so a question can never be
 * painted over its answer; a written answer keeps its line breaks; several
 * ticked options are shown as one chip each; a blank is "not answered".
 *
 * For short keys on an overview card (Name, Email, Ticket) the figure
 * kit's DefinitionRows is still the one; this is for what people wrote.
 */
export function AnswerList({ items, className }: { items: readonly AnswerItem[]; className?: string }) {
  if (!items.length) return null;
  return (
    <div className={cn("@container", className)} data-slot="answer-list">
      <dl className="divide-line-soft m-0 divide-y">
        {items.map((item) => {
          const parts = answerParts(item.value);
          return (
            <div key={item.key} className="grid gap-1 py-2.5 first:pt-0 last:pb-0 @2xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] @2xl:gap-5">
              <dt className={cn(WRAP, "text-ink-2 text-[12.5px] leading-[1.45]")}>{item.label}</dt>
              <dd className={cn(WRAP, "text-ink m-0 text-[13.5px] leading-[1.5]")}>
                {parts.length === 0 ? (
                  <span className="text-ink-3">not answered</span>
                ) : parts.length === 1 ? (
                  <span className="whitespace-pre-line">{parts[0]}</span>
                ) : (
                  <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0" aria-label={`${parts.length} chosen`}>
                    {parts.map((p, i) => (
                      <li key={`${i}-${p}`} className={cn(WRAP, "bg-sunken border-line-soft text-ink rounded-full border px-2.5 py-0.5 text-[12.5px] leading-[1.45]")}>
                        {p}
                      </li>
                    ))}
                  </ul>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}
