"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import {
  GlobeIcon,
  InstagramIcon,
  LinkedinIcon,
  YoutubeIcon,
  type LucideIcon,
} from "lucide-react";
import { initials, pickImage } from "@moa/app-kit";
import { Button, EmptyState, Skeleton, cn } from "@moa/ui";
import { enter, pressable } from "@moa/ui/motion";

import { useMyClub } from "../queries";
import { interestEmoji, type ClubInterest, type ClubSelf } from "../schemas";
import { ChangePasswordDialog } from "./change-password-dialog";

/**
 * Club profile from the design (node 245:78).
 *
 * Identity card across the top, the about text in a tall card on the left, and
 * a right column holding the two facts the design pulls out (college and
 * location) above the links card.
 */

/** Chip tints in the order the design uses them (node 251:998). */
const CHIP_TINTS = [
  "var(--chip-sky)",
  "var(--chip-lime)",
  "var(--chip-salmon)",
  "var(--chip-mint)",
  "var(--chip-sand)",
  "var(--chip-blush)",
  "var(--chip-lilac)",
] as const;

/** Keyed on id, not list position, so a chip keeps its colour as the set changes. */
function tintFor(id: number): string {
  return CHIP_TINTS[Math.abs(id) % CHIP_TINTS.length]!;
}

