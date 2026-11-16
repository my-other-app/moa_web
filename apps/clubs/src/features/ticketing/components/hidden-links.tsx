"use client";

import { CopyIcon, EyeOffIcon } from "lucide-react";
import { CardLabel, FigurePanel, toast } from "@moa/ui";

import { hiddenTypeLink, priceText, type TicketType } from "../schemas";

/**
 * Hidden ticket types (comp, speaker, staff) are sold only through their own
 * link: the event page's address with the type and a key the server made for
 * it. A link that only names the type doesn't sell it. Copy it here and send
 * it to the people the type is for.
 */
export async function copyTypeLink(link: string, name: string) {
  try {
    await navigator.clipboard.writeText(link);
    toast.success(`Link for “${name}” copied`);
  } catch {
    toast.error("Could not copy: select the link and copy it by hand.");
  }
}

export function CopyTypeLinkButton({ link, name, className = "btn btn-secondary btn-sm" }: { link: string; name: string; className?: string }) {
  return (
    <button type="button" className={className} onClick={() => void copyTypeLink(link, name)} aria-label={`Copy the link for ${name}`}>
      <CopyIcon className="size-4" /> Copy link
    </button>
  );
}

/** The Tickets tab's list of hidden types, each with its link to copy. Nothing when the event has none (or no links). */
export function HiddenTypeLinksPanel({ types }: { types: TicketType[] }) {
  const rows = types.map((t) => ({ t, link: hiddenTypeLink(t) })).filter((r): r is { t: TicketType; link: string } => r.link !== null);
  if (!rows.length) return null;
  return (
    <FigurePanel>
      <CardLabel>Links for hidden tickets</CardLabel>
      <p className="text-ink-3 mt-1 text-[12.5px]">These tickets aren&rsquo;t on the event page. Send each link only to the people it is for: anyone with the link can register with that ticket.</p>
      <ul className="mt-3 grid gap-2" aria-label="Links for hidden tickets">
        {rows.map(({ t, link }) => (
          <li key={t.id} className="border-line flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed px-3 py-2">
            <div className="min-w-0">
              <p className="text-ink flex items-center gap-1.5 text-[13px] font-medium">
                <EyeOffIcon className="text-ink-3 size-3.5" /> {t.name}
              </p>
              <p className="text-ink-3 truncate font-mono text-[11px]" title={link}>
                {priceText(t.price)} · {link}
              </p>
            </div>
            <CopyTypeLinkButton link={link} name={t.name} />
          </li>
        ))}
      </ul>
    </FigurePanel>
  );
}
