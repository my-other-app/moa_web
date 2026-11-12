import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { ApiError } from "@moa/api";

import eventFixture from "../__fixtures__/event-detail.json";
import fixture from "../__fixtures__/integrations.json";

/**
 * "Accept registrations paid outside MyOtherApp" in the event form's Places
 * and money (integrations contract, decision 5; `external_payments_allowed`):
 * read from the event, saved with it, with the warning that the club
 * collects that money itself; only on a paid event of a club that can use
 * the API, and away on a server without it.
 */

const calls: Array<{ method: string; path: string; body?: unknown }> = [];
const notFound = () => new ApiError({ status: 404, message: "Not Found", routeMissing: true });
/** The event's detail's `external_payments_allowed`; undefined: an older server that doesn't send it. */
let external: boolean | undefined = false;
let paid = true;
/** GET /clubs/integrations: the club's access, or "old" for an API without integrations. */
let status: unknown = fixture.status;

vi.mock("next/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/navigation")>();
  return {
    ...actual,
    usePathname: () => "/events/37/edit",
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
  };
});

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        calls.push({ method: "GET", path });
        if (path === "/api/v1/clubs/access/me") throw notFound();
        if (path === "/api/v1/events/info/37")
          return { ...eventFixture, has_fee: paid, reg_fee: paid ? 199 : null, ...(external === undefined ? {} : { external_payments_allowed: external }) };
        if (path === "/api/v1/clubs/integrations") {
          if (status === "old") throw notFound();
          return status;
        }
        throw notFound();
      }),
      post: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "POST", path, body });
        throw notFound();
      }),
      put: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "PUT", path, body });
        return { id: 37, name: "SF Sea Hackathon" };
      }),
      patch: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { EditEventForm, emptyEventForm, eventFormSchema, toEventFormData } = await import("@/features/event-form");
const { EXTERNAL_PAYMENTS_LABEL } = await import("./index");

const required = { name: "Hack Night", category_id: 1, event_datetime: "2026-11-01T18:00", duration: 3, location_name: "Technopark Phase 1" };
const saved = () => calls.find((c) => c.method === "PUT" && c.path === "/api/v1/events/update/37")!.body as FormData;
const save = async () => {
  fireEvent.click((await screen.findAllByRole("button", { name: /Save changes/ }))[0]!);
  await waitFor(() => expect(calls.some((c) => c.method === "PUT")).toBe(true));
};

beforeEach(() => {
  calls.length = 0;
  external = false;
  paid = true;
  status = fixture.status;
});

describe("Accept registrations paid outside MyOtherApp", () => {
  it("is off on a paid event; on, it warns that the club collects the money itself, and a save sends it", async () => {
    render(<EditEventForm eventId={37} />);
    const toggle = await screen.findByRole("switch", { name: EXTERNAL_PAYMENTS_LABEL });
    expect(toggle).not.toBeChecked();
    expect(screen.queryByText(/Your club collects this money itself/)).toBeNull();
    fireEvent.click(toggle);
    expect(toggle).toBeChecked();
    expect(screen.getByText(/Your club collects this money itself\. MyOtherApp doesn't see it, hold it, refund it or pay it out/)).toBeInTheDocument();
    await save();
    expect(saved().get("external_payments_allowed")).toBe("true");
  });

  it("sends what the event had when the club changed something else", async () => {
    external = true;
    render(<EditEventForm eventId={37} />);
    expect(await screen.findByRole("switch", { name: EXTERNAL_PAYMENTS_LABEL })).toBeChecked();
    expect(screen.getByText(/Your club collects this money itself/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch", { name: "Swag to hand out" }));
    await save();
    expect(saved().get("external_payments_allowed")).toBe("true");
  });

  it("isn't offered on a free event, or to a club that can't use the API, but one left on can be turned off", async () => {
    paid = false;
    const a = render(<EditEventForm eventId={37} />);
    await screen.findByRole("switch", { name: "Swag to hand out" });
    expect(screen.queryByRole("switch", { name: EXTERNAL_PAYMENTS_LABEL })).toBeNull();
    a.unmount();

    paid = true;
    status = { ...fixture.status, allocated: false, apps_connected: 0 };
    const b = render(<EditEventForm eventId={37} />);
    await screen.findByRole("switch", { name: "Swag to hand out" });
    await waitFor(() => expect(calls.some((c) => c.path === "/api/v1/clubs/integrations")).toBe(true));
    expect(screen.queryByRole("switch", { name: EXTERNAL_PAYMENTS_LABEL })).toBeNull();
    b.unmount();

    external = true;
    render(<EditEventForm eventId={37} />);
    fireEvent.click(await screen.findByRole("switch", { name: EXTERNAL_PAYMENTS_LABEL }));
    await save();
    expect(saved().get("external_payments_allowed")).toBe("false");
  });

  it("isn't there for an older server, and a save sends nothing about it", async () => {
    external = undefined;
    status = "old";
    render(<EditEventForm eventId={37} />);
    await screen.findByRole("switch", { name: "Swag to hand out" });
    expect(screen.queryByRole("switch", { name: EXTERNAL_PAYMENTS_LABEL })).toBeNull();
    fireEvent.click(screen.getByRole("switch", { name: "Swag to hand out" }));
    await save();
    expect(saved().has("external_payments_allowed")).toBe(false);
    // Not even asked: the event's detail never carried it.
    expect(calls.some((c) => c.path === "/api/v1/clubs/integrations")).toBe(false);
  });

  it("leaves a new event to the server, which makes it with the switch off", () => {
    const values = eventFormSchema.parse({ ...emptyEventForm, ...required });
    expect(values.external_payments_allowed).toBeUndefined();
    expect(toEventFormData(values, "draft").has("external_payments_allowed")).toBe(false);
  });
});
