import { ApiError } from "@moa/api";

/**
 * A stand-in for the app-kit `api` client, for the operator-tool screens'
 * tests: each call is recorded, and answered by the handler registered for
 * "METHOD /path" (an Error a handler throws is the refusal). GET
 * /api/v1/admin/ops/me answers `state.ops`, or FastAPI's route-level 404
 * when that is null -- a backend without the tools.
 */
export interface FakeCall {
  method: string;
  path: string;
  query?: Record<string, unknown> | undefined;
  body?: unknown;
}

export type Handler = (call: FakeCall) => unknown;

export interface FakeState {
  role: string;
  ops: { features: string[]; two_factor?: unknown; maintenance_banner?: string | null; role?: string } | null;
  calls: FakeCall[];
  handlers: Record<string, Handler>;
}

export const ALL_FEATURES = [
  "payouts",
  "disputes",
  "refunds",
  "admins",
  "settings",
  "jobs",
  "push",
  "suppressions",
  "whatsapp_templates",
  "club_reject",
  "two_factor_policy",
];

export function freshState(state: FakeState, over: Partial<FakeState> = {}) {
  state.role = "owner";
  state.ops = { features: [...ALL_FEATURES], two_factor: { required: true, enabled: true, grace_ends_at: null, blocked: false }, maintenance_banner: null };
  state.calls.length = 0;
  state.handlers = {};
  Object.assign(state, over);
}

/** FastAPI's own 404 for a path nothing is mounted on. */
export function routeMissing(): ApiError {
  return new ApiError({ message: "Not Found", status: 404, routeMissing: true });
}

/** An ErrorResponse the backend raises itself. */
export function refusal(status: number, message: string, errorCode: string | null = null): ApiError {
  return new ApiError({ message, status, errorCode });
}

export function fakeApi(state: FakeState) {
  const answer = async (method: string, path: string, body?: unknown, options?: { query?: Record<string, unknown> }) => {
    const call: FakeCall = { method, path, query: options?.query, body };
    state.calls.push(call);
    if (method === "GET" && path === "/api/v1/admin/ops/me" && !state.handlers[`GET ${path}`]) {
      if (state.ops === null) throw routeMissing();
      return { role: state.role, ...state.ops };
    }
    const handler = state.handlers[`${method} ${path}`];
    if (!handler) throw new Error(`unstubbed ${method} ${path}`);
    return handler(call);
  };
  return {
    get: (path: string, options?: { query?: Record<string, unknown> }) => answer("GET", path, undefined, options),
    post: (path: string, body?: unknown, options?: { query?: Record<string, unknown> }) => answer("POST", path, body, options),
    put: (path: string, body?: unknown, options?: { query?: Record<string, unknown> }) => answer("PUT", path, body, options),
    patch: (path: string, body?: unknown, options?: { query?: Record<string, unknown> }) => answer("PATCH", path, body, options),
    del: (path: string, body?: unknown, options?: { query?: Record<string, unknown> }) => answer("DELETE", path, body, options),
  };
}

/** The calls of one method (and path, when given). */
export function callsOf(state: FakeState, method: string, path?: string): FakeCall[] {
  return state.calls.filter((c) => c.method === method && (path === undefined || c.path === path));
}
