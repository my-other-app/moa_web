"use client";

import * as React from "react";
import type { QueryKey } from "@tanstack/react-query";

import type { MailClient } from "./client";

/**
 * Whose mailbox the screens show: where they ask (`client`), the cache's
 * keys their reads live under, what else a change refreshes, how "we" are
 * named on mail sent from it, and refusals in its own words. A club's
 * dashboard and the admin portal each give one; the screens are the same.
 */
export interface MailConfig {
  client: MailClient;
  keys: {
    /** A folder's pages live under [...threads, folder, q, unread, mailbox]. */
    threads: QueryKey;
    /** One conversation under [...thread, id]. */
    thread: QueryKey;
    /** The unread counts (the nav's badge), refreshed with the list. */
    summary?: QueryKey;
  };
  /** Other reads a change makes stale: the bell's notices, an overview. */
  alsoRefresh?: QueryKey[];
  /** Whose mailbox, on mail it sent: "the club", "MyOtherApp". */
  ours: string;
  /** A refusal in words; the shared table's otherwise. */
  describeError?: (error: unknown, fallback?: string) => string;
}

const MailContext = React.createContext<MailConfig | null>(null);

export function MailProvider({ config, children }: { config: MailConfig; children: React.ReactNode }) {
  return <MailContext.Provider value={config}>{children}</MailContext.Provider>;
}

export function useMailConfig(): MailConfig {
  const config = React.useContext(MailContext);
  if (!config) throw new Error("The mail screens need a <MailProvider> around them.");
  return config;
}
