import type * as React from "react";
import Image from "next/image";

import { cn } from "@moa/ui";

/** The product's name, as the rail of the signed-in app writes it. */
export const PRODUCT = "MyOtherApp";

/**
 * The front door's two sheets on the canvas the app is drawn as: on a wide
 * screen the left sheet carries the product in its hero colours and the
 * right holds the form; on a phone only the form sheet shows, with the mark
 * above it, so nobody signs in (or applies) without knowing where they are.
 * Sign-in and sign-up share it so the two read as one door.
 */
export function AuthFrame({
  headline,
  points,
  foot,
  wide,
  children,
}: {
  headline: string;
  points: string[];
  foot: string;
  /** Room for a longer form than sign-in's two fields. */
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <main className="bg-canvas flex min-h-dvh p-3.5 max-sm:p-2">
      <div className="flex flex-1 gap-3.5">
        <aside
          aria-label={`${PRODUCT} Clubs`}
          className="shadow-hero relative hidden w-[42%] max-w-[560px] shrink-0 flex-col justify-between overflow-hidden rounded-[var(--radius-sheet)] bg-[linear-gradient(150deg,var(--hero-from)_0%,var(--hero-to)_100%)] p-10 text-white lg:flex"
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_90%_0%,rgba(255,255,255,0.18)_0%,transparent_60%)]"
          />
          <div className="relative flex items-center gap-3">
            <Image
              src="/brand/icon.png"
              alt=""
              width={40}
              height={40}
              className="size-10 rounded-[11px] ring-1 ring-white/25"
              priority
              unoptimized
            />
            <span>
              <span className="block text-[17px] leading-[1.15] font-semibold tracking-[-0.02em]">
                {PRODUCT}
              </span>
              <span className="eyebrow block text-white/70">Clubs</span>
            </span>
          </div>

          <div className="relative">
            <p className="m-0 max-w-[16ch] text-[32px] leading-[1.12] font-semibold tracking-[-0.025em]">
              {headline}
            </p>
            <ul className="mt-6 grid gap-3 text-[14px] text-white/80">
              {points.map((point) => (
                <li key={point} className="flex items-center gap-2.5">
                  <span className="size-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />
                  {point}
                </li>
              ))}
            </ul>
          </div>

          <p className="relative m-0 text-[12px] text-white/65">{foot}</p>
        </aside>

        <section className="bg-surface shadow-card flex flex-1 items-center justify-center rounded-[var(--radius-sheet)] px-6 py-12">
          <div
            className={cn(
              "animate-in fade-in-0 slide-in-from-bottom-2 w-full duration-500 motion-reduce:animate-none",
              wide ? "max-w-[560px]" : "max-w-[360px]",
            )}
          >
            <div className="mb-9 flex items-center gap-2.5 lg:hidden">
              <Image
                src="/brand/icon.png"
                alt=""
                width={36}
                height={36}
                className="size-9 rounded-[10px]"
                priority
                unoptimized
              />
              <span>
                <span className="text-ink block text-[15px] leading-[1.15] font-semibold tracking-[-0.02em]">
                  {PRODUCT}
                </span>
                <span className="eyebrow block">Clubs</span>
              </span>
            </div>
            {children}
          </div>
        </section>
      </div>
    </main>
  );
}
