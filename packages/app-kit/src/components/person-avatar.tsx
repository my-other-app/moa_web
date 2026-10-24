"use client";

import * as React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@moa/ui";

import { initials } from "../format";
import { pickImage, type ImageField } from "../image";

/** A picture as the API sends one: an image's links by size, or a bare URL. */
export type Picture = ImageField | string;

/**
 * Which rendition a slot asks for first. A list row is drawn at 30-40px, so
 * the 150px thumbnail is plenty; a profile header wants the 500px medium.
 * Either falls through to whatever the image does have.
 */
export type PictureSize = "thumbnail" | "medium";

const ORDER: Record<PictureSize, Array<"thumbnail" | "medium" | "large" | "original">> = {
  thumbnail: ["thumbnail", "medium", "large", "original"],
  medium: ["medium", "large", "thumbnail", "original"],
};

function urlOf(picture: Picture | null | undefined, size: PictureSize): string | null {
  if (typeof picture === "string") return picture.trim() || null;
  return pickImage(picture, ORDER[size]);
}

/**
 * The links to try for a person, best first: the photo they uploaded, then
 * the preset avatar they picked. The server's own rule (reports.service.avatar
 * in the API): a person can have both at once, and the photo wins.
 */
export function pictureUrls(
  photo: Picture | null | undefined,
  avatar: Picture | null | undefined,
  size: PictureSize = "thumbnail"
): string[] {
  const urls: string[] = [];
  for (const picture of [photo, avatar]) {
    const url = urlOf(picture, size);
    if (url && !urls.includes(url)) urls.push(url);
  }
  return urls;
}

export interface PersonAvatarProps {
  /** Who it is: their initials are the fallback. */
  name: string | null | undefined;
  /** The photo they uploaded (`profile.profile_pic`), or a picture already resolved by the API. */
  photo?: Picture | null;
  /** The preset avatar they picked (`profile.avatar.image`). */
  avatar?: Picture | null;
  /** Thumbnail for a list row (the default), medium for a profile header. */
  size?: PictureSize;
  /** On the disc: its size and shape (`size-9`, `rounded-xl`). */
  className?: string;
  /** On the initials: their colours and type. Repeat a non-round shape here. */
  fallbackClassName?: string;
}

/**
 * A person's picture, wherever the dashboards show a person: the photo they
 * uploaded, else the avatar they picked, else their initials.
 *
 * The initials show while a picture loads and whenever one fails -- a link
 * to a private photo is signed for an hour, so a page left open long enough
 * outlives it. A photo that fails falls back to the avatar before the
 * initials, never to a broken-image icon.
 */
export function PersonAvatar({
  name,
  photo,
  avatar,
  size = "thumbnail",
  className,
  fallbackClassName,
}: PersonAvatarProps) {
  const urls = pictureUrls(photo, avatar, size);
  const key = urls.join(" ");
  // How many of these links failed. Kept with the links it counted, so a
  // fresh set (a refetch signs new ones) is tried from the photo again.
  const [failed, setFailed] = React.useState({ key, count: 0 });
  const skip = failed.key === key ? failed.count : 0;
  const src = urls[skip];

  return (
    // Hidden from assistive tech: it always sits beside the name it stands
    // for, and its initials would be read out a second time (and become
    // part of a link's name when it sits inside one).
    <Avatar aria-hidden="true" className={className}>
      {src ? (
        <AvatarImage
          // A new element per link: Radix tracks one load per image.
          key={src}
          src={src}
          alt=""
          className="object-cover"
          onLoadingStatusChange={(status) => {
            if (status === "error") setFailed({ key, count: skip + 1 });
          }}
        />
      ) : null}
      <AvatarFallback className={fallbackClassName}>{initials(name)}</AvatarFallback>
    </Avatar>
  );
}
