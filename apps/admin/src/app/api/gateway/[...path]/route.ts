import { createGatewayHandlers } from "@moa/auth/gateway";

/**
 * MOA_API_URL is read per request inside the handlers, not here: Next
 * evaluates this module while collecting page data during `next build`, so
 * reading it at module scope made the build fail anywhere the variable was
 * absent — which is every CI runner.
 */
export const { GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS } =
  createGatewayHandlers({});

// Auth-bearing proxy: never cache, and always Node so request bodies can be
// streamed through unchanged (logo, poster and template uploads go via here).
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
