import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { PersonAvatar, pictureUrls, profilePicturesSchema } from "@moa/app-kit";

import { shownPicture, stubImageLoading } from "@/test/images";

/**
 * The one picture every person in the dashboards is drawn with: the photo
 * they uploaded, else the preset avatar they picked, else their initials.
 *
 * The owner reported that no picture showed anywhere in the admin portal.
 * Most of it was a list that only ever drew initials; this is the piece that
 * now draws all of them, so its fallbacks are pinned down here.
 */
const photo = {
  thumbnail: "https://cdn.test/users/profile_pic/photo.thumbnail.png",
  medium: "https://cdn.test/users/profile_pic/photo.medium.png",
  large: "https://cdn.test/users/profile_pic/photo.large.png",
  original: "https://cdn.test/users/profile_pic/photo.png",
};
const avatar = {
  thumbnail: "https://cdn.test/avatars/fox.thumbnail.png",
  medium: "https://cdn.test/avatars/fox.medium.png",
  large: "https://cdn.test/avatars/fox.large.png",
  original: "https://cdn.test/avatars/fox.png",
};
const brokenPhoto = { thumbnail: "https://cdn.test/broken/photo.thumbnail.png" };
const brokenAvatar = { thumbnail: "https://cdn.test/broken/fox.thumbnail.png" };

beforeEach(() => stubImageLoading());
afterEach(() => vi.unstubAllGlobals());

describe("which picture a person gets", () => {
  it("tries the photo before the avatar, at thumbnail size for a list", () => {
    expect(pictureUrls(photo, avatar)).toEqual([photo.thumbnail, avatar.thumbnail]);
  });

  it("asks for medium in a header, falling through to what the image has", () => {
    expect(pictureUrls(photo, avatar, "medium")).toEqual([photo.medium, avatar.medium]);
    expect(pictureUrls({ original: photo.original }, null, "medium")).toEqual([photo.original]);
  });

  it("takes an avatar alone, a bare address, and nothing at all", () => {
    expect(pictureUrls(null, avatar)).toEqual([avatar.thumbnail]);
    expect(pictureUrls("https://cdn.test/a.png", undefined)).toEqual(["https://cdn.test/a.png"]);
    expect(pictureUrls(null, undefined)).toEqual([]);
    expect(pictureUrls({ thumbnail: null, original: "" }, "  ")).toEqual([]);
  });

  it("tries one address once, when photo and avatar are the same picture", () => {
    expect(pictureUrls(avatar, avatar)).toEqual([avatar.thumbnail]);
  });
});

describe("a person's picture on screen", () => {
  it("shows the photo when they have both", async () => {
    const { container } = render(<PersonAvatar name="Asha Nair" photo={photo} avatar={avatar} />);
    await waitFor(() => expect(shownPicture(container)).toBe(photo.thumbnail));
    expect(screen.queryByText("AN")).not.toBeInTheDocument();
  });

  it("shows the avatar they picked when there is no photo", async () => {
    const { container } = render(<PersonAvatar name="Asha Nair" avatar={avatar} />);
    await waitFor(() => expect(shownPicture(container)).toBe(avatar.thumbnail));
  });

  it("shows their initials when there is neither", () => {
    const { container } = render(<PersonAvatar name="Asha Nair" />);
    expect(screen.getByText("AN")).toBeInTheDocument();
    expect(shownPicture(container)).toBeNull();
  });

  it("shows the initials while the picture is still loading", () => {
    const { container } = render(<PersonAvatar name="Asha Nair" photo={photo} />);
    // Synchronously after render: the preload has not answered yet.
    expect(screen.getByText("AN")).toBeInTheDocument();
    expect(shownPicture(container)).toBeNull();
  });

  it("falls back to the avatar when the photo fails to load", async () => {
    // A private photo's link is signed for an hour; a page left open outlives it.
    const { container } = render(<PersonAvatar name="Asha Nair" photo={brokenPhoto} avatar={avatar} />);
    await waitFor(() => expect(shownPicture(container)).toBe(avatar.thumbnail));
  });

  it("falls back to the initials when every picture fails, never a broken image", async () => {
    const { container } = render(<PersonAvatar name="Asha Nair" photo={brokenPhoto} avatar={brokenAvatar} />);
    // Long enough for both preloads to have failed.
    await new Promise((r) => setTimeout(r, 30));
    expect(shownPicture(container)).toBeNull();
    expect(screen.getByText("AN")).toBeInTheDocument();
  });

  it("tries again from the photo when it is handed new links", async () => {
    const { container, rerender } = render(<PersonAvatar name="Asha Nair" photo={brokenPhoto} avatar={brokenAvatar} />);
    await new Promise((r) => setTimeout(r, 30));
    expect(shownPicture(container)).toBeNull();
    // A refetch signs fresh links for the same picture.
    rerender(<PersonAvatar name="Asha Nair" photo={photo} avatar={avatar} />);
    await waitFor(() => expect(shownPicture(container)).toBe(photo.thumbnail));
  });

  it("is hidden from screen readers, which read the name beside it", () => {
    const { container } = render(<PersonAvatar name="Asha Nair" />);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });

  it("says ? for someone with no name", () => {
    render(<PersonAvatar name={null} />);
    expect(screen.getByText("?")).toBeInTheDocument();
  });
});

describe("a profile's pictures, as the user endpoints send them", () => {
  it("keeps the photo and the avatar's image", () => {
    const parsed = profilePicturesSchema.parse({
      full_name: "Asha",
      profile_pic: photo,
      avatar: { id: 3, name: "Fox", image: avatar },
    });
    expect(parsed?.profile_pic?.thumbnail).toBe(photo.thumbnail);
    expect(parsed?.avatar?.image?.thumbnail).toBe(avatar.thumbnail);
  });

  it("reads a malformed picture as none rather than failing the row", () => {
    const parsed = profilePicturesSchema.parse({ profile_pic: 42, avatar: "fox" });
    expect(parsed?.profile_pic).toBeNull();
    expect(parsed?.avatar).toBeNull();
    expect(profilePicturesSchema.parse("nonsense")).toBeNull();
    expect(profilePicturesSchema.parse(undefined)).toBeUndefined();
  });
});