export function InterestChip({ interest }: { interest: ClubInterest }) {
  const emoji = interestEmoji(interest);
  return (
    <span
      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-light text-[#1e1e1e]"
      style={{ backgroundColor: tintFor(interest.id) }}
    >
      {emoji ? <span aria-hidden="true">{emoji}</span> : null}
      {interest.name}
    </span>
  );
}

/**
 * The small fact cards. The design puts an Apple-emoji image in a grey circle;
 * the emoji is rendered as text instead so it stays sharp at any scale and
 * needs no asset.
 */
function FactCard({
  emoji,
  label,
  value,
}: {
  emoji: string;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2 rounded-lg border-[0.5px] border-[var(--swatch-ink)] bg-white px-[7px] py-1">
      <div className="flex flex-col gap-2">
        <span
          aria-hidden="true"
          className="grid size-9 shrink-0 place-items-center rounded-full bg-[#f3f3f3] text-base"
        >
          {emoji}
        </span>
        <p className="text-base font-light text-black">{label}</p>
      </div>
      <p className="bebas truncate text-2xl leading-none text-black" title={value}>
        {value}
      </p>
    </div>
  );
}

const LINK_ROWS: ReadonlyArray<{
  key: "instagram" | "youtube" | "linkedin" | "website";
  label: string;
  icon: LucideIcon;
}> = [
  { key: "instagram", label: "Instagram", icon: InstagramIcon },
  { key: "youtube", label: "Youtube", icon: YoutubeIcon },
  { key: "linkedin", label: "Linkedin", icon: LinkedinIcon },
  { key: "website", label: "Website", icon: GlobeIcon },
];

/** `instagram.com/x` rather than `https://instagram.com/x?utm=…`, as in the design. */
function displayUrl(raw: string): string {
  try {
    const url = new URL(raw);
    return `${url.host.replace(/^www\./, "")}${url.pathname.replace(/\/$/, "")}`;
  } catch {
    return raw;
  }
}

function LinksCard({ club }: { club: ClubSelf }) {
  const rows = LINK_ROWS.map((row) => ({
    ...row,
    href: club.socials?.[row.key] || null,
  }));
  const anyLinked = rows.some((row) => row.href);

  return (
    <div className="flex flex-col gap-4 rounded-lg border-[0.5px] border-[var(--swatch-ink)] bg-white p-4">
      <h2 className="bebas text-2xl leading-none text-black">Links</h2>

      {anyLinked ? (
        <ul className="flex flex-col gap-3">
          {rows.map(({ key, label, icon: LinkIcon, href }) => (
            <li key={key} className="flex items-center gap-4 sm:gap-6">
              <span
                aria-hidden="true"
                className={cn(
                  "grid size-9 shrink-0 place-items-center rounded-full bg-[#f3f3f3]",
                  href ? "text-[var(--swatch-ink)]" : "text-[var(--swatch-grey-light)]"
                )}
              >
                <LinkIcon className="size-5" />
              </span>
              <span className="w-[74px] shrink-0 text-base text-[var(--swatch-grey)]">
                {label}
              </span>
              {href ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="min-w-0 truncate text-[13px] text-[var(--swatch-grey)] underline-offset-4 hover:text-[var(--swatch-teal)] hover:underline"
                  title={href}
                >
                  {displayUrl(href)}
                </a>
              ) : (
                <span className="text-[13px] text-[var(--swatch-grey-light)]">
                  Not added
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-[var(--swatch-grey)]">
          No links yet.{" "}
          <Link
            href="/profile/edit"
            className="font-semibold text-[var(--swatch-teal)] underline underline-offset-2"
          >
            Add them
          </Link>{" "}
          so students can find you.
        </p>
      )}
    </div>
  );
}

/**
 * The design truncates the about text and offers "Read More". Collapsed height
 * is matched to the design's card (379px) rather than a line count, so the
 * control only appears when the text actually overflows.
 */
function AboutCard({ about }: { about: string | null | undefined }) {
  const [expanded, setExpanded] = React.useState(false);
  const [overflows, setOverflows] = React.useState(false);
  const bodyRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const measure = () => setOverflows(el.scrollHeight > el.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [about]);

  return (
    <div className="flex min-h-[200px] flex-col gap-2 rounded-lg border-[0.5px] border-[var(--swatch-ink)] bg-white px-4 py-6 lg:min-h-[379px]">
      {about ? (
        <>
          <div
            ref={bodyRef}
            className={cn(
              "overflow-hidden text-base leading-6 font-light whitespace-pre-wrap text-black",
              expanded ? "max-h-none" : "max-h-[280px]"
            )}
          >
            {about}
          </div>
          {overflows || expanded ? (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="self-start text-base leading-6 font-semibold text-[var(--swatch-teal)] underline underline-offset-2"
            >
              {expanded ? "Read Less" : "Read More"}
            </button>
          ) : null}
        </>
      ) : (
        <p className="text-base font-light text-[var(--swatch-grey)]">
          No description yet. Tell students what your club does, who it is for
          and what you run — it is the first thing they read.
        </p>
      )}
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-[148px] w-full rounded-lg" />
      <div className="grid gap-6 lg:grid-cols-[687px_minmax(0,1fr)]">
        <Skeleton className="h-[379px] w-full rounded-lg" />
        <div className="space-y-6">
          <div className="flex gap-4">
            <Skeleton className="h-[106px] flex-1 rounded-lg" />
            <Skeleton className="h-[106px] flex-1 rounded-lg" />
          </div>
          <Skeleton className="h-[256px] w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}

export function ClubProfileView() {
  const { data: club, isPending, isError } = useMyClub();

  if (isPending) return <ProfileSkeleton />;

  if (isError || !club) {
    return (
      <EmptyState
        tone="muted"
        title="Could not load your club"
        description="If this keeps happening, your account may not be linked to a club yet."
      />
    );
  }

  const logo = pickImage(club.logo, ["medium", "large", "thumbnail", "original"]);

  return (
    <div className={cn("space-y-6", enter)}>
      {/* Identity card */}
      <div className="flex flex-col gap-6 rounded-lg border-[0.5px] border-[var(--swatch-ink)] bg-white px-4 py-6 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 gap-6">
          {logo ? (
            <Image
              src={logo}
              alt=""
              width={100}
              height={100}
              className="size-[100px] shrink-0 rounded-lg object-cover"
              unoptimized
            />
          ) : (
            <span className="bebas grid size-[100px] shrink-0 place-items-center rounded-lg bg-[#f3f3f3] text-3xl text-[var(--swatch-ink)]">
              {initials(club.name)}
            </span>
          )}

          <div className="flex min-w-0 flex-col gap-2">
            <h2 className="text-2xl font-bold break-words text-black">{club.name}</h2>
            {club.interests.length > 0 ? (
              <div className="flex max-w-[430px] flex-wrap gap-2">
                {club.interests.map((interest) => (
                  <InterestChip key={interest.id} interest={interest} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-[var(--swatch-grey)]">
                No focus areas selected yet.
              </p>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-4 sm:flex-row sm:items-center">
          <Button
            variant="display"
            size="display"
            asChild
            className={cn("w-full sm:w-[240px]", pressable)}
          >
            <Link href="/profile/edit">Edit Profile</Link>
          </Button>
          <ChangePasswordDialog />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,687px)_minmax(0,1fr)]">
        <AboutCard about={club.about} />

        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-4 sm:flex-row">
            <FactCard
              emoji="🎓"
              label="College"
              value={club.org?.name ?? "Not linked"}
            />
            <FactCard
              emoji="📍"
              label="Location"
              value={club.location_name || "Not set"}
            />
          </div>

          <LinksCard club={club} />
        </div>
      </div>
    </div>
  );
}
