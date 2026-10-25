"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@moa/ui";

import { ENTITLEMENTS_KEY } from "@/features/billing/queries";
import { toastError } from "@/features/plan/errors";

import {
  acceptInvite,
  changeMyPassword,
  changeRole,
  fetchAccessList,
  fetchInvite,
  fetchMyAccess,
  inviteMember,
  removeMember,
  resendInvite,
  setMemberMail,
  setMemberWhatsApp,
} from "./api";
import { OWNER_CAN, type Caps, type Me, type MemberRole, type Role } from "./schemas";

const KEY = ["club-access"] as const;

export function useAccessList() {
  return useQuery({ queryKey: [...KEY, "list"], queryFn: fetchAccessList, staleTime: 15_000 });
}

export function useMyAccess() {
  return useQuery({ queryKey: [...KEY, "me"], queryFn: fetchMyAccess, staleTime: 60_000, retry: false });
}

export interface Access {
  role: Role;
  roleLabel: string;
  can: Caps;
  member: Me["member"];
  /** True once the server has said who is signed in. */
  known: boolean;
}

/**
 * What the person signed in may open. Until the server answers — still
 * loading, or a server without team access yet — it is the club's own
 * account: the page must never lock the club out of itself. The server
 * refusing a request is what actually holds a role to its limits.
 */
export function useAccess(): Access {
  const q = useMyAccess();
  if (!q.data) return { role: "owner", roleLabel: "Owner", can: OWNER_CAN, member: null, known: false };
  return { role: q.data.role, roleLabel: q.data.role_label, can: q.data.can, member: q.data.member, known: true };
}

function useRefresh() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: KEY });
    // Seats used are part of the plan's counts.
    void queryClient.invalidateQueries({ queryKey: ENTITLEMENTS_KEY });
  };
}

export function useInvite() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: inviteMember,
    onSuccess: (r) => {
      toast.success(`Invite sent to ${r.member.email}`);
      refresh();
    },
  });
}

export function useResendInvite() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (id: number) => resendInvite(id),
    onSuccess: (r) => {
      toast.success(`A new invite is on its way to ${r.member.email}`);
      refresh();
    },
    onError: toastError,
  });
}

export function useChangeRole() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ id, role }: { id: number; role: MemberRole }) => changeRole(id, role),
    onSuccess: (m) => {
      toast.success(`${m.full_name ?? m.email} is now ${m.role_label}`);
      refresh();
    },
    onError: toastError,
  });
}

export function useSetMemberWhatsApp() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ id, allowed }: { id: number; allowed: boolean }) => setMemberWhatsApp(id, allowed),
    onSuccess: (m) => {
      toast.success(m.whatsapp ? `${m.full_name ?? m.email} can now read and answer WhatsApp` : `${m.full_name ?? m.email} no longer sees WhatsApp`);
      refresh();
    },
    onError: toastError,
  });
}

export function useSetMemberMail() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ id, allowed }: { id: number; allowed: boolean }) => setMemberMail(id, allowed),
    onSuccess: (m) => {
      toast.success(m.mail ? `${m.full_name ?? m.email} can now read and send the club's mail` : `${m.full_name ?? m.email} no longer sees the club's mail`);
      refresh();
    },
    onError: toastError,
  });
}

export function useRemoveMember() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (id: number) => removeMember(id),
    onSuccess: () => {
      toast.success("Access removed. Their sessions have ended.");
      refresh();
    },
    onError: toastError,
  });
}

export function useChangeMyPassword() {
  return useMutation({
    mutationFn: changeMyPassword,
    onSuccess: () => toast.success("Password changed"),
  });
}

export function useInvitePreview(token: string) {
  return useQuery({ queryKey: [...KEY, "invite", token], queryFn: () => fetchInvite(token), enabled: token.length > 0, retry: false });
}

export function useAcceptInvite(token: string) {
  return useMutation({ mutationFn: (body: { full_name?: string; password: string }) => acceptInvite(token, body) });
}
