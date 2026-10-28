import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getSessionQuietly } from "@moa/auth/server";
import { LoginForm, safeNext, type GoogleSignInOptions } from "@moa/app-kit";
import { Notice, Skeleton } from "@moa/ui";

import { AuthFrame } from "@/components/auth-frame";

export const metadata: Metadata = { title: "Sign in" };

/**
 * "Continue with Google" (when the build has a Google client id) opens the
 * dashboard of a club whose login, or one of whose team members, uses that
 * Google address. It never makes an account.
 */
const GOOGLE: GoogleSignInOptions = {
  scope: "club",
  noAccountMessage:
    "No club dashboard uses this Google account. Sign in with your email and password, or ask your club's owner to invite this address.",
};

/**
 * The front door. A club not on MyOtherApp yet finds its way in from here too.
 * Already signed in, it goes where `?next=` said (a path on this site only):
 * an assistant's "Confirm in dashboard" link lands back on its request.
 */
export default async function LoginPage({ searchParams }: { searchParams?: Promise<{ next?: string | string[]; reset?: string | string[] }> } = {}) {
  const session = await getSessionQuietly();
  const params = (await searchParams) ?? {};
  if (session?.user_type === "club") {
    const { next } = params;
    redirect(safeNext(Array.isArray(next) ? next[0] : next));
  }
  // Back from /forgot-password with the new password set.
  const reset = (Array.isArray(params.reset) ? params.reset[0] : params.reset) === "1";

  return (
    <AuthFrame
      headline="Everything your club runs, in one place."
      points={["Events, tickets and the people who come", "The door: check-ins, ID cards and the gate", "Money, certificates and the closeout"]}
      foot="One login per club, shared by its committee."
    >
      <h1 className="page-title">Sign in</h1>
      <p className="text-ink-2 mt-1.5 text-[13.5px]">Manage your club and its events.</p>

      {reset ? (
        <Notice tone="admit" className="mt-5">
          Your password is changed. Sign in with the new one.
        </Notice>
      ) : null}

      <div className="mt-7">
        {/* useSearchParams in LoginForm requires a Suspense boundary. */}
        <Suspense fallback={<Skeleton className="h-[236px] w-full rounded-2xl" />}>
          <LoginForm usernamePlaceholder="your_club" forgotPasswordHref="/forgot-password" google={GOOGLE} />
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
