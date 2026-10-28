import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { ApiError } from "@moa/api";
import { toast } from "@moa/ui";

import clubInfoFixture from "../__fixtures__/club-info.json";

/**
 * An event's own sponsors and partners, in the event editor. Each row saves
 * on its own (added, corrected on blur, moved, removed), as the club profile's
 * partners do, and some can be copied from the club's partners. These pin the
 * requests each action makes and what the organiser is told.
 */
type Call = { method: string; path: string; body?: unknown };
const calls: Call[] = [];

const LOGO = { thumbnail: "https://media.test/events/partners/v-a.thumbnail.png", medium: "https://media.test/events/partners/v-a.medium.png", original: "https://media.test/events/partners/v-a.png" };
const TITLE = { id: 11, kind: "sponsor", name: "Kinetic Labs", label: "Title sponsor", link: "https://kinetic.example", position: 0, logo: LOGO, club_partner_id: 1 };
const GOLD = { id: 12, kind: "sponsor", name: "Arc Foundry", label: null, link: null, position: 1, logo: null, club_partner_id: null };
const MEDIA = { id: 21, kind: "partner", name: "Radio City", label: "Media partner", link: null, position: 0, logo: null, club_partner_id: null };

const KINETIC = { id: 1, name: "Kinetic Labs", role: "Industry partner", since: 2025, sort_order: 0 };
const GDG = { id: 2, name: "GDG Pune", role: null, since: null, sort_order: 1 };

let rows: Array<Record<string, unknown>> = [];
let failNext: { method: string; error: Error } | null = null;

const record = (method: string, path: string, body?: unknown) => {
  calls.push({ method, path, body });
  if (failNext && failNext.method === method) {
    const { error } = failNext;
    failNext = null;
    throw error;
  }
};

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        if (path.includes("/clubs/info")) return { ...clubInfoFixture, partners: [KINETIC, GDG] };
        if (path === "/api/v1/events/37/partners") return rows;
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(async (path: string, body: Record<string, unknown>) => {
        record("POST", path, body);
        if (path.endsWith("/from-club")) {
          const added = (body.club_partner_ids as number[]).map((id, i) => ({ id: 40 + i, kind: body.kind, name: id === 2 ? "GDG Pune" : "?", label: null, link: null, position: 9, logo: null, club_partner_id: id }));
          rows = [...rows, ...added];
          return { added, skipped: [] };
        }
        const made = { id: 99, position: 5, logo: null, club_partner_id: null, ...body };
        rows = [...rows, made];
        return made;
      }),
      patch: vi.fn(async (path: string, body: Record<string, unknown>) => {
        record("PATCH", path, body);
        const id = Number(path.split("/").pop());
        const row = { ...rows.find((r) => r.id === id)!, ...body };
        rows = rows.map((r) => (r.id === id ? row : r));
        return row;
      }),
      put: vi.fn(async (path: string, body: unknown) => {
        record("PUT", path, body);
        if (path.endsWith("/order")) {
          const { ids } = body as { ids: number[] };
          rows = rows.map((r) => (ids.includes(r.id as number) ? { ...r, position: ids.indexOf(r.id as number) } : r));
          return rows;
        }
        const id = Number(path.split("/").at(-2));
        return { ...rows.find((r) => r.id === id), logo: LOGO };
      }),
      del: vi.fn(async (path: string) => {
        record("DELETE", path);
        rows = rows.filter((r) => r.id !== Number(path.split("/").pop()));
      }),
    },
  };
});

const { render } = await import("@/test/render");
const { EventPartnersSection } = await import("./components/event-partners-section");
const schemas = await import("./schemas");

const png = (name = "logo.png", bytes = 1024) => new File([new Uint8Array(bytes)], name, { type: "image/png" });
let opened: HTMLInputElement | null = null;
const pick = async (button: HTMLElement, file: File) => {
  opened = null;
  fireEvent.click(button);
  expect(opened, "the button should open a file picker").not.toBeNull();
  fireEvent.change(opened!, { target: { files: [file] } });
  await act(async () => {});
};
const of = (method: string) => calls.filter((c) => c.method === method);

