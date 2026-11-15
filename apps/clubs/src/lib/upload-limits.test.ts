import { describe, expect, it } from "vitest";
import { toApiError } from "@moa/api";
import { MAX_ATTACHMENT_BYTES } from "@moa/mail-ui";

import { SEND_MAX } from "@/features/whatsapp/schemas";
import { DRAFT_PDF_MAX } from "@/features/ai/schemas";

/**
 * The server in front of the dashboards (Caddy) refuses a request over
 * 10 MB before the API sees it. What the dashboard lets someone pick stays
 * under that, and a refusal that gets through anyway says what happened.
 */
const PROXY_MAX = 10_000_000;

describe("uploads and the 10 MB the server in front takes", () => {
  it("never lets a file be picked that the server in front would refuse", () => {
    for (const max of [SEND_MAX, MAX_ATTACHMENT_BYTES, DRAFT_PDF_MAX]) expect(max).toBeLessThan(PROXY_MAX);
  });

  it("says a refused upload was too large, not that something went wrong", async () => {
    const error = await toApiError(new Response("<html><body>413 Request Entity Too Large</body></html>", { status: 413, headers: { "content-type": "text/html" } }));
    expect(error.status).toBe(413);
    expect(error.message).toMatch(/too large to send: one upload can be 10 MB at most/);
  });
});
