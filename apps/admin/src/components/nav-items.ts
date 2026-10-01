import {
  AwardIcon,
  BuildingIcon,
  CalendarDaysIcon,
  LayoutDashboardIcon,
  SmileIcon,
  UsersIcon,
  UsersRoundIcon,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Exact match only -- otherwise "/" would light up on every route. */
  exact?: boolean;
}

export const navItems: NavItem[] = [
  { href: "/", label: "Overview", icon: LayoutDashboardIcon, exact: true },
  { href: "/users", label: "Users", icon: UsersIcon },
  { href: "/clubs", label: "Clubs", icon: UsersRoundIcon },
  { href: "/events", label: "Events", icon: CalendarDaysIcon },
  { href: "/organizations", label: "Organisations", icon: BuildingIcon },
  { href: "/badges", label: "Badges", icon: AwardIcon },
  { href: "/avatars", label: "Avatars", icon: SmileIcon },
];

export function isActive(pathname: string, item: NavItem): boolean {
  return item.exact ? pathname === item.href : pathname.startsWith(item.href);
}
