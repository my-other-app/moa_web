"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "@moa/api";
import { staleTimes } from "@moa/app-kit";
import { toast } from "@moa/ui";

import { createTemplate, deleteTemplate, fetchTemplates, updateTemplate } from "./api";
import type { CertificateForm, TicketForm } from "./schemas";

type Kind = "ticket" | "certificate";

const keyFor = (kind: Kind) =>
  kind === "ticket" ? qk.templates.ticket : qk.templates.certificate;

export function useTemplates(kind: Kind) {
  return useQuery({
    queryKey: keyFor(kind),
    queryFn: () => fetchTemplates(kind),
    staleTime: staleTimes.reference,
  });
}

export function useSaveTemplate(kind: Kind, templateId?: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      values,
      config,
    }: {
      values: TicketForm | CertificateForm;
      config: Record<string, unknown>;
    }) =>
      templateId === undefined
        ? createTemplate(kind, values, config)
        : updateTemplate(kind, templateId, values, config),
    onSuccess: async () => {
      toast.success(templateId === undefined ? "Template created" : "Template saved");
      await queryClient.invalidateQueries({ queryKey: keyFor(kind) });
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

export function useDeleteTemplate(kind: Kind) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (templateId: number) => deleteTemplate(kind, templateId),
    onSuccess: async () => {
      toast.success("Template deleted");
      await queryClient.invalidateQueries({ queryKey: keyFor(kind) });
    },
    onError: (error: Error) => toast.error(error.message),
  });
}
