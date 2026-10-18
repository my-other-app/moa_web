import { api, parseTopicTree, type Topic } from "@moa/app-kit";

/**
 * GET /interests/list (public): every topic with its interests, in the
 * admin's order. Public because the sign-up form asks before there is an
 * account to sign in with.
 */
export async function fetchTopicTree(): Promise<Topic[]> {
  return parseTopicTree(await api.get<unknown>("/api/v1/interests/list"));
}
