"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "@moa/api";
import { toast } from "@moa/ui";

import { useRefreshDeliveries } from "@/features/deliveries";

import { toastError } from "@/features/plan/errors";

import {
  countAudience,
  createTemplate,
  deleteTemplate,
  duplicateTemplate,
  fetchEmailContext,
  fetchLibrary,
  fetchLibraryOverview,
  fetchMessage,
  fetchMessages,
  fetchTemplate,
  fetchTemplates,
  previewEmail,
  resetTemplate,
  saveTemplate,
  saveToLibrary,
  sendMessage,
  sendTemplate,
  sendTestEmail,
  type MessageBody,
  type MessageQuery,
  type PreviewBody,
} from "./api";
import type { EmailAttachments, EmailAudience, EmailScope, EmailStage, EmailTemplateFields } from "./schemas";

export const emailsKey = (scope: EmailScope) =>
  scope.kind === "event" ? ([...qk.events.detail(scope.eventId), "emails"] as const) : ([...qk.clubs.self(), "emails"] as const);
const messagesKey = (eventId: number) => [...qk.events.detail(eventId), "messages"] as const;

export function useTemplates(eventId: number) {
  return useQuery({
    queryKey: [...emailsKey({ kind: "event", eventId }), "list"],
    queryFn: () => fetchTemplates(eventId),
    staleTime: 10_000,
  });
}

export function useLibraryOverview() {
  return useQuery({ queryKey: [...emailsKey({ kind: "library" }), "overview"], queryFn: fetchLibraryOverview, staleTime: 30_000 });
}

export function useLibrary() {
  return useQuery({
    queryKey: [...emailsKey({ kind: "library" }), "list"],
    queryFn: fetchLibrary,
    staleTime: 10_000,
  });
}

export function useEmailContext(scope: EmailScope) {
  return useQuery({
    queryKey: [...emailsKey(scope), "context"],
    queryFn: () => fetchEmailContext(scope),
    staleTime: 60_000,
  });
}

export function useTemplate(scope: EmailScope, templateId: string) {
  return useQuery({
    queryKey: [...emailsKey(scope), "template", templateId],
    queryFn: () => fetchTemplate(scope, templateId),
    // Edited and saved in one sitting: a cached copy would show the version just replaced.
    staleTime: 0,
  });
}

function useRefreshEmails(scope: EmailScope) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: emailsKey(scope) });
    if (scope.kind === "event") void queryClient.invalidateQueries({ queryKey: messagesKey(scope.eventId) });
  };
}

export function useSaveTemplate(scope: EmailScope) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ templateId, fields }: { templateId: string; fields: EmailTemplateFields }) =>
      saveTemplate(scope, templateId, fields),
    onSuccess: (data) => {
      queryClient.setQueryData([...emailsKey(scope), "template", data.id], data);
      void queryClient.invalidateQueries({ queryKey: [...emailsKey(scope), "list"] });
    },
    onError: toastError,
  });
}

export function useCreateTemplate(scope: EmailScope) {
  const refresh = useRefreshEmails(scope);
  return useMutation({
    mutationFn: ({ fields, stage }: { fields: EmailTemplateFields; stage?: EmailStage }) => createTemplate(scope, fields, stage),
    onSuccess: refresh,
    onError: toastError,
  });
}

export function useDeleteTemplate(scope: EmailScope) {
  const refresh = useRefreshEmails(scope);
  return useMutation({
    mutationFn: (templateId: string) => deleteTemplate(scope, templateId),
    onSuccess: () => {
      toast.success("Email deleted");
      refresh();
    },
    onError: toastError,
  });
}

export function useDuplicateTemplate(scope: EmailScope) {
  const refresh = useRefreshEmails(scope);
  return useMutation({
    mutationFn: (templateId: string) => duplicateTemplate(scope, templateId),
    onSuccess: (t) => {
      toast.success(`${t.name} made`);
      refresh();
    },
    onError: toastError,
  });
}

