import { describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";

import dashboardFixture from "../__fixtures__/club-dashboard.json";

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        if (path.endsWith("/clubs/dashboard")) return dashboardFixture;
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(),
      put: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { ClubPulse } = await import("./components/club-pulse");
const { attentionPath } = await import("@moa/app-kit");

describe("the dashboard's pulse", () => {
  it("reads the four tiles, what needs a decision and the doors open now from one response", async () => {
    render(<ClubPulse />);
    const events = await screen.findByRole("link", { name: /^Events: 4\./ });
    expect(events).toHaveAttribute("href", "/events");
    expect(events).toHaveTextContent("1 live · 1 published · 1 draft · 1 closed");
    expect(screen.getByRole("link", { name: /^On file: 61\./ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^Retention due: 1\./ })).toHaveTextContent("next run in");
    expect(screen.getByText("Doors open")).toBeInTheDocument();

    // Red before amber, each leading to where the decision is made.
    const failed = screen.getByRole("link", { name: /Retention failed for Demo Day/ });
    const missing = screen.getByRole("link", { name: /SF Sea Hackathon has guests without a ticket/ });
    expect(failed).toHaveAttribute("href", "/events/12/closeout");
    expect(missing).toHaveAttribute("href", "/events/37/attendees");
    expect(failed.compareDocumentPosition(missing) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(failed).getByText(/Nothing was deleted/)).toBeInTheDocument();

    expect(screen.getByRole("progressbar", { name: "SF Sea Hackathon checked in" })).toHaveAttribute("aria-valuenow", "3");
    // Upper-cased by style, so the text itself stays readable to a screen reader.
    expect(screen.getByText(/Gate A · 2 volunteers/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open gate console →" })).toHaveAttribute("href", "/gate/37");
  });

  it("routes each kind of attention to its page", () => {
    expect(attentionPath({ kind: "NO_PROVIDER", tone: "amber", title: "", body: "", event_id: null })).toBeNull();
    expect(attentionPath({ kind: "BOUNCED", tone: "amber", title: "", body: "", event_id: 4 })).toBe("/events/4/attendees");
    expect(attentionPath({ kind: "DRAFT_STARTED", tone: "amber", title: "", body: "", event_id: 4 })).toBe("/events/4/closeout");
    expect(attentionPath({ kind: "SOMETHING_NEW", tone: "amber", title: "", body: "", event_id: 4 })).toBe("/events/4");
  });
});
