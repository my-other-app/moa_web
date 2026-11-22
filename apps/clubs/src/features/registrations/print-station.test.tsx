import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";

import analyticsFixture from "../__fixtures__/event-analytics.json";
import eventFixture from "../__fixtures__/event-detail.json";
import registrationsFixture from "../__fixtures__/registrations.json";
import summaryFixture from "../__fixtures__/event-summary.json";

/** The help desk's "Print ID card": a choice when a print station is online, the old new-tab PDF when not. */
const state = { online: true };
const posts: Array<{ path: string; body: unknown }> = [];
const station = { id: "p1", name: "Help desk laptop", door_label: "", online: true, last_seen_at: null, expires_at: null };

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/events/37/attendees",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        if (path.includes("/events/info/")) return eventFixture;
        if (/\/events\/\d+\/summary$/.test(path)) return summaryFixture;
        if (path.includes("/analytics")) return analyticsFixture;
        if (path.includes("/list")) return registrationsFixture;
        if (path.endsWith("/idcards/printers")) return state.online ? [station] : [];
        if (path.endsWith("/imports")) return [];
        if (path.endsWith("/deliveries/summary")) return { kind: "ticket", registrations: 2, revoked: 0, channels: [] };
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(async (path: string, body: unknown) => {
        posts.push({ path, body });
        return { id: "pr1", status: "queued", source: "dashboard", attempts: 0, name: "Test Participant One" };
      }),
      put: vi.fn(),
      patch: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { RegistrationsPanel } = await import("./components/registrations-panel");

beforeEach(() => {
  state.online = true;
  posts.length = 0;
  vi.restoreAllMocks();
});

const openMenuItem = async (name: string, item: RegExp) => {
  fireEvent.keyDown(await screen.findByRole("button", { name: `Actions for ${name}` }), { key: "Enter" });
  fireEvent.click(await screen.findByRole("menuitem", { name: item }));
};

describe("Print ID card on the guest list", () => {
  it("sends the card to the print station when one is online", async () => {
    render(<RegistrationsPanel eventId={37} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Actions for Test Participant One" })).toBeInTheDocument());
    // The row has read that a station is online by the time the menu is used.
    await new Promise((r) => setTimeout(r, 50));
    await openMenuItem("Test Participant One", /Print ID card/);
    fireEvent.click(await screen.findByRole("button", { name: "Send to the print station" }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toEqual({ path: "/api/v1/events/37/idcards/print-requests", body: { printer_id: null, override: false, registration_id: "6f1b2c70-0000-4000-8000-000000000001" } });
  });

  it("opens the PDF in a tab as before when no station is online", async () => {
    state.online = false;
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    render(<RegistrationsPanel eventId={37} />);
    await screen.findByRole("button", { name: "Actions for Test Participant One" });
    await new Promise((r) => setTimeout(r, 50));
    await openMenuItem("Test Participant One", /Print ID card/);
    expect(open).toHaveBeenCalledWith("/api/gateway/api/v1/events/37/idcards/6f1b2c70-0000-4000-8000-000000000001.pdf?source=manual&record=true", "_blank", "noopener");
    expect(posts).toHaveLength(0);
  });
});
