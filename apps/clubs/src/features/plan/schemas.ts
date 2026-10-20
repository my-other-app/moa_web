import { z } from "zod";

import type { Catalog, Entitlements } from "@/features/billing/schemas";

/**
 * What the club's plan allows, as the dashboard shows it.
 *
 * The server is what holds a club to its plan: every gated write is refused
 * with a 403 the dashboard turns into the upgrade dialog. What is here only
 * stops the dashboard *offering* something the server would refuse, and
 * says, before the click, what the club would need.
 *
 * Reads are never gated. A club that drops to a smaller plan keeps seeing
 * everything it made; only adding to or changing it is locked.
 */

/** Always on, whatever the plan (the backend's free tier). Never locked here. */
export const ALWAYS_ON = ["checkin", "certificates", "regform", "reviews", "threads"] as const;

/** The flags with a lock somewhere in the dashboard. */
export const GATED_FEATURES = [
  "tickets",
  "website",
  "quiz",
  "polls",
  "qa",
  "networking",
  "links",
  "report",
  "merch",
  "swag",
  "badges",
  "roles",
  "teams",
  "judging",
  "rounds",
  "finance",
  "custom_domain",
  "ai_assist",
  "mcp",
] as const;
export type GatedFeature = (typeof GATED_FEATURES)[number];
export type PlanFeature = GatedFeature | (typeof ALWAYS_ON)[number];

/**
 * A flag in the club's words, for when the pricing catalogue is not to hand.
 * The catalogue's own labels win (they are the pricing page's).
 */
export const FEATURE_LABEL: Record<GatedFeature, string> = {
  tickets: "Paid tickets",
  website: "The club website",
  quiz: "The live quiz",
  polls: "Live polls",
  qa: "Live Q&A",
  networking: "Attendee networking",
  links: "Tracking links",
  report: "Post-event reports",
  merch: "The merchandise store",
  swag: "Swag handouts",
  badges: "ID cards and badge printing",
  roles: "Team roles",
  teams: "Competitions",
  judging: "Competition judging",
  rounds: "Competition rounds",
  finance: "Finance and expenses",
  custom_domain: "Your own domain for the club website",
  ai_assist: "AI assist",
  mcp: "Connecting AI assistants",
};

/**
 * The cheapest plan that has each flag, as the backend seeds them
 * (migrations/club_plans.py). Only a fallback: the live catalogue says.
 * AI assist has none: until the catalogue lists it, its lock names no plan.
 */
const FALLBACK_TIER: Partial<Record<GatedFeature, { key: string; name: string }>> = {
  tickets: { key: "starter", name: "Starter" },
  website: { key: "starter", name: "Starter" },
  quiz: { key: "growth", name: "Growth" },
  polls: { key: "growth", name: "Growth" },
  qa: { key: "growth", name: "Growth" },
  networking: { key: "growth", name: "Growth" },
  links: { key: "growth", name: "Growth" },
  report: { key: "growth", name: "Growth" },
  merch: { key: "pro", name: "Pro" },
  swag: { key: "pro", name: "Pro" },
  badges: { key: "pro", name: "Pro" },
  roles: { key: "pro", name: "Pro" },
  teams: { key: "pro", name: "Pro" },
  judging: { key: "pro", name: "Pro" },
  rounds: { key: "pro", name: "Pro" },
  finance: { key: "campus", name: "Campus" },
  custom_domain: { key: "growth", name: "Growth" },
  // plan_features.ai_assist: Starter and up (the backend's ai_assist migration).
  ai_assist: { key: "starter", name: "Starter" },
  // plan_features.mcp: Growth, Pro, Campus and Enterprise (docs/MCP.md).
  mcp: { key: "growth", name: "Growth" },
};

/** The limits the server holds a club to. Storage, ticket types and coupons are not among them. */
export const ENFORCED_LIMITS = [
  "events_per_month",
  "committee_seats",
  "announcements_per_month",
  "merch_items_per_event",
  "website_templates",
  "registrations_per_event",
  "registrations_per_month",
] as const;
export type EnforcedLimit = (typeof ENFORCED_LIMITS)[number];

