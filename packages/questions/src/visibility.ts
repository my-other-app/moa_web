import type { Answers, Question } from "./types";

/**
 * §3 of the contract, the one visibility algorithm every repo runs:
 *
 *   visible(q) = q.show_if is null
 *                OR ( visible(parent(q)) AND matches(answer(parent(q)), q.show_if.any_of) )
 *
 *   matches(answer, any_of) = select / radio : answer ∈ any_of
 *                             checkbox       : at least one ticked value ∈ any_of
 *                             blank answer   : false
 *
 * Parents always come before their children (R1), so one pass in list order
 * computes every question's visibility. A parent that is missing, or that
 * comes after its child (a definition the server refuses), has not been
 * seen by then and counts as hidden -- so its child is hidden too.
 */

/** True when an answer holds nothing: undefined, null, blank text, or no ticks. */
export function isBlankAnswer(answer: unknown): boolean {
  if (answer === undefined || answer === null) return true;
  if (Array.isArray(answer)) return answer.every(isBlankAnswer);
  return String(answer).trim() === "";
}

/**
 * Whether a parent's answer is one that reveals the child. A several-choices
 * answer is the list of ticks (one tick may arrive as the option itself);
 * any one of them in `anyOf` is enough. Compared exactly, as picked from
 * the parent's options.
 */
export function matches(answer: unknown, anyOf: readonly string[]): boolean {
  if (isBlankAnswer(answer)) return false;
  const picked = Array.isArray(answer) ? answer : [answer];
  return picked.some((v) => v !== null && v !== undefined && anyOf.includes(String(v)));
}

/** Every question's visibility for these answers, by key, in one pass in list order. */
export function visibility(questions: readonly Question[], answers: Answers): Map<string, boolean> {
  const seen = new Map<string, boolean>();
  for (const q of questions) {
    const cond = q.show_if;
    if (!cond) {
      seen.set(q.key, true);
      continue;
    }
    const parentVisible = seen.get(cond.key) === true;
    seen.set(q.key, parentVisible && matches(answers[cond.key], cond.any_of ?? []));
  }
  return seen;
}

/** The questions shown for these answers, in list order. */
export function visibleQuestions<Q extends Question>(questions: readonly Q[], answers: Answers): Q[] {
  const shown = visibility(questions, answers);
  return questions.filter((q) => shown.get(q.key) === true);
}

/**
 * The answers with every hidden question's answer dropped (§4.2): what a
 * form sends, and what the server stores. Keys that are not questions of
 * the form are left alone -- they are the caller's.
 */
export function pruneHidden(questions: readonly Question[], answers: Answers): Answers {
  const shown = visibility(questions, answers);
  const out: Answers = {};
  for (const [key, value] of Object.entries(answers)) {
    if (shown.get(key) === false) continue;
    out[key] = value;
  }
  return out;
}

/**
 * The questions whose answer should be cleared now: hidden for these
 * answers, yet holding one. A form clears them the moment a parent's answer
 * changes, so the screen is honest (§8); the server's pruning is only the
 * safety net.
 */
export function hiddenWithAnswers(questions: readonly Question[], answers: Answers): string[] {
  const shown = visibility(questions, answers);
  return questions.filter((q) => shown.get(q.key) === false && !isBlankAnswer(answers[q.key])).map((q) => q.key);
}

/**
 * Whether the club made the question required, read from the wire (§5): for
 * a conditional question `required_when_shown` is the truth (read endpoints
 * send `required: false` beside it), else `required`. Unset reads as
 * required, as the dashboards always have.
 */
export function requiredWhenShown(q: Question): boolean {
  if (q.show_if) return q.required_when_shown ?? q.required ?? true;
  return q.required ?? true;
}

/** Whether the question must be answered for these answers: shown, and required when shown. */
export function isRequiredNow(questions: readonly Question[], answers: Answers, key: string): boolean {
  const q = questions.find((x) => x.key === key);
  if (!q) return false;
  return visibility(questions, answers).get(key) === true && requiredWhenShown(q);
}

/** The visible required questions left blank, in list order: what a form refuses before sending. */
export function missingRequired(questions: readonly Question[], answers: Answers): string[] {
  const shown = visibility(questions, answers);
  return questions.filter((q) => shown.get(q.key) === true && requiredWhenShown(q) && isBlankAnswer(answers[q.key])).map((q) => q.key);
}

/**
 * What changed between two visibilities, in list order: the questions that
 * appeared (for a form to announce, without moving focus) and those that
 * went (for a form to clear).
 */
export function visibilityChange(questions: readonly Question[], before: ReadonlyMap<string, boolean>, after: ReadonlyMap<string, boolean>): { shown: Question[]; hidden: Question[] } {
  return {
    shown: questions.filter((q) => before.get(q.key) !== true && after.get(q.key) === true),
    hidden: questions.filter((q) => before.get(q.key) === true && after.get(q.key) !== true),
  };
}

/**
 * One answer set, as a form an attendee fills applies it: the new answer in,
 * and the answer of every question it hides cleared at once (§4.2, §8).
 */
export function setAnswer(questions: readonly Question[], answers: Answers, key: string, value: unknown): Answers {
  return pruneHidden(questions, { ...answers, [key]: value });
}
