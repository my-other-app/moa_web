import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@moa/api";

import { createStationLoop, type StationResult, type StationState } from "./station-loop";
import type { ClaimResponse } from "./schemas";

const card = (id: string, name = "Asha K"): ClaimResponse => ({ request: { id, registration_id: "r1", name, ticket_code: "MOA-1", source: "kiosk", attempt: 1, card_url: `/api/v1/kiosk/printer/requests/${id}/card.pdf` }, queued: 1 });
const nothing: ClaimResponse = { request: null, queued: 0 };

function setup(over: Partial<Parameters<typeof createStationLoop>[0]> = {}) {
  const states: StationState[] = [];
  const results: StationResult[] = [];
  const claim = vi.fn<() => Promise<ClaimResponse>>(async () => nothing);
  const print = vi.fn<(job: unknown) => Promise<void>>(async () => undefined);
  const done = vi.fn(async () => undefined);
  const loop = createStationLoop({
    claim,
    print,
    done,
    cardUrl: (c) => `/gw${c.card_url}`,
    testUrl: "/gw/api/v1/kiosk/printer/test",
    onState: (s) => states.push(s),
    onResult: (r) => results.push(r),
    ...over,
  });
  return { loop, claim, print, done, states, results };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("the print station loop", () => {
  it("claims every 2 seconds while nothing is waiting, one call at a time", async () => {
    const { loop, claim } = setup();
    let inFlight = 0;
    let most = 0;
    claim.mockImplementation(async () => {
      inFlight++;
      most = Math.max(most, inFlight);
      await new Promise((r) => setTimeout(r, 500));
      inFlight--;
      return nothing;
    });
    loop.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(claim).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(500 + 1999);
    expect(claim).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2);
    expect(claim).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(most).toBe(1);
    loop.stop();
  });

  it("prints a claimed card, then confirms it with ok:true, before it claims again", async () => {
    const { loop, claim, print, done, results } = setup();
    const order: string[] = [];
    print.mockImplementation(async () => void order.push("print"));
    done.mockImplementation(async () => void order.push("done"));
    claim.mockImplementationOnce(async () => (order.push("claim"), card("q1"))).mockImplementation(async () => (order.push("claim"), nothing));
    loop.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(print).toHaveBeenCalledWith({ id: "q1", name: "Asha K", url: "/gw/api/v1/kiosk/printer/requests/q1/card.pdf", method: "GET", test: false });
    expect(done).toHaveBeenCalledWith("q1", true, null);
    expect(results[0]).toMatchObject({ id: "q1", name: "Asha K", ok: true, test: false });
    expect(order).toEqual(["claim", "print", "done"]);
    // The next claim waits for the printer to take the card.
    await vi.advanceTimersByTimeAsync(1000);
    expect(order).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(2000);
    expect(order).toEqual(["claim", "print", "done", "claim"]);
    loop.stop();
  });

  it("reports a card that could not be fetched or printed as ok:false, with the reason", async () => {
    const { loop, claim, print, done, results } = setup();
    claim.mockResolvedValueOnce(card("q2", "Ravi"));
    print.mockRejectedValue(new ApiError({ message: "Your card was already printed.", status: 409 }));
    loop.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toHaveBeenCalledWith("q2", false, "Your card was already printed.");
    expect(results[0]).toMatchObject({ ok: false, error: "Your card was already printed." });
    loop.stop();
  });

  it("backs off to 5 seconds after an error, and says it is offline", async () => {
    const { loop, claim, states } = setup();
    claim.mockRejectedValueOnce(new Error("Network down")).mockResolvedValue(nothing);
    loop.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(claim).toHaveBeenCalledTimes(1);
    expect(states.at(-1)).toEqual({ kind: "offline", message: "Network down" });
    await vi.advanceTimersByTimeAsync(4900);
    expect(claim).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(200);
    expect(claim).toHaveBeenCalledTimes(2);
    expect(states.at(-1)).toEqual({ kind: "idle", queued: 0 });
    loop.stop();
  });

  it("tries to confirm a card three times, then backs off rather than print it twice", async () => {
    const { loop, claim, done } = setup();
    claim.mockResolvedValueOnce(card("q3")).mockResolvedValue(nothing);
    done.mockRejectedValue(new Error("offline"));
    loop.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1500);
    await vi.advanceTimersByTimeAsync(1500);
    expect(done).toHaveBeenCalledTimes(3);
    loop.stop();
  });

  it("prints the test card through the same path, as a POST, and tells the server nothing", async () => {
    const { loop, print, done, results } = setup();
    loop.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(loop.printTest()).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(print).toHaveBeenCalledWith(expect.objectContaining({ name: "Test card", url: "/gw/api/v1/kiosk/printer/test", method: "POST", test: true }));
    expect(done).not.toHaveBeenCalled();
    expect(results[0]).toMatchObject({ name: "Test card", ok: true, test: true });
    loop.stop();
  });

  it("refuses a test card while a real card is printing", async () => {
    const { loop, claim, print } = setup();
    claim.mockResolvedValueOnce(card("q4"));
    let finish: () => void = () => undefined;
    print.mockImplementation(() => new Promise<void>((r) => (finish = r)));
    loop.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(loop.busy).toBe(true);
    expect(loop.printTest()).toBe(false);
    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(loop.busy).toBe(false);
    loop.stop();
  });

  it("stops and says the pairing ended when the token is refused", async () => {
    const { loop, claim, states } = setup();
    claim.mockRejectedValue(new ApiError({ message: "Not paired", status: 401 }));
    loop.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(states.at(-1)).toEqual({ kind: "unpaired" });
    await vi.advanceTimersByTimeAsync(20_000);
    expect(claim).toHaveBeenCalledTimes(1);
  });
});
