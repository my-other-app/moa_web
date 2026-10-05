"use client";

import { useRouter } from "next/navigation";
import { Loader2Icon, LogOutIcon, MonitorIcon } from "lucide-react";
import { formatDateTime } from "@moa/app-kit";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  Skeleton,
  cn,
} from "@moa/ui";
import { hoverLift, pressable, stagger } from "@moa/ui/motion";

import { useRevokeAllSessions, useRevokeSession, useSessions } from "../queries";

/**
 * Where this account is signed in.
 *
 * `token_version` could already end every session at once, which is right for
 * a password change and wrong for "sign out my old laptop" -- there was no
 * way to see what existed, let alone end one of them.
 */
function describe(userAgent: string | null | undefined): string {
  if (!userAgent) return "Unknown device";
  // A user agent is a poor name for a device, but it is the only thing the
  // browser actually tells us.
  if (/iPhone|iPad/i.test(userAgent)) return "iOS";
  if (/Android/i.test(userAgent)) return "Android";
  if (/Mac OS X/i.test(userAgent)) return "Mac";
  if (/Windows/i.test(userAgent)) return "Windows";
  if (/Linux/i.test(userAgent)) return "Linux";
  return "Unknown device";
}

export function SessionsPanel() {
  const router = useRouter();
  const { data, isPending, isError } = useSessions();
  const revoke = useRevokeSession();
  const revokeAll = useRevokeAllSessions();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Active sessions</CardTitle>
        <CardDescription>
          Everywhere this account is currently signed in.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {isPending ? (
          Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))
        ) : isError ? (
          <EmptyState
            tone="muted"
            title="Could not load sessions"
            description="Try reloading."
          />
        ) : (data?.length ?? 0) === 0 ? (
          <EmptyState
            tone="muted"
            title="No recorded sessions"
            description="Sessions started before this feature existed are not listed."
          />
        ) : (
          <>
            {data!.map((session, i) => (
              <div
                key={session.id}
                style={stagger(i)}
                className={cn(
                  "animate-in fade-in-0 flex items-center gap-3 rounded-lg border p-3 duration-300 motion-reduce:animate-none",
                  hoverLift
                )}
              >
                <MonitorIcon className="text-muted-foreground size-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 truncate text-sm font-medium">
                    {describe(session.user_agent)}
                    {session.current ? (
                      <Badge variant="secondary">This device</Badge>
                    ) : null}
                  </p>
                  <p className="text-muted-foreground truncate text-xs">
                    {session.ip_address ?? "Unknown address"} · last seen{" "}
                    {formatDateTime(session.last_seen_at ?? session.created_at)}
                  </p>
                </div>
                {/* The current session is not individually revocable -- ending
                    the one you are using is what "sign out everywhere" is for. */}
                {session.current ? null : (
                  <Button
                    size="xs"
                    variant="outline"
                    className={pressable}
                    disabled={revoke.isPending}
                    onClick={() => revoke.mutate(session.id)}
                  >
                    {revoke.isPending ? (
                      <Loader2Icon className="animate-spin" />
                    ) : (
                      <LogOutIcon />
                    )}
                    Sign out
                  </Button>
                )}
              </div>
            ))}

            <Button
              size="sm"
              variant="outline"
              className={cn("text-destructive hover:text-destructive", pressable)}
              disabled={revokeAll.isPending}
              onClick={async () => {
                await revokeAll.mutateAsync();
                // This session ends too, so there is nowhere to stay.
                router.replace("/login");
                router.refresh();
              }}
            >
              {revokeAll.isPending ? <Loader2Icon className="animate-spin" /> : null}
              Sign out everywhere, including here
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