export function useSaveToLibrary(eventId: number) {
  const refreshLibrary = useRefreshEmails({ kind: "library" });
  const refreshEvent = useRefreshEmails({ kind: "event", eventId });
  return useMutation({
    mutationFn: (templateId: string) => saveToLibrary(eventId, templateId),
    onSuccess: (t) => {
      toast.success("Saved to the club's library", { description: `New events start from this ${t.name}.` });
      refreshLibrary();
      refreshEvent();
    },
    onError: toastError,
  });
}

export function useResetTemplate(eventId: number) {
  const queryClient = useQueryClient();
  const scope: EmailScope = { kind: "event", eventId };
  return useMutation({
    mutationFn: (templateId: string) => resetTemplate(eventId, templateId),
    onSuccess: (data) => {
      queryClient.setQueryData([...emailsKey(scope), "template", data.id], data);
      void queryClient.invalidateQueries({ queryKey: [...emailsKey(scope), "list"] });
      toast.success("Back to the club's version");
    },
    onError: toastError,
  });
}

export function useSendTemplate(eventId: number) {
  const refresh = useRefreshEmails({ kind: "event", eventId });
  const refreshDeliveries = useRefreshDeliveries(eventId);
  return useMutation({
    mutationFn: (templateId: string) => sendTemplate(eventId, templateId),
    onSuccess: (m) => {
      toast.success(m.recipients ? `Sending to ${m.recipients} ${m.recipients === 1 ? "guest" : "guests"}` : "Nobody to send to", {
        description: m.recipients ? "Each guest's email is on its way; the message shows how it went." : "No guest matches this audience.",
      });
      refresh();
      refreshDeliveries();
    },
    onError: toastError,
  });
}

export function usePreview(scope: EmailScope, body: PreviewBody, enabled = true) {
  return useQuery({
    queryKey: [...emailsKey(scope), "preview", body],
    queryFn: () => previewEmail(scope, body),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    retry: false,
  });
}

export function useSendTest(eventId: number) {
  return useMutation({
    mutationFn: (body: PreviewBody & { to: string; attachments: EmailAttachments }) => sendTestEmail(eventId, body),
    onSuccess: (r) => toast.success(`Test sent to ${r.to}`, { description: `Subject: ${r.subject}` }),
    onError: toastError,
  });
}

export function useAudienceCount(eventId: number, audience: EmailAudience, enabled = true) {
  return useQuery({
    queryKey: [...emailsKey({ kind: "event", eventId }), "audience", audience],
    queryFn: () => countAudience(eventId, audience),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  });
}

export function useMessages(eventId: number, page: number, pageSize = 20) {
  return useQuery({
    queryKey: [...messagesKey(eventId), "list", page, pageSize],
    queryFn: () => fetchMessages(eventId, page, pageSize),
    placeholderData: keepPreviousData,
    // A message in flight updates its counts as guests are reached.
    refetchInterval: (query) => (query.state.data?.items.some((m) => m.status === "SENDING") ? 3_000 : false),
  });
}

export function useSendMessage(eventId: number) {
  const refresh = useRefreshEmails({ kind: "event", eventId });
  const refreshDeliveries = useRefreshDeliveries(eventId);
  return useMutation({
    mutationFn: (body: MessageBody) => sendMessage(eventId, body),
    onSuccess: (m) => {
      toast.success(m.recipients ? `Sending to ${m.recipients} ${m.recipients === 1 ? "guest" : "guests"}` : "Nobody to send to");
      refresh();
      refreshDeliveries();
    },
    onError: toastError,
  });
}

export function useMessage(eventId: number, messageId: string | null, q: MessageQuery) {
  return useQuery({
    queryKey: [...messagesKey(eventId), "detail", messageId, q],
    queryFn: () => fetchMessage(eventId, messageId!, q),
    enabled: messageId !== null,
    placeholderData: keepPreviousData,
    refetchInterval: (query) => (query.state.data?.message.status === "SENDING" ? 3_000 : false),
  });
}
