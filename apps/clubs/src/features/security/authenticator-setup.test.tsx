import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import QRCode from "qrcode";
import { toast } from "@moa/ui";
import { AuthenticatorSetup } from "@moa/app-kit";

/**
 * The scan step both dashboards share (packages/app-kit): the setup link as a
 * QR code, drawn here and never by a QR service, since the link carries the
 * account's secret; then the steps, and the key and the link for anyone who
 * cannot scan.
 */
const SECRET = "JBSWY3DPEHPK3PXP";
const URI = `otpauth://totp/MyOtherApp:circuit-society?secret=${SECRET}&issuer=MyOtherApp`;
const RUN = /M(\d+) (\d+)h(\d+)v1h-\3z/g;

/** The dark modules the SVG draws, read back from its path, as "row,col" in the drawing's own grid. */
function drawn(svg: Element) {
  const size = Number(svg.getAttribute("viewBox")!.split(" ")[2]);
  const d = svg.querySelector("path")!.getAttribute("d")!;
  const dark = new Set<string>();
  for (const m of d.matchAll(RUN)) {
    const [x, y, run] = [Number(m[1]), Number(m[2]), Number(m[3])];
    for (let i = 0; i < run; i++) dark.add(`${y},${x + i}`);
  }
  return { size, dark, leftover: d.replace(RUN, "") };
}

const qr = () => screen.getByRole("img", { name: "QR code for your authenticator app" });

let writeText: ReturnType<typeof vi.fn>;
let failure: MockInstance<typeof toast.error>;

beforeEach(() => {
  writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  failure = vi.spyOn(toast, "error");
});

afterEach(() => vi.restoreAllMocks());

describe("authenticator setup", () => {
  it("draws the link as a QR code, module for module, inside a four-module quiet zone", () => {
    render(<AuthenticatorSetup uri={URI} secret={SECRET} />);
    const svg = qr();
    const { size, dark, leftover } = drawn(svg);
    const { modules } = QRCode.create(URI, { errorCorrectionLevel: "M" });

    expect(leftover).toBe("");
    expect(size).toBe(modules.size + 8);
    let expected = 0;
    for (let row = 0; row < modules.size; row++) {
      for (let col = 0; col < modules.size; col++) {
        const on = Boolean(modules.get(row, col));
        if (on) expected++;
        expect(dark.has(`${row + 4},${col + 4}`)).toBe(on);
      }
    }
    // Nothing drawn outside the code itself: the quiet zone is blank.
    expect(dark.size).toBe(expected);
    // About 200px, black on white whatever the theme, so every scanner reads it.
    expect(svg).toHaveAttribute("width", "200");
    expect(svg).toHaveAttribute("height", "200");
    expect(svg.querySelector("rect")).toHaveAttribute("fill", "#ffffff");
    expect(svg.querySelector("path")).toHaveAttribute("fill", "#000000");
    expect(svg.parentElement).toHaveClass("bg-white");
  });

  it("draws a different code for a different link", () => {
    const { rerender } = render(<AuthenticatorSetup uri={URI} secret={SECRET} />);
    const first = qr().querySelector("path")!.getAttribute("d");
    rerender(<AuthenticatorSetup uri={URI.replace(SECRET, "KRSXG5CTMVRXEZLU")} secret="KRSXG5CTMVRXEZLU" />);
    expect(qr().querySelector("path")!.getAttribute("d")).not.toBe(first);
  });

  it("fetches nothing and loads no image to draw it", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const xhrSpy = vi.spyOn(XMLHttpRequest.prototype, "open");
    const { container } = render(<AuthenticatorSetup uri={URI} secret={SECRET} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy key" }));
    await screen.findByRole("button", { name: "Copied" });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(xhrSpy).not.toHaveBeenCalled();
    expect(container.querySelector("img, image, iframe, script, object, embed, link")).toBeNull();
    // The only link anywhere is the otpauth one itself.
    const urls = [...container.querySelectorAll("[href], [src]")].map((el) => el.getAttribute("href") ?? el.getAttribute("src"));
    expect(urls).toEqual([URI]);
  });

  it("never writes the link or the key to the console", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((level) => vi.spyOn(console, level));
    render(<AuthenticatorSetup uri={URI} secret={SECRET} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy key" }));
    await screen.findByRole("button", { name: "Copied" });

    const printed = spies.flatMap((spy) => spy.mock.calls.flat().map(String));
    expect(printed.filter((line) => line.includes(SECRET) || line.includes("otpauth"))).toEqual([]);
  });

  it("says what to do with it", () => {
    render(<AuthenticatorSetup uri={URI} secret={SECRET} />);
    expect(
      screen.getByText(
        "Scan this with Google Authenticator, Microsoft Authenticator, 1Password or any authenticator app, then enter the 6-digit code it shows."
      )
    ).toBeInTheDocument();
  });

  it("shows the key in blocks of four for anyone who cannot scan", () => {
    const { rerender } = render(<AuthenticatorSetup uri={URI} secret={SECRET} />);
    const cantScan = screen.getByRole("group", { name: "Can't scan?" });
    expect(within(cantScan).getByText("JBSW Y3DP EHPK 3PXP")).toBeInTheDocument();

    rerender(<AuthenticatorSetup uri={URI} secret="JBSWY3DPEHPK3PXPKRSXG5CTMVRXEZLU" />);
    expect(screen.getByText("JBSW Y3DP EHPK 3PXP KRSX G5CT MVRX EZLU")).toBeInTheDocument();

    // A short last block stays short, and spaces the server sent are not doubled.
    rerender(<AuthenticatorSetup uri={URI} secret="ABCD EFGHIJ" />);
    expect(screen.getByText("ABCD EFGH IJ")).toBeInTheDocument();
  });

  it("copies the key without the spaces, and says so", async () => {
    render(<AuthenticatorSetup uri={URI} secret={SECRET} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy key" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(SECRET));
    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();
    expect(screen.getByText("Key copied")).toBeInTheDocument();
    expect(failure).not.toHaveBeenCalled();
  });

  it("goes back to Copy key a moment later", async () => {
    vi.useFakeTimers();
    try {
      render(<AuthenticatorSetup uri={URI} secret={SECRET} />);
      fireEvent.click(screen.getByRole("button", { name: "Copy key" }));
      await vi.waitFor(() => expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument());
      await act(() => vi.advanceTimersByTimeAsync(2_000));
      expect(screen.getByRole("button", { name: "Copy key" })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("says so when the browser will not copy, and leaves the key to select", async () => {
    writeText.mockRejectedValue(new Error("denied"));
    render(<AuthenticatorSetup uri={URI} secret={SECRET} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy key" }));

    await waitFor(() => expect(failure).toHaveBeenCalledWith("Couldn't copy the key. Select it and copy it instead."));
    expect(screen.getByRole("button", { name: "Copy key" })).toBeInTheDocument();
    expect(screen.getByText("JBSW Y3DP EHPK 3PXP")).toBeInTheDocument();
  });

  it("opens the link in the authenticator app when setting up on the same phone", () => {
    render(<AuthenticatorSetup uri={URI} secret={SECRET} />);
    const cantScan = screen.getByRole("group", { name: "Can't scan?" });
    expect(within(cantScan).getByRole("link", { name: "Open in authenticator app" })).toHaveAttribute("href", URI);
  });
});