/** How a limit reads: "2 of 2 events this month", "1 of 1 seats". */
export const LIMIT_COPY: Record<EnforcedLimit, { noun: string; period?: string; label: string }> = {
  events_per_month: { noun: "events", period: "this month", label: "Events" },
  committee_seats: { noun: "seats", label: "Committee seats" },
  announcements_per_month: { noun: "announcements", period: "this month", label: "Announcements" },
  merch_items_per_event: { noun: "items", label: "Merchandise items" },
  website_templates: { noun: "templates", label: "Website templates" },
  registrations_per_event: { noun: "registrations", period: "for one event", label: "Registrations per event" },
  registrations_per_month: { noun: "registrations", period: "this month", label: "Registrations" },
};

/** Where every "See plans" goes. */
export const UPGRADE_PATH = "/billing";

/**
 * What the upgrade dialog says: from a lock the dashboard saw coming, or
 * from a refusal the server sent.
 */
export interface PlanLock {
  kind: "feature" | "limit";
  /** The flag (`tickets`) or the limit (`events_per_month`). */
  key: string;
  /** The flag or limit in the club's words. */
  label: string;
  /** The cheapest plan that lifts it, when anyone knows. */
  requiredPlan: string | null;
  requiredPlanName: string | null;
  /** The plan the club is on. */
  planName: string | null;
  /** For a limit: the cap and how much of it is used. */
  limitValue: number | null;
  used: number | null;
  /** The server's own sentence, when the lock came from a refusal. */
  message: string | null;
}

// ─── The server's refusals ───────────────────────────────────────────────

export const PLAN_FEATURE_LOCKED = "PLAN_FEATURE_LOCKED";
export const PLAN_LIMIT_REACHED = "PLAN_LIMIT_REACHED";

/** `errors` of a PLAN_FEATURE_LOCKED 403. */
export const featureLockedSchema = z.object({
  feature: z.string(),
  label: z.string().nullish(),
  required_plan: z.string().nullish(),
  required_plan_name: z.string().nullish(),
  upgrade_url: z.string().nullish(),
});

/** `errors` of a PLAN_LIMIT_REACHED 403. */
export const limitReachedSchema = z.object({
  limit: z.string(),
  limit_value: z.coerce.number().nullish(),
  used: z.coerce.number().nullish(),
  required_plan: z.string().nullish(),
  required_plan_name: z.string().nullish(),
  upgrade_url: z.string().nullish(),
});

export function featureLabel(feature: string): string {
  return (FEATURE_LABEL as Record<string, string>)[feature] ?? feature.replace(/_/g, " ");
}

export function limitCopy(key: string): { noun: string; period?: string; label: string } {
  return (LIMIT_COPY as Record<string, { noun: string; period?: string; label: string }>)[key] ?? { noun: key.replace(/_/g, " "), label: key.replace(/_/g, " ") };
}

/** "2 of 2 events this month · Free", the line a meter reads. */
export function meterText(key: string, used: number, cap: number, planName?: string | null): string {
  const c = limitCopy(key);
  const fig = `${used.toLocaleString("en-IN")} of ${cap.toLocaleString("en-IN")} ${c.noun}${c.period ? ` ${c.period}` : ""}`;
  return planName ? `${fig} · ${planName}` : fig;
}

