import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";

/**
 * The Payments list's Export and Views. The export walks every page of the
 * filtered result set -- not just the page on screen -- with the filters the
 * admin is looking at, because a file that quietly ignored them would be
 * worse than no file.
 */
let search = "";
const push = vi.fn();
const downloads: Array<{ filename: string; csv: string }> = [];
const exports: Array<Record<string, unknown>> = [];
let exportFails: string | null = null;
let total = 3;

function payment(n: number, over: Record<string, unknown> = {}) {
  return {
    id: `p${n}`,
    razorpay_payment_id: `pay_${n}`,
    status: "captured",
    amount: 250,
    payment_method: "upi",
    created_at: "2026-10-16T10:00:00+05:30",
    order_id: `o${n}`,
    razorpay_order_id: `order_${n}`,
    receipt: `rcpt_${n}`,
    order_status: "paid",
    user: { id: n, full_name: `Payer ${n}`, email: `payer${n}@example.com` },
    is_refundable: true,
    gateway: "club",
    ...over,
  };
}

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/payments",
  useSearchParams: () => new URLSearchParams(search),
}));

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    useSession: () => ({ data: { id: 1, username: "admin", email: "a@b.c", full_name: "Admin", user_type: "admin", admin_role: "owner" } }),
    downloadCsv: vi.fn((filename: string, csv: string) => downloads.push({ filename, csv })),
    api: {
      get: vi.fn(async (path: string, init?: { query?: Record<string, unknown> }) => {
        const query = init?.query ?? {};
        if (path === "/api/v1/payments/admin/totals") {
          return { captured_total: 750, refunded_total: 0, net_total: 750, failed_count: 0 };
        }
        if (path === "/api/v1/payments/admin/list") {
          const offset = Number(query.offset);
          const limit = Number(query.limit);
          // The exporter asks in pages of 100; the list asks for 20.
          if (limit === 100) {
            exports.push(query);
            if (exportFails) throw new Error(exportFails);
          }
          const count = Math.max(0, Math.min(limit, total - offset));
          const items = Array.from({ length: count }, (_, i) => payment(offset + i + 1));
          return { items, total, limit, offset, next: null };
        }
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(),
      put: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { PaymentsTable } = await import("./index");
const { toast } = await import("@moa/ui");

beforeEach(() => {
  search = "";
  push.mockClear();
  downloads.length = 0;
  exports.length = 0;
  exportFails = null;
  total = 3;
});

const ready = () => screen.findByRole("link", { name: "Payer 1" });

describe("exporting the payments", () => {
  it("asks for the filtered set and writes the columns support reads", async () => {
    search = "status=captured&gateway=club&q=pay_";
    render(<PaymentsTable />);
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    await waitFor(() => expect(downloads).toHaveLength(1));

    expect(exports).toEqual([{ status: "captured", gateway: "club", search: "pay_", user_id: undefined, offset: 0, limit: 100 }]);
    expect(downloads[0]!.filename).toMatch(/^payments-\d{4}-\d{2}-\d{2}\.csv$/);
    const lines = downloads[0]!.csv.split("\r\n");
    expect(lines[0]).toBe("Payment ID,Receipt,Payer,Email,Amount,Status,Goes to,Method,When");
    expect(lines[1]).toBe("pay_1,rcpt_1,Payer 1,payer1@example.com,250,captured,Club,upi,2026-10-16T10:00:00+05:30");
    expect(lines).toHaveLength(4);
  });

  it("walks every page, not just the one on screen", async () => {
    total = 130;
    const said = vi.spyOn(toast, "success");
    render(<PaymentsTable />);
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    await waitFor(() => expect(downloads).toHaveLength(1));

    expect(exports.map((q) => q.offset)).toEqual([0, 100]);
    expect(downloads[0]!.csv.split("\r\n")).toHaveLength(131);
    expect(said).toHaveBeenCalledWith("Exported 130 rows");
  });

  it("says why when the export fails, and hands over no file", async () => {
    exportFails = "Gateway Timeout";
    const said = vi.spyOn(toast, "error");
    render(<PaymentsTable />);
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Export" }));

    await waitFor(() => expect(said).toHaveBeenCalledWith("Gateway Timeout"));
    expect(downloads).toHaveLength(0);
    expect(await screen.findByRole("button", { name: "Export" })).toBeEnabled();
  });
});

describe("the payments' views", () => {
  it("offers Failed and Refunded, each opening the list filtered to it", async () => {
    render(<PaymentsTable />);
    await ready();
    fireEvent.keyDown(screen.getByRole("button", { name: "Views" }), { key: "Enter" });
    expect(await screen.findByRole("menuitem", { name: "Refunded" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: "Failed" }));
    expect(push).toHaveBeenCalledWith("/payments?status=failed", { scroll: false });
  });
});
