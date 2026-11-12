"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@moa/api";
import { toast } from "@moa/ui";

import { COLUMN_IMAGE_MAX, fitImage, isPicture } from "@/lib/images";

import { uploadSiteImage } from "./api";
import { SITE_KEY, useSetImages } from "./queries";
import { PHOTO_TYPES } from "./schemas";

export type UploadState = "waiting" | "preparing" | "sending" | "failed";

export interface UploadItem {
  id: string;
  file: File;
  progress: number;
  state: UploadState;
  error: string | null;
}

export const LIBRARY_FULL = "SITE_IMAGES_FULL";

let seq = 0;

/**
 * Photos going into the library, one at a time (the library keeps them in
 * the order they were picked): each made ready as every picture in the
 * dashboard is (lib/images: converted, redrawn under its budget), then sent
 * with its progress. A photo the server refuses stays in the list with why,
 * until dismissed; the library being full stops the rest.
 *
 * `room` is how many more the library takes; `add` takes what fits of a
 * pick and says how many were left out. Kept by the editor (not the Photos
 * tab), so a queue goes on while another tab is open.
 */
export function useUploadQueue({ room, limit, maxMb }: { room: number; limit: number; maxMb: number }) {
  const [items, setItems] = React.useState<UploadItem[]>([]);
  const waiting = React.useRef<UploadItem[]>([]);
  const running = React.useRef(false);
  const setImages = useSetImages();
  const queryClient = useQueryClient();

  const patch = (id: string, next: Partial<UploadItem>) => setItems((list) => list.map((i) => (i.id === id ? { ...i, ...next } : i)));
  const fail = (id: string, error: string) => patch(id, { state: "failed", error });

  /** One photo: made ready, sent; whether the library turned out full. */
  const send = async (item: UploadItem): Promise<"full" | void> => {
    patch(item.id, { state: "preparing" });
    let ready: File;
    try {
      ready = await fitImage(item.file, "photo", { limit: Math.min(COLUMN_IMAGE_MAX, maxMb * 1024 * 1024) });
    } catch (error) {
      return fail(item.id, error instanceof Error ? error.message : "The photo is too big to send");
    }
    if (!PHOTO_TYPES.includes(ready.type)) return fail(item.id, "Use a JPG, PNG or WebP photo.");
    patch(item.id, { state: "sending", progress: 0 });
    try {
      const image = await uploadSiteImage(ready, { onProgress: (progress) => patch(item.id, { progress }) });
      setImages((list) => [...list.filter((i) => i.id !== image.id), { ...image, position: list.length }]);
      setItems((list) => list.filter((i) => i.id !== item.id));
    } catch (error) {
      if (error instanceof ApiError && error.errorCode === LIBRARY_FULL) return "full";
      fail(item.id, error instanceof Error ? error.message : "The photo couldn't be sent.");
    }
  };

  /** Sends what waits, one after another; then reads the site again (the server's order, used_in). */
  const pump = async () => {
    if (running.current) return;
    running.current = true;
    try {
      for (let item = waiting.current.shift(); item; item = waiting.current.shift()) {
        if ((await send(item)) === "full") {
          const stopped = new Set([item.id, ...waiting.current.map((i) => i.id)]);
          waiting.current = [];
          setItems((list) => list.map((i) => (stopped.has(i.id) ? { ...i, state: "failed", error: `The library is full (${limit} photos).` } : i)));
        }
      }
    } finally {
      running.current = false;
    }
    void queryClient.invalidateQueries({ queryKey: SITE_KEY, exact: true });
  };

  const pending = items.filter((i) => i.state !== "failed").length;

  const add = (files: readonly File[]) => {
    const pictures = files.filter((f) => isPicture(f));
    if (pictures.length < files.length) toast.error("Only photos go in the library: JPG, PNG or WebP.");
    const taken = pictures.slice(0, Math.max(0, room - pending));
    const left = pictures.length - taken.length;
    if (left > 0) toast.error(`The library holds ${limit} photos: ${left} ${left === 1 ? "was" : "were"} left out.`);
    if (!taken.length) return;
    const fresh = taken.map((file): UploadItem => ({ id: `u${++seq}`, file, progress: 0, state: "waiting", error: null }));
    setItems((list) => [...list, ...fresh]);
    waiting.current.push(...fresh);
    void pump();
  };

  const dismiss = (id: string) => setItems((list) => list.filter((i) => i.id !== id));

  return { items, add, dismiss, pending };
}

export type UploadQueue = ReturnType<typeof useUploadQueue>;
