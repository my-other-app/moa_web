import { ApiError } from "@moa/api";
import { toast } from "@moa/ui";

import { PLAN_FEATURE_LOCKED, PLAN_LIMIT_REACHED, featureLabel, featureLockedSchema, limitCopy, limitReachedSchema, type PlanLock } from "./schemas";

/**
 * The server's plan refusals, and the one place the dashboard answers them.
 *
 * A write the plan does not allow comes back 403 with `error_code`
 * PLAN_FEATURE_LOCKED or PLAN_LIMIT_REACHED and the details in `errors`.
 * Whatever sent it, the club sees the upgrade dialog, never a toast: the
 * mutation cache is watched for them (PlanLockHost), and a form that calls
 * the API itself hands its error to `reportPlanError`.
 *
 * Kept free of React so every feature's queries can import it without
 * pulling the dialog (and its imports) in behind them.
 */

/** The lock a refusal describes, or null when it is not a plan refusal. */
export function planLockFromError(error: unknown, planName: string | null = null): PlanLock | null {
  if (!(error instanceof ApiError) || !error.isForbidden) return null;
  // ApiError keeps the body's `errors` as fieldErrors; for these two codes it is an object of strings.
  const details: unknown = error.fieldErrors ?? {};
  if (error.errorCode === PLAN_FEATURE_LOCKED) {
    const d = featureLockedSchema.safeParse(details);
    const feature = d.success ? d.data.feature : "feature";
    return {
      kind: "feature",
      key: feature,
      label: (d.success && d.data.label) || featureLabel(feature),
      requiredPlan: (d.success && d.data.required_plan) || null,
      requiredPlanName: (d.success && d.data.required_plan_name) || null,
      planName,
      limitValue: null,
      used: null,
      message: error.message || null,
    };
  }
  if (error.errorCode === PLAN_LIMIT_REACHED) {
    const d = limitReachedSchema.safeParse(details);
    const key = d.success ? d.data.limit : "limit";
    return {
      kind: "limit",
      key,
      label: limitCopy(key).label,
      requiredPlan: (d.success && d.data.required_plan) || null,
      requiredPlanName: (d.success && d.data.required_plan_name) || null,
      planName,
      limitValue: d.success ? (d.data.limit_value ?? null) : null,
      used: d.success ? (d.data.used ?? null) : null,
      message: error.message || null,
    };
  }
  return null;
}

export function isPlanLockError(error: unknown): boolean {
  return error instanceof ApiError && error.isForbidden && (error.errorCode === PLAN_FEATURE_LOCKED || error.errorCode === PLAN_LIMIT_REACHED);
}

// ─── Who opens the dialog ───────────────────────────────────────────────

type Listener = (lock: PlanLock) => void;
const listeners = new Set<Listener>();

/** Opens the upgrade dialog (PlanLockHost listens). */
export function openUpgrade(lock: PlanLock): void {
  for (const l of listeners) l(lock);
}

/** For PlanLockHost; returns the unsubscribe. */
export function onUpgrade(listener: Listener): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/**
 * For a write that does not go through a mutation: true (and the dialog
 * opens) when the error was a plan refusal, so the caller says nothing else.
 */
export function reportPlanError(error: unknown): boolean {
  const lock = planLockFromError(error);
  if (!lock) return false;
  openUpgrade(lock);
  return true;
}

/**
 * A mutation's `onError`: the server's words in a toast, except for a plan
 * refusal, which the upgrade dialog answers instead. One argument only, so
 * React Query's (error, variables, context) cannot leak into the toast.
 */
export function toastError(error: unknown): void {
  if (isPlanLockError(error)) return;
  toast.error(error instanceof Error && error.message ? error.message : "That did not go through. Try again.");
}
