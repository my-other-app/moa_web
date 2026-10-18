import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const { PrintFrame } = await import("./components/print-frame");

/**
 * The hidden frame that prints a card: the PDF is fetched with the
 * credential in a header, framed as a blob of our own, and the blob URL is
 * revoked when the frame goes. A door key or a kiosk token never rides in
 * the frame's URL.
 */
beforeEach(() => {
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const pdf = () => new Response(new Blob(["%PDF-1.4"], { type: "application/pdf" }), { status: 200 });

describe("the print frame", () => {
  it("fetches with the header, frames the blob and revokes it when it goes", async () => {
    const fetchSpy = vi.fn(async () => pdf());
    vi.stubGlobal("fetch", fetchSpy);
    const { unmount } = render(<PrintFrame url="/api/gateway/api/v1/kiosk/card.pdf?redemption=r.1" headers={{ "X-Kiosk-Token": "kiosk_abc" }} />);
    const frame = await screen.findByTitle("Print");
    expect(frame).toHaveAttribute("src", "blob:test");
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/gateway/api/v1/kiosk/card.pdf?redemption=r.1");
    expect((init.headers as Record<string, string>)["X-Kiosk-Token"]).toBe("kiosk_abc");
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test");
  });

  it("frames nothing and says why when the card is refused", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ message: "This kiosk is not paired.", error_code: "KIOSK_UNPAIRED" }, { status: 401 })));
    const onError = vi.fn();
    const onDone = vi.fn();
    render(<PrintFrame url="/x.pdf" headers={{ "X-Kiosk-Token": "old" }} onError={onError} onDone={onDone} />);
    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(onError.mock.calls[0]![0]).toMatchObject({ status: 401, errorCode: "KIOSK_UNPAIRED" });
    expect(onDone).toHaveBeenCalled();
    expect(screen.queryByTitle("Print")).toBeNull();
  });

  it("uses the session alone when there is no header to send", async () => {
    const fetchSpy = vi.fn(async () => pdf());
    vi.stubGlobal("fetch", fetchSpy);
    render(<PrintFrame url="/api/gateway/api/v1/events/42/idcards/r1.pdf" />);
    await screen.findByTitle("Print");
    const [, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.credentials).toBe("include");
    expect(init.headers).toEqual({ Accept: "application/pdf" });
  });
});
