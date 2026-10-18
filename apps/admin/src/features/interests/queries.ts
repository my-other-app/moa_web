"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "@moa/api";
import { resolveTopics, staleTimes, type LinkedInterest, type Topic, type TopicInterest, type TopicRef } from "@moa/app-kit";
import { toast } from "@moa/ui";

import {
  createInterest,
  createTopic,
  deleteInterest,
  deleteTopic,
  fetchTopicStats,
  fetchTopicTree,
  moveInterest,
  reorder,
  updateInterest,
  updateTopic,
} from "./api";
import { isMissingEndpoint, type InterestFormInput, type ReorderBody, type TopicFormInput } from "./schemas";

/** The live numbers sit under the tree's key, so refreshing the tree refreshes them too. */
export const TOPIC_STATS_KEY = [...qk.interests.all, "topics"] as const;

/** The topic tree: the same key and the same shape the clubs dashboard reads. */
export function useTopicTree(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: qk.interests.all,
    queryFn: fetchTopicTree,
    staleTime: staleTimes.reference,
    enabled: options.enabled ?? true,
  });
}

/** Each topic's clubs and upcoming events; null before the topics release. */
export function useTopicStats() {
  return useQuery({
    queryKey: TOPIC_STATS_KEY,
    queryFn: fetchTopicStats,
    staleTime: staleTimes.analytics,
  });
}

/** A club's or event's topics: its own when the server sent them, else derived from its interests. */
export function useResolvedTopics(
  entity:
    | {
        topics?: readonly TopicRef[] | null | undefined;
        interests?: ReadonlyArray<Pick<LinkedInterest, "id" | "category_id">> | null | undefined;
      }
    | null
    | undefined,
): TopicRef[] {
  const needsTree = !!entity && !Array.isArray(entity.topics) && !!entity.interests?.length;
  const tree = useTopicTree({ enabled: needsTree });
  return entity ? resolveTopics(entity, tree.data) : [];
}

/**
 * Topics and interests appear on club, event and user profiles, so a change
 * here moves all of them, and every change is in the activity log.
 */
async function invalidate(queryClient: ReturnType<typeof useQueryClient>) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: qk.interests.all }),
    queryClient.invalidateQueries({ queryKey: qk.clubs.all }),
    queryClient.invalidateQueries({ queryKey: qk.events.all }),
    queryClient.invalidateQueries({ queryKey: qk.users.all }),
    queryClient.invalidateQueries({ queryKey: ["audit-log"] }),
  ]);
}

/**
 * Refusals are shown where they happen (the dialog that asked); an endpoint
 * the server does not have yet is the page's notice, not an error toast.
 */
function toastUnlessMissing(error: Error) {
  if (!isMissingEndpoint(error)) toast.error(error.message);
}

export function useCreateTopic() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TopicFormInput) => createTopic(input),
    onSuccess: async () => {
      toast.success("Topic added");
      await invalidate(queryClient);
    },
  });
}

export function useUpdateTopic() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: TopicFormInput }) => updateTopic(id, input),
    onSuccess: async () => {
      toast.success("Topic updated");
      await invalidate(queryClient);
    },
  });
}

export function useDeleteTopic() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, moveTo }: { id: number; moveTo?: number | undefined }) => deleteTopic(id, moveTo),
    onSuccess: async (_result, { moveTo }) => {
      toast.success(moveTo != null ? "Topic deleted; its interests moved" : "Topic deleted");
      await invalidate(queryClient);
    },
    // A topic that gained interests meanwhile (409): the list is read again so the dialog can ask where they go.
    onError: async (error) => {
      if (!isMissingEndpoint(error)) await queryClient.invalidateQueries({ queryKey: qk.interests.all });
    },
  });
}

/**
 * Reordering moves the rows at once and puts them back if the server says
 * no. The new order is the caller's (`next`), so the list never jumps twice.
 */
export function useReorder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ body }: { body: ReorderBody; next: Topic[] }) => reorder(body),
    onMutate: async ({ next }) => {
      await queryClient.cancelQueries({ queryKey: qk.interests.all, exact: true });
      const previous = queryClient.getQueryData<Topic[]>(qk.interests.all);
      queryClient.setQueryData(qk.interests.all, next);
      return { previous };
    },
    onError: (error: Error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(qk.interests.all, context.previous);
      toastUnlessMissing(error);
    },
    onSuccess: () => invalidate(queryClient),
  });
}

export function useMoveInterest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ interest, toTopicId }: { interest: TopicInterest; toTopicId: number; toName: string }) => moveInterest(interest, toTopicId),
    onSuccess: async (_r, { interest, toName }) => {
      toast.success(`${interest.name} moved to ${toName}`);
      await invalidate(queryClient);
    },
  });
}

export function useCreateInterest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: InterestFormInput) => createInterest(input),
    onSuccess: async () => {
      toast.success("Interest added");
      await invalidate(queryClient);
    },
  });
}

export function useUpdateInterest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: InterestFormInput }) => updateInterest(id, input),
    onSuccess: async () => {
      toast.success("Interest updated");
      await invalidate(queryClient);
    },
  });
}

export function useDeleteInterest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteInterest,
    onSuccess: async (result) => {
      toast.success(result.detached_from > 0 ? `Interest deleted and removed from ${result.detached_from} records` : "Interest deleted");
      await invalidate(queryClient);
    },
    onError: toastUnlessMissing,
  });
}
