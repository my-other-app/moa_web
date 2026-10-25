"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LockIcon } from "lucide-react";
import { Button, FigurePanel } from "@moa/ui";

import { useAccess } from "../queries";
import type { Cap } from "../schemas";

/**
 * Pages a role may not open, by path. Mirrors the server's rules; the server refusing is what holds.
 * `appliesIf`: the rule holds only when the server says so -- one without WhatsApp (its caps don't
 * mention it, `whatsapp_known` false) refuses no role there; the pages say it isn't available yet.
 */
const RULES: { test: (path: string) => boolean; needs: Cap; what: string; appliesIf?: Cap }[] = [
  { test: (p) => p === "/finance" || /^\/events\/\d+\/finance(\/|$)/.test(p), needs: "money", what: "Finance" },
  { test: (p) => /^\/events\/\d+\/payments(\/|$)/.test(p), needs: "money", what: "the event's payments" },
  { test: (p) => p === "/access" || p.startsWith("/access/"), needs: "see_access", what: "Access" },
  { test: (p) => p === "/profile" || p.startsWith("/profile/"), needs: "club_profile", what: "the club profile" },
  { test: (p) => /^\/(followers|threads|announcements|emails|links|website|templates|merchandise)(\/|$)/.test(p), needs: "edit_events", what: "this page" },
  { test: (p) => p === "/whatsapp" || p.startsWith("/whatsapp/"), needs: "whatsapp", what: "WhatsApp", appliesIf: "whatsapp_known" },
  { test: (p) => p === "/mail" || p.startsWith("/mail/"), needs: "mail", what: "Mail", appliesIf: "mail_known" },
  { test: (p) => p === "/contacts" || p.startsWith("/contacts/"), needs: "contacts", what: "the contact book" },
];

export function blockedBy(path: string, can: Partial<Record<Cap, boolean>>) {
  return RULES.find((r) => r.test(path) && !can[r.needs] && !(r.appliesIf && can[r.appliesIf] === false)) ?? null;
}

/** Wraps every dashboard page: a page the signed-in role cannot use says so instead of failing request by request. */
export function RouteGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const access = useAccess();
  const rule = blockedBy(pathname, access.can);
  if (!rule) return <>{children}</>;
  return (
    <FigurePanel className="mx-auto mt-10 flex max-w-[520px] flex-col items-start gap-3 p-6">
      <span className="bg-sunken text-ink-2 grid size-10 place-items-center rounded-xl">
        <LockIcon className="size-4" />
      </span>
      <h2 className="text-ink m-0 text-[18px] font-semibold tracking-[-0.01em]">
        Your role can&apos;t open {rule.what}
      </h2>
      <p className="text-ink-2 m-0 text-[13px] leading-[1.55]">
        You&apos;re signed in as {access.roleLabel.toLowerCase()}. Ask the club&apos;s owner if you need it.
      </p>
      <Button variant="secondary" asChild>
        <Link href="/">Back to the dashboard</Link>
      </Button>
    </FigurePanel>
  );
}
