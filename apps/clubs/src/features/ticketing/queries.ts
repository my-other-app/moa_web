"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, nullIfRouteMissing, qk } from "@moa/api";
import { toast } from "@moa/ui";

import { ENTITLEMENTS_KEY } from "@/features/billing/queries";
import { isPlanLockError } from "@/features/plan/errors";

import {
  createDiscountCode,
  deleteDiscountCode,
  fetchDiscountCodes,
  fetchTicketSales,
  fetchTicketTypes,
  fetchWaitlist,
  offerWaitlistEntry,
  putTicketTypes,
  putWaitlistSettings,
  removeWaitlistEntry,
  setDiscountCodeActive,
  updateDiscountCode,
  type CodeScope,
} from "./api";
import { TICKETING_ERRORS, type CodeForm, type EntryStatus, type SaveTypesBody } from "./schemas";

/**
 * Every read here is `null` from a backend without ticket types, codes and
 * waiting lists (the route answers FastAPI's bare 404): the dashboard goes
 * out ahead of its backend and shows none of it until the API has it.
 */
export const TICKETING_KEY = ["ticketing"] as const;

const typesKey = (eventId: number) => [...TICKETING_KEY, "types", eventId] as const;
const salesKey = (eventId: number) => [...TICKETING_KEY, "sales", eventId] as const;
const codesKey = (scope: CodeScope) => [...TICKETING_KEY, "codes", scope.eventId ?? "club"] as const;
const waitlistKey = (eventId: number) => [...TICKETING_KEY, "waitlist", eventId] as const;

/** A refusal in the club's words: the ticketing codes the dashboard knows, else the server's own. */
export function ticketingError(error: unknown): string {
  if (error instanceof ApiError && error.errorCode && TICKETING_ERRORS[error.errorCode]) return TICKETING_ERRORS[error.errorCode]!;
  return error instanceof Error && error.message ? error.message : "That did not go through. Try again.";
}

/** A mutation's onError: the upgrade dialog answers a plan refusal; anything else is a toast. */
function toastTicketingError(error: unknown) {
  if (isPlanLockError(error)) return;
  toast.error(ticketingError(error));
}

/**
 * Whether this backend has ticketing at all: true or false once known,
 * undefined while asking. Asks the club's codes, the one ticketing read
 * that needs no event.
 */
export function useTicketingOnServer(enabled = true): boolean | undefined {
  const q = useQuery({
    queryKey: codesKey({}),
    queryFn: () => nullIfRouteMissing(() => fetchDiscountCodes({})),
    staleTime: 60_000,
    retry: false,
    enabled,
  });
  if (q.isError) return false;
  if (q.data === undefined) return undefined;
  return q.data !== null;
}

export function useTicketTypes(eventId: number | null | undefined, enabled = true) {
  return useQuery({
    queryKey: typesKey(eventId ?? -1),
    queryFn: () => nullIfRouteMissing(() => fetchTicketTypes(eventId!)),
    enabled: Boolean(eventId) && enabled,
    staleTime: 15_000,
    retry: false,
  });
}

export function useTicketSales(eventId: number) {
  return useQuery({
    queryKey: salesKey(eventId),
    queryFn: () => nullIfRouteMissing(() => fetchTicketSales(eventId)),
    staleTime: 15_000,
    retry: false,
  });
}

export function useDiscountCodes(scope: CodeScope = {}) {
  return useQuery({
    queryKey: codesKey(scope),
    queryFn: () => nullIfRouteMissing(() => fetchDiscountCodes(scope)),
    staleTime: 15_000,
    retry: false,
  });
}

export function useWaitlist(eventId: number, status?: EntryStatus | null) {
  return useQuery({
    queryKey: [...waitlistKey(eventId), status ?? "all"],
    queryFn: () => nullIfRouteMissing(() => fetchWaitlist(eventId, status)),
    // Another filter keeps the settings and the counts on screen while it loads.
    placeholderData: keepPreviousData,
    staleTime: 15_000,
    retry: false,
  });
}

/** After anything about an event's tickets changed: its types, its sales, its line, the event itself. */
function useRefreshTicketing() {
  const queryClient = useQueryClient();
  return (eventId?: number | null) => {
    void queryClient.invalidateQueries({ queryKey: TICKETING_KEY });
    void queryClient.invalidateQueries({ queryKey: ENTITLEMENTS_KEY });
    if (eventId) void queryClient.invalidateQueries({ queryKey: qk.events.detail(eventId) });
  };
}

export function useSaveTicketTypes(eventId: number) {
  const refresh = useRefreshTicketing();
  return useMutation({
    mutationFn: (body: SaveTypesBody) => putTicketTypes(eventId, body),
    onSuccess: () => refresh(eventId),
    onError: toastTicketingError,
  });
}

export function useCreateDiscountCode() {
  const refresh = useRefreshTicketing();
  return useMutation({
    mutationFn: (form: CodeForm) => createDiscountCode(form),
    onSuccess: (made) => {
      toast.success(`${made.code} is ready`);
      refresh(made.event_id);
    },
    onError: toastTicketingError,
  });
}

export function useUpdateDiscountCode() {
  const refresh = useRefreshTicketing();
  return useMutation({
    mutationFn: ({ id, form }: { id: number; form: CodeForm }) => updateDiscountCode(id, form),
    onSuccess: (saved) => {
      toast.success(`${saved.code} saved`);
      refresh(saved.event_id);
    },
    onError: toastTicketingError,
  });
}

export function useToggleDiscountCode() {
  const refresh = useRefreshTicketing();
  return useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) => setDiscountCodeActive(id, active),
    onSuccess: (saved) => {
      toast.success(saved.is_active ? `${saved.code} is on` : `${saved.code} is off`);
      refresh(saved.event_id);
    },
    onError: toastTicketingError,
  });
}

export function useDeleteDiscountCode() {
  const refresh = useRefreshTicketing();
  return useMutation({
    mutationFn: ({ id }: { id: number; code: string }) => deleteDiscountCode(id),
    onSuccess: (_, { code }) => {
      toast.success(`${code} deleted. Tickets bought with it keep their price.`);
      refresh();
    },
    onError: toastTicketingError,
  });
}

export function useWaitlistSettings(eventId: number) {
  const refresh = useRefreshTicketing();
  return useMutation({
    mutationFn: (body: { enabled?: boolean; offer_hours?: number }) => putWaitlistSettings(eventId, body),
    onSuccess: (s, body) => {
      if (body.enabled !== undefined) toast.success(s.enabled ? "Waiting list on" : "Waiting list off");
      else toast.success(`Offers now hold a place for ${s.offer_hours} ${s.offer_hours === 1 ? "hour" : "hours"}`);
      refresh(eventId);
    },
    onError: toastTicketingError,
  });
}

export function useOfferWaitlistEntry(eventId: number) {
  const refresh = useRefreshTicketing();
  return useMutation({
    mutationFn: (entryId: string) => offerWaitlistEntry(eventId, entryId),
    onSuccess: (entry) => {
      toast.success(`${entry.full_name} has been offered a place`);
      refresh(eventId);
    },
    onError: toastTicketingError,
  });
}

export function useRemoveWaitlistEntry(eventId: number) {
  const refresh = useRefreshTicketing();
  return useMutation({
    mutationFn: ({ id }: { id: string; name: string }) => removeWaitlistEntry(eventId, id),
    onSuccess: (_, { name }) => {
      toast.success(`${name} is off the waiting list`);
      refresh(eventId);
    },
    onError: toastTicketingError,
  });
}
