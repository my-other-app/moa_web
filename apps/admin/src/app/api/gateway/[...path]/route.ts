import { createGatewayHandlers } from "@moa/auth/gateway";
import { reportUpstreamResponse } from "@moa/observability/gateway";

/**
 * MOA_API_URL is read per request inside the handlers, not here: Next
 * evaluates this module while collecting page data during `next build`, so
 * reading it at module scope made the build fail anywhere the variable was
 * absent — which is every CI runner.
 */
export const { GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS } =
  // An upstream 5xx goes to Sentry (when it is on); a 4xx is the API
  // answering the caller and is not reported.
  createGatewayHandlers({ onUpstreamResponse: reportUpstreamResponse });

// Auth-bearing proxy: never cache, and always Node so request bodies pass
// through unchanged (logo, poster and template uploads go via here).
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
