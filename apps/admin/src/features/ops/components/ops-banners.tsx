"use client";

import Link from "next/link";
import { Notice } from "@moa/ui";

import { useOpsMe } from "../queries";
import { graceNotice } from "../schemas";

/**
 * Above every page: the maintenance line an owner set on the Settings page,
 * and, for an admin without two-factor still inside their grace, the date
 * the portal closes to them. Nothing at all on a backend without the probe.
 */
export function OpsBanners() {
  const { data } = useOpsMe();
  if (!data) return null;
  const banner = data.maintenance_banner?.trim();
  const grace = graceNotice(data.two_factor);
  if (!banner && !grace) return null;
  return (
    <div className="flex flex-col gap-2">
      {banner ? (
        <Notice tone="caution" tag="Notice">
          {banner}
        </Notice>
      ) : null}
      {grace ? (
        <Notice
          tone="caution"
          tag="Two-factor"
          action={
            <Link href="/security" className="text-ink font-medium underline underline-offset-2">
              Set it up
            </Link>
          }
        >
          {grace}
        </Notice>
      ) : null}
    </div>
  );
}
