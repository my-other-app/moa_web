import { unstable_rethrow } from "next/navigation";
import { createServerApiClient } from "@moa/auth/server";

import { OPS_ME_PATH } from "./api";
import { opsMeSchema, type OpsMe } from "./schemas";

/**
 * The operator-tools probe, read while the dashboard renders on the server.
 *
 * Null on anything but an answer -- a backend without the route, a 5xx, no
 * API configured -- so a probe that cannot be read never locks an admin out:
 * the server still refuses an admin route to an admin who must set up
 * two-factor, whatever this says.
 */
export async function readOpsMeOnServer(): Promise<OpsMe | null> {
  try {
    const raw = await createServerApiClient().get<unknown>(OPS_ME_PATH, { cache: "no-store" });
    return opsMeSchema.parse(raw);
  } catch (error) {
    unstable_rethrow(error);
    return null;
  }
}
