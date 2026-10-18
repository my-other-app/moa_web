import {
  AwardIcon,
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
  ShieldCheckIcon,
  SmileIcon,
  TagIcon,
  Trash2Icon,
  TrendingUpIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";

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
}

/**
 * The v2 rail: eighteen destinations in five groups.
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

  { href: "/badges", label: "Badges", icon: AwardIcon, group: "Catalogue" },
  { href: "/interests", label: "Interests", icon: TagIcon },
  { href: "/avatars", label: "Avatars", icon: SmileIcon },

  { href: "/announcements", label: "Announcements", icon: BellIcon, group: "Comms" },
  { href: "/notifications", label: "Notifications", icon: InboxIcon },
  // What app users reported, beside the platform's own alerts: both are things that came in and want an admin.
  { href: "/reports", label: "Reports", icon: FlagIcon, badge: "openReports" },
  { href: "/activity", label: "Activity", icon: ClockIcon },

  { href: "/trash", label: "Trash", icon: Trash2Icon, group: "System" },
  { href: "/security", label: "Security", icon: ShieldCheckIcon },
];

export function isActive(pathname: string, item: NavItem): boolean {
  return item.exact ? pathname === item.href : pathname.startsWith(item.href);
}
