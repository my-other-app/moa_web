"use client";

import * as React from "react";
import { CheckCircle2Icon, CopyIcon, Loader2Icon, ShieldCheckIcon } from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Skeleton,
  StatusBadge,
  cn,
  toast,
} from "@moa/ui";
import { pressable } from "@moa/ui/motion";

import {
  useDisableTotp,
  useEnableTotp,
  useStartTotpSetup,
  useTotpStatus,
} from "../queries";

/**
 * Two-factor enrolment.
 *
 * A stolen admin password was the whole chain -- impersonation, refunds and
 * deletion all sit behind it. Enrolment is two steps so the secret is only
 * enabled once a code from it has been read back; enabling on generation
 * would lock out anyone whose authenticator failed to scan.
 */
export function TwoFactorPanel() {
  const { data: status, isPending } = useTotpStatus();
  const start = useStartTotpSetup();
  const enable = useEnableTotp();
  const disable = useDisableTotp();

  const [code, setCode] = React.useState("");
  const [recoveryCodes, setRecoveryCodes] = React.useState<string[] | null>(null);

  if (isPending) return <Skeleton className="h-56 w-full" />;

  const enabled = status?.enabled ?? false;
  const setup = start.data;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Two-factor authentication</CardTitle>
            <CardDescription>
              A second step at sign-in, from an authenticator app.
            </CardDescription>
          </div>
          <StatusBadge
            tone={enabled ? "success" : "warning"}
            label={enabled ? "On" : "Off"}
          />
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {recoveryCodes ? (
          <div className="space-y-2 rounded-lg border p-4">
            <p className="flex items-center gap-2 text-sm font-medium">
              <CheckCircle2Icon className="size-4 text-emerald-600" />
              Save these recovery codes now
            </p>
            <p className="text-muted-foreground text-xs">
              Each works once if you lose your authenticator.{" "}
              <strong>They are not shown again</strong> — only hashes are stored.
            </p>
            <div className="grid gap-1 sm:grid-cols-2">
              {recoveryCodes.map((rc) => (
                <code key={rc} className="bg-muted rounded px-2 py-1 text-sm">
                  {rc}
                </code>
              ))}
            </div>
            <Button
              size="sm"
              variant="outline"
              className={pressable}
              onClick={async () => {
                await navigator.clipboard.writeText(recoveryCodes.join("\n"));
                toast.success("Copied");
              }}
            >
              <CopyIcon /> Copy all
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setRecoveryCodes(null)}>
              I have saved them
            </Button>
          </div>
        ) : enabled ? (
          <>
            <p className="text-muted-foreground text-sm">
              {status?.recovery_codes_remaining ?? 0} recovery code
              {status?.recovery_codes_remaining === 1 ? "" : "s"} left.
            </p>
            <div className="flex flex-col gap-1.5 sm:max-w-xs">
              <Label htmlFor="disable-code">
                Enter a current code to turn it off
              </Label>
              <Input
                id="disable-code"
                inputMode="numeric"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
                disabled={disable.isPending}
              />
            </div>
            {/* A code, not just a session: otherwise anyone at an unlocked
                screen could remove the factor it exists to provide. */}
            <Button
              size="sm"
              variant="outline"
              className={cn("text-destructive hover:text-destructive", pressable)}
              disabled={code.length < 6 || disable.isPending}
              onClick={async () => {
                try {
                  await disable.mutateAsync(code);
                } catch {
                  // A wrong code: the hook's onError has said so. Left in
                  // place to correct rather than escaping as an unhandled
                  // promise rejection.
                  return;
                }
                setCode("");
              }}
            >
              {disable.isPending ? <Loader2Icon className="animate-spin" /> : null}
              Turn off
            </Button>
          </>
        ) : setup ? (
          <>
            <p className="text-sm">
              Add this to your authenticator app, then enter the code it shows.
            </p>
            <div className="space-y-1">
              <Label>Setup key</Label>
              <code className="bg-muted block rounded px-2 py-1 text-sm break-all">
                {setup.secret}
              </code>
              <p className="text-muted-foreground text-xs">
                Or open{" "}
                <a
                  href={setup.provisioning_uri}
                  className="underline underline-offset-2"
                >
                  this link
                </a>{" "}
                on the device with your authenticator.
              </p>
            </div>
            <div className="flex flex-col gap-1.5 sm:max-w-xs">
              <Label htmlFor="enable-code">Code from the app</Label>
              <Input
                id="enable-code"
                inputMode="numeric"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
                disabled={enable.isPending}
              />
            </div>
            <Button
              size="sm"
              className={pressable}
              disabled={code.length < 6 || enable.isPending}
              onClick={async () => {
                let result;
                try {
                  result = await enable.mutateAsync(code);
                } catch {
                  // A wrong code: the hook's onError has said so, and the
                  // setup key stays on screen to try again.
                  return;
                }
                setRecoveryCodes(result.recovery_codes);
                setCode("");
                // The setup key is spent: turning two-factor off later
                // deletes it on the server, so it must not come back on
                // screen as if it could be enabled again.
                start.reset();
              }}
            >
              {enable.isPending ? <Loader2Icon className="animate-spin" /> : null}
              Confirm and turn on
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            className={pressable}
            disabled={start.isPending}
            onClick={() => start.mutate()}
          >
            {start.isPending ? (
              <Loader2Icon className="animate-spin" />
            ) : (
              <ShieldCheckIcon />
            )}
            Set up two-factor
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
