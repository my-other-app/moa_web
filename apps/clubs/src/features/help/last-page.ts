"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

/**
 * The dashboard page the club was on before it opened Help, so a request
 * says where the trouble was. Kept for the tab (sessionStorage, and in
 * memory where storage is off); Help's own pages are never remembered.
 */
const KEY = "moa.help.from";
let memory: string | null = null;

export function rememberPage(path: string | null | undefined): void {
  if (!path || !path.startsWith("/") || path === "/help" || path.startsWith("/help/")) return;
  memory = path;
  try {
    window.sessionStorage.setItem(KEY, path);
  } catch {
    // Storage off (a private window): the memory copy is enough for this visit.
  }
}

export function lastPage(): string | null {
  if (memory) return memory;
  try {
    return window.sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** Mounted once in the shell: every page the club opens is remembered. */
export function useRememberPage(): void {
  const pathname = usePathname();
  React.useEffect(() => rememberPage(pathname), [pathname]);
}
