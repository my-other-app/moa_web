import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";

import clubInfoFixture from "../__fixtures__/club-info.json";
import interestsFixture from "../__fixtures__/interests.json";
import orgsFixture from "../__fixtures__/orgs.json";

/**
 * The club profile's pickers say each picture's shape, show it in its true
 * frame, and put a logo or banner of another shape through the crop step
 * before it uploads.
 */
const puts: Array<{ path: string; body: FormData }> = [];

vi.mock("@moa/app-kit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@moa/app-kit")>();
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        if (path.includes("/clubs/info")) return clubInfoFixture;
        if (path.includes("/interests/list")) return interestsFixture;
        if (path.includes("/orgs/list")) return orgsFixture;
        throw new Error(`unstubbed GET ${path}`);
      }),
      put: vi.fn(async (path: string, body: FormData) => {
        puts.push({ path, body });
      }),
      post: vi.fn(),
      patch: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { CropHost } = await import("@moa/app-kit");
const { render } = await import("@/test/render");
const { ClubProfilePage } = await import("./components/club-profile-page");

/** What the browser would decode the picked picture as. */
let decoded = { width: 1600, height: 900 };
const drawn: number[][] = [];

beforeEach(() => {
  puts.length = 0;
  drawn.length = 0;
  vi.spyOn(URL, "createObjectURL").mockImplementation((f) => `blob:${(f as File).name}`);
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ ...decoded, close: vi.fn() })));
  // A canvas that records what it was asked to draw, and encodes to a few bytes.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement) {
    return { fillRect: vi.fn(), drawImage: (...args: number[]) => drawn.push([this.width, this.height, ...args.slice(1)]), set fillStyle(_v: string) {}, set imageSmoothingEnabled(_v: boolean) {}, set imageSmoothingQuality(_v: string) {} } as unknown as CanvasRenderingContext2D;
  });
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (cb: BlobCallback, type?: string) {
    cb(new Blob([new Uint8Array(8)], { type }));
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const image = (name: string, type: string) => new File([new Uint8Array(1024)], name, { type });
const pickWith = (button: HTMLElement, file: File) => {
  const input = button.parentElement!.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
};

describe("the club profile's pictures", () => {
  it("say their shape and size", async () => {
    render(<ClubProfilePage />);
    await screen.findByRole("button", { name: "Replace logo" });
    expect(screen.getByText("Square · 1080×1080 · like an Instagram profile picture")).toBeInTheDocument();
    expect(screen.getByText("Wide 3:1 · 1500×500 · like an X (Twitter) header")).toBeInTheDocument();
    expect(screen.getByText(/Logos: Square · 1080×1080\./)).toBeInTheDocument();
    expect(screen.getByText(/Photos: Square · 1080×1080\./)).toBeInTheDocument();
  });

  it("show the logo in a square tile and the banner in a 3:1 frame", async () => {
    const { container } = render(<ClubProfilePage />);
    await screen.findByRole("button", { name: "Replace logo" });
    expect(container.querySelector('[data-frame="logo"]')).toHaveClass("aspect-square");
    expect(container.querySelector('[data-frame="banner"]')).toHaveClass("aspect-[3/1]");
  });

  it("put a logo that is not square through the crop step and upload the square it makes", async () => {
    decoded = { width: 1300, height: 1000 };
    render(
      <>
        <ClubProfilePage />
        <CropHost />
      </>,
    );
    pickWith(await screen.findByRole("button", { name: "Replace logo" }), image("crest.jpg", "image/jpeg"));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Fit the logo to its square");
    expect(puts).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Use this" }));
    await waitFor(() => expect(puts).toHaveLength(1));
    const sent = puts[0]!.body.get("logo") as File;
    expect(puts[0]!.path).toBe("/api/v1/clubs/logo");
    expect(sent.name).toBe("crest.jpg");
    expect(sent.type).toBe("image/jpeg");
    // A 1000×1000 square from the middle of the 1300×1000 picture.
    expect(drawn[0]!.slice(0, 2)).toEqual([1000, 1000]);
    expect(drawn[0]![2]).toBeCloseTo(150);
    expect(drawn[0]![4]).toBeCloseTo(1000);
  });

  it("send nothing when the crop is cancelled", async () => {
    decoded = { width: 1600, height: 900 };
    render(
      <>
        <ClubProfilePage />
        <CropHost />
      </>,
    );
    pickWith(await screen.findByRole("button", { name: "Cover banner" }), image("stage.png", "image/png"));
    expect(await screen.findByRole("dialog")).toHaveTextContent("Fit the cover to its 3:1 banner");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(puts).toEqual([]);
    expect(screen.getByRole("button", { name: "Cover banner" })).toBeInTheDocument();
  });

  it("upload a banner that is already 3:1 without asking", async () => {
    decoded = { width: 1500, height: 500 };
    render(
      <>
        <ClubProfilePage />
        <CropHost />
      </>,
    );
    pickWith(await screen.findByRole("button", { name: "Cover banner" }), image("stage.jpg", "image/jpeg"));
    await waitFor(() => expect(puts.map((p) => p.path)).toEqual(["/api/v1/clubs/cover"]));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect((puts[0]!.body.get("cover") as File).name).toBe("stage.jpg");
  });
});
