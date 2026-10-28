import { describe, expect, it } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import {
  BannerFrame,
  bannerSizes,
  LogoTile,
  PICTURE_SPECS,
  POSTER_SHAPE_NOTE,
  PosterFrame,
  centred,
  croppedName,
  hasShape,
  isSquareEnough,
  logoSizes,
  moveBy,
  outputType,
  planCrop,
  planWhole,
  posterSizes,
  zoomTo,
} from "@moa/app-kit";

/**
 * One shape per picture, said the same everywhere (the owner's table):
 * a logo is square (1080×1080), a poster 4:5 (1080×1350), a banner 3:1
 * (1500×500). A poster is never cropped; a logo of another shape shows whole.
 */

/** The browser has loaded the picture: its own size, then the load event. */
function loaded(img: HTMLImageElement, width: number, height: number) {
  Object.defineProperty(img, "naturalWidth", { value: width, configurable: true });
  Object.defineProperty(img, "naturalHeight", { value: height, configurable: true });
  Object.defineProperty(img, "complete", { value: true, configurable: true });
  fireEvent.load(img);
}

describe("what the pickers say", () => {
  it("names each shape and size in plain words", () => {
    expect(PICTURE_SPECS.logo.label).toBe("Square · 1080×1080 · like an Instagram profile picture");
    expect(PICTURE_SPECS.poster.label).toBe("Portrait 4:5 · 1080×1350 · like an Instagram portrait post");
    expect(PICTURE_SPECS.banner.label).toBe("Wide 3:1 · 1500×500 · like an X (Twitter) header");
    expect(PICTURE_SPECS.icon.label).toBe("Square · 1080×1080");
    expect(PICTURE_SPECS.photo.label).toBe("Square · 1080×1080");
    expect(POSTER_SHAPE_NOTE).toBe("This poster isn't 4:5, so it will show whole on a soft blurred background. For a full frame, use 1080×1350.");
  });

  it("has the shapes and sizes the API makes", () => {
    expect([PICTURE_SPECS.logo.width, PICTURE_SPECS.logo.height]).toEqual([1080, 1080]);
    expect([PICTURE_SPECS.poster.width, PICTURE_SPECS.poster.height]).toEqual([1080, 1350]);
    expect([PICTURE_SPECS.banner.width, PICTURE_SPECS.banner.height]).toEqual([1500, 500]);
    expect(PICTURE_SPECS.poster.ratio).toBeCloseTo(0.8);
    expect(PICTURE_SPECS.banner.ratio).toBe(3);
  });

  it("counts a picture within 1% as the right shape", () => {
    expect(hasShape(1080, 1350, 4 / 5)).toBe(true);
    expect(hasShape(1000, 1255, 4 / 5)).toBe(true);
    expect(hasShape(1080, 1080, 4 / 5)).toBe(false);
    expect(hasShape(1600, 900, 4 / 5)).toBe(false);
    expect(hasShape(1500, 500, 3)).toBe(true);
    expect(hasShape(1600, 900, 3)).toBe(false);
  });
});

describe("which size of a picture is asked for", () => {
  // The smallest size whose box is at least twice the frame, then larger, the original, smaller.
  it("asks a poster frame for the smallest size at least twice as wide", () => {
    expect(posterSizes(56)).toEqual(["thumbnail", "medium", "large", "original"]);
    expect(posterSizes(120)[0]).toBe("thumbnail");
    expect(posterSizes(121)[0]).toBe("medium");
    expect(posterSizes(270)[0]).toBe("medium");
    expect(posterSizes(300)).toEqual(["large", "original", "medium", "thumbnail"]);
    expect(posterSizes(540)[0]).toBe("large");
    expect(posterSizes(541)).toEqual(["original", "large", "medium", "thumbnail"]);
  });

  it("asks a logo tile the same way", () => {
    expect(logoSizes(40)[0]).toBe("thumbnail");
    expect(logoSizes(75)[0]).toBe("thumbnail");
    expect(logoSizes(76)[0]).toBe("medium");
    expect(logoSizes(250)[0]).toBe("medium");
    expect(logoSizes(251)[0]).toBe("large");
    expect(logoSizes(540)[0]).toBe("large");
    expect(logoSizes(600)[0]).toBe("original");
  });

  it("never asks a banner for a thumbnail, which the API does not make", () => {
    expect(bannerSizes(640)).toEqual(["medium", "large", "original"]);
    expect(bannerSizes(750)[0]).toBe("medium");
    expect(bannerSizes(751)).toEqual(["large", "original", "medium"]);
    expect(bannerSizes(1500)[0]).toBe("large");
    expect(bannerSizes(1600)).toEqual(["original", "large", "medium"]);
    for (const w of [100, 900, 2000]) expect(bannerSizes(w)).not.toContain("thumbnail");
  });
});

