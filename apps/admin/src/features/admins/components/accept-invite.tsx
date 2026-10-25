"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2Icon, KeyRoundIcon, Loader2Icon } from "lucide-react";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label, Notice, Skeleton } from "@moa/ui";

import { acceptInvite, checkInvite } from "../api";
import { MIN_ADMIN_PASSWORD, acceptInputSchema } from "../schemas";

/**
 * An invited admin's link: whom it is for, then the password they will sign
 * in with. No session needed (they have none yet); the link's token is the
 * proof. A used, expired or unknown link says so, in the API's own words.
 */
export function AcceptInvite({ token }: { token: string | null }) {
  const check = useQuery({
    queryKey: ["admin-invite", token],
    queryFn: () => checkInvite(token!),
    enabled: Boolean(token),
    retry: false,
  });
  const accept = useMutation({ mutationFn: (password: string) => acceptInvite(token!, password) });
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = acceptInputSchema.safeParse({ password, confirm });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the password");
      return;
    }
    setError(null);
    accept.mutate(parsed.data.password, { onError: (e) => setError(e.message) });
  }

  let body: React.ReactNode;
  if (!token) {
    body = <Notice tone="refuse">This link is missing its code. Open it from the email again.</Notice>;
  } else if (check.isPending) {
    body = <Skeleton className="h-40 w-full" />;
  } else if (check.isError) {
    body = <Notice tone="refuse">{check.error.message || "This link is not valid. Ask an owner for a new one."}</Notice>;
  } else if (accept.isSuccess) {
    body = (
      <div className="flex flex-col items-start gap-3">
        <Notice tone="admit" tag="Done">
          Your password is set. Sign in as {check.data.email}; you will set up two-factor sign-in next.
        </Notice>
        <Button asChild>
          <Link href="/login">
            <CheckCircle2Icon /> Sign in
          </Link>
        </Button>
      </div>
    );
  } else {
    body = (
      <form onSubmit={submit} className="flex flex-col gap-4">
        <p className="text-ink-2 m-0 text-sm">
          For <strong>{check.data.email}</strong>
          {check.data.role ? ` (${check.data.role})` : ""}.{" "}
          {check.data.has_password ? "You can also sign in with the password you have; setting one here replaces it." : ""}
        </p>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="new-password">New password</Label>
          <Input id="new-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <p className="text-ink-3 m-0 text-xs">At least {MIN_ADMIN_PASSWORD} characters.</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="confirm-password">Type it again</Label>
          <Input id="confirm-password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </div>
        {error ? <Notice tone="refuse">{error}</Notice> : null}
        <Button type="submit" disabled={accept.isPending}>
          {accept.isPending ? <Loader2Icon className="animate-spin" /> : <KeyRoundIcon />} Set password
        </Button>
      </form>
    );
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="space-y-1">
        <CardTitle className="text-xl">Set your admin password</CardTitle>
        <CardDescription>MyOtherApp&apos;s admin portal.</CardDescription>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}
