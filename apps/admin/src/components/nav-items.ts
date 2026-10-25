import {
  AwardIcon,
  BanknoteIcon,
  BellIcon,
  BuildingIcon,
  CalendarDaysIcon,
  ClockIcon,
  CreditCardIcon,
  CrownIcon,
  GlobeIcon,
  FlagIcon,
  GraduationCapIcon,
  InboxIcon,
  LandmarkIcon,
  LayoutGridIcon,
  ListChecksIcon,
  MailXIcon,
  MegaphoneIcon,
  MessageSquareTextIcon,
  ScaleIcon,
  Settings2Icon,
  ShieldCheckIcon,
  SmileIcon,
  TagIcon,
  Trash2Icon,
  TrendingUpIcon,
  UserCogIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";

import type { OpsFeature } from "@/features/ops/schemas";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Group heading rendered above this item, when it starts a group. */
  group?: string;
  /** Exact match only -- otherwise "/" would light up on every route. */
  exact?: boolean;
  /**
   * Which count to show, if any: one from the overview payload, or
   * `openReports`, which the rail asks for itself every minute.
   */
  badge?: "pendingClubs" | "users" | "events" | "trash" | "openReports";
  /**
   * An operator tool the backend may not have yet: shown only once
   * GET /admin/ops/me lists it, so a portal deployed ahead of its API never
   * offers a page that would 404.
   */
  feature?: OpsFeature;
}

/**
 * The v2 rail: eighteen destinations in five groups, and the operator
 * tools (`feature`) once the backend has them.
 *
 * Grouping is the change from v1's flat list. Fourteen unlabelled siblings is
 * a list you scan; five groups of two to five is a structure you learn, and it
 * is what lets Subscriptions sit next to Payments rather than alphabetically
 * adrift.
 */
export const navItems: NavItem[] = [
  { href: "/", label: "Overview", icon: LayoutGridIcon, group: "Platform", exact: true },
  { href: "/users", label: "Users", icon: UsersIcon, badge: "users" },
  { href: "/clubs", label: "Clubs", icon: BuildingIcon, badge: "pendingClubs" },
  // Club websites on domains of their own. Not under /clubs: that prefix would light Clubs too.
  { href: "/club-domains", label: "Club domains", icon: GlobeIcon },
  { href: "/organizations", label: "Organisations", icon: GraduationCapIcon },
  { href: "/events", label: "Events", icon: CalendarDaysIcon, badge: "events" },

  { href: "/payments", label: "Payments", icon: CreditCardIcon, group: "Money" },
  // Clubs taking ticket payments in their own Razorpay account. Not under /payments: that prefix would light Payments too.
  { href: "/payment-gateways", label: "Club gateways", icon: LandmarkIcon },
  { href: "/subscriptions", label: "Subscriptions", icon: CrownIcon },
  { href: "/revenue", label: "Revenue", icon: TrendingUpIcon },
  // What MyOtherApp owes clubs for sales on its own Razorpay, and what it paid them.
  { href: "/payouts", label: "Payouts", icon: BanknoteIcon, feature: "payouts" },
  { href: "/disputes", label: "Disputes", icon: ScaleIcon, feature: "disputes" },

  { href: "/badges", label: "Badges", icon: AwardIcon, group: "Catalogue" },
  // Topics and the interests under them. The address stays /interests so old links still land.
  { href: "/interests", label: "Topics", icon: TagIcon },
  { href: "/avatars", label: "Avatars", icon: SmileIcon },

  { href: "/announcements", label: "Announcements", icon: BellIcon, group: "Comms" },
  { href: "/notifications", label: "Notifications", icon: InboxIcon },
  // What app users reported, beside the platform's own alerts: both are things that came in and want an admin.
  { href: "/reports", label: "Reports", icon: FlagIcon, badge: "openReports" },
  { href: "/activity", label: "Activity", icon: ClockIcon },
  { href: "/push", label: "Push", icon: MegaphoneIcon, feature: "push" },
  { href: "/mail-suppressions", label: "Mail suppressions", icon: MailXIcon, feature: "suppressions" },
  { href: "/whatsapp-templates", label: "WhatsApp templates", icon: MessageSquareTextIcon, feature: "whatsapp_templates" },

  { href: "/trash", label: "Trash", icon: Trash2Icon, group: "System" },
  { href: "/security", label: "Security", icon: ShieldCheckIcon },
  { href: "/admins", label: "Admins", icon: UserCogIcon, feature: "admins" },
  { href: "/settings", label: "Settings", icon: Settings2Icon, feature: "settings" },
  { href: "/jobs", label: "Jobs", icon: ListChecksIcon, feature: "jobs" },
];

/** The rail's items this backend has: every plain item, and each tool `features` lists. */
export function visibleNavItems(features: readonly string[] | null | undefined): NavItem[] {
  return navItems.filter((item) => !item.feature || Boolean(features?.includes(item.feature)));
}

export function isActive(pathname: string, item: NavItem): boolean {
  return item.exact ? pathname === item.href : pathname.startsWith(item.href);
}
