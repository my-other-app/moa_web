"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { ApiError } from "@moa/api";
import { toast } from "@moa/ui";

import { fetchAdoption, fetchDeviceCount, fetchFirebaseStatus, sendToEveryone } from "./api";

const KEY = ["admin", "push"] as const;

export function useDeviceCount() {
  return useQuery({ queryKey: [...KEY, "devices"], queryFn: fetchDeviceCount });
}

export function useAdoption() {
  return useQuery({ queryKey: [...KEY, "adoption"], queryFn: fetchAdoption });
}

export function useFirebaseStatus() {
  return useQuery({ queryKey: [...KEY, "firebase"], queryFn: fetchFirebaseStatus });
}

/** What a refused send says: the server's limit is two an hour. */
export function sendRefusal(error: Error): string {
  if (error instanceof ApiError && error.status === 429) {
    return "Only two pushes to everyone are allowed an hour, and that limit is used up. Try again later.";
  }
  return error.message || "The push was not sent";
}

export function useSendToEveryone() {
  return useMutation({
    mutationFn: sendToEveryone,
    onSuccess: (result) => {
      if (result.success) toast.success(result.message || "Sending");
      else toast.error(result.message || "Nothing was sent");
    },
    onError: (error: Error) => toast.error(sendRefusal(error)),
  });
}
