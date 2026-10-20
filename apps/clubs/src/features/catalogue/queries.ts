"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "@moa/api";
import { toast } from "@moa/ui";

import { toastError } from "@/features/plan/errors";

import { createClubItem, deleteClubItem, fetchClubStore, fetchEventOffers, setEventOffers, updateClubItem } from "./api";

/** The club's catalogue. Every event's shelf reads from it, so a change here refreshes them too. */
export const CATALOGUE_KEY = [...qk.clubs.all, "store"] as const;
/** The same prefix the event's Merchandise tab caches under (features/store). */
const EVENT_STORE_KEY = ["store"] as const;
export const offersKey = (eventId: number) => [...EVENT_STORE_KEY, eventId, "offers"] as const;

export function useClubStore(options: { refetchOnWindowFocus?: boolean } = {}) {
  return useQuery({ queryKey: CATALOGUE_KEY, queryFn: fetchClubStore, staleTime: 10_000, refetchOnWindowFocus: options.refetchOnWindowFocus ?? false });
}

function useRefresh() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: CATALOGUE_KEY });
    // Price, stock and photo show on every event that offers the item.
    void queryClient.invalidateQueries({ queryKey: EVENT_STORE_KEY });
  };
}

export function useCreateClubItem() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => createClubItem(body),
    onSuccess: (item) => {
      toast.success(`${item.name} is in your merchandise`, { description: "Offer it on an event from the event's form or its Merchandise tab." });
      refresh();
    },
    onError: toastError,
  });
}

export function useUpdateClubItem() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Record<string, unknown> }) => updateClubItem(id, patch),
    onSuccess: (item) => {
      toast.success(`${item.name} saved`);
      refresh();
    },
    onError: toastError,
  });
}

export function useDeleteClubItem() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ id }: { id: string; name: string }) => deleteClubItem(id),
    onSuccess: (_r, { name }) => {
      toast.success(`${name} deleted`);
      refresh();
    },
    onError: toastError,
  });
}

/** What an event offers. Read by the event form while editing and by the event's Merchandise tab. */
export function useEventOffers(eventId: number | undefined) {
  return useQuery({
    queryKey: offersKey(eventId ?? -1),
    queryFn: () => fetchEventOffers(eventId!),
    enabled: eventId !== undefined && eventId > 0,
    staleTime: 10_000,
  });
}

export function useSetEventOffers(eventId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (itemIds: string[]) => setEventOffers(eventId, itemIds),
    onSuccess: (r) => {
      queryClient.setQueryData(offersKey(eventId), r);
      toast.success(r.item_ids.length === 0 ? "Nothing is offered on this event now" : `${r.item_ids.length} ${r.item_ids.length === 1 ? "item" : "items"} offered on this event`);
      void queryClient.invalidateQueries({ queryKey: [...EVENT_STORE_KEY, eventId] });
      void queryClient.invalidateQueries({ queryKey: CATALOGUE_KEY });
    },
    onError: toastError,
  });
}
