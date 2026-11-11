"use client";

import * as React from "react";
import { BookmarkIcon, GlobeIcon, HeartIcon, ImageIcon, MessageCircleIcon, Repeat2Icon, SendIcon, ThumbsUpIcon } from "lucide-react";
import { initials } from "@moa/app-kit";
import { cn } from "@moa/ui";

import { PLATFORM_LABEL, truncateFor, type Platform } from "../schemas";

/**
 * A post as it will look on a phone, per platform: the account's name and
 * picture, the text cut with "… more" where the app cuts it, and the
 * poster at the platform's shape. Close to the real thing, not a copy of
 * any app: enough to see the crop, the length and the first line.
 */
export interface PreviewImage {
  /** The poster the platform gets; or, while a crop is being changed, the event's poster to show it from. */
  src: string | null;
  /** Width over height of the post's image. */
  aspect: number;
  /** Shown from the event's poster with these settings (not yet made by the server). */
  simulate?: { mode: "crop" | "fit"; position: { x: number; y: number }; background: string } | null;
}

export interface PreviewAccount {
  name: string;
  handle?: string | null;
  picture?: string | null;
}

const LINK_RE = /(https?:\/\/[^\s]+)/g;

function Text({ text, platform, links }: { text: string; platform: Platform; links: boolean }) {
  const { shown, cut } = truncateFor(platform, text);
  const parts = shown.split(LINK_RE);
  const more = platform === "instagram" ? "… more" : platform === "x" ? "" : platform === "facebook" ? "… See more" : "…see more";
  return (
    <span className="break-words whitespace-pre-wrap">
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <span key={i} className={links ? "text-[#1d6fe0] dark:text-[#6aa8ff]" : undefined}>
            {p}
          </span>
        ) : (
          <React.Fragment key={i}>{p.split(/(#[\p{L}\p{N}_]+)/u).map((h, j) => (j % 2 === 1 ? <span key={j} className="text-[#1d6fe0] dark:text-[#6aa8ff]">{h}</span> : h))}</React.Fragment>
        ),
      )}
      {cut && more ? <span className="text-ink-3"> {more}</span> : null}
    </span>
  );
}

function Picture({ image, rounded }: { image: PreviewImage; rounded?: boolean }) {
  const s = image.simulate;
  return (
    <div
      className={cn("bg-sunken relative w-full overflow-hidden", rounded && "border-line-soft rounded-2xl border")}
      style={{ aspectRatio: String(image.aspect || 1), background: s?.mode === "fit" ? s.background : undefined }}
    >
      {image.src ? (
        // eslint-disable-next-line @next/next/no-img-element -- a preview of the CDN's own image (or the event's poster)
        <img
          src={image.src}
          alt="The post's image"
          className="absolute inset-0 size-full"
          style={
            s
              ? { objectFit: s.mode === "fit" ? "contain" : "cover", objectPosition: `${Math.round(s.position.x * 100)}% ${Math.round(s.position.y * 100)}%` }
              : { objectFit: "cover" }
          }
        />
      ) : (
        <span className="text-ink-3 absolute inset-0 grid place-items-center">
          <ImageIcon className="size-6" aria-hidden="true" />
        </span>
      )}
    </div>
  );
}

function Avatar({ account, size = 32 }: { account: PreviewAccount; size?: number }) {
  return account.picture ? (
    // eslint-disable-next-line @next/next/no-img-element -- the platform's own picture
    <img src={account.picture} alt="" style={{ width: size, height: size }} className="shrink-0 rounded-full object-cover" />
  ) : (
    <span style={{ width: size, height: size }} className="bg-brand-soft text-brand grid shrink-0 place-items-center rounded-full font-mono text-[10px] font-semibold">
      {initials(account.name)}
    </span>
  );
}

