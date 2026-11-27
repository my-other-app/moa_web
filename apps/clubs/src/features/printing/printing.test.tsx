import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { ApiError } from "@moa/api";

const req = (id: string, status: string, extra: Record<string, unknown> = {}) => ({ id, registration_id: `r-${id}`, name: `Guest ${id}`, ticket_code: "MOA-1", source: "kiosk", status, attempts: 1, printer: null, error: null, created_at: "2026-11-28T10:00:00Z", printed_at: null, position: null, ...extra });
const station = { id: "p1", name: "Help desk laptop", door_label: "Help desk", online: true, last_seen_at: "2026-11-28T10:00:00Z", expires_at: "2026-11-29T00:00:00Z" };

const api = vi.hoisted(() => ({ printers: vi.fn(), queue: vi.fn(), retry: vi.fn(), cancel: vi.fn(), create: vi.fn() }));
vi.mock("./api", () => ({ fetchPrinters: api.printers, fetchPrintRequests: api.queue, retryPrintRequest: api.retry, cancelPrintRequest: api.cancel, createPrintRequest: api.create }));
vi.mock("@/features/registrations/queries", () => ({ useRegistrations: () => ({ data: { items: [{ id: "g1", full_name: "Asha Kumar", name: null }] }, isFetching: false }) }));

const { render } = await import("@/test/render");
const { PrintQueuePanel } = await import("./components/queue-panel");
const { PrintChoice } = await import("./components/print-choice");

beforeEach(() => {
  vi.clearAllMocks();
  api.printers.mockResolvedValue([station]);
  api.queue.mockResolvedValue({ items: [req("a", "queued", { position: 1 }), req("b", "failed", { error: "The printer is out of paper.", attempts: 2 }), req("c", "printed")], printers_online: 1 });
  api.retry.mockResolvedValue(req("b", "queued"));
  api.cancel.mockResolvedValue(req("a", "cancelled"));
});

