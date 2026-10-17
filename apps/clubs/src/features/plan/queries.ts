"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";

import { ENTITLEMENTS_KEY, useEntitlements, usePlans } from "@/features/billing/queries";
import { useEventDetail } from "@/features/events/queries";

import { openUpgrade } from "./errors";
import { exemptState, planState, type PlanLock, type PlanState } from "./schemas";

/**
 * The club's plan: what it may do and how much of it is used.
 *
 * One cache entry with Plan & billing (GET /clubs/entitlements), so every
 * lock and meter on a page costs one request between them. The pricing
 * catalogue is read only while the server enforces plans, and only to name
 * the plan that lifts a lock.
 *
 * Until the entitlements load, or when they fail, nothing is locked: the
 * dashboard must never shut a club out of itself on a guess. The server
 * refusing is what holds a club to its plan.
 */
export function usePlan(): PlanState {
  const ent = useEntitlements();
  const enforced = Boolean(ent.data?.enforced);
  const catalog = usePlans(enforced);
  return React.useMemo(() => planState(ent.data, catalog.data), [ent.data, catalog.data]);
}

/**
 * Whether the server grandfathers this event (`plan_grandfathered` on its
 * detail). Shares the event detail's cache entry with the console; false
 * for no event, while it loads, and on a server that does not say.
 */
export function useEventGrandfathered(eventId?: number | null): boolean {
  const detail = useEventDetail(eventId ?? 0);
  return Boolean(eventId && detail.data?.plan_grandfathered);
}

/**
 * The plan as one event sees it. A grandfathered event is exempt from every
 * event-scoped lock; the club-wide ones (website, seats and roles, club
 * finance, events and announcements a month) read `usePlan()` instead.
 */
export function useEventPlan(eventId?: number | null): PlanState {
  const plan = usePlan();
  const exempt = useEventGrandfathered(eventId);
  return React.useMemo(() => (exempt ? exemptState(plan) : plan), [exempt, plan]);
}

/** Re-reads the entitlements: after a write that counts (an event, an invite, an announcement). */
export function useRefreshPlan() {
  const queryClient = useQueryClient();
  return React.useCallback(() => void queryClient.invalidateQueries({ queryKey: ENTITLEMENTS_KEY }), [queryClient]);
}

export interface Gate {
  /** The plan stops this. False while not enforced, or while nothing is known. */
  locked: boolean;
  lock: PlanLock | null;
  /** Opens the upgrade dialog for this lock. */
  prompt: () => void;
  /** `fn`, unless locked: then the upgrade dialog instead. */
  guard: <A extends unknown[]>(fn: (...args: A) => void) => (...args: A) => void;
}

function gateOf(lock: PlanLock | null): Gate {
  return {
    locked: lock !== null,
    lock,
    prompt: () => {
      if (lock) openUpgrade(lock);
    },
    guard:
      (fn) =>
      (...args) => {
        if (lock) openUpgrade(lock);
        else fn(...args);
      },
  };
}

/** Where a gate applies: an event's own (exempt when grandfathered), or the club's when absent. */
export interface GateScope {
  eventId?: number | null;
}

/** A gated flag: `tickets`, `website`, `links`… */
export function useFeatureGate(feature: string, scope: GateScope = {}): Gate {
  const plan = useEventPlan(scope.eventId);
  return gateOf(plan.featureLock(feature));
}

/**
 * A limit, at its cap or not. `used` is for a count the screen knows and the
 * entitlements do not (a store's items, the template a card sits at).
 */
export function useLimitGate(key: string, used?: number | null, scope: GateScope = {}): Gate & { cap: number | null; used: number | null } {
  const plan = useEventPlan(scope.eventId);
  return { ...gateOf(plan.limitLock(key, used)), cap: plan.limit(key), used: used ?? plan.used(key) };
}
