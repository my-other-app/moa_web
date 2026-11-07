import { CHOICE_TYPES, MAX_DEPTH, MAX_QUESTIONS, type Question } from "./types";

/**
 * R1–R6 of the contract: the definitions the server refuses, refused in the
 * dashboard first, in the same plain words. Each problem names the
 * question it is about and the rule.
 */

export type Rule = "R1" | "R2" | "R3" | "R4" | "R5" | "R6";

export interface Problem {
  rule: Rule;
  /** The question the problem is about, by its place in the list; -1 for the form as a whole. */
  index: number;
  key: string;
  /** Plain words, naming the question: "'PG specialisation' depends on 'Degree type', which must come before it." */
  message: string;
}

/** How a question is named in a message: its label, else its key. */
export const nameOf = (q: Pick<Question, "key" | "label"> | undefined, fallback = "a question"): string =>
  q ? `'${q.label?.trim() || q.key}'` : fallback;

/** Whether a question can decide what is shown (R2): a one-choice, several-choices or dropdown question with options. */
export function canBeParent(q: Question | undefined): boolean {
  return !!q && CHOICE_TYPES.has(q.field_type ?? "") && !!q.options?.length;
}

/**
 * How deep a question is nested: the number of conditions on its chain of
 * parents (an always-shown question is 0, its child 1). Stops at a cycle
 * or a missing parent, counting what it walked.
 */
export function depthOf(questions: readonly Question[], key: string): number {
  const byKey = new Map(questions.map((q) => [q.key, q]));
  let depth = 0;
  const walked = new Set<string>([key]);
  let at = byKey.get(key);
  while (at?.show_if) {
    depth++;
    const next = at.show_if.key;
    if (walked.has(next)) break;
    walked.add(next);
    at = byKey.get(next);
  }
  return depth;
}

/** Every problem with the form, in list order; empty when the server would take it. */
export function checkDefinition(questions: readonly Question[]): Problem[] {
  const problems: Problem[] = [];
  if (questions.length > MAX_QUESTIONS) {
    problems.push({ rule: "R4", index: -1, key: "", message: `A form can ask at most ${MAX_QUESTIONS} questions; this one has ${questions.length}.` });
  }

  const firstAt = new Map<string, number>();
  questions.forEach((q, i) => {
    if (firstAt.has(q.key)) {
      problems.push({ rule: "R5", index: i, key: q.key, message: `${nameOf(q)} has the same key as ${nameOf(questions[firstAt.get(q.key)!])}. Every question needs its own.` });
    } else {
      firstAt.set(q.key, i);
    }
  });

  questions.forEach((q, i) => {
    const cond = q.show_if;
    if (!cond) return;
    const at = firstAt.get(cond.key);
    const parent = at === undefined ? undefined : questions[at];
    if (cond.key === q.key) {
      problems.push({ rule: "R1", index: i, key: q.key, message: `${nameOf(q)} can't depend on itself.` });
      return;
    }
    if (!parent || at === undefined) {
      problems.push({ rule: "R1", index: i, key: q.key, message: `${nameOf(q)} depends on a question that isn't in this form.` });
      return;
    }
    if (at > i) {
      problems.push({ rule: "R1", index: i, key: q.key, message: `${nameOf(q)} depends on ${nameOf(parent)}, which must come before it.` });
      return;
    }
    if (!canBeParent(parent)) {
      problems.push({ rule: "R2", index: i, key: q.key, message: `${nameOf(q)} depends on ${nameOf(parent)}, which isn't a choice question. Only a question with options can show or hide others.` });
      return;
    }
    if (!cond.any_of.length) {
      problems.push({ rule: "R3", index: i, key: q.key, message: `${nameOf(q)} needs at least one answer to ${nameOf(parent)} that shows it.` });
      return;
    }
    const options = parent.options ?? [];
    const stray = cond.any_of.find((v) => !options.includes(v));
    if (stray !== undefined) {
      problems.push({ rule: "R3", index: i, key: q.key, message: `${nameOf(q)} is shown when ${nameOf(parent)} is '${stray}', which isn't one of its options.` });
      return;
    }
    const depth = depthOf(questions, q.key);
    if (depth > MAX_DEPTH) {
      problems.push({ rule: "R4", index: i, key: q.key, message: `${nameOf(q)} is nested ${depth} deep. Questions can be nested at most ${MAX_DEPTH} deep.` });
    }
  });
  return problems;
}

/** The questions whose condition uses this option of this parent. */
export function dependentsOfOption(questions: readonly Question[], parentKey: string, option: string): Question[] {
  return questions.filter((q) => q.show_if?.key === parentKey && q.show_if.any_of.includes(option));
}

/**
 * R6: changing a parent's options. Removing or renaming an option that a
 * child's condition uses is refused, naming the child; null when the change
 * is fine.
 */
export function checkOptionChange(questions: readonly Question[], parentIndex: number, nextOptions: readonly string[]): Problem | null {
  const parent = questions[parentIndex];
  if (!parent) return null;
  for (const option of parent.options ?? []) {
    if (nextOptions.includes(option)) continue;
    const child = dependentsOfOption(questions, parent.key, option)[0];
    if (child) {
      return {
        rule: "R6",
        index: parentIndex,
        key: parent.key,
        message: `'${option}' can't be removed or renamed: ${nameOf(child)} is shown when ${nameOf(parent)} is '${option}'. Change that question's condition first.`,
      };
    }
  }
  return null;
}

/** R2 before the fact: a parent's answer type changing to one that cannot be a parent, while questions depend on it. */
export function checkTypeChange(questions: readonly Question[], parentIndex: number, nextType: string): Problem | null {
  const parent = questions[parentIndex];
  if (!parent || CHOICE_TYPES.has(nextType)) return null;
  const child = questions.find((q) => q.show_if?.key === parent.key);
  if (!child) return null;
  return {
    rule: "R2",
    index: parentIndex,
    key: parent.key,
    message: `${nameOf(parent)} must stay a choice question: ${nameOf(child)} depends on its answer. Change that question's condition first.`,
  };
}
