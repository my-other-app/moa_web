"use client";

import * as React from "react";
import { formatDate } from "@moa/app-kit";
import { Button, CardLabel, DefinitionRows, FigurePanel, Notice } from "@moa/ui";

import { useChangeMyPassword } from "../queries";
import { MIN_PASSWORD, type Me } from "../schemas";

const label = "eyebrow mb-1.5 block";

/**
 * Security, for a team member: who they are signed in as, and their own
 * password. The club account's devices, sign-in history and two-factor
 * belong to the club's owner and are not shown here.
 */
export function MemberAccount({ me }: { me: Me & { member: NonNullable<Me["member"]> } }) {
  const change = useChangeMyPassword();
  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [again, setAgain] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const m = me.member;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (next.length < MIN_PASSWORD) return setError(`Use at least ${MIN_PASSWORD} characters.`);
    if (next !== again) return setError("The two new passwords don't match.");
    try {
      await change.mutateAsync({ current_password: current, new_password: next });
      setCurrent("");
      setNext("");
      setAgain("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change the password.");
    }
  };

  return (
    <div className="flex flex-col gap-3.5">
      <header>
        <h2 className="page-title m-0 font-semibold tracking-[-0.02em]">Your account</h2>
        <p className="text-ink-2 mt-1 text-[13px]">
          You sign in to {me.club_name} as yourself, with the {me.role_label.toLowerCase()} role.
        </p>
      </header>
      <div className="grid gap-3.5 lg:grid-cols-2">
        <FigurePanel className="p-4">
          <CardLabel>Signed in as</CardLabel>
          <div className="mt-2">
            <DefinitionRows
              rows={[
                { k: "Name", v: m.full_name ?? "—" },
                { k: "Email", v: m.email },
                { k: "Role", v: `${me.role_label} · ${me.role_description}` },
                { k: "Joined", v: m.accepted_at ? formatDate(m.accepted_at) : "—" },
              ]}
            />
          </div>
          <Notice tone="neutral" className="mt-3">
            The club account&apos;s devices, sign-in history and two-factor are managed by the club&apos;s owner.
          </Notice>
        </FigurePanel>
        <FigurePanel className="p-4">
          <CardLabel>Change your password</CardLabel>
          <form onSubmit={submit} className="mt-3 flex flex-col gap-3">
            <label>
              <span className={label}>Current password</span>
              <input className="input w-full" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
            </label>
            <label>
              <span className={label}>New password</span>
              <input className="input w-full" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
            </label>
            <label>
              <span className={label}>New password again</span>
              <input className="input w-full" type="password" value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" />
            </label>
            {error ? <Notice tone="refuse">{error}</Notice> : null}
            <div>
              <Button type="submit" disabled={change.isPending || !current || !next}>
                {change.isPending ? "Changing…" : "Change password"}
              </Button>
            </div>
          </form>
        </FigurePanel>
      </div>
    </div>
  );
}
