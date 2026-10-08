import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@moa/ui";

import { UsersV2 } from "@/features/users";

export const metadata: Metadata = { title: "Users" };

export default function UsersPage() {
  return (
    // The v2 screen brings its own header, so PageHeader is deliberately
    // absent -- as on the Overview.
    //
    // useSearchParams inside it needs a Suspense boundary: the filters live
    // in the URL, which makes the whole screen a dynamic render.
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <UsersV2 />
    </Suspense>
  );
}
