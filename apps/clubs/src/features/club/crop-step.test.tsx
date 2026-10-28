import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CropHost, cropToShape, type CropPlan, type LoadedPicture } from "@moa/app-kit";

/**
 * The crop step: a logo, a banner or a photo of another shape is placed in
 * its own before it is sent. jsdom has no decoder and no canvas, so the
 * picture's size and the drawing are stood in for (the arithmetic itself is
 * in picture-frames.test.tsx).
 */
const picture = (width: number, height: number): LoadedPicture => ({ width, height, source: {} as CanvasImageSource, url: `blob:${width}x${height}`, close: vi.fn() });
const file = (name: string, type: string) => new File([new Uint8Array(16)], name, { type });

function deps(width: number, height: number) {
  const plans: CropPlan[] = [];
  return {
    plans,
    load: vi.fn(async () => picture(width, height)),
    draw: vi.fn(async (_source: CanvasImageSource, plan: CropPlan, f: File) => {
      plans.push(plan);
      return new File([new Uint8Array(4)], f.name.replace(/\.\w+$/, ".png"), { type: "image/png" });
    }),
  };
}

afterEach(() => vi.restoreAllMocks());

describe("cropToShape", () => {
  it("sends the picture as it is where no crop host is mounted", async () => {
    const f = file("crest.png", "image/png");
    const d = deps(1600, 900);
    expect(await cropToShape(f, "logo", "logo", d)).toBe(f);
    expect(d.load).not.toHaveBeenCalled();
  });

  it("sends a picture already of its shape without asking", async () => {
    render(<CropHost />);
    const f = file("crest.png", "image/png");
    const d = deps(1080, 1080);
    expect(await cropToShape(f, "logo", "logo", d)).toBe(f);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("places a wider picture in the logo's square, and sends what the frame shows", async () => {
    render(<CropHost />);
    const d = deps(1300, 1000);
    let result: Promise<File | null>;
    act(() => {
      result = cropToShape(file("crest.png", "image/png"), "logo", "logo", d);
    });
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Fit the logo to its square");
    expect(dialog).toHaveTextContent("Square · 1080×1080 · like an Instagram profile picture");
    expect(screen.getByRole("checkbox", { name: /Show the whole logo/ })).not.toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: "Use this" }));
    const out = await result!;
    expect(out?.name).toBe("crest.png");
    expect(d.plans).toHaveLength(1);
    expect(d.plans[0]!.width).toBe(d.plans[0]!.height);
    expect(d.plans[0]!.width).toBe(1000);
    expect(d.plans[0]!.sx).toBeCloseTo(150);
    expect(d.plans[0]!.white).toBe(false);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("keeps a wide wordmark whole on white to begin with, never cut", async () => {
    render(<CropHost />);
    const d = deps(1200, 300);
    let result: Promise<File | null>;
    act(() => {
      result = cropToShape(file("wordmark.png", "image/png"), "icon", "partner logo", d);
    });
    await screen.findByRole("dialog");
    const whole = screen.getByRole("checkbox", { name: /Show the whole logo/ });
    expect(whole).toBeChecked();
    expect(screen.queryByRole("slider", { name: "Zoom" })).toBeNull();
    // It can still be cropped instead, and back.
    fireEvent.click(whole);
    expect(screen.getByRole("slider", { name: "Zoom" })).toBeInTheDocument();
    fireEvent.click(whole);
    fireEvent.click(screen.getByRole("button", { name: "Use this" }));
    await result!;
    expect(d.plans[0]).toMatchObject({ width: 1080, height: 1080, white: true });
  });

  it("cuts a banner to 3:1, zoomed and moved with the keys, with no whole-picture choice", async () => {
    render(<CropHost />);
    const d = deps(1600, 900);
    let result: Promise<File | null>;
    act(() => {
      result = cropToShape(file("stage.jpg", "image/jpeg"), "banner", "cover", d);
    });
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Wide 3:1 · 1500×500 · like an X (Twitter) header");
    expect(screen.queryByRole("checkbox", { name: /Show the whole logo/ })).toBeNull();
    fireEvent.change(screen.getByRole("slider", { name: "Zoom" }), { target: { value: "200" } });
    const frame = screen.getByRole("group", { name: /The cover, as it will show/ });
    fireEvent.keyDown(frame, { key: "ArrowLeft" });
    fireEvent.click(screen.getByRole("button", { name: "Use this" }));
    await result!;
    const plan = d.plans[0]!;
    expect(plan.width / plan.height).toBeCloseTo(3);
    expect(plan.width).toBe(800);
    expect(plan.sw / plan.sh).toBeCloseTo(3);
  });

  it("sends nothing when cancelled", async () => {
    render(<CropHost />);
    const d = deps(800, 1000);
    let result: Promise<File | null>;
    act(() => {
      result = cropToShape(file("asha.jpg", "image/jpeg"), "photo", "photo", d);
    });
    await screen.findByRole("dialog");
    expect(screen.queryByRole("checkbox", { name: /Show the whole logo/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(await result!).toBeNull();
    expect(d.draw).not.toHaveBeenCalled();
  });
});
