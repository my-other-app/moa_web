import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";

import summaryFixture from "../__fixtures__/links-summary.json";

const calls: Array<{ method: string; path: string; body?: unknown }> = [];

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        calls.push({ method: "GET", path });
        if (path.endsWith("/events/37/links")) return summaryFixture;
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "POST", path, body });
        return { ...summaryFixture.links[0], id: "aaaaaaaa-0000-0000-0000-000000000009", name: "Instagram story", code: "n3wl1nk2", url: "https://api.myotherapp.in/l/n3wl1nk2", clicks: 0, uniques: 0, conversions: 0, rate: 0, second: 0 };
      }),
      patch: vi.fn(),
      put: vi.fn(),
      del: vi.fn(async (path: string) => {
        calls.push({ method: "DELETE", path });
      }),
    },
  };
});

const { render } = await import("@/test/render");
const { LinksPage } = await import("./components/links-page");
const { linksSummarySchema } = await import("./schemas");

beforeEach(() => {
  calls.length = 0;
  Object.assign(navigator, { clipboard: { writeText: vi.fn(async () => undefined) } });
});

describe("tracking links", () => {
  it("parses the summary", () => {
    const s = linksSummarySchema.parse(summaryFixture);
    expect(s.links).toHaveLength(3);
    expect(s.totals.best_source).toBe("poster_qr");
  });

  it("reads the period's four figures, the channels and every link", async () => {
    render(<LinksPage scope={{ kind: "event", eventId: 37 }} />);
    expect(await screen.findByText("Tracked clicks")).toBeInTheDocument();
    expect(screen.getByText("4,420")).toBeInTheDocument();
    expect(screen.getByText(/\+11%/)).toBeInTheDocument();
    expect(screen.getByText("Registrations from links")).toBeInTheDocument();
    expect(screen.getByText("48% of all registrations")).toBeInTheDocument();
    expect(screen.getByText("12.7%")).toBeInTheDocument();
    expect(screen.getByText(/−4 pts/)).toBeInTheDocument();
    expect(screen.getByText("Best channel")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Poster QR registrations" })).toHaveAttribute("aria-valuenow", "241");
    expect(screen.getByText(/608 of your 1,169 registrations in this period came without a link/)).toBeInTheDocument();
    expect(screen.getByText("Freshers fair QR")).toBeInTheDocument();
    expect(screen.getByText("api.myotherapp.in/l/x7k2m9pq")).toBeInTheDocument();
    expect(screen.getByText("25.1%")).toBeInTheDocument();
    expect(screen.getByText("checked in")).toBeInTheDocument();
    expect(calls[0]).toMatchObject({ method: "GET", path: "/api/v1/events/37/links" });
  });

  it("builds a link from a name and a source, the medium following the source", async () => {
    render(<LinksPage scope={{ kind: "event", eventId: 37 }} />);
    await screen.findByText("Tracked clicks");
    fireEvent.change(screen.getByLabelText("Name it (only you see this)"), { target: { value: "Instagram story" } });
    fireEvent.change(screen.getByLabelText("Source · utm_source"), { target: { value: "poster_qr" } });
    expect((screen.getByLabelText("Medium · utm_medium") as HTMLSelectElement).value).toBe("print");
    fireEvent.click(screen.getByRole("button", { name: /Save link/ }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
    expect(calls.find((c) => c.method === "POST")).toMatchObject({
      path: "/api/v1/events/37/links",
      body: { name: "Instagram story", utm_source: "poster_qr", utm_medium: "print", utm_campaign: "event-37", utm_content: null },
    });
    expect(await screen.findByText("https://api.myotherapp.in/l/n3wl1nk2")).toBeInTheDocument();
  });

  it("refuses a link with no name", async () => {
    render(<LinksPage scope={{ kind: "event", eventId: 37 }} />);
    await screen.findByText("Tracked clicks");
    fireEvent.click(screen.getByRole("button", { name: /Save link/ }));
    expect(await screen.findByText("Name the link so you know where it went")).toBeInTheDocument();
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });
});
