"use client";

import Image from "next/image";
import { ExternalLinkIcon } from "lucide-react";
import { SectionTitle, pickImage } from "@moa/app-kit";
import { Card, CardContent } from "@moa/ui";

import type { EventPartner } from "../schemas";

/** "kinetic.example" out of "https://www.kinetic.example/fest": what the link reads as. */
function host(link: string): string {
  try {
    return new URL(link).hostname.replace(/^www\./, "");
  } catch {
    return link;
  }
}

function Tile({ partner }: { partner: EventPartner }) {
  const logo = pickImage(partner.logo, ["medium", "thumbnail", "large", "original"]);
  return (
    <li className="flex min-w-0 items-center gap-3">
      {/* Square and whole, as the public page shows it: never cropped. */}
      <span className="relative grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl border bg-white">
        {logo ? (
          <Image src={logo} alt="" fill sizes="56px" className="object-contain p-1.5" unoptimized />
        ) : (
          <span className="text-muted-foreground text-sm font-semibold">{partner.name.trim().slice(0, 2).toUpperCase()}</span>
        )}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{partner.name}</span>
        {partner.label ? <span className="text-muted-foreground block truncate text-xs">{partner.label}</span> : null}
        {partner.link ? (
          <a href={partner.link} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground inline-flex max-w-full items-center gap-1 truncate text-xs underline-offset-2 hover:underline">
            {host(partner.link)} <ExternalLinkIcon className="size-3 shrink-0" />
          </a>
        ) : null}
      </span>
    </li>
  );
}

function Group({ title, rows }: { title: string; rows: EventPartner[] }) {
  if (!rows.length) return null;
  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        {title} · {rows.length}
      </p>
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label={title}>
        {rows.map((p) => (
          <Tile key={p.id} partner={p} />
        ))}
      </ul>
    </div>
  );
}

/**
 * The event's own sponsors and partners, as its public page lists them:
 * sponsors first, each in the club's order. Read-only; nothing when the event
 * names none (or the server is older and sends neither list).
 */
export function EventPartnersCard({ sponsors, partners }: { sponsors: EventPartner[]; partners: EventPartner[] }) {
  if (!sponsors.length && !partners.length) return null;
  const ordered = (rows: EventPartner[]) => [...rows].sort((a, b) => a.position - b.position || a.id - b.id);
  return (
    <section className="space-y-3" aria-label="Sponsors and partners">
      <SectionTitle>Sponsors &amp; partners</SectionTitle>
      <Card>
        <CardContent className="space-y-5">
          <Group title="Sponsors" rows={ordered(sponsors)} />
          <Group title="Partners" rows={ordered(partners)} />
        </CardContent>
      </Card>
    </section>
  );
}
