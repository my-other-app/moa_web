"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "@moa/api";
import { toast } from "@moa/ui";

import { addVolunteer, fetchVolunteers, removeVolunteer } from "./api";
import type { AddVolunteerInput } from "./schemas";

export function useVolunteers(eventId: number) {
  return useQuery({
    queryKey: qk.events.volunteers(eventId),
    queryFn: () => fetchVolunteers(eventId),
  });
}

export function useAddVolunteer(eventId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AddVolunteerInput) => addVolunteer(eventId, input),
    onSuccess: async () => {
      toast.success("Volunteer added");
      await queryClient.invalidateQueries({ queryKey: qk.events.volunteers(eventId) });
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useRemoveVolunteer(eventId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (emailId: string) => removeVolunteer(eventId, emailId),
    onSuccess: async () => {
      toast.success("Volunteer removed");
      await queryClient.invalidateQueries({ queryKey: qk.events.volunteers(eventId) });
    },
    onError: (error: Error) => toast.error(error.message),
  });
}