describe("a logo's tile", () => {
  it("decides square enough within 3%", () => {
    expect(isSquareEnough(1080, 1080)).toBe(true);
    expect(isSquareEnough(1000, 975)).toBe(true);
    expect(isSquareEnough(1000, 960)).toBe(false);
    expect(isSquareEnough(1200, 300)).toBe(false);
    expect(isSquareEnough(800, 1000)).toBe(false);
  });

  it("fills the tile with a square logo", () => {
    const { container } = render(<LogoTile src="https://cdn.test/square.png" className="size-16" />);
    const tile = container.querySelector('[data-frame="logo"]')!;
    const img = tile.querySelector("img")!;
    // Not drawn before its shape is known: a wordmark never shows cropped first.
    expect(img).toHaveClass("opacity-0");
    loaded(img, 1080, 1080);
    expect(tile).toHaveAttribute("data-fit", "fill");
    expect(img).toHaveClass("object-cover");
    expect(img).not.toHaveClass("opacity-0");
    expect(tile).toHaveClass("bg-white", "aspect-square");
  });

  it("shows a wide wordmark whole, with room around it, on white", () => {
    const { container } = render(<LogoTile src="https://cdn.test/wordmark.png" className="size-16" />);
    const tile = container.querySelector('[data-frame="logo"]')!;
    const img = tile.querySelector("img")!;
    loaded(img, 1200, 300);
    expect(tile).toHaveAttribute("data-fit", "whole");
    expect(img).toHaveClass("object-contain", "p-[10%]");
    expect(img).not.toHaveClass("object-cover");
    expect(tile).toHaveClass("bg-white");
  });

  it("draws a hairline round the white tile, unless the tile has a border of its own", () => {
    const { container, rerender } = render(<LogoTile src="https://cdn.test/logo.png" />);
    expect(container.querySelector(".ring-1")).not.toBeNull();
    rerender(<LogoTile src="https://cdn.test/logo.png" outline={false} className="border" />);
    expect(container.querySelector(".ring-1")).toBeNull();
  });

  it("gives a wordmark more room in a circle, so its corners are never cut", () => {
    const { container } = render(<LogoTile src="https://cdn.test/wordmark.png" shape="circle" className="size-10" />);
    const img = container.querySelector("img")!;
    loaded(img, 1200, 300);
    expect(img).toHaveClass("object-contain", "p-[16%]");
    expect(container.querySelector('[data-frame="logo"]')).toHaveClass("rounded-full");
  });

  it("shows the initials without a logo, and after one fails to load", () => {
    const { container, rerender } = render(<LogoTile src={null} name="Pixel Society" />);
    expect(container.textContent).toBe("PS");
    rerender(<LogoTile src="https://cdn.test/gone.png" name="Pixel Society" />);
    fireEvent.error(container.querySelector("img")!);
    expect(container.textContent).toBe("PS");
    expect(container.querySelector('[data-frame="logo"]')).not.toHaveClass("bg-white");
  });
});

describe("a poster's frame", () => {
  it("is 4:5 and draws the poster whole over a blurred copy of itself", () => {
    const { container } = render(<PosterFrame src="https://cdn.test/poster.jpg" alt="Poster for Hack Night" width={300} className="w-[300px]" />);
    const frame = container.querySelector('[data-frame="poster"]')!;
    expect(frame).toHaveClass("aspect-[4/5]", "overflow-hidden");
    const backdrop = frame.querySelector('[data-part="backdrop"]')!;
    const poster = frame.querySelector('[data-part="poster"]')!;
    expect(backdrop).toHaveAttribute("aria-hidden", "true");
    expect(backdrop).toHaveAttribute("src", "https://cdn.test/poster.jpg");
    expect(backdrop).toHaveClass("object-cover", "blur-[20px]", "scale-[1.15]");
    // Never cropped.
    expect(poster).toHaveClass("object-contain");
    expect(poster).not.toHaveClass("object-cover");
    expect(poster).toHaveAttribute("alt", "Poster for Hack Night");
  });

  it("blurs less in a small frame", () => {
    const { container } = render(<PosterFrame src="https://cdn.test/poster.jpg" width={56} />);
    expect(container.querySelector('[data-part="backdrop"]')).toHaveClass("blur-[8px]");
  });

  it("tells its poster's own size once loaded", () => {
    const sizes: Array<[number, number]> = [];
    const { container } = render(<PosterFrame src="https://cdn.test/poster.jpg" onSize={(w, h) => sizes.push([w, h])} />);
    loaded(container.querySelector('[data-part="poster"]') as HTMLImageElement, 1600, 900);
    expect(sizes).toEqual([[1600, 900]]);
  });

  it("keeps the fallback when there is no poster", () => {
    const { container, getByText } = render(<PosterFrame src={null} fallback={<span>No poster</span>} />);
    expect(getByText("No poster")).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector('[data-frame="poster"]')).toHaveClass("aspect-[4/5]");
  });
});

