"use client";

import * as React from "react";
import { HandshakeIcon } from "lucide-react";
import { LogoTile, logoSizes, pickImage, type ImageField } from "@moa/app-kit";
import { cn } from "@moa/ui";

import { clubPublicUrl } from "@/lib/public-site";

/** A club as the co-host screens draw it: a name, a handle, a logo. */
export interface ClubLike {
  name: string;
  slug?: string | null | undefined;
  logo?: ImageField;
}

/** A club's logo in a small square (whole, on white, as everywhere); its initials without one. */
export function ClubLogo({ club, size = 32, className }: { club: ClubLike; size?: number; className?: string }) {
  // The name is always written beside it, so the logo itself is decoration.
  return (
    <span aria-hidden="true" className={cn("inline-grid shrink-0", className)} style={{ width: size, height: size }}>
      <LogoTile src={pickImage(club.logo ?? null, logoSizes(size))} name={club.name} className="size-full rounded-lg text-[11px]" />
    </span>
  );
}

/** The host's logo, then each co-host's, overlapping (contract §8). */
export function LogoStack({ clubs, size = 22 }: { clubs: readonly ClubLike[]; size?: number }) {
  return (
    <span className="inline-flex shrink-0 items-center" aria-hidden="true">
      {clubs.map((c, i) => (
        <span key={`${c.slug ?? c.name}-${i}`} className={cn("ring-surface relative rounded-md ring-2", i > 0 && "-ml-1.5")} style={{ width: size, height: size, zIndex: clubs.length - i }}>
          <LogoTile src={pickImage(c.logo ?? null, logoSizes(size))} name={c.name} className="size-full rounded-md text-[8.5px]" outline={false} />
        </span>
      ))}
    </span>
  );
}

/** A club's name, linking to its public page when it has a handle. */
function ClubName({ club, link }: { club: ClubLike; link: boolean }) {
  if (link && club.slug) {
    return (
      <a href={clubPublicUrl(club.slug)} target="_blank" rel="noopener noreferrer" className="text-ink font-medium hover:underline">
        {club.name}
      </a>
    );
  }
  return <span className="text-ink font-medium">{club.name}</span>;
}

/**
 * "Hosted by A and B" / "Hosted by A, B and C" (contract §8): the host's
 * logo first, then each co-host's, and each name links to that club's page.
 */
export function HostedBy({ host, cohosts, link = true, className }: { host: ClubLike; cohosts: readonly ClubLike[]; link?: boolean; className?: string }) {
  const clubs = [host, ...cohosts];
  return (
    <span className={cn("inline-flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5", className)} data-testid="hosted-by">
      <LogoStack clubs={clubs} />
      <span>
        Hosted by{" "}
        {clubs.map((c, i) => (
          <React.Fragment key={`${c.slug ?? c.name}-${i}`}>
            {i > 0 ? (i === clubs.length - 1 ? " and " : ", ") : null}
            <ClubName club={c} link={link} />
          </React.Fragment>
        ))}
      </span>
    </span>
  );
}

/** On a row this club co-hosts: "Co-host", with whose event it is. */
export function CohostBadge({ hostName, className }: { hostName?: string | null | undefined; className?: string }) {
  return (
    <span
      className={cn("tag tag-outline gap-1", className)}
      title={hostName ? `${hostName} hosts this event; your club co-hosts it` : "Your club co-hosts this event"}
    >
      <HandshakeIcon aria-hidden="true" className="size-3" />
      Co-host
    </span>
  );
}

/** In the event's header: the club is a guest here, and whose event it is. */
export function CohostingWith({ host }: { host: ClubLike }) {
  return (
    <span className="border-brand-line bg-brand-soft text-brand inline-flex h-6 items-center gap-1.5 rounded-full border pr-2.5 pl-1 text-[12px] font-medium">
      <LogoTile src={pickImage(host.logo ?? null, logoSizes(18))} name={host.name} shape="circle" className="size-[18px] text-[8px]" outline={false} />
      Co-hosting with {host.name}
    </span>
  );
}
