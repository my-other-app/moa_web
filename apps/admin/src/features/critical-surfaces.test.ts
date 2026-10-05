import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Payloads for the critical-list surfaces: payments, suspension, restore and
 * interest management. These are the calls where getting a field wrong is
 * expensive -- a refund, a lockout, or reference data detached from every
 * profile that used it.
 */
const calls: Array<{ method: string; path: string; body?: unknown }> = [];

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string, init?: { query?: Record<string, unknown> }) => {
        const q = new URLSearchParams(
          Object.entries(init?.query ?? {})
            .filter(([, v]) => v !== undefined)
            .map(([k, v]) => [k, String(v)])
        ).toString();
        calls.push({ method: "GET", path: q ? `${path}?${q}` : path });
        if (path.includes("/payments/admin/totals")) {
          return {
            captured_total: 1000,
            refunded_total: 300,
            net_total: 700,
            failed_count: 2,
          };
        }
        return { items: [], total: 0, limit: 10, offset: 0, next: null };
      }),
      post: vi.fn(async (path: string, body?: unknown) => {
        calls.push({ method: "POST", path, body });
        // Enabling 2FA parses its response, so the stub has to return the
        // shape rather than undefined.
        if (path.includes("/2fa/enable")) {
          return { enabled: true, recovery_codes: ["aaaa-bbbb"] };
        }
        return undefined;
      }),
      put: vi.fn(async (path: string, body?: unknown) => {
        calls.push({ method: "PUT", path, body });
      }),
      del: vi.fn(async (path: string) => {
        calls.push({ method: "DELETE", path });
        return { detached_from: 3 };
      }),
    },
  };
});

const { fetchPayments, refundPayment } = await import("./payments/api");
const { paymentTotalsSchema } = await import("./payments/schemas");
const { setUserActive } = await import("./users/api");
const { restoreClub, fetchDeletedClubs } = await import("./clubs/api");
const { createInterest, updateInterest, deleteInterest } = await import(
  "./interests/api"
);

beforeEach(() => {
  calls.length = 0;
});

describe("payments", () => {
  it("omits the status filter when nothing is selected", async () => {
    await fetchPayments({ offset: 0, limit: 10 });
    expect(calls[0]!.path).not.toContain("status");
  });

  it("sends the status filter and the search term", async () => {
    await fetchPayments({ offset: 0, limit: 10, status: "failed", search: "pay_abc" });
    expect(calls[0]!.path).toContain("status=failed");
    expect(calls[0]!.path).toContain("search=pay_abc");
  });

  it("scopes to one payer", async () => {
    await fetchPayments({ offset: 0, limit: 10, userId: 42 });
    expect(calls[0]!.path).toContain("user_id=42");
  });

  it("refunds by payment id, with no amount", async () => {
    // Partial refunds are not supported; sending an amount would imply they are.
    await refundPayment("pay-1");
    expect(calls[0]!.method).toBe("POST");
    expect(calls[0]!.path).toContain("/payments/logs/pay-1/refund");
    expect(calls[0]!.body).toBeUndefined();
  });

  it("reports net separately from gross", () => {
    const totals = paymentTotalsSchema.parse({
      captured_total: 1000,
      refunded_total: 300,
      net_total: 700,
      failed_count: 2,
    });
    expect(totals.net_total).toBe(totals.captured_total - totals.refunded_total);
  });
});

describe("suspension", () => {
  it("sends is_active=false with the reason", async () => {
    await setUserActive(7, false, "repeated reports");
    expect(calls[0]!.body).toEqual({
      is_active: false,
      reason: "repeated reports",
    });
  });

  it("sends null rather than an empty reason", async () => {
    // An empty string would be stored and shown back as the reason.
    await setUserActive(7, false, "   ");
    expect(calls[0]!.body).toEqual({ is_active: false, reason: null });
  });

  it("reinstates with is_active=true", async () => {
    await setUserActive(7, true);
    expect(calls[0]!.body).toEqual({ is_active: true, reason: null });
  });
});

