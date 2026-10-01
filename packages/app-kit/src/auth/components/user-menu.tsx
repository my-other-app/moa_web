"use client";

import { useRouter } from "next/navigation";
import { LogOutIcon, MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import type { SessionUser } from "@moa/auth";
import {
  Avatar,
  AvatarFallback,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@moa/ui";

import { initials } from "../../format";
import { useLogout } from "../queries";

export function UserMenu({ user }: { user: SessionUser }) {
  const router = useRouter();
  const logout = useLogout();
  const { theme, setTheme } = useTheme();

  async function onSignOut() {
    await logout.mutateAsync();
    router.replace("/login");
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full transition-transform duration-200 hover:scale-105 motion-reduce:hover:scale-100"
          aria-label="Account menu"
        >
          <Avatar className="size-8">
            <AvatarFallback className="text-xs font-medium">
              {initials(user.full_name ?? user.username)}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">
              {user.full_name ?? user.username}
            </span>
            <span className="text-muted-foreground truncate text-xs">
              {user.email}
            </span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => setTheme("light")}>
          <SunIcon /> Light {theme === "light" ? "·" : ""}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>
          <MoonIcon /> Dark {theme === "dark" ? "·" : ""}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}>
          <MonitorIcon /> System {theme === "system" ? "·" : ""}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={onSignOut}
          disabled={logout.isPending}
          variant="destructive"
        >
          <LogOutIcon /> {logout.isPending ? "Signing out…" : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
