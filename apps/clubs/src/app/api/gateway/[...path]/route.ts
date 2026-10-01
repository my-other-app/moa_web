import { createGatewayHandlers } from "@moa/auth/gateway";

const apiUrl = process.env.MOA_API_URL;

if (!apiUrl) {
  throw new Error("MOA_API_URL must be set for the API gateway to function.");
}

export const { GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS } =
  createGatewayHandlers({ apiUrl });

// Auth-bearing proxy: never cache, and always run on the Node runtime so the
// request body can be streamed through unchanged (file uploads for club
// logos, badge art and certificate templates go through here).
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
