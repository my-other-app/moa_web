import {
  CalendarDaysIcon,
  LayoutDashboardIcon,
  MegaphoneIcon,
  UsersRoundIcon,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
}

export const navItems: NavItem[] = [
  { href: "/", label: "Overview", icon: LayoutDashboardIcon, exact: true },
  { href: "/events", label: "Events", icon: CalendarDaysIcon },
  { href: "/announcements", label: "Announcements", icon: MegaphoneIcon },
  { href: "/profile", label: "Club profile", icon: UsersRoundIcon },
];

export function isActive(pathname: string, item: NavItem): boolean {
  return item.exact ? pathname === item.href : pathname.startsWith(item.href);
}
