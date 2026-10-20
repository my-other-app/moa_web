import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getSessionQuietly } from "@moa/auth/server";
import { LoginForm, safeNext } from "@moa/app-kit";
import { Skeleton } from "@moa/ui";

import { AuthFrame } from "@/components/auth-frame";

export const metadata: Metadata = { title: "Sign in" };

/**
 * The front door. A club not on MyOtherApp yet finds its way in from here too.
 * Already signed in, it goes where `?next=` said (a path on this site only):
 * an assistant's "Confirm in dashboard" link lands back on its request.
 */
export default async function LoginPage({ searchParams }: { searchParams?: Promise<{ next?: string | string[] }> } = {}) {
  const session = await getSessionQuietly();
  if (session?.user_type === "club") {
    const { next } = (await searchParams) ?? {};
    redirect(safeNext(Array.isArray(next) ? next[0] : next));
  }

  return (
    <AuthFrame
      headline="Everything your club runs, in one place."
      points={["Events, tickets and the people who come", "The door: check-ins, ID cards and the gate", "Money, certificates and the closeout"]}
      foot="One login per club, shared by its committee."
    >
      <h1 className="page-title">Sign in</h1>
      <p className="text-ink-2 mt-1.5 text-[13.5px]">Manage your club and its events.</p>

      <div className="mt-7">
        {/* useSearchParams in LoginForm requires a Suspense boundary. */}
        <Suspense fallback={<Skeleton className="h-[236px] w-full rounded-2xl" />}>
          <LoginForm usernamePlaceholder="your_club" />
        </Suspense>
      </div>

      <p className="text-ink-3 mt-6 text-[13px]">
        New club?{" "}
        <Link href="/signup" className="text-brand font-medium">
          Apply to join
        </Link>
      </p>
    </AuthFrame>
  );
}
