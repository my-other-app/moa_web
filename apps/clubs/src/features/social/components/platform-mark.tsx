import { cn } from "@moa/ui";

import { PLATFORM_LABEL, type Platform } from "../schemas";

/**
 * Each platform's mark on its own colour, drawn here rather than taken from
 * lucide: its brand icons are deprecated and leave in v1, and X never had
 * one. Simple shapes, so they read at 16px and in both themes.
 */
const TILE: Record<Platform, string> = {
  instagram: "bg-[linear-gradient(45deg,#f9a825_0%,#e1306c_55%,#833ab4_100%)] text-white",
  facebook: "bg-[#1877f2] text-white",
  linkedin: "bg-[#0a66c2] text-white",
  linkedin_page: "bg-[#0a66c2] text-white",
  x: "bg-ink text-surface",
};

function Glyph({ platform, className }: { platform: Platform; className?: string }) {
  const common = { viewBox: "0 0 24 24", "aria-hidden": true, className } as const;
  switch (platform) {
    case "instagram":
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth={2}>
          <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none" />
        </svg>
      );
    case "facebook":
      return (
        <svg {...common} fill="currentColor">
          <path d="M13.6 21v-7.6h2.6l.4-3h-3V8.5c0-.9.3-1.5 1.5-1.5h1.6V4.3c-.3 0-1.2-.1-2.3-.1-2.3 0-3.9 1.4-3.9 4v2.2H7.9v3h2.6V21h3.1Z" />
        </svg>
      );
    case "linkedin":
    case "linkedin_page":
      return (
        <svg {...common} fill="currentColor">
          <circle cx="6.4" cy="6" r="1.8" />
          <path d="M4.9 9.2h3v10.3h-3zM10.3 9.2h2.9v1.4c.4-.8 1.5-1.6 3.1-1.6 3.2 0 3.8 2.1 3.8 4.8v5.7h-3v-5c0-1.2 0-2.7-1.7-2.7s-1.9 1.3-1.9 2.6v5.1h-3z" />
        </svg>
      );
    case "x":
      return (
        <svg {...common} fill="currentColor">
          <path d="M4 4h4.6l11.4 16h-4.6z" />
          <path d="M18.6 4h1.9l-6.7 7.6-1-1.3zM10.3 13.2l1 1.3L5.4 20H3.5z" />
        </svg>
      );
  }
}

export function PlatformMark({ platform, size = "md", className }: { platform: Platform; size?: "sm" | "md" | "lg"; className?: string }) {
  const box = size === "sm" ? "size-5 rounded-[6px]" : size === "lg" ? "size-10 rounded-xl" : "size-7 rounded-lg";
  const glyph = size === "sm" ? "size-3" : size === "lg" ? "size-5" : "size-4";
  return (
    <span role="img" aria-label={PLATFORM_LABEL[platform]} className={cn("grid shrink-0 place-items-center", box, TILE[platform], className)}>
      <Glyph platform={platform} className={glyph} />
    </span>
  );
}
