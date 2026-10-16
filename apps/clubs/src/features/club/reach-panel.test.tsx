import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { ReachPanel } from "./components/reach-panel";

describe("the reach panel", () => {
  it("shows the view-to-sign-up dial and the four figures beside it", () => {
    render(<ReachPanel reach={{ views: 1240, registrations: 310, attended: 214, conversionPercent: 25, attendancePercent: 71.4 }} />);
    expect(screen.getByRole("img", { name: "Share of people who viewed an event and then registered: 25%" })).toBeInTheDocument();
    expect(screen.getByText("1,240")).toBeInTheDocument();
    expect(screen.getByText("310")).toBeInTheDocument();
    expect(screen.getByText("214")).toBeInTheDocument();
    expect(screen.getByText("71%")).toBeInTheDocument();
  });

  it("says nothing rather than zero before anything has been seen or held", () => {
    render(<ReachPanel reach={{ views: 0, registrations: 0, attended: 0, conversionPercent: 0, attendancePercent: 0 }} />);
    expect(screen.getAllByText("—")).toHaveLength(2);
  });
});
