/**
 * Hierarchical query keys.
 *
 * Keys are built here rather than inline at call sites so invalidation can be
 * expressed by prefix: invalidating `qk.users.all` clears every user list and
 * detail regardless of the filters each one was fetched with. Inline string
 * keys make that impossible without knowing every filter combination in use.
 */
export const qk = {
  session: ["session"] as const,

  analytics: {
    all: ["analytics"] as const,
    dashboard: () => [...qk.analytics.all, "dashboard"] as const,
    org: (orgId: number) => [...qk.analytics.all, "org", orgId] as const,
  },

  users: {
    all: ["users"] as const,
    list: (filters: object) =>
      [...qk.users.all, "list", filters] as const,
    detail: (id: number) => [...qk.users.all, "detail", id] as const,
  },

  clubs: {
    all: ["clubs"] as const,
    list: (filters: object) =>
      [...qk.clubs.all, "list", filters] as const,
    detail: (id: number) => [...qk.clubs.all, "detail", id] as const,
    self: () => [...qk.clubs.all, "self"] as const,
    followers: (id: number) => [...qk.clubs.all, "followers", id] as const,
    events: (id: number) => [...qk.clubs.all, "events", id] as const,
    notes: (id?: number) => [...qk.clubs.all, "notes", id ?? "self"] as const,
  },

  events: {
    all: ["events"] as const,
    list: (filters: object) =>
      [...qk.events.all, "list", filters] as const,
    detail: (id: number) => [...qk.events.all, "detail", id] as const,
    registrations: (id: number) =>
      [...qk.events.all, "registrations", id] as const,
    volunteers: (id: number) => [...qk.events.all, "volunteers", id] as const,
  },

  orgs: {
    all: ["orgs"] as const,
    list: (filters: object) =>
      [...qk.orgs.all, "list", filters] as const,
    detail: (id: number) => [...qk.orgs.all, "detail", id] as const,
  },

  badges: {
    all: ["badges"] as const,
    list: (filters: object) =>
      [...qk.badges.all, "list", filters] as const,
    detail: (id: number) => [...qk.badges.all, "detail", id] as const,
    recipients: (id: number) => [...qk.badges.all, "recipients", id] as const,
    stats: (id: number) => [...qk.badges.all, "stats", id] as const,
  },

  interests: { all: ["interests"] as const },

  notifications: {
    all: ["notifications"] as const,
    history: (filters: object) =>
      [...qk.notifications.all, "history", filters] as const,
    stats: (eventId: number) =>
      [...qk.notifications.all, "stats", eventId] as const,
  },

  templates: {
    ticket: ["templates", "ticket"] as const,
    certificate: ["templates", "certificate"] as const,
  },
} as const;
