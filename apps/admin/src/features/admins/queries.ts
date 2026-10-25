"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { staleTimes } from "@moa/app-kit";
import { toast } from "@moa/ui";

import { fetchAdmins, inviteAdmin, removeAdmin, resendInvite } from "./api";

const KEY = ["admin", "admins"] as const;

export function useAdmins() {
  return useQuery({ queryKey: KEY, queryFn: fetchAdmins, staleTime: staleTimes.volatile });
}

export function useInviteAdmin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: inviteAdmin,
    onSuccess: async (result) => {
      toast.success(
        result.promoted
          ? `${result.email} is an admin now. They were mailed a link to set a password.`
          : `Account made for ${result.email}. They were mailed a link to set a password.`
      );
      await queryClient.invalidateQueries({ queryKey: KEY });
    },
    onError: (error: Error) => toast.error(error.message || "Could not add the admin"),
  });
}

export function useResendInvite() {
  return useMutation({
    mutationFn: resendInvite,
    onSuccess: () => toast.success("A new set-password link is on its way"),
    onError: (error: Error) => toast.error(error.message || "Could not send the link"),
  });
}

export function useRemoveAdmin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: removeAdmin,
    onSuccess: async () => {
      toast.success("Admin access removed");
      await queryClient.invalidateQueries({ queryKey: KEY });
    },
    onError: (error: Error) => toast.error(error.message || "Could not remove the admin"),
  });
}
