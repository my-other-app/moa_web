"use client";

import Image from "next/image";
import { ImageOffIcon, SmileIcon } from "lucide-react";
import { Card, EmptyState, Skeleton } from "@moa/ui";
import { hoverLift, stagger } from "@moa/ui/motion";

import { pickImage } from "@moa/app-kit";
import { useAvatars } from "../queries";

/**
 * A grid rather than a table: these rows are a single image plus a name, and a
 * table of thumbnails wastes most of the width while making them too small to
 * judge. Picking the right presentation per resource is the point of
 * feature-owned components.
 */
export function AvatarGrid() {
  const { data, isPending, isError } = useAvatars();

  if (isPending) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="aspect-square w-full" style={stagger(i, 40, 300)} />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <Card className="p-0">
        <EmptyState
          icon={<ImageOffIcon />}
          title="Could not load avatars"
          description="The avatar list could not be fetched. Try reloading the page."
        />
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card className="p-0">
        <EmptyState
          icon={<SmileIcon />}
          title="No avatars yet"
          description="Avatars users can choose from during onboarding will appear here."
        />
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      {data.map((avatar, i) => {
        const src = pickImage(avatar.image, ["medium", "thumbnail", "original"]);
        return (
          <Card
            key={avatar.id}
            style={stagger(i, 40, 300)}
            className={`animate-in fade-in-0 zoom-in-95 overflow-hidden p-0 duration-300 motion-reduce:animate-none ${hoverLift}`}
          >
            <div className="bg-muted relative aspect-square">
              {src ? (
                <Image
                  src={src}
                  alt={avatar.name}
                  fill
                  sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
                  className="object-cover"
                  unoptimized
                />
              ) : (
                <div className="text-muted-foreground grid h-full place-items-center">
                  <ImageOffIcon className="size-6" />
                </div>
              )}
            </div>
            <p className="truncate px-3 py-2 text-sm font-medium">{avatar.name}</p>
          </Card>
        );
      })}
    </div>
  );
}
