import type { Question } from "./types";

/** "Student", "Student or Working", "UG, PG or Diploma": a list in words. */
export function orList(values: readonly string[]): string {
  if (values.length <= 1) return values[0] ?? "";
  return `${values.slice(0, -1).join(", ")} or ${values[values.length - 1]}`;
}

/**
 * The condition in words, for the chip under a question in the builder:
 * "Shown when Status is Student", or for a several-choices parent "Shown
 * when Tracks includes AI or Web". Null for an always-shown question.
 */
export function conditionText(questions: readonly Question[], q: Question): string | null {
  const cond = q.show_if;
  if (!cond) return null;
  const parent = questions.find((p) => p.key === cond.key);
  const name = parent?.label?.trim() || parent?.key || cond.key;
  const verb = parent?.field_type === "checkbox" ? "includes" : "is";
  return `Shown when ${name} ${verb} ${orList(cond.any_of) || "…"}`;
}

/** The answer types in the words the club dashboard's builder uses for them. */
export const ANSWER_TYPE_WORDS: Readonly<Record<string, string>> = {
  text: "Short text",
  textarea: "Long text",
  number: "Number",
  email: "Email",
  tel: "Phone",
  url: "Link",
  date: "Date",
  time: "Time",
  datetime: "Date & time",
  radio: "One choice",
  checkbox: "Several choices",
  select: "Dropdown",
};
