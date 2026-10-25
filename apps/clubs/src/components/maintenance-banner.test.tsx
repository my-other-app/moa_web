import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { ApiError } from "@moa/api";

/**
 * The line MyOtherApp's owners set for every club (planned maintenance, an
 * outage): shown above every page when there is one, and nothing at all when
 * there is none or the API predates it.
 */
const answer = vi.hoisted(() => ({ current: null as unknown, calls: 0 }));

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        answer.calls += 1;
        if (path !== "/api/v1/platform/banner") throw new Error(`unstubbed GET ${path}`);
        if (answer.current instanceof Error) throw answer.current;
        return answer.current;
      }),
    },
  };
});

const { render } = await import("@/test/render");
const { MaintenanceBanner } = await import("./maintenance-banner");

beforeEach(() => {
  answer.current = null;
  answer.calls = 0;
});

describe("the maintenance banner", () => {
  it("shows the owners' line", async () => {
    answer.current = { message: "Payments pause tonight at 11 pm for ten minutes" };
    render(<MaintenanceBanner />);
    expect(await screen.findByText("Payments pause tonight at 11 pm for ten minutes")).toBeInTheDocument();
  });

  it("draws nothing when there is no line", async () => {
    answer.current = { message: null };
    const { container } = render(<MaintenanceBanner />);
    await waitFor(() => expect(answer.calls).toBe(1));
    expect(container).toBeEmptyDOMElement();
  });

  it("draws nothing on an API without the route", async () => {
    answer.current = new ApiError({ message: "Not Found", status: 404, routeMissing: true });
    const { container } = render(<MaintenanceBanner />);
    await waitFor(() => expect(answer.calls).toBe(1));
    expect(container).toBeEmptyDOMElement();
  });
});
