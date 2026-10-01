import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ShieldCheckIcon } from "lucide-react";
import { getSession } from "@moa/auth/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Skeleton } from "@moa/ui";

import { LoginForm } from "@/features/auth";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  // Already signed in as an admin? Skip the form entirely.
  const session = await getSession();
  if (session?.user_type === "admin") redirect("/");

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
        <CardContent>
          {/* useSearchParams in LoginForm requires a Suspense boundary. */}
          <Suspense fallback={<Skeleton className="h-64 w-full" />}>
            <LoginForm />
          </Suspense>
        </CardContent>
      </Card>
    </main>
  );
}