/** The dialog's title and sentence for a lock. */
export function lockCopy(lock: PlanLock): { title: string; body: string } {
  const on = lock.planName ? `You're on ${lock.planName}. ` : "";
  const up = lock.requiredPlanName ? `${lock.requiredPlanName} and up` : "A bigger plan";
  if (lock.kind === "feature") {
    return {
      title: lock.requiredPlanName ? `${lock.label} is part of ${lock.requiredPlanName} and up` : `${lock.label} isn't on your plan`,
      body: `${on}Upgrade to use it. Everything you've already made stays here for you to look at.`,
    };
  }
  const c = limitCopy(lock.key);
  const plan = lock.planName ?? "your plan";
  if (lock.key === "website_templates" && lock.limitValue) {
    // Not something used up: the plan offers the first N templates to choose from.
    return {
      title: `${plan} includes ${lock.limitValue === 1 ? "one website template" : `${lock.limitValue} website templates`}`,
      body: `${up} ${lock.requiredPlanName ? "include" : "includes"} more templates to choose from. Your site keeps the one it has.`,
    };
  }
  if (lock.limitValue === 0) {
    return {
      title: `${c.label} aren't included on ${plan}`,
      body: `${up} ${lock.requiredPlanName ? "include" : "includes"} them.`,
    };
  }
  const fig = lock.used !== null && lock.limitValue !== null ? `You've used ${lock.used.toLocaleString("en-IN")} of ${lock.limitValue.toLocaleString("en-IN")} ${c.noun}${c.period ? ` ${c.period}` : ""}` : `You've reached ${plan}'s limit on ${c.noun}`;
  return {
    title: fig,
    body: `That's all ${plan} includes${c.period === "this month" ? " this month" : ""}. ${up} ${lock.requiredPlanName ? "include" : "includes"} more${c.period === "this month" ? ", or it starts again next month" : ""}.`,
  };
}

// ─── The club's plan, as the dashboard reads it ─────────────────────────

export interface PlanState {
  /** The entitlements have loaded. Until they have, nothing is locked. */
  ready: boolean;
  /** The server enforces plans. False is the kill switch: no lock anywhere. */
  enforced: boolean;
  planKey: string | null;
  planName: string | null;
  /** Whether a gated write is open to the club. */
  can(feature: string): boolean;
  /** The cap, or null for unlimited (and for anything while not enforced). */
  limit(key: string): number | null;
  /** How much of a counted limit is used, or null when the server does not count it. */
  used(key: string): number | null;
  /** At or over the cap, counting `used` when the screen knows better (a store's items). */
  atLimit(key: string, used?: number | null): boolean;
  /** The lock for a flag, or null when it is open. */
  featureLock(feature: string): PlanLock | null;
  /**
   * The lock a flag would have, open or not: for a screen whose own endpoint
   * says the club is not entitled (a custom domain's `entitled`) while the
   * entitlements have not caught up, or for an upgrade offered on a paused
   * thing.
   */
  lockFor(feature: string): PlanLock;
  /** The lock for a limit, or null while under it. */
  limitLock(key: string, used?: number | null): PlanLock | null;
}

/**
 * The plan's rules from the entitlements (and, for "which plan has it", the
 * public catalogue). Pure, so the rules are tested without rendering.
 */
