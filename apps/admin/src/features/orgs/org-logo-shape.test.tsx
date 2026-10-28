import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";

/**
 * An organisation's logo, as everywhere: square, said in plain words, and a
 * logo of another shape placed in a square (or kept whole on white) before
 * it is sent.
 */
const sent: Array<FormData | unknown> = [];

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async () => ({ items: [], total: 0 })),
      post: vi.fn(async (_path: string, body: unknown) => {
        sent.push(body);
        return { id: 9, name: "CET", type: "college" };
      }),
      put: vi.fn(),
      patch: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { CropHost, LogoTile } = await import("@moa/app-kit");
const { render } = await import("@/test/render");
const { OrgFormDialog } = await import("./components/org-form");

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("an organisation's logo", () => {
  it("says it is square, 1080×1080", () => {
    render(<OrgFormDialog open onOpenChange={() => undefined} />);
    expect(screen.getByText("Square · 1080×1080")).toBeInTheDocument();
  });

  it("asks where a wide logo sits in its square before it is kept", async () => {
    vi.spyOn(URL, "createObjectURL").mockImplementation(() => "blob:wordmark");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 1200, height: 300, close: vi.fn() })));
    render(
      <>
        <OrgFormDialog open onOpenChange={() => undefined} />
        <CropHost />
      </>,
    );
    fireEvent.change(screen.getByLabelText("Logo"), { target: { files: [new File([new Uint8Array(8)], "wordmark.png", { type: "image/png" })] } });
    await waitFor(() => expect(screen.getByText("Fit the logo to its square")).toBeInTheDocument());
    expect(screen.getByRole("checkbox", { name: /Show the whole logo/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByText("Fit the logo to its square")).toBeNull());
  });

  it("is shown whole on white in its detail tile when it is not square", () => {
    const { container } = render(<LogoTile src="https://cdn.test/org.png" className="size-16 rounded-xl" />);
    const img = container.querySelector("img")!;
    Object.defineProperty(img, "naturalWidth", { value: 1200 });
    Object.defineProperty(img, "naturalHeight", { value: 300 });
    Object.defineProperty(img, "complete", { value: true });
    fireEvent.load(img);
    expect(img).toHaveClass("object-contain");
    expect(container.firstElementChild).toHaveClass("bg-white", "size-16");
  });
});
