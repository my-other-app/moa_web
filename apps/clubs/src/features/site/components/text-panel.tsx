"use client";

import * as React from "react";
import Link from "next/link";
import { CardLabel, ChoiceCard, FigurePanel } from "@moa/ui";

import { HEADLINE_MAX, SUBLINE_MAX } from "../schemas";

/**
 * The hero's two lines, and (v2) the accent: the template's own colour, or
 * the club's brand colour from Club profile in its place.
 */
function Swatch({ hex }: { hex: string | null | undefined }) {
  if (!hex) return null;
  return <span className="border-line inline-block size-3.5 rounded-full border align-[-2px]" style={{ background: hex }} aria-hidden="true" />;
}

export function TextPanel({
  headline,
  subline,
  defaultHeadline,
  defaultSubline,
  onHeadline,
  onSubline,
  accent,
  templateAccent,
  brand,
  onAccent,
}: {
  headline: string;
  subline: string;
  defaultHeadline: string;
  defaultSubline: string | null;
  onHeadline: (v: string) => void;
  onSubline: (v: string) => void;
  /** v2 only: the accent as chosen (null = the template's); undefined hides the choice. */
  accent?: string | null;
  templateAccent?: string | null;
  brand?: string | null;
  onAccent?: (hex: string | null) => void;
}) {
  const usable = brand && /^#[0-9a-fA-F]{6}$/.test(brand) ? brand : null;
  return (
    <FigurePanel className="p-4">
      <CardLabel>Hero text</CardLabel>
      <label htmlFor="site-headline" className="eyebrow mt-3 mb-1.5 block">
        Headline
      </label>
      <input id="site-headline" className="input w-full" value={headline} placeholder={defaultHeadline} onChange={(e) => onHeadline(e.target.value)} maxLength={HEADLINE_MAX} />
      <label htmlFor="site-subline" className="eyebrow mt-3 mb-1.5 block">
        Subline
      </label>
      <input
        id="site-subline"
        className="input w-full"
        value={subline}
        placeholder={defaultSubline ?? "One line on what the club does."}
        onChange={(e) => onSubline(e.target.value)}
        maxLength={SUBLINE_MAX}
      />
      <p className="text-ink-3 mt-2 text-[11.5px]">Left empty, the headline is your tagline and the subline the first line of your about.</p>

      {onAccent && accent !== undefined ? (
        <>
          <CardLabel className="mt-5">Accent colour</CardLabel>
          <div className="mt-2 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Accent colour">
            <ChoiceCard
              checked={accent === null}
              onClick={() => onAccent(null)}
              title={
                <span className="flex items-center gap-1.5">
                  <Swatch hex={templateAccent} /> Template colour
                </span>
              }
              hint="As the designer made it"
            />
            <ChoiceCard
              checked={accent !== null}
              disabled={!usable && accent === null}
              onClick={() => (usable ? onAccent(usable) : null)}
              title={
                <span className="flex items-center gap-1.5">
                  <Swatch hex={accent ?? usable} /> Club colour
                </span>
              }
              hint={usable ? "Your brand colour in its place" : "Set a brand colour on Club profile first"}
            />
          </div>
          {accent !== null && usable && accent.toLowerCase() !== usable.toLowerCase() ? (
            <p className="text-ink-3 mt-2 text-[11.5px]">
              The page uses {accent}; your brand colour is now {usable}.{" "}
              <button type="button" className="text-brand underline" onClick={() => onAccent(usable)}>
                Use {usable}
              </button>
            </p>
          ) : null}
          {!usable ? (
            <p className="text-ink-3 mt-2 text-[11.5px]">
              Your brand colour is set on{" "}
              <Link href="/profile" className="text-brand underline">
                Club profile
              </Link>
              .
            </p>
          ) : null}
        </>
      ) : null}
    </FigurePanel>
  );
}
