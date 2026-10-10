"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "@moa/api";
import { toast } from "@moa/ui";

import {
  fetchDesign,
  fetchDesignSample,
  resetDesign,
  saveArtwork,
  saveDesign,
} from "./api";
import type { Audience, DesignKind } from "./schemas";

export function useEventDesign(
  eventId: number,
  kind: DesignKind,
  audience: Audience
) {
  return useQuery({
    queryKey: qk.eventDesigns.detail(eventId, kind, audience),
    queryFn: () => fetchDesign(eventId, kind, audience),
    /*
     * No staleTime. A design is edited and saved in the same sitting, and a
     * cached copy served after a save would show the organiser the version
     * they just replaced.
     */
    staleTime: 0,
  });
}

export function useSaveEventDesign(
  eventId: number,
  kind: DesignKind,
  audience: Audience
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      config,
      name,
    }: {
      config: Record<string, unknown>;
      name?: string;
    }) => saveDesign(eventId, kind, audience, config, name),
    onSuccess: (data) => {
      toast.success("Design saved for this event");
      /*
       * Written straight into the cache rather than invalidated, because the
       * response is the saved design and a refetch would briefly show the
       * old one. The sibling audiences are invalidated instead: the first
       * save forks the event's design, which changes what they fall back to.
       */
      queryClient.setQueryData(qk.eventDesigns.detail(eventId, kind, audience), data);
      void queryClient.invalidateQueries({
        queryKey: qk.eventDesigns.forEvent(eventId),
        predicate: (query) =>
          query.queryKey !== qk.eventDesigns.detail(eventId, kind, audience),
      });
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useSaveEventArtwork(
  eventId: number,
  kind: DesignKind,
  audience: Audience
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      files,
      removals,
    }: {
      files: Parameters<typeof saveArtwork>[3];
      removals?: string[];
    }) => saveArtwork(eventId, kind, audience, files, removals),
    onSuccess: (data) => {
      toast.success("Artwork updated");
      queryClient.setQueryData(qk.eventDesigns.detail(eventId, kind, audience), data);
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useResetEventDesign(
  eventId: number,
  kind: DesignKind,
  audience: Audience
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => resetDesign(eventId, kind, audience),
    onSuccess: (data) => {
      toast.success("Back to your club's default");
      queryClient.setQueryData(qk.eventDesigns.detail(eventId, kind, audience), data);
      void queryClient.invalidateQueries({
        queryKey: qk.eventDesigns.forEvent(eventId),
      });
    },
    onError: (error: Error) => toast.error(error.message),
  });
}


export function useDesignSample(
  eventId: number,
  kind: DesignKind,
  ticketId: string | null
) {
  return useQuery({
    queryKey: [...qk.eventDesigns.forEvent(eventId), "sample", kind, ticketId],
    queryFn: () => fetchDesignSample(eventId, kind, ticketId),
    // An attendee's details do not change while a design is being made.
    staleTime: 5 * 60 * 1000,
  });
}
