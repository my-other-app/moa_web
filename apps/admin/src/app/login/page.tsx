import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ShieldCheckIcon } from "lucide-react";
import { getSessionQuietly } from "@moa/auth/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Notice, Skeleton } from "@moa/ui";

import { LoginForm, safeNext, type GoogleSignInOptions } from "@moa/app-kit";

export const metadata: Metadata = { title: "Sign in" };

/**
 * "Continue with Google" (when the build has a Google client id) signs in
 * the admin account with that Google address, two-factor and all. It never
 * makes an account, and an app user's Google account never opens the portal.
 */
const GOOGLE: GoogleSignInOptions = {
  scope: "admin",
  noAccountMessage: "No admin account uses this Google account.",
};

type Query = { next?: string | string[]; error?: string | string[] };
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function LoginPage({ searchParams }: { searchParams?: Promise<Query> } = {}) {
  const query = (await searchParams) ?? {};
  // Already signed in as an admin? Skip the form, to where `?next=` said (a
  // path on this site only), as the clubs dashboard's sign-in does.
  const session = await getSessionQuietly();
  if (session?.user_type === "admin") redirect(safeNext(first(query.next)));
  /*
   * The dashboard's role gate sends a signed-in account that is not an admin
   * (a club, an app user) here with ?error=forbidden. Without a word, the
   * form simply came back after a correct password, as if nothing happened.
   */
  const forbidden = first(query.error) === "forbidden";

  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      {/* Ambient backdrop. Purely decorative, so it is hidden from assistive tech. */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      >
        <div className="bg-primary/5 absolute -top-40 left-1/2 size-[36rem] -translate-x-1/2 rounded-full blur-3xl" />
      </div>

      <Card className="animate-in fade-in-0 zoom-in-95 w-full max-w-sm duration-500 motion-reduce:animate-none">
        <CardHeader className="space-y-3 text-center">
          <div className="bg-primary/10 text-primary mx-auto grid size-11 place-items-center rounded-xl">
            <ShieldCheckIcon className="size-5" />
          </div>
          <div className="space-y-1">
            <CardTitle className="text-xl">Admin sign in</CardTitle>
            <CardDescription>
              Platform administration for My Other App.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {forbidden ? (
            <Notice tone="caution">
              That account is not a platform admin. Sign in with an admin account.
            </Notice>
          ) : null}
          {/* useSearchParams in LoginForm requires a Suspense boundary. */}
          <Suspense fallback={<Skeleton className="h-64 w-full" />}>
            <LoginForm usernamePlaceholder="platform_admin" google={GOOGLE} />
          </Suspense>
        </CardContent>
      </Card>
    </main>
  );
}
