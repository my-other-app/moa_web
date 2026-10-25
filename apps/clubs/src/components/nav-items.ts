import {
  BanknoteIcon,
  GlobeIcon,
  BellIcon,
  InboxIcon,
  KeyRoundIcon,
  BuildingIcon,
  CalendarDaysIcon,
  CreditCardIcon,
  LayoutDashboardIcon,
  LinkIcon,
  MailIcon,
  MessageCircleIcon,
  MessagesSquareIcon,
  PaletteIcon,
  ShieldCheckIcon,
  ShoppingBagIcon,
  TicketPercentIcon,
  UsersIcon,
  WalletIcon,
  type LucideIcon,
} from "lucide-react";

import type { Cap } from "@/features/access/schemas";

export type NavGroup = "grow" | "manage";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  /** Ungrouped items are the day's work; Grow and Manage sit under their own headings. */
  group?: NavGroup;
  /** What the signed-in role needs to see it at all (see features/access). */
  needs?: Cap;
  /**
   * The plan flag the whole area is for. Without it the item carries a lock
   * but still opens: a club should see what it is missing, and what it
   * already made there stays readable.
   */
  feature?: string;
  /**
   * A section whose backend may not be deployed yet: shown only once the API
   * is known to have its routes (see SidebarNav). The dashboard can then go
   * out ahead of its backend, and the item appears when the backend does.
   */
  server?: "whatsapp" | "mailbox" | "ticketing";
}

export const NAV_GROUPS: { key: NavGroup; label: string }[] = [
  { key: "grow", label: "Grow" },
  { key: "manage", label: "Manage" },
];


/**
 * The rail, now labelled.
 *
 * It was icon-only at 104px, faithful to the design file (node 3:791), with
 * labels only on hover. That makes every destination a guess for anyone who
 * does not already know the icons -- and it hid Overview entirely, which was
 * reachable only by clicking the logo.
 *
 * Icons are components rather than files in /public/icons: a name with no
 * matching SVG used to render an invisible, unlabelled button, and nothing in
 * lint, typecheck or the build said a word. Now a wrong icon will not compile.
 */
export const navItems: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboardIcon, exact: true },
  { href: "/events", label: "Events", icon: CalendarDaysIcon },
  // The club's catalogue: items made once and offered on any event, which share their stock.
  { href: "/merchandise", label: "Merchandise", icon: ShoppingBagIcon, needs: "edit_events", feature: "merch" },
  { href: "/followers", label: "Followers", icon: UsersIcon, needs: "edit_events" },
  { href: "/threads", label: "Threads", icon: MessagesSquareIcon, needs: "edit_events" },
  { href: "/announcements", label: "Announcements", icon: BellIcon, needs: "edit_events" },
  { href: "/emails", label: "Emails", icon: MailIcon, needs: "edit_events" },
  // The club's own WhatsApp number (Enterprise): its inbox, templates and settings. Owners and admins
  // (the connection) and members given the WhatsApp permission (the inbox) see it -- once the API has it.
  { href: "/whatsapp", label: "WhatsApp", icon: MessageCircleIcon, needs: "whatsapp", feature: "whatsapp_own", server: "whatsapp" },
  // The club's mailbox, <handle>@mail.myotherapp.in (Pro and Enterprise): owners and admins (its address) and members given
  // the Mail permission (the mail) see it -- once the API has it and has switched it on.
  { href: "/mail", label: "Mail", icon: InboxIcon, needs: "mail", feature: "mailbox", server: "mailbox" },
  { href: "/links", label: "Tracking links", icon: LinkIcon, group: "grow", needs: "edit_events", feature: "links" },
  // Codes for one event or every event of the club -- once the API has them.
  { href: "/discount-codes", label: "Discount codes", icon: TicketPercentIcon, group: "grow", needs: "edit_events", feature: "coupons", server: "ticketing" },
  { href: "/website", label: "Website", icon: GlobeIcon, group: "grow", needs: "edit_events", feature: "website" },
  { href: "/templates", label: "Templates", icon: PaletteIcon, group: "grow", needs: "edit_events" },
  { href: "/finance", label: "Finance", icon: WalletIcon, group: "manage", needs: "money", feature: "finance" },
  { href: "/access", label: "Access", icon: KeyRoundIcon, group: "manage", needs: "see_access" },
  { href: "/security", label: "Security", icon: ShieldCheckIcon, group: "manage" },
  // Every role may look; only the club's own account can change the plan (the page says so).
  { href: "/billing", label: "Plan & billing", icon: CreditCardIcon, group: "manage" },
  // The club's own Razorpay. Free on every plan, so no lock. The owner and admins may read it (the server's
  // `money`, as with Finance); only the owner changes it.
  { href: "/payments", label: "Payments", icon: BanknoteIcon, group: "manage", needs: "money" },
  { href: "/profile", label: "Club profile", icon: BuildingIcon, group: "manage", needs: "club_profile" },
];

export function isActive(pathname: string, item: NavItem): boolean {
  return item.exact ? pathname === item.href : pathname.startsWith(item.href);
}
