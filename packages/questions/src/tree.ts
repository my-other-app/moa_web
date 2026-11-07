import type { Question, ShowIf } from "./types";

/**
 * The list as a tree, for the builder (§7): a question's children are the
 * questions whose `show_if` names it. The list stays the truth -- render
 * and evaluation order are list order -- and every operation here returns a
 * new list in which each parent still comes before its children (R1), each
 * subtree in one piece under its parent.
 *
 * Generic over the question type so the builder's own rows (which carry
 * react-hook-form ids and the like) pass through untouched.
 */

type Q = Pick<Question, "key" | "show_if">;

/** The keys of every question that depends on this one, directly or through others. */
export function descendantKeys(questions: readonly Q[], key: string): Set<string> {
  const out = new Set<string>();
  let frontier = [key];
  while (frontier.length) {
    const next: string[] = [];
    for (const q of questions) {
      const parent = q.show_if?.key;
      if (parent && frontier.includes(parent) && !out.has(q.key) && q.key !== key) {
        out.add(q.key);
        next.push(q.key);
      }
    }
    frontier = next;
  }
  return out;
}

/** A question and every question under it, by place in the list, in list order. */
export function subtreeIndices(questions: readonly Q[], index: number): number[] {
  const root = questions[index];
  if (!root) return [];
  const under = descendantKeys(questions, root.key);
  return questions.flatMap((q, i) => (i === index || under.has(q.key) ? [i] : []));
}

/** The place of a question's parent in the list, or -1 for an always-shown question (or a missing parent). */
export function parentIndexOf(questions: readonly Q[], index: number): number {
  const key = questions[index]?.show_if?.key;
  return key ? questions.findIndex((q) => q.key === key) : -1;
}

/** Questions that are children of the same parent (or both always shown). */
const siblings = (a: Q, b: Q) => (a.show_if?.key ?? null) === (b.show_if?.key ?? null);

/** Takes the questions at `take` out and puts them, in their order, before list index `before` (an index into the original list; length for the end). */
function relocate<T>(list: readonly T[], take: readonly number[], before: number): T[] {
  const taken = new Set(take);
  const block = take.map((i) => list[i]!);
  const out: T[] = [];
  list.forEach((item, i) => {
    if (i === before) out.push(...block);
    if (!taken.has(i)) out.push(item);
  });
  if (before >= list.length) out.push(...block);
  return out;
}

/**
 * Moves a question one place up or down among its siblings, taking its
 * whole subtree with it and stepping over the sibling's whole subtree. A
 * child never moves above its parent: the first child of a parent cannot
 * move up. Null when there is nowhere to go.
 */
export function moveQuestion<T extends Q>(questions: readonly T[], index: number, direction: "up" | "down"): T[] | null {
  const me = questions[index];
  if (!me) return null;
  const mine = subtreeIndices(questions, index);
  const mineSet = new Set(mine);
  if (direction === "up") {
    for (let j = index - 1; j >= 0; j--) {
      if (mineSet.has(j)) continue;
      const other = questions[j]!;
      if (other.key === me.show_if?.key) return null; // the parent: a child stays below it
      if (siblings(other, me)) return relocate(questions, mine, j);
    }
    return null;
  }
  for (let j = index + 1; j < questions.length; j++) {
    if (mineSet.has(j)) continue;
    const other = questions[j]!;
    if (siblings(other, me)) {
      const theirs = subtreeIndices(questions, j);
      return relocate(questions, mine, theirs[theirs.length - 1]! + 1);
    }
  }
  return null;
}

/** Whether `moveQuestion` would go anywhere: what the builder's move buttons are enabled by. */
export const canMove = (questions: readonly Q[], index: number, direction: "up" | "down"): boolean =>
  moveQuestion(questions, index, direction) !== null;

/**
 * Sets or clears a question's condition, and moves it (with its subtree)
 * to where it now belongs: the last child of its new parent, or -- once
 * always shown -- straight after the subtree it was nested in, among the
 * always-shown questions. The new parent must come before the question and
 * not be under it (the picker offers only those); otherwise null.
 */
export function setCondition<T extends Q>(questions: readonly T[], index: number, showIf: ShowIf | null): T[] | null {
  const me = questions[index];
  if (!me) return null;
  const mine = subtreeIndices(questions, index);
  const updated = questions.map((q, i) => (i === index ? ({ ...q, show_if: showIf } as T) : q));

  if (showIf) {
    const p = questions.findIndex((q) => q.key === showIf.key);
    if (p < 0 || p >= index || mine.includes(p)) return null;
    // Same parent as before: the condition's values changed, the place did not.
    if (me.show_if?.key === showIf.key) return updated;
    const theirs = subtreeIndices(questions, p).filter((i) => !mine.includes(i));
    return relocate(updated, mine, theirs[theirs.length - 1]! + 1);
  }

  if (!me.show_if) return updated;
  // Now always shown: after the whole subtree of its top ancestor, so it is not left inside another's branch.
  let top = index;
  for (let up = parentIndexOf(questions, top), guard = 0; up >= 0 && guard < questions.length; up = parentIndexOf(questions, up), guard++) top = up;
  const block = subtreeIndices(questions, top).filter((i) => !mine.includes(i));
  return relocate(updated, mine, block.length ? block[block.length - 1]! + 1 : index);
}

/**
 * Deletes a question. `children: "delete"` takes everything under it too;
 * `"keep"` keeps its children, now always shown (§7), each still carrying
 * its own subtree, placed where an always-shown question belongs.
 */
export function removeQuestion<T extends Q>(questions: readonly T[], index: number, children: "delete" | "keep"): T[] {
  const me = questions[index];
  if (!me) return [...questions];
  if (children === "delete") {
    const gone = new Set(subtreeIndices(questions, index));
    return questions.filter((_, i) => !gone.has(i));
  }
  let list: T[] = [...questions];
  // Free each direct child (moving it out of the branch), the last first so they keep their order; then take the question out.
  for (let guard = 0; guard < questions.length; guard++) {
    let at = -1;
    list.forEach((q, i) => {
      if (q.show_if?.key === me.key) at = i;
    });
    if (at < 0) break;
    const next = setCondition(list, at, null);
    if (!next) break;
    list = next;
  }
  return list.filter((q) => q !== me);
}

/** A parent's key changed (its label was retyped): its children's conditions follow it. */
export function renameKey<T extends Q>(questions: readonly T[], from: string, to: string): T[] {
  if (from === to) return [...questions];
  return questions.map((q) => (q.show_if?.key === from ? ({ ...q, show_if: { ...q.show_if, key: to } } as T) : q));
}
