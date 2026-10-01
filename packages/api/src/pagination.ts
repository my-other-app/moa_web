/**
 * Mirrors the backend's PaginatedResponse (app/core/response/pagination.py).
 */
export interface Paginated<T> {
  limit: number;
  offset: number;
  total: number | null;
  next: string | null;
  items: T[];
}

export interface PageParams {
  offset?: number;
  limit?: number;
}

export const DEFAULT_PAGE_SIZE = 20;

/**
 * Note the backend requests `limit + 1` internally to detect whether another
 * page exists, so `items.length` can exceed the requested limit by one. Use
 * this rather than comparing lengths yourself.
 */
export function hasNextPage<T>(page: Paginated<T>, requestedLimit: number): boolean {
  if (page.next) return true;
  if (page.total !== null) return page.offset + requestedLimit < page.total;
  return page.items.length > requestedLimit;
}

export function pageCount(total: number | null, limit: number): number | null {
  if (total === null || limit <= 0) return null;
  return Math.max(1, Math.ceil(total / limit));
}

export function toOffset(page: number, limit: number): number {
  return Math.max(0, (page - 1) * limit);
}
