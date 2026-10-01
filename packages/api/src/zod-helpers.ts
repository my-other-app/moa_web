import { z } from "zod";

/**
 * Wraps an item schema in the backend's PaginatedResponse envelope.
 */
export function paginatedSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    limit: z.number(),
    offset: z.number(),
    // Normalised to `null` rather than left nullish so the parsed value is
    // assignable to Paginated<T>, whose fields are `T | null`. Leaving these
    // as `| undefined` forces a cast at every call site.
    total: z
      .number()
      .nullish()
      .transform((v) => v ?? null),
    next: z
      .string()
      .nullish()
      .transform((v) => v ?? null),
    items: z.array(item),
  });
}

/**
 * Coerces the API's loosely-typed scalars.
 *
 * Needed because the backend's CustomBaseModel declares a wildcard
 * `@field_serializer("*")` returning `Union[str, Any]`. Pydantic derives the
 * serialization schema from that annotation, so every field of every model
 * inheriting it is published as `anyOf: [string, {}]` -- which generates as
 * `unknown` and makes the OpenAPI types unusable for those models. Validating
 * here restores real types and catches genuine shape changes at the boundary.
 *
 * Remove these once the backend annotates that serializer properly; the
 * generated types will then be authoritative on their own.
 */
export const apiNumber = z.coerce.number();
export const apiString = z.string();
export const apiNullableString = z.string().nullish().transform((v) => v ?? null);
export const apiBool = z.coerce.boolean();
