import type { paths } from "./generated/schema";

/**
 * The 200-response body for an endpoint, read straight from the generated
 * schema.
 *
 * Features use this rather than re-declaring interfaces, so a backend field
 * rename surfaces as a compile error at the call site instead of as
 * `undefined` on screen. Addressing by path+method also survives the
 * generator's schema renames, which component names do not.
 */
export type ResponseOf<
  P extends keyof paths,
  M extends keyof paths[P],
> = paths[P][M] extends {
  responses: { 200: { content: { "application/json": infer R } } };
}
  ? R
  : never;

/** Request body for an endpoint, same rationale as ResponseOf. */
export type BodyOf<
  P extends keyof paths,
  M extends keyof paths[P],
> = paths[P][M] extends {
  requestBody: { content: { "application/json": infer B } };
}
  ? B
  : never;

/** Query parameters for an endpoint. */
export type QueryOf<
  P extends keyof paths,
  M extends keyof paths[P],
> = paths[P][M] extends { parameters: { query?: infer Q } } ? Q : never;

/** Element type of a paginated response's `items`. */
export type ItemOf<T> = T extends { items: readonly (infer I)[] } ? I : never;
