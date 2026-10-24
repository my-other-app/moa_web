import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionQuietly } from "@moa/auth/server";

import { AuthFrame } from "@/components/auth-frame";
import { cycleOf, planKeyOf } from "@/features/billing";
import { SignupFlow } from "@/features/signup";

export const metadata: Metadata = { title: "Apply to join" };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * Where a club applies to join. Public: the proxy lets it through without a
 * session. The pricing page links here as /signup?plan=growth&cycle=yearly,
 * and that plan is what the form offers at the end.
 */
export default async function SignupPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await getSessionQuietly();
  if (session?.user_type === "club") redirect("/");

  const params = await searchParams;
  return (
    <AuthFrame
      wide
      headline="Bring your club to MyOtherApp."
      points={["Apply in a few minutes", "We review it, usually within a day", "Then 14 days of Pro free, no card needed"]}
      foot="14 days of Pro free, no card needed. After it, a free plan for small events, or pick a paid one."
    >
      <SignupFlow initialPlan={planKeyOf(first(params.plan))} initialCycle={cycleOf(first(params.cycle))} />
    </AuthFrame>
  );
}
