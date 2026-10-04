import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";

import analyticsFixture from "../__fixtures__/org-analytics.json";
import clubsFixture from "../__fixtures__/org-clubs.json";
import eventsFixture from "../__fixtures__/org-events.json";
import detailFixture from "../__fixtures__/org-detail.json";

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

        if (path.includes("/analytics")) return analyticsFixture;
        if (path.includes("/clubs/admin/list")) return clubsFixture;
        if (path.includes("/events/admin/list")) return eventsFixture;
        if (/\/orgs\/\d+$/.test(path)) return detailFixture;
        throw new Error(`unstubbed GET ${path}`);
      }),
      put: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "PUT", path, body });
      }),
      post: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "POST", path, body });
      }),
      del: vi.fn(async (path: string) => {
        calls.push({ method: "DELETE", path });
      }),
    },
  };
});

const { render } = await import("@/test/render");
const { OrgDetail } = await import("./components/org-detail");
const { orgFormSchema } = await import("./schemas");
const { createOrg, setOrgBlocked, updateOrg } = await import("./api");

beforeEach(() => {
  calls.length = 0;
});

describe("org form schema", () => {
  it("accepts a minimal organisation", () => {
    const parsed = orgFormSchema.parse({ name: "Some College", type: "college" });
    expect(parsed.type).toBe("college");
  });

  it("rejects a type the backend enum does not have", () => {
    expect(
      orgFormSchema.safeParse({ name: "Some College", type: "nonsense" }).success
    ).toBe(false);
  });

  it("rejects a name shorter than the backend's minimum", () => {
    expect(orgFormSchema.safeParse({ name: "AB", type: "other" }).success).toBe(false);
  });
});

describe("org detail page", () => {
  it("renders without throwing", () => {
    expect(() => render(<OrgDetail orgId={1} />)).not.toThrow();
  });

  it("shows the organisation and its reach", async () => {
    render(<OrgDetail orgId={1} />);
    expect(
      await screen.findByRole("heading", { name: "College of Engineering Trivandrum" })
    ).toBeInTheDocument();
    // The analytics endpoint existed from the start and nothing called it.
    expect(await screen.findByText("Events")).toBeInTheDocument();
    expect(await screen.findByText("27")).toBeInTheDocument();
    expect(await screen.findByText("512")).toBeInTheDocument();
  });

  it("lists the organisation's clubs, including unverified ones", async () => {
    render(<OrgDetail orgId={1} />);
    expect(await screen.findByText("IEDC CET")).toBeInTheDocument();
    // The public listing hides these; an admin needs to see them.
    expect(await screen.findByText("Robotics Club")).toBeInTheDocument();
    expect(await screen.findByText("Pending")).toBeInTheDocument();
  });

  it("scopes the club list to this organisation", async () => {
    render(<OrgDetail orgId={1} />);
    await screen.findByText("IEDC CET");
    const clubCall = calls.find((c) => c.path.includes("/clubs/admin/list"));
    expect(clubCall?.path).toContain("org_id=1");
  });

  it("lists the organisation's events, not just a count of them", async () => {
    // The page reported total_events and gave no way to see any of them.
    render(<OrgDetail orgId={1} />);
    expect(await screen.findByRole("tab", { name: /Events/ })).toBeInTheDocument();
  });

  it("scopes the event list to this organisation", async () => {
    render(<OrgDetail orgId={1} />);
    await screen.findByText("IEDC CET");
    const call = calls.find((c) => c.path.includes("/events/admin/list"));
    expect(call?.path).toContain("org_id=1");
  });

  it("shows the club total from the API, not the page length", async () => {
    // get_all_clubs returned no count, so every club list was stuck on page
    // one -- an org with thirty clubs showed ten and no pager.
    render(<OrgDetail orgId={1} />);
    expect(await screen.findByRole("tab", { name: /Clubs \(2\)/ })).toBeInTheDocument();
  });

  it("offers edit, block and delete", async () => {
    render(<OrgDetail orgId={1} />);
    expect(await screen.findByRole("button", { name: /Edit/ })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /Block/ })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /Delete/ })).toBeInTheDocument();
  });
});

describe("org mutations", () => {
  it("sends an explicit is_blocked rather than relying on a toggle", async () => {
    // The endpoint used to toggle and ignore the body, so acting on a stale
    // row inverted the result -- and this list is cached for ten minutes.
    await setOrgBlocked(1, true);
    expect(calls[0]!.body).toEqual({ is_blocked: true });
  });

  function entries(body: unknown): Record<string, string> {
    expect(body).toBeInstanceOf(FormData);
    const out: Record<string, string> = {};
    for (const [k, v] of (body as FormData).entries()) out[k] = String(v);
    return out;
  }

  it("creates with the required fields", async () => {
    await createOrg({ name: "New College", type: "college" });
    const sent = entries(calls[0]!.body);
    expect(sent.name).toBe("New College");
    expect(sent.type).toBe("college");
  });

  it("omits blank optional fields so an update cannot blank a real value", async () => {
    // PUT /orgs/update applies only what it receives, so sending "" would
    // overwrite the stored address rather than leave it alone.
    await updateOrg(1, { name: "Kept", type: "college", address: "", email: "" });
    const sent = entries(calls[0]!.body);
    expect(sent).not.toHaveProperty("address");
    expect(sent).not.toHaveProperty("email");
    expect(sent.name).toBe("Kept");
  });

  it("sends optional fields that do have a value", async () => {
    await updateOrg(1, {
      name: "Kept",
      type: "college",
      address: "Trivandrum",
      email: "a@example.com",
    });
    const sent = entries(calls[0]!.body);
    expect(sent.address).toBe("Trivandrum");
    expect(sent.email).toBe("a@example.com");
  });
});