describe("the print stations and queue panel", () => {
  it("shows the stations online and the queue with its words", async () => {
    render(<PrintQueuePanel eventId={37} />);
    expect(await screen.findByText("Help desk laptop")).toBeInTheDocument();
    expect(screen.getByText("online")).toBeInTheDocument();
    expect(await screen.findByText("Guest a")).toBeInTheDocument();
    expect(screen.getByText("In the queue · no. 1")).toBeInTheDocument();
    expect(screen.getByText("The printer is out of paper.")).toBeInTheDocument();
    expect(screen.getByText(/2 tries/)).toBeInTheDocument();
    expect(api.queue).toHaveBeenCalledWith(37, "all");
  });

  it("retries a failed card and cancels a queued one", async () => {
    render(<PrintQueuePanel eventId={37} />);
    fireEvent.click(await screen.findByRole("button", { name: "Retry Guest b's card" }));
    await waitFor(() => expect(api.retry).toHaveBeenCalledWith(37, "b"));
    fireEvent.click(screen.getByRole("button", { name: "Cancel Guest a's card" }));
    await waitFor(() => expect(api.cancel).toHaveBeenCalledWith(37, "a"));
    // A printed card has neither.
    expect(screen.queryByRole("button", { name: "Retry Guest c's card" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cancel Guest c's card" })).toBeNull();
  });

  it("reads the queue as a bare list or as an object around one", async () => {
    const { printQueueSchema } = await import("./schemas");
    expect(printQueueSchema.parse([req("z", "printing")]).items[0]?.id).toBe("z");
    const wrapped = printQueueSchema.parse({ items: [req("y", "queued", { position: 2 })], printers_online: 2 });
    expect(wrapped.items[0]?.position).toBe(2);
    expect(wrapped.printers_online).toBe(2);
  });

  it("sends one guest's card from the finder, to the station by default", async () => {
    api.create.mockResolvedValue(req("n", "queued"));
    render(<PrintQueuePanel eventId={37} />);
    fireEvent.change(await screen.findByPlaceholderText("Name, email or ticket"), { target: { value: "asha" } });
    fireEvent.click(await screen.findByRole("button", { name: "Print card for Asha Kumar" }));
    fireEvent.click(await screen.findByRole("button", { name: /^Send to the print station$/ }));
    await waitFor(() => expect(api.create).toHaveBeenCalledWith(37, { registration_id: "g1", override: false }));
  });
});

describe("the send-to-printer choice", () => {
  const open = (over: Partial<Parameters<typeof PrintChoice>[0]> = {}) => {
    const send = vi.fn(async () => req("n", "queued") as never);
    const onLocal = vi.fn();
    const onClose = vi.fn();
    render(<PrintChoice name="Asha K" open onClose={onClose} send={send} onLocal={onLocal} {...over} />);
    return { send, onLocal, onClose };
  };

  it("defaults to the print station and sends without an override", async () => {
    const { send, onClose, onLocal } = open();
    const radios = screen.getAllByRole("radio");
    expect(radios[0]).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("button", { name: "Send to the print station" }));
    await waitFor(() => expect(send).toHaveBeenCalledWith(false));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onLocal).not.toHaveBeenCalled();
  });

  it("keeps Print on this computer as the other way, sending nothing", async () => {
    const { send, onLocal, onClose } = open();
    fireEvent.click(screen.getByRole("radio", { name: /Print on this computer/ }));
    fireEvent.click(screen.getByRole("button", { name: "Print" }));
    expect(onLocal).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("asks an organiser to confirm when the reprint is refused, then sends with override", async () => {
    const send = vi.fn(async (override: boolean) => {
      if (!override) throw new ApiError({ message: "A second card needs an organiser.", status: 409, errorCode: "REPRINT_NOT_ALLOWED" });
      return req("n", "queued") as never;
    });
    const { onClose } = open({ send });
    fireEvent.click(screen.getByRole("button", { name: "Send to the print station" }));
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("A second card needs an organiser.")).toBeInTheDocument();
    expect(alert).toHaveTextContent("Print it again anyway?");
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Print it again anyway/ }));
    await waitFor(() => expect(send).toHaveBeenLastCalledWith(true));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("does not offer the override to someone who may not give it", async () => {
    const send = vi.fn(async () => {
      throw new ApiError({ message: "A second card needs an organiser.", status: 409, errorCode: "REPRINT_NOT_ALLOWED" });
    });
    open({ send, canOverride: false });
    fireEvent.click(screen.getByRole("button", { name: "Send to the print station" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("A second card needs an organiser.");
    expect(screen.queryByRole("button", { name: /Print it again anyway/ })).toBeNull();
  });

  it("points to this computer when no station is online", async () => {
    const send = vi.fn(async () => {
      throw new ApiError({ message: "No print station is online.", status: 409, errorCode: "NO_PRINTER" });
    });
    open({ send });
    fireEvent.click(screen.getByRole("button", { name: "Send to the print station" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("You can print on this computer instead.");
  });
});

describe("where a card prints", () => {
  it("words the station from the request", async () => {
    const { stationWords } = await import("./schemas");
    expect(stationWords({ status: "queued", station: { id: "p1", name: "Help desk A" }, printer: null })).toBe("Will print at Help desk A");
    expect(stationWords({ status: "printing", station: { id: "p1", name: "Help desk A" }, printer: null })).toBe("Printing at Help desk A");
    expect(stationWords({ status: "printed", station: null, printer: { id: "p1", name: "Help desk A" } })).toBe("Printed at Help desk A");
    expect(stationWords({ status: "queued", station: null, printer: null })).toBeNull();
  });

  it("shows the door and the station on each queued card", async () => {
    api.printers.mockResolvedValue([{ ...station, door: { id: "da", name: "Help desk A" } }]);
    api.queue.mockResolvedValue({ items: [req("d", "printing", { door: { id: "da", name: "Help desk A" }, station: { id: "p1", name: "Help desk laptop" } })], printers_online: 1 });
    render(<PrintQueuePanel eventId={37} />);
    expect(await screen.findByText(/Asked at Help desk A · Printing at Help desk laptop/)).toBeInTheDocument();
    expect(screen.getByText(/Help desk A · online/)).toBeInTheDocument();
  });

  it("names the station in the message after sending", async () => {
    const ui = await import("@moa/ui");
    const success = vi.spyOn(ui.toast, "success");
    const send = vi.fn(async () => req("n", "queued", { station: { id: "p1", name: "Help desk A" } }) as never);
    render(<PrintChoice name="Asha K" open onClose={() => {}} send={send} onLocal={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Send to the print station" }));
    await waitFor(() => expect(success).toHaveBeenCalledWith("Asha K's card was sent. Will print at Help desk A."));
  });
});
