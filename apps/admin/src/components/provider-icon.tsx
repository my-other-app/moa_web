import { MailIcon, UserIcon } from "lucide-react";

/**
 * Sign-in provider glyphs.
 *
 * Google and Apple are drawn inline rather than imported: lucide dropped
 * brand icons, and pulling in a second icon set for two 24px paths would cost
 * more than the paths do. Both are the vendors' own single-colour marks,
 * which is what their brand guidelines permit at this size.
 */
function GoogleGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M12 11v2.8h6.6c-.3 1.7-2 5-6.6 5a7.3 7.3 0 0 1 0-14.6c2 0 3.5.8 4.3 1.6l2.1-2A10 10 0 1 0 12 22c5.8 0 9.6-4 9.6-9.8 0-.6-.1-1.1-.2-1.6H12Z" />
    </svg>
  );
}

function AppleGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M16.4 12.7c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.7.8-3.4.8-.7 0-1.8-.8-3-.8-1.5 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.3 2.9 2.3 1.1 0 1.6-.7 3-.7s1.8.7 3 .7 2-1.1 2.8-2.2c.9-1.3 1.3-2.5 1.3-2.6-.1 0-2.6-1-2.6-3.8ZM14.2 5.8c.6-.7 1-1.7.9-2.8-.9.1-2 .6-2.7 1.4-.6.6-1 1.7-.9 2.7 1 .1 2-.5 2.7-1.3Z" />
    </svg>
  );
}

/** Falls back to a neutral mark: the column must line up even for nulls. */
export function ProviderIcon({
  provider,
  className = "size-3.5",
}: {
  provider: string | null | undefined;
  className?: string;
}) {
  if (provider === "google") return <GoogleGlyph className={className} />;
  if (provider === "apple") return <AppleGlyph className={className} />;
  if (provider === "email") return <MailIcon className={className} />;
  return <UserIcon className={className} />;
}

export const PROVIDER_LABELS: Record<string, string> = {
  google: "Google",
  apple: "Apple",
  email: "Email",
};

export function providerLabel(provider: string | null | undefined): string {
  if (!provider) return "—";
  return PROVIDER_LABELS[provider] ?? provider;
}
