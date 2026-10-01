import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { UsersRoundIcon } from "lucide-react";
import { getSession } from "@moa/auth/server";
import { LoginForm } from "@moa/app-kit";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Skeleton } from "@moa/ui";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  const session = await getSession();
  if (session?.user_type === "club") redirect("/");

  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="bg-primary/5 absolute -top-40 left-1/2 size-[36rem] -translate-x-1/2 rounded-full blur-3xl" />
      </div>

      <Card className="animate-in fade-in-0 zoom-in-95 w-full max-w-sm duration-500 motion-reduce:animate-none">
        <CardHeader className="space-y-3 text-center">
          <div className="bg-primary/10 text-primary mx-auto grid size-11 place-items-center rounded-xl">
            <UsersRoundIcon className="size-5" />
          </div>
          <div className="space-y-1">
            <CardTitle className="text-xl">Organiser sign in</CardTitle>
            <CardDescription>Manage your club and its events.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<Skeleton className="h-64 w-full" />}>
            <LoginForm usernamePlaceholder="your_club" />
          </Suspense>
        </CardContent>
      </Card>
    </main>
  );
}
