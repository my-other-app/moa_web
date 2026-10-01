import {
  QueryClient,
  defaultShouldDehydrateQuery,
  isServer,
} from "@tanstack/react-query";
import { ApiError } from "@moa/api";

/**
 * Cache policy.
 *
 * `staleTime` is deliberately non-zero: an admin moving between Users and
 * Clubs and back within a few seconds should not refetch identical lists.
 * Individual queries raise it further for reference data that barely changes
 * (interests, organisations) via `staleTimes` below.
 */
export const staleTimes = {
  /** Lists an admin edits and expects to see change. */
  volatile: 30_000,
  /** Dashboard counters; a minute of staleness is invisible and saves load. */
  analytics: 60_000,
  /** Interests, organisations, badge definitions. */
  reference: 10 * 60_000,
} as const;

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: staleTimes.volatile,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          // Retrying a 401/403/404 is pointless and, for 401, actively harmful:
          // it delays the redirect to sign-in behind three failed attempts.
          if (error instanceof ApiError && !error.isServer) return false;
          return failureCount < 2;
        },
      },
      mutations: {
        // Mutations are user-initiated; a silent retry can double-submit.
        retry: false,
      },
      dehydrate: {
        // Also dehydrate still-pending queries so a server-prefetched page can
        // stream rather than waiting for every query to settle first.
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) || query.state.status === "pending",
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

export function getQueryClient(): QueryClient {
  // One client per request on the server (never shared between users), one
  // singleton in the browser (survives re-renders, keeps the cache).
  if (isServer) return makeQueryClient();
  browserQueryClient ??= makeQueryClient();
  return browserQueryClient;
}
