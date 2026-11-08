import { questionToWire } from "./wire";
import type { Question } from "./types";

/**
 * Question keys (missing-answers contract §1.1). Answers are stored under a
 * question's key, so a key is made from the label once -- when the question
 * is created -- and never re-derived afterwards, whatever the label becomes:
 * rewording "Collage" to "College" keeps every answer given under `collage`.
 * A key that clashes with one the form already has gets `_2`, `_3`, … so two
 * questions never share answers (R5).
 */

/** The longest key the editors make. */
export const KEY_MAX = 40;

/** A label as a snake_case key: "T-shirt size" → "t_shirt_size". Empty for a label with no letters or digits. */
export function keyFromLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, KEY_MAX);
}

/**
 * A key for a new question with this label that none of `taken` is: the
 * label's own key, else it with `_2`, `_3`, … (cut so the whole stays within
 * KEY_MAX). A label with nothing to make a key from is "question".
 */
export function uniqueKey(label: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const root = keyFromLabel(label) || "question";
  if (!used.has(root)) return root;
  for (let n = 2; ; n++) {
    const suffix = `_${n}`;
    const key = `${root.slice(0, KEY_MAX - suffix.length).replace(/_+$/, "")}${suffix}`;
    if (!used.has(key)) return key;
  }
}

/**
 * Whether two forms differ in anything an attendee or a stored answer could
 * feel: a question added, removed, moved, reworded, retyped, its options,
 * whether it must be answered, or its condition. Compared as they go over
 * the wire, so a builder's own row fields (react-hook-form ids, a "new"
 * mark) never count as a change.
 */
export function formChanged(before: readonly Question[], after: readonly Question[]): boolean {
  const wire = (list: readonly Question[]) => JSON.stringify(list.map((q) => questionToWire({ ...q, options: q.options?.map((o) => o.trim()).filter(Boolean) })));
  return wire(before) !== wire(after);
}
