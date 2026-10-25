import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { ApiError } from "@moa/api";
import { toast } from "@moa/ui";

/**
 * An event's admission numbers: the format (a prefix, a padded sequence,
 * the event code), saved field by field, and numbering everyone who
 * registered before numbers were switched on.
 */
const calls: Array<{ method: string; path: string; body?: unknown }> = [];
const BASE = { prefix: "HN", digits: 4, include_code: true, code: "HN04", next_number: "HN-0042-HN04", numbered: 41, unnumbered: 9 };
let settings = { ...BASE };
let numbered: unknown = { numbered: 9, first: "HN-0042-HN04", last: "HN-0050-HN04" };
let refuse: Error | null = null;

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        calls.push({ method: "GET", path });
        if (path === "/api/v1/events/37/admission") return settings;
        throw new Error(`unstubbed GET ${path}`);
      }),
      patch: vi.fn(async (path: string, body: Record<string, unknown>) => {
        calls.push({ method: "PATCH", path, body });
        if (refuse) throw refuse;
        settings = { ...settings, ...body } as typeof settings;
        return settings;
      }),
      post: vi.fn(async (path: string, body: unknown) => {
        calls.push({ method: "POST", path, body });
        if (refuse) throw refuse;
        settings = { ...settings, numbered: settings.numbered + settings.unnumbered, unnumbered: 0 };
        return numbered;
      }),
      put: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { AdmissionPanel } = await import("./components/admission-panel");

beforeEach(() => {
  calls.length = 0;
  settings = { ...BASE };
  numbered = { numbered: 9, first: "HN-0042-HN04", last: "HN-0050-HN04" };
  refuse = null;
  vi.restoreAllMocks();
});

const writes = (method: string) => calls.filter((c) => c.method === method);
const preview = () => screen.getByText(/^Reads as/).querySelector("span")!.textContent;

describe("admission number settings", () => {
  it("reads the format, the next number and how many are numbered", async () => {
    render(<AdmissionPanel eventId={37} />);
    expect(await screen.findByLabelText("Prefix")).toHaveValue("HN");
    expect(screen.getByLabelText("Digits")).toHaveValue("4");
    expect(screen.getByRole("checkbox", { name: /End with the event code/ })).toBeChecked();
    expect(screen.getByText(/End with the event code/)).toHaveTextContent("End with the event code (HN04)");
    expect(preview()).toBe("HN-0001-HN04");
    expect(screen.getByText("HN-0042-HN04")).toBeInTheDocument();
    expect(screen.getByText("41 numbered · 9 without a number")).toBeInTheDocument();
  });

  it("takes the prefix in capitals, previews it as typed, and saves it when the field is left", async () => {
    render(<AdmissionPanel eventId={37} />);
    const prefix = await screen.findByLabelText("Prefix");
    fireEvent.change(prefix, { target: { value: "tech" } });
    expect(prefix).toHaveValue("TECH");
    expect(preview()).toBe("TECH-0001-HN04");
    expect(writes("PATCH")).toEqual([]);

    fireEvent.blur(prefix);
    await waitFor(() => expect(writes("PATCH")).toEqual([{ method: "PATCH", path: "/api/v1/events/37/admission", body: { prefix: "TECH" } }]));
  });

  it("saves nothing when the prefix is left unchanged", async () => {
    render(<AdmissionPanel eventId={37} />);
    fireEvent.blur(await screen.findByLabelText("Prefix"));
    fireEvent.blur(screen.getByLabelText("Digits"));
    expect(writes("PATCH")).toEqual([]);
  });

  it("clears the prefix as no prefix at all, and previews the default", async () => {
    render(<AdmissionPanel eventId={37} />);
    const prefix = await screen.findByLabelText("Prefix");
    fireEvent.change(prefix, { target: { value: "" } });
    expect(preview()).toBe("MOA-0001-HN04");
    fireEvent.blur(prefix);
    await waitFor(() => expect(writes("PATCH")[0]?.body).toEqual({ prefix: null }));
  });

  it("pads the sequence to the digits asked, between one and eight, and saves them", async () => {
    render(<AdmissionPanel eventId={37} />);
    const digits = await screen.findByLabelText("Digits");
    fireEvent.change(digits, { target: { value: "6" } });
    expect(preview()).toBe("HN-000001-HN04");
    fireEvent.change(digits, { target: { value: "12" } });
    expect(digits).toHaveValue("8");
    fireEvent.change(digits, { target: { value: "x" } });
    expect(digits).toHaveValue("1");
    expect(preview()).toBe("HN-1-HN04");
    fireEvent.change(digits, { target: { value: "5" } });
    fireEvent.blur(digits);
    await waitFor(() => expect(writes("PATCH")).toEqual([{ method: "PATCH", path: "/api/v1/events/37/admission", body: { digits: 5 } }]));
  });

  it("drops the event code from the end when unticked", async () => {
    render(<AdmissionPanel eventId={37} />);
    fireEvent.click(await screen.findByRole("checkbox", { name: /End with the event code/ }));
    await waitFor(() => expect(writes("PATCH")).toEqual([{ method: "PATCH", path: "/api/v1/events/37/admission", body: { include_code: false } }]));
    await waitFor(() => expect(preview()).toBe("HN-0001"));
  });

  it("says why when a format is refused", async () => {
    const error = vi.spyOn(toast, "error");
    refuse = new ApiError({ status: 422, message: "Use letters and digits only" });
    render(<AdmissionPanel eventId={37} />);
    const prefix = await screen.findByLabelText("Prefix");
    fireEvent.change(prefix, { target: { value: "H N" } });
    fireEvent.blur(prefix);
    await waitFor(() => expect(error).toHaveBeenCalledWith("Use letters and digits only"));
  });
});

describe("numbering everyone registered so far", () => {
  it("numbers those without a number, says which range they got, and reads the counts again", async () => {
    const success = vi.spyOn(toast, "success");
    render(<AdmissionPanel eventId={37} />);
    fireEvent.click(await screen.findByRole("button", { name: "Number everyone registered so far (9)" }));
    await waitFor(() => expect(writes("POST")).toEqual([{ method: "POST", path: "/api/v1/events/37/admission/number-all", body: {} }]));
    await waitFor(() => expect(success).toHaveBeenCalledWith("9 numbered", { description: "HN-0042-HN04 to HN-0050-HN04" }));
    expect(await screen.findByText("50 numbered")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Number everyone/ })).not.toBeInTheDocument();
  });

  it("says so when everyone already had a number", async () => {
    const success = vi.spyOn(toast, "success");
    numbered = { numbered: 0, first: null, last: null };
    render(<AdmissionPanel eventId={37} />);
    fireEvent.click(await screen.findByRole("button", { name: /Number everyone/ }));
    await waitFor(() => expect(success).toHaveBeenCalledWith("Everyone already has a number", { description: undefined }));
  });

  it("offers nothing to number when everyone has one", async () => {
    settings = { ...BASE, numbered: 50, unnumbered: 0 };
    render(<AdmissionPanel eventId={37} />);
    expect(await screen.findByText("50 numbered")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Number everyone/ })).not.toBeInTheDocument();
  });

  it("says why when numbering is refused", async () => {
    const error = vi.spyOn(toast, "error");
    refuse = new ApiError({ status: 409, message: "Numbering is already running" });
    render(<AdmissionPanel eventId={37} />);
    fireEvent.click(await screen.findByRole("button", { name: /Number everyone/ }));
    await waitFor(() => expect(error).toHaveBeenCalledWith("Numbering is already running"));
  });
});
