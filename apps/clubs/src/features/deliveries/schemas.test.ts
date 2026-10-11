import { describe, expect, it } from "vitest";

import { verdictOf } from "./schemas";

describe("what became of a send, in a word", () => {
  it("lets the provider's verdict outrank our own 'sent'", () => {
    expect(verdictOf({ status: "sent", outcome: "bounced" })).toEqual({ label: "Bounced", tone: "destructive" });
    expect(verdictOf({ status: "sent", outcome: "delivered" })).toEqual({ label: "Delivered", tone: "success" });
    expect(verdictOf({ status: "sent", outcome: null })).toEqual({ label: "Sent", tone: "info" });
  });

  it("tells a refusal from a guest with no address", () => {
    expect(verdictOf({ status: "failed" }).label).toBe("Refused");
    expect(verdictOf({ status: "skipped" }).label).toBe("Skipped");
    expect(verdictOf({ status: "pending" }).label).toBe("Queued");
  });
});
