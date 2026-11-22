"use client";

import * as React from "react";
import { CrownIcon, FlameIcon, MoonIcon, ShieldIcon, StarIcon, ZapIcon, type LucideIcon } from "lucide-react";
import { cn } from "@moa/ui";

import { THEME_COLORS, TIER_LABEL, type Hero, type ThemeKey, type Tier } from "../schemas";

/**
 * The hero card as the website draws it (the shared HeroCard of the Neon
 * Arcade look): a tier frame and colour, the picture or a built-in emblem
 * on top, the number, name and tagline under it, in Unbounded for the
 * heading and Plus Jakarta Sans for the text. A locked card shows its
 * frame and number but not the hero.
 */

export const TIER_STYLE: Record<Tier, { frame: string; glow: string; pill: string; pillInk: string }> = {
  common: { frame: "linear-gradient(145deg,#B8C4DA,#6F7F9E)", glow: "rgba(143,163,199,.35)", pill: "#8FA3C7", pillInk: "#0B0618" },
  uncommon: { frame: "linear-gradient(145deg,#8CF5B5,#1FA765)", glow: "rgba(74,222,128,.4)", pill: "#4ADE80", pillInk: "#06210F" },
  rare: { frame: "linear-gradient(145deg,#C4B0FF,#6D3DF0)", glow: "rgba(139,92,246,.5)", pill: "#A78BFA", pillInk: "#12062E" },
  legendary: { frame: "linear-gradient(145deg,#FFE27A,#FF9F1C 55%,#FF3DB8)", glow: "rgba(255,190,60,.6)", pill: "#FFC93D", pillInk: "#2B1A00" },
};

const EMBLEM_ICON: Record<string, LucideIcon> = { bolt: ZapIcon, shield: ShieldIcon, star: StarIcon, flame: FlameIcon, moon: MoonIcon, crown: CrownIcon };

const SIZES = { sm: { w: 132, name: 11, tag: 9, pad: 6 }, md: { w: 200, name: 15, tag: 11.5, pad: 9 }, lg: { w: 264, name: 19, tag: 13, pad: 11 } } as const;
export type CardSize = keyof typeof SIZES;

export type CardHero = Pick<Hero, "name" | "tagline" | "tier" | "art_url" | "emblem_key"> & { number?: number | null };

export function HeroCard({ hero, theme = "neon_arcade", size = "md", locked = false, className }: { hero: CardHero; theme?: ThemeKey; size?: CardSize; locked?: boolean; className?: string }) {
  const c = THEME_COLORS[theme];
  const t = TIER_STYLE[hero.tier];
  const s = SIZES[size];
  const Emblem = EMBLEM_ICON[hero.emblem_key ?? ""] ?? ZapIcon;
  const no = hero.number ? `No. ${String(hero.number).padStart(2, "0")}` : "No. --";
  return (
    <figure
      data-slot="hero-card"
      data-tier={hero.tier}
      data-locked={locked || undefined}
      aria-label={locked ? `Locked ${TIER_LABEL[hero.tier]} card ${no}` : `${hero.name || "New hero"}, ${TIER_LABEL[hero.tier]}`}
      className={cn("m-0 shrink-0 rounded-[18px] p-[3px]", className)}
      style={{ width: s.w, background: t.frame, boxShadow: `0 0 22px ${t.glow}`, fontFamily: "var(--font-jakarta), system-ui, sans-serif" }}
    >
      <div className="flex flex-col overflow-hidden rounded-[15px]" style={{ background: c.panel, color: c.ink, padding: s.pad }}>
        <div className="flex items-center justify-between" style={{ fontSize: s.tag - 1.5, color: c.mute, marginBottom: s.pad - 2 }}>
          <span style={{ fontFamily: "var(--font-unbounded), system-ui, sans-serif", letterSpacing: ".04em" }}>{no}</span>
          <span className="rounded-full px-1.5 py-px font-semibold uppercase" style={{ background: t.pill, color: t.pillInk, letterSpacing: ".06em" }}>
            {TIER_LABEL[hero.tier]}
          </span>
        </div>
        <div className="relative grid w-full place-items-center overflow-hidden rounded-[10px]" style={{ aspectRatio: "3 / 4", background: `linear-gradient(160deg, ${c.bg}, ${c.panel})`, border: `1px solid ${c.mute}33` }}>
          {locked ? (
            <span aria-hidden="true" style={{ fontFamily: "var(--font-unbounded), system-ui, sans-serif", fontSize: s.name * 2.4, color: c.mute }}>
              ?
            </span>
          ) : hero.art_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={hero.art_url} alt="" className="size-full object-cover" />
          ) : (
            <Emblem aria-hidden="true" style={{ width: "46%", height: "46%", color: t.pill, filter: `drop-shadow(0 0 10px ${t.glow})` }} strokeWidth={1.6} />
          )}
        </div>
        <figcaption className="mt-[0.5em] min-w-0 text-center" style={{ minHeight: s.name * 2.6 }}>
          <span className="block truncate font-bold leading-tight" style={{ fontFamily: "var(--font-unbounded), system-ui, sans-serif", fontSize: s.name }}>
            {locked ? "Locked" : hero.name || "Hero name"}
          </span>
          {locked ? null : (
            <span className="mt-0.5 line-clamp-2 block leading-snug" style={{ fontSize: s.tag, color: c.mute }}>
              {hero.tagline || "A line about them"}
            </span>
          )}
        </figcaption>
      </div>
    </figure>
  );
}
