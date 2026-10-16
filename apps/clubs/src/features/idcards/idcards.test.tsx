import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

const calls: Array<{ method: string; path: string; body?: unknown }> = [];

const baseSummary = {
  registered: 120,
  printed: 84,
  by_role: [
    { role: "attendee", registered: 100, printed: 70 },
    { role: "speaker", registered: 12, printed: 10 },
    { role: "staff", registered: 8, printed: 4 },
  ],
  design_version: 3,
  jobs: 6,
  settings: { reprint_policy: "organiser", auto_print_badges: false, preprinted_carries: ["logo"] },
  preprinted_layers: [
    { key: "logo", label: "Club logo", note: "Printed on the stock you bought." },
    { key: "background", label: "Background", note: "The colour field behind everything." },
  ],
  reprint_policies: [
    { key: "anyone", label: "Anyone at the door", note: "Any door can print a second card." },
    { key: "organiser", label: "Organisers only", note: "A door asks an organiser first." },
    { key: "never", label: "Never", note: "One card a guest, full stop." },
  ],
};
let summary = baseSummary;
let jobs: unknown[] = [];
const fullJobs = [
  { id: "j1", source: "batch", door: null, cards: 40, guest: null, design_version: 3, overrode: false, error: null, created_at: "2026-10-11T09:00:00Z" },
  { id: "j2", source: "checkin", door: "Gate A", cards: 1, guest: "Ananya Rao", design_version: 2, overrode: true, error: null, created_at: "2026-10-11T10:00:00Z" },
  { id: "j3", source: "manual", door: "Desk", cards: 1, guest: "Rohan Patil", design_version: 3, overrode: false, error: "Printer offline", created_at: "2026-10-11T11:00:00Z" },
];
const admission = { prefix: "HN", digits: 4, include_code: true, code: "HN04", next_number: "HN-0085-HN04", numbered: 84, unnumbered: 36 };

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        calls.push({ method: "GET", path });
        if (path.endsWith("/idcards/summary")) return summary;
        if (path.endsWith("/idcards/jobs")) return jobs;
        if (path.endsWith("/admission")) return admission;
        throw new Error(`unstubbed GET ${path}`);
      }),
      patch: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "PATCH", path, body });
        if (path.endsWith("/idcards/settings")) return { ...summary.settings, ...(body as object) };
        return { ...admission, ...(body as object) };
      }),
      post: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "POST", path, body });
        return { numbered: 36, first: "HN-0085-HN04", last: "HN-0120-HN04" };
      }),
      put: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { IdCardsPage } = await import("./components/idcards-page");

let open: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  calls.length = 0;
  summary = baseSummary;
  jobs = fullJobs;
  open = vi.spyOn(window, "open").mockImplementation(() => null);
});
afterEach(() => open.mockRestore());

describe("ID cards", () => {
  it("leads with how many are out, how many are left, the design and the runs", async () => {
    render(<IdCardsPage eventId={37} />);
    expect(await screen.findByText("84 of 120 printed · design v3 · 6 print runs")).toBeInTheDocument();
    expect(screen.getByText("of 120 with a ticket · 70%")).toBeInTheDocument();
    expect(screen.getByText("36")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^Design: v3\. Open the designer/ })).toHaveAttribute("href", "/events/37/design?kind=badge");
    // Each role says how far along it is.
    expect(screen.getByRole("progressbar", { name: "Attendees: 70 of 100 printed" })).toHaveAttribute("aria-valuenow", "70");
    expect(screen.getByText("4 of 8 printed")).toBeInTheDocument();
  });

  it("prints the rest as the one primary action, and previews without recording when asked", async () => {
    render(<IdCardsPage eventId={37} />);
    fireEvent.click(await screen.findByRole("button", { name: /Print 36 not yet printed/ }));
    expect(open).toHaveBeenLastCalledWith("/api/gateway/api/v1/events/37/idcards/batch.pdf?scope=not_printed&record=true", "_blank", "noopener");

    fireEvent.click(screen.getByRole("radio", { name: "Preview only" }));
    expect(screen.getByRole("button", { name: /Preview 36 not yet printed/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Preview 12: speakers" }));
    expect(open).toHaveBeenLastCalledWith("/api/gateway/api/v1/events/37/idcards/batch.pdf?scope=all&role=speaker", "_blank", "noopener");
  });

  it("changes the reprint rule, the gate's printing and what the stock carries", async () => {
    render(<IdCardsPage eventId={37} />);
    fireEvent.click(await screen.findByRole("radio", { name: /^Never/ }));
    await waitFor(() => expect(calls.find((c) => c.method === "PATCH")).toMatchObject({ path: "/api/v1/events/37/idcards/settings", body: { reprint_policy: "never" } }));

    calls.length = 0;
    fireEvent.click(screen.getByRole("switch", { name: "Print the card when a guest is checked in" }));
    await waitFor(() => expect(calls.find((c) => c.method === "PATCH")).toMatchObject({ body: { auto_print_badges: true } }));

    calls.length = 0;
    expect(screen.getByRole("checkbox", { name: /Club logo/ })).toBeChecked();
    fireEvent.click(screen.getByRole("checkbox", { name: /Background/ }));
    await waitFor(() => expect(calls.find((c) => c.method === "PATCH")).toMatchObject({ body: { preprinted_carries: ["logo", "background"] } }));
  });

  it("logs every card put out, filters it by how, and says what went wrong", async () => {
    render(<IdCardsPage eventId={37} />);
    expect(await screen.findByText("40 cards")).toBeInTheDocument();
    expect(screen.getByText("Ananya Rao")).toBeInTheDocument();
    expect(screen.getByText("Rule overridden")).toBeInTheDocument();
    expect(screen.getByText("Did not print: Printer offline")).toBeInTheDocument();
    // Printed on an older design than the current one.
    expect(screen.getByTitle("Printed on an older design")).toHaveTextContent("v2");

    fireEvent.click(screen.getByRole("button", { name: "At check-in 1" }));
    expect(screen.getByText("Ananya Rao")).toBeInTheDocument();
    expect(screen.queryByText("40 cards")).not.toBeInTheDocument();
  });

  it("keeps the admission numbers beside the cards", async () => {
    render(<IdCardsPage eventId={37} />);
    expect(await screen.findByText("HN-0085-HN04")).toBeInTheDocument();
    expect(screen.getByLabelText("Prefix")).toHaveValue("HN");
    fireEvent.click(screen.getByRole("button", { name: "Number everyone registered so far (36)" }));
    await waitFor(() => expect(calls.find((c) => c.method === "POST")).toMatchObject({ path: "/api/v1/events/37/admission/number-all" }));
  });

  it("says what to do when nothing has printed and the design is the starter", async () => {
    summary = { ...baseSummary, printed: 0, design_version: 0, jobs: 0 };
    jobs = [];
    render(<IdCardsPage eventId={37} />);
    const notice = await screen.findByRole("alert");
    expect(notice).toHaveTextContent(/starter design until you make your own/);
    expect(within(notice).getByRole("link", { name: "Open the designer" })).toHaveAttribute("href", "/events/37/design?kind=badge");
    expect(await screen.findByText("No card printed yet")).toBeInTheDocument();
  });
});
