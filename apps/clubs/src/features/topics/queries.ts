"use client";

import { useQuery } from "@tanstack/react-query";
import { qk } from "@moa/api";
import { resolveTopics, staleTimes, type LinkedInterest, type TopicRef } from "@moa/app-kit";

import { fetchTopicTree } from "./api";

/**
 * The topic tree: reference data, cached in the longest tier and shared by
 * the sign-up form, the club profile and the event form. One reader for the
 * key -- the club profile and the event form once read it under the same
 * key into two different shapes and could hand each other the wrong one.
 */
export function useTopicTree(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: qk.interests.all,
    queryFn: fetchTopicTree,
    staleTime: staleTimes.reference,
    enabled: options.enabled ?? true,
  });
}

/**
 * The topics to show for an event or a club: its own `topics` when the
 * server sent them, else derived from its interests against the tree (only
 * asked for when it is needed), else none.
 */
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
