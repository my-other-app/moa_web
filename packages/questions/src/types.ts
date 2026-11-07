/**
 * Conditional registration questions: the shapes of
 * feature-register/conditional-questions-contract.md, which the backend, the
 * website and the app build against too. Nothing here renders; both
 * dashboards (apps/clubs and apps/admin) use it.
 */

/** "Only show this if…": the parent question's key, and the parent answers that reveal it. */
export interface ShowIf {
  key: string;
  any_of: string[];
}

/**
 * One entry of an event's `additional_details`, as the editors and the forms
 * hold it. `required` is the club's intent: required *when shown* (§2).
 */
export interface Question {
  key: string;
  label?: string | null;
  field_type?: string | null;
  required?: boolean | null;
  options?: string[] | null;
  /** Absent or null: always shown. */
  show_if?: ShowIf | null;
  /**
   * Only on the wire, and only beside `show_if` (§5): what the club set.
   * Read endpoints send a conditional question as `required: false` so old
   * apps, which render every question flat, are never blocked by a branch
   * they cannot see.
   */
  required_when_shown?: boolean | null;
}

/** Answers keyed by question key: text, or the ticked options of a several-choices question. */
export type Answers = Record<string, unknown>;

/** The answer types that are a choice among the organiser's options. */
export const CHOICE_TYPES: ReadonlySet<string> = new Set(["select", "radio", "checkbox"]);

/** The most a form may hold (R4). */
export const MAX_QUESTIONS = 50;

/** How deep conditions may nest: a question's chain of parents is at most this long (R4). */
export const MAX_DEPTH = 5;
