"use client";

import * as React from "react";
import { CopyIcon, LockIcon, UserPlusIcon } from "lucide-react";
import {
  Button,
  ChoiceCard,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Notice,
  toast,
} from "@moa/ui";

import { LockBadge, isPlanLockError, openUpgrade, useFeatureGate, useLimitGate } from "@/features/plan";

import { useInvite } from "../queries";
import { DEFAULT_MEMBER_ROLE, type InviteResponse, type MemberRole, type RoleOption } from "../schemas";

const label = "eyebrow mb-1.5 block";

export async function copyLink(url: string) {
  try {
    await navigator.clipboard.writeText(url);
    toast.success("Invite link copied");
  } catch {
    toast.error("Could not copy. Select the link and copy it by hand.");
  }
}

/** The link an invite opens, with a copy button, for when the mail goes astray. */
export function InviteLink({ url }: { url: string }) {
  return (
    <div className="border-brand-line bg-brand-soft flex items-center gap-2 rounded-xl border px-3 py-2.5">
      <span className="text-ink min-w-0 flex-1 truncate font-mono text-[12px]">{url}</span>
      <Button variant="secondary" size="sm" onClick={() => void copyLink(url)}>
        <CopyIcon className="size-3.5" /> Copy
      </Button>
    </div>
  );
}

/**
 * Invite one person: their email, their name if you know it, and a role.
 * They get a mail with a link to set their own password; the link is also
 * shown here once, so it can be sent another way.
 */
export function InviteDialog({ roles, seatsUsed }: { roles: RoleOption[]; seatsUsed?: number | null }) {
  // Every seat taken: the button opens the upgrade dialog. Roles but the default need the plan's `roles`.
  const seats = useLimitGate("committee_seats", seatsUsed);
  const rolesGate = useFeatureGate("roles");
  const [open, setOpen] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [name, setName] = React.useState("");
  const [role, setRole] = React.useState<MemberRole>(DEFAULT_MEMBER_ROLE);
  const [error, setError] = React.useState<string | null>(null);
  const [sent, setSent] = React.useState<InviteResponse | null>(null);
  const invite = useInvite();

  const reset = () => {
    setEmail("");
    setName("");
    setRole(DEFAULT_MEMBER_ROLE);
    setError(null);
    setSent(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setError("Enter the email address they will sign in with.");
      return;
    }
    try {
      setSent(await invite.mutateAsync({ email: email.trim(), full_name: name.trim() || undefined, role }));
    } catch (err) {
      // A plan refusal opens the upgrade dialog; it is not a mistake in the form.
      if (isPlanLockError(err)) return setOpen(false);
      setError(err instanceof Error ? err.message : "Could not send the invite.");
    }
  };

  if (seats.locked) {
    return (
      <Button onClick={seats.prompt}>
        <LockIcon className="size-4" /> Invite someone
      </Button>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <UserPlusIcon className="size-4" /> Invite someone
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[560px]">
        {sent ? (
          <>
            <DialogHeader>
              <DialogTitle>Invite sent</DialogTitle>
              <DialogDescription>
                {sent.member.email} has a mail with a link to set their password. It works for 7 days.
              </DialogDescription>
            </DialogHeader>
            <div>
              <span className={label}>If the mail doesn&apos;t arrive, send them this link</span>
              <InviteLink url={sent.invite_url} />
            </div>
            <DialogFooter>
              <Button variant="secondary" onClick={reset}>
                Invite another
              </Button>
              <Button onClick={() => setOpen(false)}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>Invite someone</DialogTitle>
              <DialogDescription>
                They get their own password, so you can see who did what and take access away from one person without changing it for everyone.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 sm:grid-cols-2">
              <label>
                <span className={label}>Email</span>
                <input className="input w-full" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@college.edu" autoFocus />
              </label>
              <label>
                <span className={label}>Name · optional</span>
                <input className="input w-full" value={name} onChange={(e) => setName(e.target.value)} placeholder="Priya Nair" maxLength={80} />
              </label>
            </div>
            <div>
              <span className={label}>Role</span>
              <div role="radiogroup" aria-label="Role" className="flex flex-col gap-2">
                {roles.map((r) => {
                  const lock = r.key === DEFAULT_MEMBER_ROLE ? null : rolesGate.lock;
                  return (
                    <ChoiceCard
                      key={r.key}
                      checked={role === r.key}
                      onClick={() => (lock ? openUpgrade(lock) : setRole(r.key))}
                      title={
                        <span className="flex items-center gap-1.5">
                          {r.label}
                          <LockBadge lock={lock} />
                        </span>
                      }
                      hint={r.description}
                    />
                  );
                })}
              </div>
            </div>
            {error ? <Notice tone="refuse">{error}</Notice> : null}
            <DialogFooter>
              <Button variant="secondary" type="button" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={invite.isPending}>
                {invite.isPending ? "Sending…" : "Send invite"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
