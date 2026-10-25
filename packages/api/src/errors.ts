/**
 * Normalised API error.
 *
 * The backend returns `{ message, errors, error_code, track_id }` (see
 * app/response.py's ErrorResponse). Everything that talks to the API throws
 * this, so UI code never has to reach into an axios/fetch-shaped error or
 * guess between `detail` and `message` -- a mismatch that has already caused
 * blank error toasts in the previous dashboards.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly errorCode: string | null;
  readonly trackId: string | null;
  readonly fieldErrors: Record<string, string[]> | null;
  /**
   * The API has no such route at all: FastAPI's own 404 for a path nothing
   * is mounted on, `{"detail": "Not Found"}`. Every 404 the backend raises
   * itself is an ErrorResponse (`{message, errors, error_code, track_id}`),
   * so a coded "no such template" is never read as "this API doesn't have
   * the feature yet" -- which is what this says: a dashboard deployed ahead
   * of its backend hides what the backend can't answer yet.
   */
  readonly routeMissing: boolean;

  constructor(init: {
    message: string;
    status: number;
    errorCode?: string | null;
    trackId?: string | null;
    fieldErrors?: Record<string, string[]> | null;
    routeMissing?: boolean;
  }) {
    super(init.message);
    this.name = "ApiError";
    this.status = init.status;
    this.errorCode = init.errorCode ?? null;
    this.trackId = init.trackId ?? null;
    this.fieldErrors = init.fieldErrors ?? null;
    this.routeMissing = init.status === 404 && Boolean(init.routeMissing);
  }

  /** The session is gone or was revoked; the caller should re-authenticate. */
  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  /** Authenticated but not allowed. Retrying or re-logging in will not help. */
  get isForbidden(): boolean {
    return this.status === 403;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  /** Server-side fault: worth retrying, unlike a 4xx. */
  get isServer(): boolean {
    return this.status >= 500;
  }
}

const FALLBACK_BY_STATUS: Record<number, string> = {
  400: "That request was not valid.",
  401: "Your session has expired. Please sign in again.",
  403: "You do not have permission to do that.",
  404: "We could not find what you were looking for.",
  409: "That conflicts with something that already exists.",
  422: "Some of the submitted values were not valid.",
  429: "Too many attempts. Please wait a moment and try again.",
};

/**
 * Builds an ApiError from a failed Response.
 *
 * FastAPI emits two different error shapes: the app's own ErrorResponse, and
 * the framework's `{ detail: ... }` for validation failures raised before our
 * handlers run. Both are handled here so neither surfaces as "undefined".
 */
export async function toApiError(response: Response): Promise<ApiError> {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Non-JSON body (gateway HTML, empty 502, ...) -- fall through to defaults.
  }

  const fallback =
    FALLBACK_BY_STATUS[response.status] ??
    (response.status >= 500
      ? "Something went wrong on our side. Please try again."
      : "Something went wrong.");

  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;

    // FastAPI validation errors: detail is an array of {loc, msg, type}.
    if (Array.isArray(b.detail)) {
      const fieldErrors: Record<string, string[]> = {};
      for (const raw of b.detail) {
        if (!raw || typeof raw !== "object") continue;
        const item = raw as { loc?: unknown[]; msg?: string };
        const field = Array.isArray(item.loc)
          ? item.loc.filter((p) => p !== "body").join(".")
          : "_";
        const list = fieldErrors[field] ?? [];
        list.push(item.msg ?? "Invalid value");
        fieldErrors[field] = list;
      }
      return new ApiError({
        message: "Some of the submitted values were not valid.",
        status: response.status,
        fieldErrors,
      });
    }

    const message =
      (typeof b.message === "string" && b.message) ||
      (typeof b.detail === "string" && b.detail) ||
      fallback;

    return new ApiError({
      message,
      status: response.status,
      errorCode: typeof b.error_code === "string" ? b.error_code : null,
      trackId: typeof b.track_id === "string" ? b.track_id : null,
      fieldErrors:
        b.errors && typeof b.errors === "object"
          ? (b.errors as Record<string, string[]>)
          : null,
      routeMissing: isRouteMissingBody(b),
    });
  }

  return new ApiError({ message: fallback, status: response.status });
}

/**
 * FastAPI's answer for a path no route matches -- `{"detail": "Not Found"}`
 * and nothing else of the app's ErrorResponse. (The status is checked by
 * ApiError itself: only a 404 can be a missing route.)
 */
function isRouteMissingBody(b: Record<string, unknown>): boolean {
  return b.detail === "Not Found" && !("message" in b) && !("error_code" in b);
}

/**
 * True when the API answered that it has no such route (see
 * ApiError.routeMissing): the feature isn't on this backend yet. Anything
 * else -- a coded 404, a 403, a 5xx, the network -- is not evidence of that.
 */
export function isRouteMissing(error: unknown): boolean {
  return error instanceof ApiError && error.routeMissing;
}

/**
 * The read, or `null` when the API has no such route yet (isRouteMissing):
 * for a query whose feature may reach the dashboard before its backend.
 * `null` is an answer, not an error, so the query keeps it (no retry, no
 * skeleton on the next visit) and simply reads it again later -- the day the
 * backend has the route, the feature shows up without a dashboard deploy.
 */
export async function nullIfRouteMissing<T>(read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch (error) {
    if (isRouteMissing(error)) return null;
    throw error;
  }
}
