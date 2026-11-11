"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@moa/ui";

import { TEAMWORK_KEY } from "@/features/teamwork";

import {
  addContact,
  createLead,
  deleteContact,
  fetchLead,
  fetchLeads,
  importLeads,
  logActivity,
  mergeLead,
  updateContact,
  updateLead,
  uploadLeadFile,
  type ActivityInput,
  type ContactInput,
  type LeadPatch,
  type LeadQuery,
  type NewLeadInput,
} from "./api";
import { DuplicateLeadError } from "./schemas";

export const LEADS_KEY = [...TEAMWORK_KEY, "leads"] as const;

export function useLeads(query: LeadQuery, enabled = true) {
  return useQuery({ queryKey: [...LEADS_KEY, "list", query], queryFn: () => fetchLeads(query), placeholderData: keepPreviousData, enabled });
}

export function useLead(id: number) {
  return useQuery({ queryKey: [...LEADS_KEY, "one", id], queryFn: () => fetchLead(id) });
}

function useRefresh() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: TEAMWORK_KEY });
}

const failed = (fallback: string) => (error: Error) => toast.error(error.message || fallback);

/** A duplicate is not a failure to shout about: the form shows the matches and asks. */
export function useCreateLead() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ input, force }: { input: NewLeadInput; force?: boolean }) => createLead(input, force),
    onSuccess: async () => {
      toast.success("Lead added");
      await refresh();
    },
    onError: (error: Error) => {
      if (!(error instanceof DuplicateLeadError)) toast.error(error.message || "Could not add the lead");
    },
  });
}

export function useUpdateLead() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: LeadPatch }) => updateLead(id, patch),
    onSuccess: async () => {
      await refresh();
    },
    onError: failed("Could not change the lead"),
  });
}

export function useMergeLead(id: number) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (intoId: number) => mergeLead(id, intoId),
    onSuccess: async () => {
      toast.success("Merged: both timelines are on the lead kept");
      await refresh();
    },
    onError: failed("Could not merge the leads"),
  });
}

export function useSaveContact(leadId: number) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ input, contactId }: { input: ContactInput; contactId?: number }) => (contactId ? updateContact(leadId, contactId, input) : addContact(leadId, input)),
    onSuccess: async () => {
      toast.success("Contact saved");
      await refresh();
    },
    onError: failed("Could not save the contact"),
  });
}

export function useDeleteContact(leadId: number) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (contactId: number) => deleteContact(leadId, contactId),
    onSuccess: async () => {
      toast.success("Contact removed");
      await refresh();
    },
    onError: failed("Could not remove the contact"),
  });
}

export function useLogActivity(leadId: number) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (input: ActivityInput) => logActivity(leadId, input),
    onSuccess: async () => {
      toast.success("Logged");
      await refresh();
    },
    onError: failed("Could not log it"),
  });
}

export function useUploadLeadFile(leadId: number) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (file: File) => uploadLeadFile(leadId, file),
    onSuccess: async () => {
      toast.success("File added");
      await refresh();
    },
    onError: failed("Could not add the file"),
  });
}

/** A dry run reads only; the real run creates leads, so it refreshes the lists. */
export function useImportLeads() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ file, dryRun }: { file: File; dryRun: boolean }) => importLeads(file, dryRun),
    onSuccess: async (result, { dryRun }) => {
      if (dryRun) return;
      toast.success(`${result.created ?? 0} leads imported`);
      await refresh();
    },
    onError: failed("Could not read the sheet"),
  });
}
