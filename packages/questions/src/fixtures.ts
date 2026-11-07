import type { Question } from "./types";

/**
 * §12 of the contract: the shared test form every repo tests. Held as an
 * editor holds it (`required` is the club's intent, required when shown).
 * The wire form of it -- conditional questions as `required: false`,
 * `required_when_shown: true` -- is `SHARED_FORM_WIRE`.
 */
export const SHARED_FORM: Question[] = [
  { key: "status", label: "Status", field_type: "radio", options: ["Student", "Working"], required: true },
  { key: "college", label: "College name", field_type: "text", required: true, show_if: { key: "status", any_of: ["Student"] } },
  { key: "year", label: "Year", field_type: "select", options: ["1", "2", "3", "4"], required: true, show_if: { key: "status", any_of: ["Student"] } },
  { key: "degree_type", label: "Degree type", field_type: "radio", options: ["UG", "PG"], required: true, show_if: { key: "status", any_of: ["Student"] } },
  { key: "pg_spec", label: "PG specialisation", field_type: "text", required: true, show_if: { key: "degree_type", any_of: ["PG"] } },
  { key: "company", label: "Company", field_type: "text", required: true, show_if: { key: "status", any_of: ["Working"] } },
  { key: "experience", label: "Experience", field_type: "select", options: ["0-2", "3-5", "5+"], required: true, show_if: { key: "status", any_of: ["Working"] } },
  { key: "tshirt", label: "T-shirt size", field_type: "select", options: ["S", "M", "L", "XL"], required: true },
];

/** The shared form as every read endpoint sends it (§5). */
export const SHARED_FORM_WIRE: Array<Record<string, unknown>> = SHARED_FORM.map((q) =>
  q.show_if ? { ...q, required: false, required_when_shown: q.required } : { ...q },
);
