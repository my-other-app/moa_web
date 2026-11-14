import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@moa/api";

/**
 * The overview's Networking card against the contract (profiles-networking
 * contract, "Admin"): GET /admin/networking/summary → {profiles_completed,
 * profiles_total, codes_active, saves_7d, saves_30d, mutual_rate,
 * reports_open}. The admin portal may ship before the backend, so any
 * failure leaves the card off the overview and the overview as it was.
 */
const SUMMARY = {
  profiles_completed: 340,
  profiles_total: 1200,
  codes_active: 910,
  saves_7d: 420,
  saves_30d: 1730,
  mutual_rate: 37.5,
  reports_open: 3,
};

let answer: () => unknown = () => SUMMARY;
const gets: string[] = [];

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        gets.push(path);
        if (path === "/api/v1/admin/networking/summary") return answer();
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(),
      put: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { networkingSummarySchema } = await import("@moa/api");
const { NetworkingSummaryPanel } = await import("./index");

const valueOf = (panel: HTMLElement, label: string) => within(panel).getByText(label).nextElementSibling;

beforeEach(() => {
  answer = () => SUMMARY;
  gets.length = 0;
});

describe("the shape", () => {
  it("reads the summary", () => {
    expect(networkingSummarySchema.parse(SUMMARY)).toEqual(SUMMARY);
  });

  it("reads an absent or odd count as 0 and an absent or odd rate as none", () => {
    expect(networkingSummarySchema.parse({ profiles_total: "12", saves_7d: null, mutual_rate: "high" })).toEqual({
      profiles_completed: 0,
      profiles_total: 12,
      codes_active: 0,
      saves_7d: 0,
      saves_30d: 0,
      mutual_rate: null,
      reports_open: 0,
    });
    expect(networkingSummarySchema.parse({ mutual_rate: 140 }).mutual_rate).toBe(100);
  });
});

describe("the card", () => {
  it("shows completed profiles, codes in use, the saves, the mutual share and open profile reports", async () => {
    render(<NetworkingSummaryPanel />);
    const panel = await screen.findByRole("region", { name: "Networking" });
    expect(gets).toEqual(["/api/v1/admin/networking/summary"]);
    expect(valueOf(panel, "Profiles completed")).toHaveTextContent("340 of 1,200 · 28%");
    expect(valueOf(panel, "Personal QR codes in use")).toHaveTextContent("910");
    expect(valueOf(panel, "Saves, last 7 days")).toHaveTextContent("420");
    expect(valueOf(panel, "Saves, last 30 days")).toHaveTextContent("1,730");
    expect(valueOf(panel, "Mutual saves")).toHaveTextContent("37.5%");
    expect(within(panel).getByRole("link", { name: "3" })).toHaveAttribute("href", "/reports?type=profile");
  });

  it("says a dash for an unknown mutual share and links nothing when no report is open", async () => {
    answer = () => ({ ...SUMMARY, mutual_rate: null, reports_open: 0, profiles_total: 0, profiles_completed: 0 });
    render(<NetworkingSummaryPanel />);
    const panel = await screen.findByRole("region", { name: "Networking" });
    expect(valueOf(panel, "Mutual saves")).toHaveTextContent("—");
    expect(valueOf(panel, "Profiles completed")).toHaveTextContent(/^0$/);
    expect(within(panel).queryByRole("link")).not.toBeInTheDocument();
  });

  it("keeps the last figures when a refresh fails, and goes only when the API says no", async () => {
    /** Reads the overview's figures again, as a later visit would. */
    function Refresh() {
      const queryClient = useQueryClient();
      return (
        <button type="button" onClick={() => void queryClient.invalidateQueries({ queryKey: ["analytics"] })}>
          refresh
        </button>
      );
    }
    render(
      <>
        <Refresh />
        <NetworkingSummaryPanel />
      </>
    );
    const panel = await screen.findByRole("region", { name: "Networking" });
    expect(valueOf(panel, "Saves, last 7 days")).toHaveTextContent("420");
    answer = () => {
      throw new TypeError("Failed to fetch");
    };
    fireEvent.click(screen.getByRole("button", { name: "refresh" }));
    await waitFor(() => expect(gets).toHaveLength(2));
    await act(async () => {});
    expect(valueOf(screen.getByRole("region", { name: "Networking" }), "Saves, last 7 days")).toHaveTextContent("420");
    answer = () => {
      throw new ApiError({ status: 403, message: "Your admin role does not allow this.", errorCode: "INSUFFICIENT_ADMIN_ROLE" });
    };
    fireEvent.click(screen.getByRole("button", { name: "refresh" }));
    await waitFor(() => expect(screen.queryByRole("region", { name: "Networking" })).not.toBeInTheDocument());
  });

  const failures: Array<[string, () => unknown]> = [
    ["an API without the route (404)", () => {
      throw new ApiError({ status: 404, message: "Not Found", routeMissing: true });
    }],
    ["a 403", () => {
      throw new ApiError({ status: 403, message: "Your admin role does not allow this.", errorCode: "INSUFFICIENT_ADMIN_ROLE" });
    }],
    ["the network", () => {
      throw new TypeError("Failed to fetch");
    }],
  ];
  for (const [what, fail] of failures) {
    it(`is left off the overview on ${what}`, async () => {
      answer = fail;
      render(
        <div>
          <p>the rest of the overview</p>
          <NetworkingSummaryPanel />
        </div>
      );
      await waitFor(() => expect(gets).toHaveLength(1));
      await act(async () => {});
      expect(screen.getByText("the rest of the overview")).toBeInTheDocument();
      expect(screen.queryByRole("region", { name: "Networking" })).not.toBeInTheDocument();
    });
  }
});
