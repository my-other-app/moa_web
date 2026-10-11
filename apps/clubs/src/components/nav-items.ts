import {
  BellIcon,
  BuildingIcon,
  CalendarDaysIcon,
  LayoutDashboardIcon,
  MailIcon,
  PaletteIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Exact match only -- otherwise "/" would light up on every route. */
  exact?: boolean;
}

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
  { href: "/followers", label: "Followers", icon: UsersIcon },
  { href: "/announcements", label: "Announcements", icon: BellIcon },
  { href: "/emails", label: "Emails", icon: MailIcon },
  { href: "/templates", label: "Templates", icon: PaletteIcon },
  { href: "/profile", label: "Club profile", icon: BuildingIcon },
];

export function isActive(pathname: string, item: NavItem): boolean {
  return item.exact ? pathname === item.href : pathname.startsWith(item.href);
}
