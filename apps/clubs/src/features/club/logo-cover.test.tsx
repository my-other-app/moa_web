import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { ApiError } from "@moa/api";

import clubInfoFixture from "../__fixtures__/club-info.json";
import interestsFixture from "../__fixtures__/interests.json";
import orgsFixture from "../__fixtures__/orgs.json";

/**
 * The club's logo and cover upload the moment they are picked, each as its
 * own multipart request. The picture shows at once while it uploads, and a
 * picture the server refused must not stay on screen as if it were saved.
 */
const puts: Array<{ path: string; body: FormData }> = [];
const state: { refuse: Error | null; hold: Promise<void> | null } = { refuse: null, hold: null };

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
        if (state.hold) await state.hold;
        if (state.refuse) throw state.refuse;
      }),
      post: vi.fn(),
      patch: vi.fn(),
      del: vi.fn(),
    },
  };
});

const { api } = await import("@moa/app-kit");
const { toast } = await import("@moa/ui");
const { render } = await import("@/test/render");
const { ClubProfilePage } = await import("./components/club-profile-page");

const savedLogo = (clubInfoFixture as { logo: { medium?: string } }).logo.medium;

beforeEach(() => {
  puts.length = 0;
  state.refuse = null;
  state.hold = null;
  vi.restoreAllMocks();
  // A picked file previews from a blob URL named after it, so the test can tell which picture is up.
  vi.spyOn(URL, "createObjectURL").mockImplementation((f) => `blob:${(f as File).name}`);
  vi.mocked(api.get).mockClear();
});

const image = (name: string, type: string, bytes = 1024) => new File([new Uint8Array(bytes)], name, { type });

/** The picker's hidden input sits beside its button. */
const pickWith = (button: HTMLElement, file: File) => {
  const input = button.parentElement!.querySelector('input[type="file"]') as HTMLInputElement;
  expect(input).toHaveAttribute("accept", "image/*");
  fireEvent.change(input, { target: { files: [file] } });
};
const logoShown = () => {
  const button = screen.getByRole("button", { name: /logo$/ });
  return button.parentElement!.parentElement!.querySelector("img")?.getAttribute("src") ?? null;
};
const coverShown = () => {
  const button = screen.getByRole("button", { name: /Replace cover|Cover banner/ });
  return button.parentElement!.querySelector("img")?.getAttribute("src") ?? null;
};

describe("the club's logo", () => {
  it("uploads the picked image as the logo field, showing it while it goes", async () => {
    let release: () => void = () => undefined;
    state.hold = new Promise<void>((r) => (release = r));
    const said = vi.spyOn(toast, "success");
    render(<ClubProfilePage />);
    const button = await screen.findByRole("button", { name: "Replace logo" });
    expect(logoShown()).toBe(savedLogo);
    const infoReads = vi.mocked(api.get).mock.calls.filter(([p]) => String(p).includes("/clubs/info")).length;

    pickWith(button, image("crest.png", "image/png"));
    await waitFor(() => expect(button).toBeDisabled());
    expect(logoShown()).toBe("blob:crest.png");
    expect(puts).toHaveLength(1);
    expect(puts[0]!.path).toBe("/api/v1/clubs/logo");
    expect(puts[0]!.body).toBeInstanceOf(FormData);
    expect((puts[0]!.body.get("logo") as File).name).toBe("crest.png");
    expect(puts[0]!.body.get("cover")).toBeNull();

    release();
    await waitFor(() => expect(said).toHaveBeenCalledWith("Logo updated"));
    await waitFor(() => expect(button).toBeEnabled());
    // The club is read again so every place that shows the logo has the new one.
    await waitFor(() => expect(vi.mocked(api.get).mock.calls.filter(([p]) => String(p).includes("/clubs/info")).length).toBeGreaterThan(infoReads));
  });

  it("refuses a file that is not an image, sending nothing", async () => {
    const said = vi.spyOn(toast, "error");
    render(<ClubProfilePage />);
    pickWith(await screen.findByRole("button", { name: "Replace logo" }), image("crest.pdf", "application/pdf"));
    expect(said).toHaveBeenCalledWith("Choose an image file for the logo");
    expect(puts).toEqual([]);
    expect(logoShown()).toBe(savedLogo);
  });

  it("refuses an image over 5 MB, sending nothing", async () => {
    const said = vi.spyOn(toast, "error");
    render(<ClubProfilePage />);
    pickWith(await screen.findByRole("button", { name: "Replace logo" }), image("huge.png", "image/png", 5 * 1024 * 1024 + 1));
    expect(said).toHaveBeenCalledWith("The logo must be under 5 MB");
    expect(puts).toEqual([]);
  });

  it("says the server's refusal and goes back to the logo that is saved", async () => {
    state.refuse = new ApiError({ status: 422, message: "The logo must be at least 400 px square" });
    const said = vi.spyOn(toast, "error");
    render(<ClubProfilePage />);
    pickWith(await screen.findByRole("button", { name: "Replace logo" }), image("tiny.png", "image/png"));
    await waitFor(() => expect(said).toHaveBeenCalledWith("The logo must be at least 400 px square"));
    await waitFor(() => expect(logoShown()).toBe(savedLogo));
  });
});

describe("the club's cover", () => {
  it("uploads the picked image as the cover field and shows it", async () => {
    const said = vi.spyOn(toast, "success");
    render(<ClubProfilePage />);
    const button = await screen.findByRole("button", { name: "Cover banner" });
    expect(coverShown()).toBeNull();

    pickWith(button, image("stage.jpg", "image/jpeg"));
    await waitFor(() => expect(said).toHaveBeenCalledWith("Cover updated"));
    expect(puts.map((p) => p.path)).toEqual(["/api/v1/clubs/cover"]);
    expect((puts[0]!.body.get("cover") as File).name).toBe("stage.jpg");
    expect(puts[0]!.body.get("logo")).toBeNull();
    expect(await screen.findByRole("button", { name: "Replace cover" })).toBeEnabled();
    expect(coverShown()).toBe("blob:stage.jpg");
  });

  it("refuses an image over 5 MB", async () => {
    const said = vi.spyOn(toast, "error");
    render(<ClubProfilePage />);
    pickWith(await screen.findByRole("button", { name: "Cover banner" }), image("huge.jpg", "image/jpeg", 6 * 1024 * 1024));
    expect(said).toHaveBeenCalledWith("The cover must be under 5 MB");
    expect(puts).toEqual([]);
  });

  it("does not keep a refused cover on screen", async () => {
    state.refuse = new ApiError({ status: 413, message: "That file is too large" });
    const said = vi.spyOn(toast, "error");
    render(<ClubProfilePage />);
    pickWith(await screen.findByRole("button", { name: "Cover banner" }), image("stage.jpg", "image/jpeg"));
    await waitFor(() => expect(said).toHaveBeenCalledWith("That file is too large"));
    await waitFor(() => expect(coverShown()).toBeNull());
    expect(screen.getByRole("button", { name: "Cover banner" })).toBeEnabled();
  });
});
