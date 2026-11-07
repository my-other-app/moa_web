import { requiredWhenShown } from "./visibility";
import type { Question, ShowIf } from "./types";

/**
 * §5 of the contract: how a question goes over the wire, both ways.
 *
 * Read: a question *with* `show_if` comes as `required: false`,
 * `required_when_shown: <the club's setting>` (so the live app builds, which
 * render every question flat, are never blocked by a hidden branch). An
 * editor must read `required_when_shown`, or a round trip through it would
 * save `required: false` and lose what the club set.
 *
 * Write: `required_when_shown` beside `show_if` is the truth for the server.
 * `required` is sent as the club's setting too -- storage keeps the intent
 * in `required`, so a server that has not learnt `show_if` yet would at
 * least keep the question's required setting rather than drop it to false.
 */

/** A `show_if` as read, or null when it is absent or not one (no key, no values). */
export function readShowIf(raw: unknown): ShowIf | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.key !== "string" || !o.key) return null;
  const anyOf = Array.isArray(o.any_of) ? o.any_of.filter((v): v is string => typeof v === "string") : [];
  return { key: o.key, any_of: anyOf };
}

/**
 * One question as an editor holds it, from what a read endpoint sent:
 * `required` is the club's intent (required when shown), `show_if` kept,
 * `required_when_shown` folded into `required`.
 */
export function questionFromWire(raw: Record<string, unknown>): Question {
  const showIf = readShowIf(raw.show_if);
  const asRead: Question = {
    key: String(raw.key ?? ""),
    label: typeof raw.label === "string" ? raw.label : null,
    field_type: typeof raw.field_type === "string" ? raw.field_type : null,
    required: typeof raw.required === "boolean" ? raw.required : null,
    options: Array.isArray(raw.options) ? raw.options.filter((o): o is string => typeof o === "string") : null,
    show_if: showIf,
    required_when_shown: typeof raw.required_when_shown === "boolean" ? raw.required_when_shown : null,
  };
  const out: Question = {
    key: asRead.key,
    label: asRead.label,
    field_type: asRead.field_type,
    required: requiredWhenShown(asRead),
  };
  if (asRead.options?.length) out.options = asRead.options;
  if (showIf) out.show_if = showIf;
  return out;
}

/** The wire entry for one question of an editor: what an event create or update sends. */
export interface WireQuestion {
  key: string;
  label: string;
  field_type: string;
  required: boolean;
  options?: string[];
  show_if?: ShowIf;
  required_when_shown?: boolean;
}

/**
 * One question as event create and update are sent it. With a condition:
 * `show_if` and `required_when_shown` always (§5). Without: exactly as
 * before the feature, `required` and no `required_when_shown`.
 */
export function questionToWire(q: Question): WireQuestion {
  const required = q.required ?? true;
  const out: WireQuestion = {
    key: q.key,
    label: q.label ?? "",
    field_type: q.field_type ?? "text",
    required,
  };
  if (q.options?.length) out.options = [...q.options];
  if (q.show_if) {
    out.show_if = { key: q.show_if.key, any_of: [...q.show_if.any_of] };
    out.required_when_shown = required;
  }
  return out;
}

/** A whole `additional_details` list from a read endpoint, or [] for anything that is not one. */
export function questionsFromWire(raw: unknown): Question[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((q) => (q && typeof q === "object" && typeof (q as { key?: unknown }).key === "string" ? [questionFromWire(q as Record<string, unknown>)] : []));
}
