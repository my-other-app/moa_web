"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LockIcon } from "lucide-react";
import { cn } from "@moa/ui";

import { useAccess } from "@/features/access";
import { useContactsOnServer } from "@/features/contacts";
import { useMailSummary, useMailboxOnServer } from "@/features/mailbox/queries";
import { usePlan } from "@/features/plan";
import { useTicketingOnServer } from "@/features/ticketing/queries";
import { useSummary, useUnreadTitle, useWhatsAppOnServer } from "@/features/whatsapp";

import { NAV_GROUPS, isActive, navItems, type NavItem } from "./nav-items";

/**
 * The rail's items: an icon tile and a label, the current one lit.
 *
 * The active item carries three marks at once — a soft brand tint, the
 * brand colour on its text, and the tile filled — plus a 4px bar on the
 * leading edge that grows into place. Collapsed, only the tiles remain and
 * the label becomes the title.
 *
 * The day's work comes first, ungrouped; Grow and Manage sit under their
 * own headings, so the rail reads as three short lists rather than one
 * long one.
 */
export function SidebarNav({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const { can } = useAccess();
  const plan = usePlan();
  // Asked only of those who may open WhatsApp; shared with its pages' read of the account.
  const whatsapp = useWhatsAppOnServer(Boolean(can.whatsapp));
  // Club mailboxes: shown once the API has them and has them switched on (its status says `available`).
  const mailbox = useMailboxOnServer(Boolean(can.mail));
  // Discount codes, for those who may edit events: asked once, shared with the codes page.
  const ticketing = useTicketingOnServer(Boolean(can.edit_events));
  // The contact book, asked only of those who may open it.
  const contacts = useContactsOnServer(Boolean(can.contacts));
  const onServer = { whatsapp, mailbox, ticketing, contacts };
  // What waits unread in the inbox, for those who may read it: on the item and in the tab's title.
  const summary = useSummary(Boolean(can.whatsapp_inbox) && whatsapp === true);
  const unread = summary.data?.unread_total ?? 0;
  // The mailbox's Inbox the same, for those with the Mail permission.
  const mailSummary = useMailSummary(Boolean(can.mail_inbox) && mailbox === true);
  const mailUnread = mailSummary.data?.unread_total ?? 0;
  useUnreadTitle(unread + mailUnread);
  // A role sees only what it can open; the club's own account sees everything. A section
  // whose backend isn't deployed yet waits until the API is known to have it.
  const visible = navItems.filter((i) => (!i.needs || can[i.needs]) && (!i.server || onServer[i.server] === true));
  const sections: { key: string; label: string; items: NavItem[] }[] = [
    { key: "main", label: "Menu", items: visible.filter((i) => !i.group) },
    ...NAV_GROUPS.map((g) => ({ key: g.key, label: g.label, items: visible.filter((i) => i.group === g.key) })),
  ].filter((s) => s.items.length > 0);

  return (
    <nav aria-label="Main" className="flex flex-col gap-4 px-3">
      {sections.map((section) => (
        <div key={section.key}>
          <div className={cn("eyebrow px-2 pb-2.5 tracking-[0.14em]", collapsed && "hidden")}>{section.label}</div>
          {collapsed && section.key !== "main" && <div aria-hidden="true" className="bg-line-soft mx-2 mb-2 h-px" />}
          <ul className="flex flex-col gap-0.5">
            {section.items.map((item) => {
              const on = isActive(pathname, item);
              const lock = item.feature ? plan.featureLock(item.feature) : null;
              const count = item.server === "whatsapp" ? unread : item.server === "mailbox" ? mailUnread : 0;
              const hint = lock
                ? `${item.label} · part of ${lock.requiredPlanName ?? "a bigger plan"} and up`
                : count
                  ? `${item.label} · ${count} unread`
                  : item.label;
              return (
                <li key={item.href} className="relative">
                  <span
                    aria-hidden="true"
                    className={cn("bg-brand absolute top-1/2 -left-3 w-1 -translate-y-1/2 rounded-r-full transition-[height] duration-200", on ? "h-5" : "h-0")}
                  />
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={on ? "page" : undefined}
                    title={hint}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-[14px] px-2.5 py-[8px] text-left text-[13.5px] transition-colors duration-150",
                      on ? "bg-brand-soft text-brand font-semibold" : "text-ink-2 hover:bg-sunken hover:text-ink",
                      collapsed && "justify-center px-0"
                    )}
                  >
                    <span className={cn("relative grid size-8 shrink-0 place-items-center rounded-[10px] transition-colors duration-150", on ? "bg-brand text-brand-foreground" : "bg-raised text-ink-2")}>
                      <item.icon className="size-[17px]" />
                      {count && collapsed ? <span aria-hidden="true" className="bg-refuse ring-surface absolute -top-0.5 -right-0.5 size-2.5 rounded-full ring-2" /> : null}
                    </span>
                    <span className={cn("flex-1 truncate", collapsed && "hidden")}>{item.label}</span>
                    {count ? (
                      <span
                        data-testid={`${item.server ?? "item"}-unread`}
                        className={cn(
                          "bg-refuse shrink-0 rounded-full px-1.5 font-mono text-[10.5px] leading-[18px] font-semibold text-white tabular-nums",
                          collapsed && "sr-only",
                        )}
                      >
                        {count > 99 ? "99+" : count}
                        <span className="sr-only"> unread</span>
                      </span>
                    ) : null}
                    {lock ? (
                      <LockIcon
                        role="img"
                        aria-label={`Locked: part of ${lock.requiredPlanName ?? "a bigger plan"} and up`}
                        className={cn("text-ink-3 size-3.5 shrink-0", collapsed && "hidden")}
                      />
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
