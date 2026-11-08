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
 * A question's label changed in an editor (§1.1): the list with the new
 * label, and the key it should have now.
 *
 * - A saved question (`followsLabel` false) keeps the key it was loaded
 *   with, whatever its label becomes: its answers are stored under it.
 * - A question not saved yet takes its key from its label, unique among the
 *   others (`_2`, `_3`, …), and every question whose condition names it
 *   follows to the new key.
 * - A label cleared to be retyped keeps the key it had, so the questions
 *   under it never point at nothing.
 *
 * Pure, and generic over the editor's own rows, so every editor runs the
 * same rule.
 */
export function relabel<Q extends Question>(questions: readonly Q[], index: number, label: string, followsLabel: boolean): Q[] {
  const me = questions[index];
  if (!me) return [...questions];
  const current = me.key;
  const others = questions.flatMap((q, j) => (j !== index && q.key ? [q.key] : []));
  const key = followsLabel && label.trim() ? uniqueKey(label, others) : current;
  return questions.map((q, j) => {
    if (j === index) return { ...q, label, key };
    if (key !== current && current && q.show_if?.key === current) return { ...q, show_if: { ...q.show_if, key } };
    return q;
  });
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
