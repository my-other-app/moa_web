export interface NavItem {
  href: string;
  label: string;
  /** File name in /public/icons, exported from the design. */
  icon: string;
  exact?: boolean;
}

/**
 * The rail from the design (node 3:791): four destinations plus a sign-out
 * action, icon-only. Overview is deliberately not a rail item — the design has
 * no icon for it — so it stays reachable through the logo at the top.
 */
export const navItems: NavItem[] = [
  { href: "/events", label: "Events", icon: "ticket-01" },
  { href: "/templates", label: "Templates", icon: "edit-04" },
  { href: "/followers", label: "Followers", icon: "users-01" },
  { href: "/announcements", label: "Announcements", icon: "bell-02" },
  { href: "/profile", label: "Club profile", icon: "building-07" },
];

export function isActive(pathname: string, item: NavItem): boolean {
  return item.exact ? pathname === item.href : pathname.startsWith(item.href);
}
