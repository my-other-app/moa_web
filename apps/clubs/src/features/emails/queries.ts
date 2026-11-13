"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, isRouteMissing, qk } from "@moa/api";
import { toast } from "@moa/ui";

import { useRefreshDeliveries } from "@/features/deliveries";

import { toastError } from "@/features/plan/errors";

import {
  countAudience,
  createTemplate,
  deleteTemplate,
  duplicateTemplate,
  fetchEmailContext,
  fetchLibraryOverview,
  fetchMessage,
  fetchMessages,
  fetchTemplate,
  fetchTemplates,
  previewEmail,
  resetLibraryTemplate,
  resetTemplate,
  saveTemplate,
  saveToLibrary,
  sendMessage,
  sendTemplate,
  sendTestEmail,
  countReviewResend,
  fetchReviewEmails,
  resendReviewEmail,
  resetReviewEmail,
  saveReviewEmail,
  type MessageBody,
  type MessageQuery,
  type PreviewBody,
} from "./api";
import type { EmailAttachments, EmailAudience, EmailScope, EmailStage, EmailTemplateFields, ReviewEmail } from "./schemas";

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

/**
 * "Reset to default…" on a library email (the registration review emails):
 * back to MyOtherApp's words. A backend before the route answers its bare
 * 404, said as "not available yet" rather than as an error.
 */
export function useResetLibraryTemplate() {
  const queryClient = useQueryClient();
  const scope: EmailScope = { kind: "library" };
  return useMutation({
    mutationFn: (templateId: string) => resetLibraryTemplate(templateId),
    onSuccess: (data) => {
      queryClient.setQueryData([...emailsKey(scope), "template", data.id], data);
      void queryClient.invalidateQueries({ queryKey: [...emailsKey(scope), "overview"] });
      void queryClient.invalidateQueries({ queryKey: [...emailsKey(scope), "list"] });
      toast.success("Back to the default words", { description: `Version ${data.version}.` });
    },
    onError: (error) => {
      if (isRouteMissing(error) || (error instanceof ApiError && error.status === 405)) toast.warning("Reset isn't available yet.");
      else toastError(error);
    },
  });
}

export function useSendTemplate(eventId: number) {
  const refresh = useRefreshEmails({ kind: "event", eventId });
  const refreshDeliveries = useRefreshDeliveries(eventId);
  return useMutation({
    mutationFn: ({ templateId, clientRef }: { templateId: string; clientRef?: string }) => sendTemplate(eventId, templateId, clientRef),
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

export function useMessages(eventId: number, page: number, pageSize = 20, order: "asc" | "desc" = "desc") {
  return useQuery({
    queryKey: [...messagesKey(eventId), "list", page, pageSize, ...(order === "asc" ? ["asc"] : [])],
    queryFn: () => fetchMessages(eventId, page, pageSize, order),
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

// --- an event's own registration review emails --------------------------------------------------------------------------------------

export const reviewEmailsKey = (eventId: number) => [...emailsKey({ kind: "event", eventId }), "review"] as const;

/**
 * The six review emails as this event sends them; `null` from an API
 * without them per event (the section hides). While a send-again is going
 * out its counts are read again every few seconds.
 */
export function useReviewEmails(eventId: number) {
  return useQuery({
    queryKey: reviewEmailsKey(eventId),
    queryFn: () => fetchReviewEmails(eventId),
    staleTime: 10_000,
    refetchInterval: (query) => (query.state.data?.some((r) => r.lastResend?.status === "sending") ? 3_000 : false),
  });
}

/** Puts a stage's new template into the cached list, as this event's own (a save) or the club's (a reset). */
function useSetReviewTemplate(eventId: number) {
  const queryClient = useQueryClient();
  return (stage: string, template: ReviewEmail["template"] | null, source: ReviewEmail["source"]) => {
    queryClient.setQueryData<ReviewEmail[] | null>(reviewEmailsKey(eventId), (list) =>
      list?.map((r) => (r.stage === stage.toUpperCase() ? { ...r, source, template: template ?? r.template } : r)),
    );
    // The counts (who a send-again reaches) and the club's template come from the server.
    void queryClient.invalidateQueries({ queryKey: reviewEmailsKey(eventId) });
  };
}

export function useSaveReviewEmail(eventId: number) {
  const setTemplate = useSetReviewTemplate(eventId);
  return useMutation({
    mutationFn: ({ stage, fields }: { stage: string; fields: EmailTemplateFields }) => saveReviewEmail(eventId, stage, fields),
    onSuccess: (template, { stage }) => setTemplate(stage, template, "event"),
    onError: toastError,
  });
}

/** "Use club's default": drops this event's own words for the stage. */
export function useResetReviewEmail(eventId: number) {
  const setTemplate = useSetReviewTemplate(eventId);
  return useMutation({
    mutationFn: (stage: string) => resetReviewEmail(eventId, stage),
    onSuccess: (template, stage) => {
      setTemplate(stage, template, "club");
      toast.success("Back to the club's words", { description: "This event now sends the club's version of this email." });
    },
    onError: toastError,
  });
}

export function useReviewResendCount(eventId: number, stage: string, enabled: boolean) {
  return useQuery({
    queryKey: [...reviewEmailsKey(eventId), "count", stage],
    queryFn: () => countReviewResend(eventId, stage),
    enabled,
    staleTime: 0,
    retry: false,
  });
}

/** A send-again; its errors are said in the confirm dialog (a plan refusal opens the upgrade dialog instead). */
export function useResendReviewEmail(eventId: number) {
  const queryClient = useQueryClient();
  const refreshDeliveries = useRefreshDeliveries(eventId);
  return useMutation({
    mutationFn: ({ stage, clientRef }: { stage: string; clientRef: string }) => resendReviewEmail(eventId, stage, clientRef),
    onSuccess: (r) => {
      toast.success(r.recipients ? `Sending to ${r.recipients} ${r.recipients === 1 ? "person" : "people"}` : "Nobody to send to", {
        description: r.recipients ? "Each email goes out one by one; the card shows how it went." : undefined,
      });
      void queryClient.invalidateQueries({ queryKey: reviewEmailsKey(eventId) });
      refreshDeliveries();
    },
  });
}
