import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";

import summaryFixture from "../__fixtures__/finance-summary.json";

/**
 * "Export statement" is a plain download link through the gateway, so the
 * file a club gets is whatever that address asks for. What matters is that
 * it asks for the same period as the figures on screen, and for the right
 * ledger: the club's, or one event's.
 */
const gets: Array<{ path: string; query?: Record<string, string> }> = [];

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string, opts?: { query?: Record<string, string> }) => {
        gets.push({ path, query: opts?.query });
        if (path.endsWith("/clubs/finance")) return summaryFixture;
        if (/\/events\/37\/finance$/.test(path)) return { ...summaryFixture, scope: "event", figures: { ...summaryFixture.figures, events: null }, by_type: [], by_event: [] };
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(),
      patch: vi.fn(),
      put: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { FinancePage } = await import("./components/finance-page");

beforeEach(() => {
  gets.length = 0;
});

const statement = () => screen.getByRole("link", { name: /Export statement/ });
const lastQuery = () => new URLSearchParams(gets.filter((g) => g.path.endsWith("/clubs/finance")).at(-1)?.query ?? {});

describe("the finance statement", () => {
  it("downloads the club's statement through the gateway, as a file, for the default window", async () => {
    render(<FinancePage scope={{ kind: "club" }} />);
    await waitFor(() => expect(gets.length).toBeGreaterThan(0));
    const link = statement();
    expect(link).toHaveAttribute("download");
    // The last six months is the API's own default, so neither asks for dates.
    expect(link).toHaveAttribute("href", "/api/gateway/api/v1/clubs/finance/statement.csv");
    expect(lastQuery().toString()).toBe("");
  });

  it("follows the period picked, asking for exactly the dates the figures were fetched for", async () => {
    render(<FinancePage scope={{ kind: "club" }} />);
    await waitFor(() => expect(gets.length).toBeGreaterThan(0));

    for (const period of ["month", "year", "all", "3m"]) {
      fireEvent.change(screen.getByRole("combobox", { name: "Period" }), { target: { value: period } });
      await waitFor(() => expect(lastQuery().get("from")).toBeTruthy());
      const href = statement().getAttribute("href")!;
      const [path, search] = href.split("?");
      expect(path).toBe("/api/gateway/api/v1/clubs/finance/statement.csv");
      const asked = new URLSearchParams(search);
      expect(asked.get("from")).toBe(lastQuery().get("from"));
      expect(asked.get("to")).toBe(lastQuery().get("to"));
    }
  });

  it("downloads one event's statement on its own tab, without a period", async () => {
    render(<FinancePage scope={{ kind: "event", eventId: 37 }} />);
    await waitFor(() => expect(gets.some((g) => g.path.endsWith("/events/37/finance"))).toBe(true));
    expect(screen.queryByRole("combobox", { name: "Period" })).not.toBeInTheDocument();
    expect(statement()).toHaveAttribute("href", "/api/gateway/api/v1/events/37/finance/statement.csv");
    expect(statement()).toHaveAttribute("download");
  });
});
