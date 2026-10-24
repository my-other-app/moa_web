import { vi } from "vitest";

/**
 * Pictures that load, as in a browser.
 *
 * jsdom never fetches an image, so `new Image()` never fires `load` or
 * `error` -- and Radix's Avatar, which PersonAvatar is built on, renders its
 * <img> only once a preload has fired `load`. Without this every picture in
 * a test is stuck on its initials, and a test of "shows the photo" cannot
 * pass. Any address containing "broken" fails instead, for the fallbacks.
 *
 * Call in a beforeEach; vi.unstubAllGlobals() in an afterEach undoes it.
 */
export function stubImageLoading() {
  class LoadingImage extends EventTarget {
    complete = false;
    naturalWidth = 0;
    referrerPolicy = "";
    crossOrigin: string | null = null;
    #src = "";

    get src() {
      return this.#src;
    }

    set src(value: string) {
      this.#src = value;
      setTimeout(() => {
        this.complete = true;
        if (value.includes("broken")) {
          this.dispatchEvent(new Event("error"));
        } else {
          this.naturalWidth = 150;
          this.dispatchEvent(new Event("load"));
        }
      }, 0);
    }
  }
  vi.stubGlobal("Image", LoadingImage);
}

/** The picture a PersonAvatar (or any Radix Avatar) inside `root` is showing, or null for its initials. */
export function shownPicture(root: ParentNode): string | null {
  return root.querySelector<HTMLImageElement>('img[data-slot="avatar-image"]')?.getAttribute("src") ?? null;
}
