import { z } from "zod";

import { GEO_SOURCES } from "./geo";

/**
 * The pin's fields, for a form schema to spread in. Latitude and longitude
 * are range-checked as the server checks them; `refinePin` adds the rule
 * that they come as a pair.
 */
export const pinFormShape = {
  lat: z.number().finite().gte(-90, "Latitude runs from -90 to 90").lte(90, "Latitude runs from -90 to 90").nullish(),
  lng: z.number().finite().gte(-180, "Longitude runs from -180 to 180").lte(180, "Longitude runs from -180 to 180").nullish(),
  geo_source: z.enum(GEO_SOURCES).nullish(),
  clear_point: z.boolean().optional(),
};

/** Both or neither: a latitude without its longitude is nowhere at all. */
export function refinePin(value: { lat?: number | null; lng?: number | null }, ctx: z.RefinementCtx) {
  if ((value.lat == null) !== (value.lng == null)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [value.lat == null ? "lat" : "lng"],
      message: "Give both latitude and longitude, or neither",
    });
  }
}

/**
 * The pin as the event and club detail payloads carry it. Each part falls
 * back to null rather than failing the payload: an edit form that will not
 * open over a source name it does not know would be worse than no pin.
 */
export const pinDetailShape = {
  lat: z.number().finite().nullish().catch(null),
  lng: z.number().finite().nullish().catch(null),
  geo_source: z.enum(GEO_SOURCES).nullish().catch(null),
};

/** One Photon feature, as much of it as a suggestion shows. Coordinates are [lng, lat]. */
export const photonFeatureSchema = z.object({
  geometry: z.object({ coordinates: z.tuple([z.number(), z.number()]).rest(z.unknown()) }),
  properties: z
    .object({
      osm_type: z.string().nullish(),
      osm_id: z.union([z.number(), z.string()]).nullish(),
      name: z.string().nullish(),
      housenumber: z.string().nullish(),
      street: z.string().nullish(),
      city: z.string().nullish(),
      locality: z.string().nullish(),
      district: z.string().nullish(),
      county: z.string().nullish(),
      state: z.string().nullish(),
    })
    .passthrough(),
});

export type PhotonFeature = z.infer<typeof photonFeatureSchema>;

export const photonResponseSchema = z.object({ features: z.array(z.unknown()) });