beforeEach(() => {
  calls.length = 0;
  failNext = null;
  rows = [GOLD, MEDIA, TITLE];
  vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(function (this: HTMLInputElement) {
    if (this.type === "file") opened = this;
  });
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("the sponsors and partners section", () => {
  it("lists sponsors then partners, each in its order, with the logo whole in a square tile", async () => {
    render(<EventPartnersSection eventId={37} />);
    const sponsors = await screen.findByRole("list", { name: "Sponsors" });
    expect(within(sponsors).getAllByRole("listitem").map((li) => li.getAttribute("data-testid"))).toEqual(["event-partner-11", "event-partner-12"]);
    const partners = screen.getByRole("list", { name: "Partners" });
    expect(within(partners).getAllByRole("listitem")).toHaveLength(1);
    const img = within(sponsors).getByRole("button", { name: "Replace Kinetic Labs logo" }).querySelector("img")!;
    expect(img.className).toContain("object-contain");
    expect(img.getAttribute("src")).toBe(LOGO.medium);
  });

  it("on a new event, says to save it first and asks the server nothing", async () => {
    render(<EventPartnersSection />);
    expect(screen.getByText(/Save the event first/)).toBeInTheDocument();
    await act(async () => {});
    expect(calls).toHaveLength(0);
  });

  it("adds one from scratch, then its logo, and says so", async () => {
    const success = vi.spyOn(toast, "success");
    render(<EventPartnersSection eventId={37} />);
    fireEvent.click(await screen.findByRole("button", { name: /Add sponsor/ }));
    fireEvent.change(screen.getByLabelText("New sponsor name"), { target: { value: "  Northwind " } });
    fireEvent.change(screen.getByLabelText("New sponsor label"), { target: { value: "Gold sponsor" } });
    fireEvent.change(screen.getByLabelText("New sponsor link"), { target: { value: "northwind.example/fest" } });
    const file = png("northwind.png");
    await pick(screen.getByRole("button", { name: "Add the new sponsor's logo" }), file);
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => expect(of("PUT")).toHaveLength(1));
    expect(of("POST")[0]).toEqual({ method: "POST", path: "/api/v1/events/37/partners", body: { kind: "sponsor", name: "Northwind", label: "Gold sponsor", link: "https://northwind.example/fest" } });
    expect(of("PUT")[0]!.path).toBe("/api/v1/events/37/partners/99/logo");
    expect((of("PUT")[0]!.body as FormData).get("logo")).toBe(file);
    await waitFor(() => expect(success).toHaveBeenCalledWith("Sponsor added"));
    expect(success).toHaveBeenCalledWith("Logo updated");
  });

  it("refuses an http:// link before sending anything", async () => {
    render(<EventPartnersSection eventId={37} />);
    fireEvent.click(await screen.findByRole("button", { name: /Add partner/ }));
    fireEvent.change(screen.getByLabelText("New partner name"), { target: { value: "Radio Mirchi" } });
    fireEvent.change(screen.getByLabelText("New partner link"), { target: { value: "http://mirchi.example" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByText("Use a link that starts with https://")).toBeInTheDocument();
    expect(of("POST")).toHaveLength(0);
  });

  it("saves a corrected row on blur, and only what the organiser typed", async () => {
    const success = vi.spyOn(toast, "success");
    render(<EventPartnersSection eventId={37} />);
    const label = await screen.findByLabelText("Arc Foundry label");
    fireEvent.change(label, { target: { value: "Gold sponsor" } });
    fireEvent.blur(label);
    await waitFor(() => expect(of("PATCH")).toHaveLength(1));
    expect(of("PATCH")[0]).toEqual({ method: "PATCH", path: "/api/v1/events/37/partners/12", body: { name: "Arc Foundry", label: "Gold sponsor", link: null } });
    await waitFor(() => expect(success).toHaveBeenCalledWith("Sponsor saved"));
    // Blurring again with nothing changed sends nothing.
    fireEvent.blur(await screen.findByLabelText("Arc Foundry label"));
    expect(of("PATCH")).toHaveLength(1);
  });

  it("moves a row within its kind, sending that kind's whole new order", async () => {
    render(<EventPartnersSection eventId={37} />);
    expect(await screen.findByRole("button", { name: "Move Kinetic Labs up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Arc Foundry down" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Move Arc Foundry up" }));
    await waitFor(() => expect(of("PUT")).toHaveLength(1));
    expect(of("PUT")[0]).toEqual({ method: "PUT", path: "/api/v1/events/37/partners/order", body: { kind: "sponsor", ids: [12, 11] } });
    const sponsors = screen.getByRole("list", { name: "Sponsors" });
    await waitFor(() => expect(within(sponsors).getAllByRole("listitem")[0]).toHaveAttribute("data-testid", "event-partner-12"));
  });

  it("moves a row to the other kind from its select", async () => {
    const success = vi.spyOn(toast, "success");
    render(<EventPartnersSection eventId={37} />);
    fireEvent.change(await screen.findByLabelText("Radio City is a"), { target: { value: "sponsor" } });
    await waitFor(() => expect(of("PATCH")[0]).toEqual({ method: "PATCH", path: "/api/v1/events/37/partners/21", body: { kind: "sponsor" } }));
    await waitFor(() => expect(success).toHaveBeenCalledWith("Moved to sponsors"));
  });

  it("removes a row on the second click only", async () => {
    render(<EventPartnersSection eventId={37} />);
    fireEvent.click(await screen.findByRole("button", { name: "Remove Radio City" }));
    expect(of("DELETE")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Confirm removing Radio City" }));
    await waitFor(() => expect(of("DELETE")[0]!.path).toBe("/api/v1/events/37/partners/21"));
    await waitFor(() => expect(screen.getByText("No partners yet.")).toBeInTheDocument());
  });

  it("adds some of the club's partners, the ones already on the event shown as such", async () => {
    const success = vi.spyOn(toast, "success");
    render(<EventPartnersSection eventId={37} />);
    fireEvent.click(await screen.findByRole("button", { name: /Add from your club's partners/ }));
    const dialog = await screen.findByRole("dialog");
    // Kinetic Labs was copied already (club_partner_id 1).
    expect(within(dialog).getByRole("checkbox", { name: "Kinetic Labs" })).toBeDisabled();
    expect(within(dialog).getByText("On this event")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("radio", { name: "Sponsors" }));
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "GDG Pune" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Add 1 as sponsor" }));
    await waitFor(() => expect(of("POST")[0]).toEqual({ method: "POST", path: "/api/v1/events/37/partners/from-club", body: { kind: "sponsor", club_partner_ids: [2] } }));
    await waitFor(() => expect(success).toHaveBeenCalledWith("1 sponsor added from your club's partners"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("says what the server said when a row is refused", async () => {
    const error = vi.spyOn(toast, "error");
    failNext = { method: "POST", error: new ApiError({ status: 422, message: "An event can list up to 50 sponsors and partners. Remove one to add another.", errorCode: "EVENT_PARTNERS_LIMIT" }) };
    render(<EventPartnersSection eventId={37} />);
    fireEvent.click(await screen.findByRole("button", { name: /Add partner/ }));
    fireEvent.change(screen.getByLabelText("New partner name"), { target: { value: "One too many" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(error).toHaveBeenCalledWith("An event can list up to 50 sponsors and partners. Remove one to add another."));
    // The row stays open for another try.
    expect(screen.getByLabelText("New partner name")).toHaveValue("One too many");
  });
});

describe("the rules the section follows", () => {
  it("gives a bare address https:// and keeps any other scheme for the check to refuse", () => {
    expect(schemas.normaliseLink(" kinetic.example/x ")).toBe("https://kinetic.example/x");
    expect(schemas.normaliseLink("https://kinetic.example")).toBe("https://kinetic.example");
    expect(schemas.normaliseLink("http://kinetic.example")).toBe("http://kinetic.example");
    expect(schemas.normaliseLink("")).toBe("");
    expect(schemas.isHttpsLink("https://kinetic.example")).toBe(true);
    for (const bad of ["http://kinetic.example", "https://localhost", "javascript:alert(1)", "https://a b.example"]) expect(schemas.isHttpsLink(bad)).toBe(false);
  });

  it("moves within bounds only", () => {
    expect(schemas.moved([1, 2, 3], 1, -1)).toEqual([2, 1, 3]);
    expect(schemas.moved([1, 2, 3], 2, 1)).toBeNull();
    expect(schemas.moved([1, 2, 3], 0, -1)).toBeNull();
  });

  it("knows a server has them by the sponsors list on the event's detail", () => {
    expect(schemas.partnersSupported({ id: 1, sponsors: [], partners: [] })).toBe(true);
    expect(schemas.partnersSupported({ id: 1 })).toBe(false);
    expect(schemas.partnersSupported(null)).toBe(false);
  });
});
