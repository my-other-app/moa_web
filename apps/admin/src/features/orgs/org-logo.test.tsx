import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";

/**
 * An organisation's logo, in whatever format the operator has: an SVG is
 * drawn as a PNG here, a HEIC this browser cannot open goes typed for the API
 * to convert, and a file that is not a picture is refused before anything is
 * sent (@moa/ui/images).
 */
const calls: Array<{ method: string; path: string; body: FormData }> = [];

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async () => []),
      post: vi.fn(async (path: string, body: FormData) => void calls.push({ method: "POST", path, body })),
      put: vi.fn(async (path: string, body: FormData) => void calls.push({ method: "PUT", path, body })),
      del: vi.fn(),
    },
  };
});

const { render } = await import("@/test/render");
const { stubPictureBrowser } = await import("@/test/pictures");
const { IMAGE_ACCEPT } = await import("@moa/ui/images");
const { OrgFormDialog } = await import("./components/org-form");

beforeEach(() => {
  calls.length = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function fillAndPick(file: File) {
  render(<OrgFormDialog open onOpenChange={() => undefined} />);
  fireEvent.change(await screen.findByLabelText("Name"), { target: { value: "Model Engineering College" } });
  const input = screen.getByLabelText("Logo");
  expect(input).toHaveAttribute("accept", IMAGE_ACCEPT);
  fireEvent.change(input, { target: { files: [file] } });
}

const submit = () => fireEvent.click(screen.getByRole("button", { name: "Create organisation" }));

describe("an organisation's logo", () => {
  it("sends an SVG logo as a PNG drawn in the browser", async () => {
    stubPictureBrowser({ opens: ["image/png", "image/jpeg"] });
    await fillAndPick(new File(['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"/>'], "mec.svg", { type: "image/svg+xml" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Create organisation" })).toBeEnabled());
    submit();
    await waitFor(() => expect(calls).toHaveLength(1));
    const logo = calls[0]!.body.get("logo") as File;
    expect(calls[0]!.path).toBe("/api/v1/orgs/create");
    expect(logo).toMatchObject({ name: "mec.png", type: "image/png" });
  });

  it("sends a HEIC this browser cannot open as it is, typed, for the API to convert", async () => {
    stubPictureBrowser({ opens: ["image/png", "image/jpeg"] });
    await fillAndPick(new File(["heic"], "IMG_7.heic", { type: "" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Create organisation" })).toBeEnabled());
    submit();
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]!.body.get("logo")).toMatchObject({ name: "IMG_7.heic", type: "image/heic" });
  });

  it("refuses a file that is not a picture, saying what is, and sends no logo", async () => {
    await fillAndPick(new File(["%PDF-1.7"], "letterhead.pdf", { type: "application/pdf" }));
    expect(await screen.findByText("Choose a picture: JPG, PNG, WebP, GIF, HEIC, AVIF, SVG, BMP or TIFF.")).toBeInTheDocument();
    submit();
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]!.body.get("logo")).toBeNull();
  });
});
