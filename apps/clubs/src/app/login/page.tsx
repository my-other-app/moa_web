import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getSessionQuietly } from "@moa/auth/server";
import { LoginForm } from "@moa/app-kit";
import { Skeleton } from "@moa/ui";

export const metadata: Metadata = { title: "Sign in" };

/** The product's name, as the rail of the signed-in app writes it. */
const PRODUCT = "MyOtherApp";

/**
 * The front door: the same two sheets on a canvas the app is drawn as. On a
 * wide screen the left sheet carries the product in its hero colours; the
 * right is the form. On a phone only the form sheet shows, with the mark
 * above it, so nobody signs in without knowing where they are.
 */
export default async function LoginPage() {
  const session = await getSessionQuietly();
  if (session?.user_type === "club") redirect("/");

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
              Everything your club runs, in one place.
            </p>
            <ul className="mt-6 grid gap-3 text-[14px] text-white/80">
              <li className="flex items-center gap-2.5">
                <span className="size-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />
                Events, tickets and the people who come
              </li>
              <li className="flex items-center gap-2.5">
                <span className="size-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />
                The door: check-ins, ID cards and the gate
              </li>
              <li className="flex items-center gap-2.5">
                <span className="size-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />
                Money, certificates and the closeout
              </li>
            </ul>
          </div>

          <p className="relative m-0 text-[12px] text-white/65">
            One login per club, shared by its committee.
          </p>
        </aside>

        <section className="bg-surface shadow-card flex flex-1 items-center justify-center rounded-[var(--radius-sheet)] px-6 py-12">
          <div className="animate-in fade-in-0 slide-in-from-bottom-2 w-full max-w-[360px] duration-500 motion-reduce:animate-none">
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

            <h1 className="page-title">Sign in</h1>
            <p className="text-ink-2 mt-1.5 text-[13.5px]">
              Manage your club and its events.
            </p>

            <div className="mt-7">
              {/* useSearchParams in LoginForm requires a Suspense boundary. */}
              <Suspense fallback={<Skeleton className="h-[236px] w-full rounded-2xl" />}>
                <LoginForm usernamePlaceholder="your_club" />
              </Suspense>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
