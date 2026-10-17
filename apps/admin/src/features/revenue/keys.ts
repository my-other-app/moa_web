/**
 * The revenue page's cache keys, in a module of their own so the features
 * that change what it counts (giving a plan, cancelling one) can invalidate it
 * without importing its components.
 */
export const REVENUE_KEY = ["revenue"] as const;
