import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";

import clubFixture from "../__fixtures__/club-info.json";
import dashboardFixture from "../__fixtures__/club-dashboard.json";
import overviewFixture from "../__fixtures__/club-overview.json";

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        if (path.endsWith("/clubs/overview")) return overviewFixture;
        if (path.endsWith("/clubs/dashboard")) return dashboardFixture;
        if (path.endsWith("/clubs/info")) return clubFixture;
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(),
      put: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { ClubDashboardV2 } = await import("./components/dashboard-v2");

describe("the club dashboard", () => {
  it("opens with a greeting and one sentence on where things stand", async () => {
    render(<ClubDashboardV2 />);
    const h1 = await screen.findByRole("heading", { level: 1 });
    expect(h1.textContent).toMatch(/^Good (morning|afternoon|evening)/);
    // One live door in the pulse; two decisions from it plus one finished event with no attendance.
    expect(await screen.findByText(/One door is open right now\. 3 things need a decision\./)).toBeInTheDocument();
  });

  it("shows the period's four figures with their direction", async () => {
    render(<ClubDashboardV2 />);
    expect(await screen.findByText("184")).toBeInTheDocument();
    // The direction chip carries its arrow in the same text node: "▲ +23%".
    expect(screen.getByText(/\+23%/)).toBeInTheDocument();
    // The figure is on the tile and again on the revenue panel.
    expect(screen.getAllByText("₹46,500").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("71%")).toBeInTheDocument();
    expect(screen.getByText(/\+7 pts/)).toBeInTheDocument();
    const events = await screen.findByRole("link", { name: /^Events: 4\./ });
    expect(events).toHaveTextContent("1 live · 1 draft · 1 closed · 61 on file");
  });

  it("merges what needs a decision and leads each to its page, red first", async () => {
    render(<ClubDashboardV2 />);
    const failed = await screen.findByRole("link", { name: /Retention failed for Demo Day/ });
    const missing = screen.getByRole("link", { name: /SF Sea Hackathon has guests without a ticket/ });
    const unmarked = screen.getByRole("link", { name: /Demo Day finished with nobody marked present/ });
    expect(failed).toHaveAttribute("href", "/events/12/closeout");
    expect(missing).toHaveAttribute("href", "/events/37/attendees");
    expect(unmarked).toHaveAttribute("href", "/events/12/attendees");
    expect(failed.compareDocumentPosition(unmarked) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows the doors open now while a door is open, the calendar, the audience and the reach", async () => {
    render(<ClubDashboardV2 />);
    expect(await screen.findByRole("progressbar", { name: "SF Sea Hackathon checked in" })).toHaveAttribute("aria-valuenow", "3");
    expect(screen.getByRole("link", { name: "Open gate console →" })).toHaveAttribute("href", "/gate/37");
    expect(screen.getByText("Robotics Jam")).toBeInTheDocument();
    expect(screen.getByText("Ticket revenue")).toBeInTheDocument();
    expect(screen.getByText("1,240")).toBeInTheDocument();
    expect(screen.getByText("38%")).toBeInTheDocument();
    expect(screen.getByText("Thu")).toBeInTheDocument();
    const hack = screen.getByRole("link", { name: /Hack Night/ });
    expect(hack).toHaveTextContent("76%");
    expect(hack).toHaveAttribute("href", "/events/9");
  });
});