export function planState(ent: Entitlements | null | undefined, catalog?: Catalog | null): PlanState {
  const enforced = Boolean(ent?.enforced) && ent?.configured !== false;
  const planKey = ent?.plan_key ?? null;
  const planName = ent?.plan_name ?? null;
  const plans = catalog?.plans ?? [];

  const can = (feature: string) => {
    if (!enforced || !ent) return true;
    if ((ALWAYS_ON as readonly string[]).includes(feature)) return true;
    // A flag the server did not send is one it does not gate.
    return ent.features[feature] !== false;
  };

  const limit = (key: string) => {
    if (!enforced || !ent) return null;
    const cap = ent.limits[key];
    return cap === undefined ? null : cap;
  };

  const used = (key: string) => {
    const n = ent?.usage[key];
    return typeof n === "number" ? n : null;
  };

  const atLimit = (key: string, override?: number | null) => {
    const cap = limit(key);
    if (cap === null) return false;
    if (cap === 0) return true;
    const u = override ?? used(key);
    return u !== null && u >= cap;
  };

  const requiredForFeature = (feature: string): { key: string; name: string } | null => {
    const hit = plans.find((p) => p.key !== planKey && p.features.some((f) => f.key === feature && f.included));
    if (hit) return { key: hit.key, name: hit.name };
    return (FALLBACK_TIER as Record<string, { key: string; name: string }>)[feature] ?? null;
  };

  const requiredForLimit = (key: string, cap: number): { key: string; name: string } | null => {
    const hit = plans.find((p) => {
      if (p.key === planKey || !(key in p.limits)) return false;
      const theirs = p.limits[key];
      return theirs === null || (theirs ?? 0) > cap;
    });
    return hit ? { key: hit.key, name: hit.name } : null;
  };

  const lockFor = (feature: string): PlanLock => {
    const row = plans.flatMap((p) => p.features).find((f) => f.key === feature);
    const req = requiredForFeature(feature);
    return {
      kind: "feature",
      key: feature,
      label: row?.label ?? featureLabel(feature),
      requiredPlan: req?.key ?? null,
      requiredPlanName: req?.name ?? null,
      planName,
      limitValue: null,
      used: null,
      message: null,
    };
  };

  const featureLock = (feature: string): PlanLock | null => (can(feature) ? null : lockFor(feature));

  const limitLock = (key: string, override?: number | null): PlanLock | null => {
    if (!atLimit(key, override)) return null;
    const cap = limit(key) ?? 0;
    const req = requiredForLimit(key, cap);
    return {
      kind: "limit",
      key,
      label: limitCopy(key).label,
      requiredPlan: req?.key ?? null,
      requiredPlanName: req?.name ?? null,
      planName,
      limitValue: cap,
      used: override ?? used(key),
      message: null,
    };
  };

  return {
    ready: Boolean(ent),
    enforced,
    planKey,
    planName,
    can,
    limit,
    used,
    atLimit,
    featureLock,
    lockFor,
    limitLock,
  };
}

/**
 * The plan as one grandfathered event sees it: no event-scoped lock applies
 * (the server says which events, in `plan_grandfathered`). Counts still
 * read, so a meter still shows; nothing is ever at its limit.
 */
export function exemptState(plan: PlanState): PlanState {
  return { ...plan, can: () => true, atLimit: () => false, featureLock: () => null, limitLock: () => null };
}

// ─── What a copy left behind ─────────────────────────────────────────────

/** The parts of an event a copy can leave out on a plan without them, by the flag or limit that left them out. */
const SKIPPED_WORDS: Record<string, { text: string; plural: boolean }> = {
  swag: { text: "swag items", plural: true },
  merch: { text: "merchandise", plural: false },
  merch_items_per_event: { text: "merchandise items past your plan's limit", plural: true },
  badges: { text: "badge designs", plural: true },
  report: { text: "report settings", plural: true },
  quiz: { text: "the quiz", plural: false },
  polls: { text: "polls", plural: true },
  qa: { text: "Q&A settings", plural: true },
  teams: { text: "the competition setup", plural: false },
  judging: { text: "the competition setup", plural: false },
  rounds: { text: "the competition setup", plural: false },
  links: { text: "tracking links", plural: true },
  tickets: { text: "paid entry", plural: false },
  networking: { text: "networking", plural: false },
};

/**
 * "Copied. Swag items and badge designs weren't copied on your plan." Null
 * when nothing was left out.
 */
export function skippedNotice(skipped: readonly string[] | null | undefined): string | null {
  const parts: { text: string; plural: boolean }[] = [];
  for (const key of skipped ?? []) {
    const w = SKIPPED_WORDS[key] ?? { text: key.replace(/_/g, " "), plural: true };
    if (!parts.some((p) => p.text === w.text)) parts.push(w);
  }
  if (parts.length === 0) return null;
  const words = parts.map((p) => p.text);
  const list = words.length === 1 ? words[0]! : `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;
  const verb = parts.length === 1 && !parts[0]!.plural ? "wasn't" : "weren't";
  return `Copied. ${list.charAt(0).toUpperCase()}${list.slice(1)} ${verb} copied on your plan.`;
}
