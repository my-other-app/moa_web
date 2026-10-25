import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { ApiError } from "@moa/api";

import analyticsFixture from "../__fixtures__/event-analytics.json";
import eventFixture from "../__fixtures__/event-detail.json";
import registrationsFixture from "../__fixtures__/registrations.json";
import summaryFixture from "../__fixtures__/event-summary.json";

/**
 * Bringing a guest list in from a file: the upload itself, the page saying
 * while the server reads it, and the permanent record of what happened to
 * every row.
 */
const job = (patch: Record<string, unknown>) => ({
  id: "job-7",
  task_name: "Import guests.csv into SF Sea Hackathon",
  status: "STARTED",
  created_at: "2099-06-01T09:00:00Z",
  imported: 0,
  failed: 0,
  issues: [],
  ...patch,
});
const state: { imports: unknown[][]; refuse: Error | null } = { imports: [[]], refuse: null };
const uploads: Array<{ path: string; body: unknown }> = [];

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/events/37/attendees",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        if (path.includes("/events/info/")) return { ...eventFixture, additional_details: [{ key: "github", label: "GitHub profile" }] };
        if (/\/events\/\d+\/summary$/.test(path)) return summaryFixture;
        if (path.includes("/analytics")) return analyticsFixture;
        if (path.includes("/list")) return registrationsFixture;
        // Each read takes the next answer in line, then keeps repeating the last.
        if (path.endsWith("/imports")) return state.imports.length > 1 ? state.imports.shift() : state.imports[0];
        if (path.endsWith("/deliveries/summary"))
          return { kind: "ticket", registrations: 2, revoked: 0, channels: [{ channel: "email", sent: 0, failed: 0, skipped: 0, pending: 0, unsent: 2 }] };
        throw new Error(`unstubbed GET ${path}`);
      }),
      post: vi.fn(async (path: string, body: unknown) => {
        uploads.push({ path, body });
        if (state.refuse) throw state.refuse;
        return job({});
      }),
      put: vi.fn(),
      patch: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { toast } = await import("@moa/ui");
const { render } = await import("@/test/render");
const { RegistrationsPanel } = await import("./components/registrations-panel");

beforeEach(() => {
  state.imports = [[]];
  state.refuse = null;
  uploads.length = 0;
  vi.restoreAllMocks();
});

const openImport = async () => {
  render(<RegistrationsPanel eventId={37} />);
  fireEvent.click(await screen.findByRole("button", { name: "Import" }));
  return screen.findByRole("dialog", { name: "Import a guest list" });
};
const pick = (dialog: HTMLElement, file: File) => {
  // The drop zone opens a hidden file input; picking a file there is what a person does.
  const input = dialog.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
};
const csv = (name = "guests.csv") => new File(["full_name,email\nAnanya Iyer,ananya@example.com\n"], name, { type: "text/csv" });

describe("importing a guest list", () => {
  it("names the columns it reads, the event's own questions among them", async () => {
    const dialog = await openImport();
    expect(within(dialog).getByText(/full_name · email · phone · role · GitHub profile/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Nobody is emailed by an import/)).toBeInTheDocument();
  });

  it("uploads the picked file as multipart form data for this event, then closes", async () => {
    const said = vi.spyOn(toast, "success");
    const dialog = await openImport();
    // Once the file is accepted the server answers with the running import.
    state.imports = [[job({})]];
    pick(dialog, csv());

    await waitFor(() => expect(said).toHaveBeenCalledWith("Import started", expect.anything()));
    expect(uploads).toHaveLength(1);
    expect(uploads[0]!.path).toBe("/api/v1/events/registration/37/import");
    const body = uploads[0]!.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect((body.get("file") as File).name).toBe("guests.csv");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("says while the file is read, then shows what happened to every row", async () => {
    const dialog = await openImport();
    state.imports = [
      [job({})],
      [job({ status: "SUCCESS", imported: 12, failed: 2, issues: ["Row 4: no email or phone", "Row 9: already on the list"] })],
    ];
    pick(dialog, csv());

    expect(await screen.findByText(/guests\.csv is being read row by row/)).toBeInTheDocument();
    const record = (await screen.findByText("Imports")).closest("[data-slot='figure-panel']") as HTMLElement;
    expect(within(record).getByText("Processing…")).toBeInTheDocument();
    // The one just started is opened, and does not claim a result it does not have yet.
    expect(within(record).getByRole("button", { name: /Import guests\.csv/ })).toHaveAttribute("aria-expanded", "true");
    expect(within(record).queryByText("Every row is on the list")).toBeNull();
    expect(within(record).getByText("Still reading the file")).toBeInTheDocument();

    // The page polls a running import; the record fills in when it finishes.
    expect(await within(record).findByText("12 imported, 2 rows not used", undefined, { timeout: 6000 })).toBeInTheDocument();
    expect(within(record).getByText("Rows not imported")).toBeInTheDocument();
    expect(within(record).getByText("Row 4: no email or phone")).toBeInTheDocument();
    expect(within(record).getByText("Row 9: already on the list")).toBeInTheDocument();
    expect(screen.queryByText(/is being read row by row/)).toBeNull();
  });

  it("refuses a file that is not CSV or Excel without sending it", async () => {
    const dialog = await openImport();
    pick(dialog, new File(["%PDF"], "guests.pdf", { type: "application/pdf" }));
    expect(await within(dialog).findByText("“guests.pdf” is not a CSV or Excel file. Save it as one and try again.")).toBeInTheDocument();
    expect(uploads).toEqual([]);
  });

  it("takes an Excel workbook too", async () => {
    const dialog = await openImport();
    pick(dialog, new File(["xlsx"], "Guests.XLSX"));
    await waitFor(() => expect(uploads).toHaveLength(1));
  });

  it("keeps the dialog open with the server's refusal", async () => {
    state.refuse = new ApiError({ status: 422, message: "The file has no full_name column" });
    const said = vi.spyOn(toast, "error");
    const dialog = await openImport();
    pick(dialog, csv());
    await waitFor(() => expect(said).toHaveBeenCalledWith("The file has no full_name column"));
    expect(screen.getByRole("dialog", { name: "Import a guest list" })).toBeInTheDocument();
  });
});

describe("the record of past imports", () => {
  it("lists every import with its outcome, and opens one to its rows", async () => {
    state.imports = [
      [
        job({ id: "a", task_name: "Import alumni.xlsx into SF Sea Hackathon", status: "SUCCESS", imported: 40, failed: 0 }),
        job({ id: "b", task_name: "Import late.csv into SF Sea Hackathon", status: "FAILED", issues: ["The file is empty"] }),
        job({ id: "c", task_name: "Import broken.csv into SF Sea Hackathon", status: "FAILED" }),
      ],
    ];
    render(<RegistrationsPanel eventId={37} />);
    const record = (await screen.findByText("Imports")).closest("[data-slot='figure-panel']") as HTMLElement;
    expect(within(record).getByText("40 imported, 0 rows not used")).toBeInTheDocument();
    expect(within(record).getByText("Failed — The file is empty")).toBeInTheDocument();
    expect(within(record).getByText("Failed — the file could not be read")).toBeInTheDocument();

    fireEvent.click(within(record).getByRole("button", { name: /alumni\.xlsx/ }));
    expect(within(record).getByText("Every row is on the list")).toBeInTheDocument();

    // A failed import imported nothing, whether or not it said why.
    fireEvent.click(within(record).getByRole("button", { name: /broken\.csv/ }));
    expect(within(record).queryByText("Every row is on the list")).toBeNull();
    expect(within(record).getByText("Nothing was imported")).toBeInTheDocument();
  });
});