export function PhonePreview({ platform, account, text, image, className }: { platform: Platform; account: PreviewAccount; text: string; image: PreviewImage; className?: string }) {
  const handle = account.handle?.replace(/^@/, "") || account.name.toLowerCase().replace(/[^a-z0-9_.]+/g, "");
  return (
    <figure className={cn("m-0 flex flex-col items-center gap-2", className)} aria-label={`How it looks on ${PLATFORM_LABEL[platform]}`}>
      <div className="border-line bg-surface shadow-card w-full max-w-[320px] overflow-hidden rounded-[30px] border-[6px] border-neutral-900 dark:border-neutral-700">
        <div className="flex items-center justify-between px-5 pt-2 pb-1 font-mono text-[10px] text-ink-2" aria-hidden="true">
          <span>9:41</span>
          <span className="bg-ink h-1 w-12 rounded-full opacity-80" />
          <span>5G</span>
        </div>
        <div className="max-h-[560px] overflow-y-auto text-[12.5px] leading-[1.45] text-ink">
          {platform === "instagram" ? (
            <div>
              <div className="flex items-center gap-2 px-3 py-2">
                <Avatar account={account} size={28} />
                <span className="truncate text-[12px] font-semibold">{handle}</span>
              </div>
              <Picture image={image} />
              <div className="text-ink flex items-center gap-3.5 px-3 pt-2.5" aria-hidden="true">
                <HeartIcon className="size-5" />
                <MessageCircleIcon className="size-5" />
                <SendIcon className="size-5" />
                <BookmarkIcon className="ml-auto size-5" />
              </div>
              <p className="m-0 px-3 pt-1.5 pb-3">
                <span className="font-semibold">{handle}</span> <Text text={text} platform={platform} links={false} />
              </p>
            </div>
          ) : platform === "x" ? (
            <div className="flex gap-2.5 px-3 py-3">
              <Avatar account={account} size={34} />
              <div className="min-w-0 flex-1">
                <p className="m-0 truncate text-[12.5px]">
                  <span className="font-semibold">{account.name}</span> <span className="text-ink-3">@{handle} · now</span>
                </p>
                <p className="m-0 mt-0.5">
                  <Text text={text} platform={platform} links />
                </p>
                <div className="mt-2">
                  <Picture image={image} rounded />
                </div>
                <div className="text-ink-3 mt-2 flex justify-between pr-6" aria-hidden="true">
                  <MessageCircleIcon className="size-4" />
                  <Repeat2Icon className="size-4" />
                  <HeartIcon className="size-4" />
                  <BookmarkIcon className="size-4" />
                </div>
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-2 px-3 pt-3">
                <Avatar account={account} size={34} />
                <div className="min-w-0">
                  <p className="m-0 truncate text-[12.5px] font-semibold">{account.name}</p>
                  <p className="text-ink-3 m-0 flex items-center gap-1 text-[10.5px]">
                    {platform === "facebook" ? "Just now ·" : "Now ·"} <GlobeIcon className="size-2.5" aria-hidden="true" />
                  </p>
                </div>
              </div>
              <p className="m-0 px-3 py-2">
                <Text text={text} platform={platform} links />
              </p>
              <Picture image={image} />
              <div className="text-ink-3 border-line-soft flex justify-around border-t px-3 py-2 text-[11px]" aria-hidden="true">
                <span className="inline-flex items-center gap-1">
                  <ThumbsUpIcon className="size-3.5" /> Like
                </span>
                <span className="inline-flex items-center gap-1">
                  <MessageCircleIcon className="size-3.5" /> Comment
                </span>
                <span className="inline-flex items-center gap-1">
                  {platform === "facebook" ? <SendIcon className="size-3.5" /> : <Repeat2Icon className="size-3.5" />} {platform === "facebook" ? "Share" : "Repost"}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
      <figcaption className="text-ink-3 text-[11px]">A close likeness of {PLATFORM_LABEL[platform]} on a phone</figcaption>
    </figure>
  );
}