describe("restore", () => {
  it("reads the deleted list from its own endpoint", async () => {
    await fetchDeletedClubs({ offset: 0, limit: 10 });
    expect(calls[0]!.path).toContain("/clubs/admin/deleted/list");
  });

  it("restores by id", async () => {
    await restoreClub(5);
    expect(calls[0]!.method).toBe("POST");
    expect(calls[0]!.path).toContain("/clubs/admin/5/restore");
  });
});

describe("interests", () => {
  it("marks an icon as an emoji when one is given", async () => {
    await createInterest({ name: "Coding", category_id: 1, icon: "⌨️" });
    expect(calls[0]!.body).toMatchObject({ icon: "⌨️", icon_type: "emoji" });
  });

  it("sends null for both when no icon is given", async () => {
    // Seeded rows store the literal word "string"; an empty one must not
    // become a new instance of that problem.
    await createInterest({ name: "Coding", category_id: 1, icon: "" });
    expect(calls[0]!.body).toMatchObject({ icon: null, icon_type: null });
  });

  it("sends the category on an edit, so an interest can be moved", async () => {
    await updateInterest(9, { name: "Coding", category_id: 4 });
    expect(calls[0]!.method).toBe("PUT");
    expect(calls[0]!.body).toMatchObject({ name: "Coding", category_id: 4 });
  });

  it("reports how many records a delete detached it from", async () => {
    const result = await deleteInterest(9);
    expect(result.detached_from).toBe(3);
  });
});

const { updateUser, setAdminRole } = await import("./users/api");
const { updateEvent, restoreEvent } = await import("./events/api");
const { restoreOrg } = await import("./orgs/api");
const { enableTotp, disableTotp, revokeSession } = await import("./security/api");

describe("user edit and roles", () => {
  it("sends the phone explicitly so it can be cleared", async () => {
    // The handler skips None but applies an empty value, so omitting it would
    // make a phone impossible to remove.
    await updateUser(7, { full_name: "A Name", email: "a@example.com" });
    expect(calls[0]!.body).toMatchObject({ phone: "" });
  });

  it("does not send the username", async () => {
    // It appears in links and exports that already exist.
    await updateUser(7, { full_name: "A Name", email: "a@example.com" });
    expect(calls[0]!.body).not.toHaveProperty("username");
  });

  it("sets a role by name", async () => {
    await setAdminRole(7, "support");
    expect(calls[0]!.path).toContain("/user/admin/7/role");
    expect(calls[0]!.body).toEqual({ role: "support" });
  });
});

describe("event edit and restore", () => {
  it("sends the event as multipart, as the handler expects", async () => {
    await updateEvent(3, { name: "Renamed", about: "x" });
    expect(calls[0]!.method).toBe("PUT");
    expect(calls[0]!.body).toBeInstanceOf(FormData);
  });

  it("drops undefined values rather than sending the string 'undefined'", async () => {
    await updateEvent(3, { name: "Renamed", about: undefined });
    const sent = calls[0]!.body as FormData;
    expect(sent.get("name")).toBe("Renamed");
    expect(sent.has("about")).toBe(false);
  });

  it("restores an event and an organisation by id", async () => {
    await restoreEvent(3);
    expect(calls[0]!.path).toContain("/events/admin/3/restore");
    calls.length = 0;
    await restoreOrg(4);
    expect(calls[0]!.path).toContain("/orgs/4/restore");
  });
});

describe("security", () => {
  it("enables and disables 2FA with a code", async () => {
    await enableTotp("123456");
    expect(calls[0]!.body).toEqual({ code: "123456" });
    calls.length = 0;
    // Disabling needs a code too, not just a session.
    await disableTotp("654321");
    expect(calls[0]!.body).toEqual({ code: "654321" });
  });

  it("revokes one session by id", async () => {
    await revokeSession("abc-123");
    expect(calls[0]!.method).toBe("DELETE");
    expect(calls[0]!.path).toContain("/auth/sessions/abc-123");
  });
});
