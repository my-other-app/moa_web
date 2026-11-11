import { ApiError } from "@moa/api";

/**
 * Whether an error means "this API has no such feature yet": the bare 404
 * FastAPI answers for a path nothing is mounted on, or a 405 (a path that
 * exists for another method only). A 404 or 405 the backend raises itself
 * carries an error code, and is never read as a missing feature.
 *
 * The portal deploys from main ahead of the backend; every screen of a new
 * feature asks its first endpoint through `nullIfAhead` and hides quietly
 * while it answers like this.
 */
export function isAheadOfApi(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  if (error.status === 404) return error.routeMissing;
  return error.status === 405 && error.errorCode === null;
}

/** The read, or `null` while the API does not have it (see isAheadOfApi). */
export async function nullIfAhead<T>(read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch (error) {
    if (isAheadOfApi(error)) return null;
    throw error;
  }
}
