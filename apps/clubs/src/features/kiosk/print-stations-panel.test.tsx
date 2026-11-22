import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";

const device = (over: Record<string, unknown>) => ({ id: "d1", event_id: 37, name: "x", door_label: "", token_prefix: "abc", expires_at: "2026-11-29T00:00:00Z", last_seen_at: null, revoked_at: null, online: false, active: true, created_at: null, role: "kiosk", ...over });
const api = vi.hoisted(() => ({ kiosks: vi.fn(), pair: vi.fn(), rotate: vi.fn(), unpair: vi.fn(), settings: vi.fn() }));
vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api")>();
  return { ...actual, fetchKiosks: api.kiosks, pairKiosk: api.pair, rotateKiosk: api.rotate, unpairKiosk: api.unpair, fetchKioskSettings: api.settings };
});

const { render } = await import("@/test/render");
const { PrintStationsPanel } = await import("./components/print-stations-panel");
const { KiosksPanel } = await import("./components/kiosks-panel");
const { pairedKioskSchema } = await import("./schemas");

beforeEach(() => {
  vi.clearAllMocks();
  api.kiosks.mockResolvedValue([device({ id: "k1", name: "Lobby tablet", role: "kiosk", online: true }), device({ id: "p1", name: "Help desk laptop", role: "printer", online: true })]);
  api.settings.mockResolvedValue({ self_check_in_enabled: false, self_check_in_verify: "name", self_check_in_print: false, has_pin: false });
});

describe("print stations under Team & doors", () => {
  it("lists only the print stations, with an online dot and its words", async () => {
    render(<PrintStationsPanel eventId={37} />);
    expect(await screen.findByText("Help desk laptop")).toBeInTheDocument();
    expect(screen.queryByText("Lobby tablet")).toBeNull();
    expect(screen.getByText("Online")).toBeInTheDocument();
    expect(screen.getByText("1 of 1 online")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Unpair Help desk laptop" })).toBeInTheDocument();
  });

  it("leaves print stations out of the kiosks panel", async () => {
    render(<KiosksPanel eventId={37} doors={[]} />);
    expect(await screen.findByText("Lobby tablet")).toBeInTheDocument();
    expect(screen.queryByText("Help desk laptop")).toBeNull();
  });

  it("adds a print station with role printer and shows its link once", async () => {
    api.pair.mockResolvedValue({ device: device({ id: "p2", name: "Door laptop", role: "printer" }), token: "tok", url: "https://club-dashboard.myotherapp.in/print-station?token=tok" });
    render(<PrintStationsPanel eventId={37} />);
    fireEvent.change(await screen.findByLabelText("Print station name"), { target: { value: "Door laptop" } });
    fireEvent.click(screen.getByRole("button", { name: /Add a print station/ }));
    await waitFor(() => expect(api.pair).toHaveBeenCalledWith(37, { name: "Door laptop", shift_hours: 12, role: "printer" }));
    expect(await screen.findByRole("heading", { name: "Open this on the print station" })).toBeInTheDocument();
    expect(screen.getByLabelText("Print station pairing link")).toHaveValue("https://club-dashboard.myotherapp.in/print-station?token=tok");
  });

  it("rotates a link and unpairs", async () => {
    api.rotate.mockResolvedValue({ device: device({ id: "p1", name: "Help desk laptop", role: "printer" }), token: "t2", url: "https://x.test/print-station?token=t2" });
    api.unpair.mockResolvedValue(device({ id: "p1", role: "printer" }));
    render(<PrintStationsPanel eventId={37} />);
    fireEvent.click(await screen.findByRole("button", { name: /New link/ }));
    await waitFor(() => expect(api.rotate).toHaveBeenCalledWith(37, "p1", undefined));
    fireEvent.click(await screen.findByRole("button", { name: "Done" }));
    fireEvent.click(screen.getByRole("button", { name: "Unpair Help desk laptop" }));
    fireEvent.click(await screen.findByRole("button", { name: "Unpair" }));
    await waitFor(() => expect(api.unpair).toHaveBeenCalledWith(37, "p1"));
  });

  it("points a printer's pairing link at /print-station even if the server names /kiosk", () => {
    const p = pairedKioskSchema.parse({ device: device({ role: "printer" }), token: "t", url: "https://club-dashboard.myotherapp.in/kiosk?token=t" });
    expect(p.url).toBe("https://club-dashboard.myotherapp.in/print-station?token=t");
    const k = pairedKioskSchema.parse({ device: device({ role: "kiosk" }), token: "t", url: "https://club-dashboard.myotherapp.in/kiosk?token=t" });
    expect(k.url).toBe("https://club-dashboard.myotherapp.in/kiosk?token=t");
  });
});
