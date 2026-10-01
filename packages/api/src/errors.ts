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

  constructor(init: {
    message: string;
    status: number;
    errorCode?: string | null;
    trackId?: string | null;
    fieldErrors?: Record<string, string[]> | null;
  }) {
    super(init.message);
    this.name = "ApiError";
    this.status = init.status;
    this.errorCode = init.errorCode ?? null;
    this.trackId = init.trackId ?? null;
    this.fieldErrors = init.fieldErrors ?? null;
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
    });
  }

  return new ApiError({ message: fallback, status: response.status });
}
