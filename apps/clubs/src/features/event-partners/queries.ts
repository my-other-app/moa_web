"use client";

import { useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "@moa/api";
import { plural } from "@moa/app-kit";
import { toast } from "@moa/ui";

import { toastError } from "@/features/plan/errors";

import {
  addFromClubPartners,
  createEventPartner,
  deleteEventPartner,
  fetchEventPartners,
  orderEventPartners,
  updateEventPartner,
  uploadEventPartnerLogo,
} from "./api";
import { KIND_WORDS, type EventPartner, type PartnerForm, type PartnerKind } from "./schemas";

export const eventPartnersKey = (eventId: number) => [...qk.events.detail(eventId), "partners"] as const;

/** The event's sponsors and partners. Off until the server is known to have them. */
export function useEventPartners(eventId: number, enabled = true) {
  return useQuery({ queryKey: eventPartnersKey(eventId), queryFn: () => fetchEventPartners(eventId), enabled, staleTime: 10_000 });
}

function useList(eventId: number) {
  const qc = useQueryClient();
  return {
    /** Puts one row in place (or the whole list), then checks with the server. */
    put(row: EventPartner | EventPartner[]) {
      qc.setQueryData<EventPartner[]>(eventPartnersKey(eventId), (old) => {
        if (Array.isArray(row)) return row;
        const rest = (old ?? []).filter((r) => r.id !== row.id);
        return [...rest, row];
      });
      void qc.invalidateQueries({ queryKey: eventPartnersKey(eventId) });
    },
    drop(id: number) {
      qc.setQueryData<EventPartner[]>(eventPartnersKey(eventId), (old) => (old ?? []).filter((r) => r.id !== id));
      void qc.invalidateQueries({ queryKey: eventPartnersKey(eventId) });
    },
  };
}

export function useCreateEventPartner(eventId: number) {
  const list = useList(eventId);
  return useMutation({
    mutationFn: ({ kind, form }: { kind: PartnerKind; form: PartnerForm }) => createEventPartner(eventId, kind, form),
    onSuccess: (row) => {
      toast.success(`${KIND_WORDS[row.kind].One} added`);
      list.put(row);
    },
    onError: toastError,
  });
}

export function useUpdateEventPartner(eventId: number) {
  const list = useList(eventId);
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: Partial<PartnerForm> & { kind?: PartnerKind } }) => updateEventPartner(eventId, id, patch),
    onSuccess: (row, { patch }) => {
      // A row saves on blur, with no button to press: the toast is how the organiser knows it took.
      toast.success(patch.kind ? `Moved to ${KIND_WORDS[row.kind].many}` : `${KIND_WORDS[row.kind].One} saved`);
      list.put(row);
    },
    onError: toastError,
  });
}

export function useUploadEventPartnerLogo(eventId: number) {
  const list = useList(eventId);
  return useMutation({
    mutationFn: ({ id, file }: { id: number; file: File }) => uploadEventPartnerLogo(eventId, id, file),
    onSuccess: (row) => {
      toast.success("Logo updated");
      list.put(row);
    },
    onError: toastError,
  });
}

export function useDeleteEventPartner(eventId: number) {
  const list = useList(eventId);
  return useMutation({
    mutationFn: (row: EventPartner) => deleteEventPartner(eventId, row.id),
    onSuccess: (_, row) => {
      toast.success(`${KIND_WORDS[row.kind].One} removed`);
      list.drop(row.id);
    },
    onError: toastError,
  });
}

const orderKey = (eventId: number) => [...eventPartnersKey(eventId), "order"] as const;

/** Whether a new order is on its way, from any row. */
export function useOrdering(eventId: number): boolean {
  return useIsMutating({ mutationKey: orderKey(eventId) }) > 0;
}

export function useOrderEventPartners(eventId: number) {
  const list = useList(eventId);
  return useMutation({
    mutationKey: orderKey(eventId),
    mutationFn: ({ kind, ids }: { kind: PartnerKind; ids: number[] }) => orderEventPartners(eventId, kind, ids),
    onSuccess: (rows) => {
      toast.success("Order saved");
      list.put(rows);
    },
    onError: toastError,
  });
}

export function useAddFromClubPartners(eventId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ kind, ids }: { kind: PartnerKind; ids: number[] }) => addFromClubPartners(eventId, kind, ids),
    onSuccess: ({ added, skipped }, { kind }) => {
      const words = KIND_WORDS[kind];
      if (added.length) toast.success(`${plural(added.length, words.one, words.many)} added from your club's partners`);
      if (skipped.length) toast.info(skipped.length === 1 ? "One was already on this event, so it was left as it is" : `${skipped.length} were already on this event, so they were left as they are`);
      void qc.invalidateQueries({ queryKey: eventPartnersKey(eventId) });
    },
    onError: toastError,
  });
}