describe("a banner's frame", () => {
  it("is 3:1, the banner filling it", () => {
    const { container } = render(<BannerFrame src="https://cdn.test/cover.jpg" />);
    expect(container.querySelector('[data-frame="banner"]')).toHaveClass("aspect-[3/1]");
    expect(container.querySelector("img")).toHaveClass("object-cover");
  });
});

describe("the crop", () => {
  const square = { width: 264, height: 264 };
  const band = { width: 456, height: 152 };

  it("cuts a 16:9 banner to exactly 3:1 at 1500×500", () => {
    const picture = { width: 1600, height: 900 };
    const plan = planCrop("banner", band, picture, centred(band, picture));
    expect([plan.width, plan.height]).toEqual([1500, 500]);
    expect(plan.sw / plan.sh).toBeCloseTo(3);
    // Centred, top to bottom of the picture's width.
    expect(plan.sx).toBeCloseTo(0);
    expect(plan.sw).toBeCloseTo(1600);
    expect(plan.sy).toBeCloseTo((900 - 1600 / 3) / 2);
  });

  it("never makes more pixels than the picture has", () => {
    const picture = { width: 400, height: 600 };
    const plan = planCrop("logo", square, picture, centred(square, picture));
    expect([plan.width, plan.height]).toEqual([400, 400]);
    expect(plan.sy).toBeCloseTo(100);
  });

  it("zooms about the centre and keeps the picture over the whole frame", () => {
    const picture = { width: 1200, height: 800 };
    const start = centred(square, picture);
    const zoomed = zoomTo(square, picture, start, 2);
    expect(zoomed.zoom).toBe(2);
    const plan = planCrop("logo", square, picture, zoomed);
    expect(plan.sw).toBeCloseTo(400);
    expect(plan.sx + plan.sw / 2).toBeCloseTo(600);
    expect(plan.sy + plan.sh / 2).toBeCloseTo(400);
    // Dragged far past an edge, it stops at the edge.
    const dragged = moveBy(square, picture, zoomed, 10_000, 10_000);
    expect([dragged.x, dragged.y]).toEqual([0, 0]);
    expect(zoomTo(square, picture, start, 9).zoom).toBe(4);
    expect(zoomTo(square, picture, start, 0.2).zoom).toBe(1);
  });

  it("keeps a wordmark whole, centred on white with room around it", () => {
    const plan = planWhole("logo", { width: 1200, height: 300 });
    expect([plan.width, plan.height]).toEqual([1080, 1080]);
    expect(plan.white).toBe(true);
    expect(plan.dw).toBeCloseTo(1080 * 0.8);
    expect(plan.dx).toBeCloseTo(1080 * 0.1);
    expect(plan.dy + plan.dh / 2).toBeCloseTo(540);
  });

  it("keeps a see-through picture a PNG, and makes anything else a JPEG", () => {
    expect(outputType(new File([], "logo.png", { type: "image/png" }))).toBe("image/png");
    expect(outputType(new File([], "logo.webp", { type: "image/webp" }))).toBe("image/png");
    expect(outputType(new File([], "logo.gif", { type: "image/gif" }))).toBe("image/png");
    expect(outputType(new File([], "photo.jpg", { type: "image/jpeg" }))).toBe("image/jpeg");
    expect(outputType(new File([], "photo.heic", { type: "image/heic" }))).toBe("image/jpeg");
    expect(croppedName(new File([], "Crest Final.webp"), "image/png")).toBe("Crest Final.png");
    expect(croppedName(new File([], "stage.jpeg"), "image/jpeg")).toBe("stage.jpg");
  });
});
