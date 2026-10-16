"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2Icon } from "lucide-react";
import { Button, EmptyState, FigurePanel, Notice, Skeleton } from "@moa/ui";

import { useAcceptInvite, useInvitePreview } from "../queries";
import { MIN_PASSWORD } from "../schemas";

const label = "eyebrow mb-1.5 block";

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <main className="bg-canvas grid min-h-dvh place-items-center px-4 py-10">
      <div className="flex w-full max-w-[440px] flex-col gap-4">
        <div className="flex items-center gap-2.5">
          <Image src="/brand/icon.png" alt="" width={28} height={28} className="rounded-lg" />
          <span className="text-ink text-[15px] font-semibold tracking-[-0.01em]">MyOtherApp</span>
          <span className="eyebrow">Clubs</span>
        </div>
        {children}
      </div>
    </main>
  );
}

/**
 * Where an invite link lands: whose dashboard, which role, and a name and
 * password to set. Nobody is signed in here; the link is the only key.
 */
export function JoinPage() {
  const token = useSearchParams().get("token") ?? "";
  const preview = useInvitePreview(token);
  const accept = useAcceptInvite(token);
  const [name, setName] = React.useState<string | null>(null);
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  if (!token) {
    return (
      <Frame>
        <EmptyState tone="muted" title="This link is incomplete" description="Open the invite link from your mail again, or ask the club to send a new one." />
      </Frame>
    );
  }
  if (preview.isPending) {
    return (
      <Frame>
        <Skeleton className="h-[360px] rounded-2xl" />
      </Frame>
    );
  }
  if (preview.isError || !preview.data) {
    return (
      <Frame>
        <EmptyState tone="muted" title="This invite link is not valid" description="It may have been used already or replaced by a newer one. Ask the club to send a new invite." />
      </Frame>
    );
  }

  const p = preview.data;
  if (accept.data) {
    return (
      <Frame>
        <FigurePanel className="flex flex-col items-start gap-3 p-6">
          <CheckCircle2Icon className="text-admit size-7" />
          <h1 className="text-ink m-0 text-[20px] font-semibold tracking-[-0.02em]">You&apos;re in</h1>
          <p className="text-ink-2 m-0 text-[13.5px]">
            Sign in with <strong className="text-ink">{accept.data.email}</strong> and the password you just set to open {accept.data.club_name}&apos;s dashboard.
          </p>
          <Button asChild>
            <Link href="/login">Sign in</Link>
          </Button>
        </FigurePanel>
      </Frame>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD) return setError(`Use at least ${MIN_PASSWORD} characters.`);
    if (password !== confirm) return setError("The two passwords don't match.");
    try {
      await accept.mutateAsync({ full_name: (name ?? p.full_name ?? "").trim() || undefined, password });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join. Try again.");
    }
  };

  return (
    <Frame>
      <FigurePanel className="p-6">
        <p className="eyebrow m-0">You&apos;re invited</p>
        <h1 className="text-ink mt-1.5 mb-0 text-[22px] font-semibold tracking-[-0.02em]">Join {p.club_name} on MyOtherApp</h1>
        <div className="border-brand-line bg-brand-soft mt-4 rounded-xl border px-3.5 py-3">
          <div className="text-ink text-[13.5px] font-semibold">{p.role_label}</div>
          <div className="text-ink-2 mt-0.5 text-[12.5px] leading-[1.5]">{p.role_description}</div>
        </div>

        {p.expired ? (
          <Notice tone="caution" className="mt-4">
            This invite has expired. Ask the club to send a new one from its Access page.
          </Notice>
        ) : (
          <form onSubmit={submit} className="mt-5 flex flex-col gap-3.5">
            <label>
              <span className={label}>Email</span>
              <input className="input w-full" value={p.email} readOnly aria-readonly="true" />
            </label>
            <label>
              <span className={label}>Your name</span>
              <input className="input w-full" value={name ?? p.full_name ?? ""} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="name" />
            </label>
            <label>
              <span className={label}>Password</span>
              <input className="input w-full" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
            </label>
            <label>
              <span className={label}>Password again</span>
              <input className="input w-full" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
            </label>
            {error ? <Notice tone="refuse">{error}</Notice> : null}
            <Button type="submit" size="lg" disabled={accept.isPending}>
              {accept.isPending ? "Joining…" : `Join ${p.club_name}`}
            </Button>
            <p className="text-ink-3 m-0 text-[12px]">Already joined? <Link href="/login" className="text-brand">Sign in</Link></p>
          </form>
        )}
      </FigurePanel>
    </Frame>
  );
}
