import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";

const api = vi.hoisted(() => ({ claim: vi.fn(), done: vi.fn() }));
vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api")>();
  return { ...actual, claimNext: api.claim, reportDone: api.done };
});
const frame = vi.hoisted(() => ({ fail: null as null | Error, props: [] as Array<{ url: string; method?: string; headers?: Record<string, string> }> }));
// The real frame prints through the browser; here it only says how the print went.
vi.mock("@/features/idcards", async () => {
  const React = await import("react");
  return {
    PrintFrame: ({ url, method, headers, onDone, onError }: { url: string; method?: string; headers?: Record<string, string>; onDone?: () => void; onError?: (e: unknown) => void }) => {
      React.useEffect(() => {
        frame.props.push({ url, method, headers });
        if (frame.fail) onError?.(frame.fail);
        onDone?.();
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
      return null;
    },
  };
});
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams("") }));
const sound = vi.hoisted(() => vi.fn());
vi.mock("./alert-sound", () => ({ playAlertSound: sound }));

const store = new Map<string, string>();
vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, String(v)), removeItem: (k: string) => void store.delete(k), clear: () => store.clear() });

const { render } = await import("@/test/render");
const { PrintStationApp } = await import("./components/print-station-app");
const { STATION_TOKEN_STORAGE } = await import("./api");

const job = { request: { id: "q1", registration_id: "r1", name: "Asha K", ticket_code: "MOA-1", source: "kiosk", attempt: 1, card_url: "/kiosk/printer/requests/q1/card.pdf" }, queued: 1 };

beforeEach(() => {
  vi.clearAllMocks();
  store.clear();
  frame.fail = null;
  frame.props.length = 0;
  api.claim.mockReset();
  api.claim.mockResolvedValue({ request: null, queued: 0 });
  api.done.mockResolvedValue(undefined);
});

describe("the print station page", () => {
  it("says it is not paired when it has no token", () => {
    render(<PrintStationApp />);
    expect(screen.getByRole("heading", { name: "This print station is not paired" })).toBeInTheDocument();
  });

  it("is ready and waiting, lists the setup and offers a test card", async () => {
    store.set(STATION_TOKEN_STORAGE, "stn_tok");
    render(<PrintStationApp />);
    expect(await screen.findByText("Ready")).toBeInTheDocument();
    expect(api.claim).toHaveBeenCalledWith("stn_tok");
    expect(screen.getByRole("button", { name: /Print a test card/ })).toBeEnabled();
    expect(screen.getByText("--kiosk --kiosk-printing --autoplay-policy=no-user-gesture-required")).toBeInTheDocument();
    expect(screen.getByText(/Margins: none. Scale: 100%/)).toBeInTheDocument();
  });

  it("prints a claimed card with the token in a header, confirms it, and lists it", async () => {
    store.set(STATION_TOKEN_STORAGE, "stn_tok");
    api.claim.mockResolvedValueOnce(job).mockResolvedValue({ request: null, queued: 0 });
    render(<PrintStationApp />);
    await waitFor(() => expect(api.done).toHaveBeenCalledWith("stn_tok", "q1", true, null));
    expect(frame.props[0]?.url).toBe("/api/gateway/api/v1/kiosk/printer/requests/q1/card.pdf");
    expect(frame.props[0]?.method).toBe("GET");
    expect(frame.props[0]?.headers).toEqual({ "X-Kiosk-Token": "stn_tok" });
    expect(await screen.findByText("Asha K")).toBeInTheDocument();
    expect(screen.getByText("Printed")).toBeInTheDocument();
    expect(sound).not.toHaveBeenCalled();
  });

  it("raises the alert and the sound for a card that did not print, and says why to the server", async () => {
    store.set(STATION_TOKEN_STORAGE, "stn_tok");
    frame.fail = new Error("Your card was already printed.");
    api.claim.mockResolvedValueOnce(job).mockResolvedValue({ request: null, queued: 0 });
    render(<PrintStationApp />);
    await waitFor(() => expect(api.done).toHaveBeenCalledWith("stn_tok", "q1", false, "Your card was already printed."));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Asha K's card did not print");
    expect(alert).toHaveTextContent("Your card was already printed.");
    expect(sound).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: /Dismiss/ }));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("prints a test card as a POST and tells the server nothing", async () => {
    store.set(STATION_TOKEN_STORAGE, "stn_tok");
    render(<PrintStationApp />);
    await screen.findByText("Ready");
    fireEvent.click(screen.getByRole("button", { name: /Print a test card/ }));
    await waitFor(() => expect(frame.props.length).toBe(1));
    expect(frame.props[0]).toMatchObject({ method: "POST" });
    expect(frame.props[0]?.url).toContain("/api/v1/kiosk/printer/test");
    expect((await screen.findAllByText("Test card")).length).toBeGreaterThan(0);
    expect(api.done).not.toHaveBeenCalled();
  });
});
