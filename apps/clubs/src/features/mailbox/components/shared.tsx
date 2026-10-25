"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { InboxIcon, LockIcon } from "lucide-react";
import { formatDate } from "@moa/app-kit";
import { FigurePanel, Notice, TabRail } from "@moa/ui";

import { UPGRADE_PATH } from "@/features/plan";

import type { Mailbox, Upgrade } from "../schemas";

const TABS = [
  { key: "mail", label: "Mail", href: "/mail" },
  { key: "settings", label: "Settings", href: "/mail/settings" },
];

export function MailHeader({ title, sub, right }: { title: string; sub: React.ReactNode; right?: React.ReactNode }) {
  const pathname = usePathname();
  const value = pathname.startsWith("/mail/settings") ? "settings" : "mail";
  return (
    <div className="flex flex-col gap-3">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="page-title m-0 font-semibold tracking-[-0.02em]">{title}</h2>
          <p className="text-ink-2 mt-1 text-[13px]">{sub}</p>
        </div>
        {right ? <div className="flex flex-wrap items-center gap-2">{right}</div> : null}
      </header>
      <TabRail
        label="Mail sections"
        items={TABS}
        value={value}
        renderLink={(item, props) => (
          <Link href={item.href!} className={props.className} aria-current={props["aria-current"]}>
            {props.children}
          </Link>
        )}
      />
    </div>
  );
}

/** A calm panel for someone the page isn't for: no permission, or an admin acting as the club. */
export function NoAccessPanel({ title, body }: { title: string; body: string }) {
  return (
    <FigurePanel className="flex max-w-[560px] flex-col items-start gap-3 p-5" role="region" aria-label="Mail">
      <span className="bg-sunken text-ink-2 grid size-10 place-items-center rounded-xl">
        <LockIcon className="size-4" aria-hidden="true" />
      </span>
      <h3 className="text-ink m-0 text-[16px] font-semibold tracking-[-0.01em]">{title}</h3>
      <p className="text-ink-2 m-0 text-[13px] leading-[1.55]">{body}</p>
    </FigurePanel>
  );
}

/**
 * Mail on a server without club mailboxes, or with them switched off: the
 * rail doesn't offer it, so only an old link or a typed address gets here.
 * Nothing is locked or broken -- it just isn't there yet. No tabs.
 */
export function MailUnavailable() {
  return (
    <div className="flex flex-col gap-3.5">
      <header className="min-w-0">
        <h2 className="page-title m-0 font-semibold tracking-[-0.02em]">Mail</h2>
        <p className="text-ink-2 mt-1 text-[13px]">The club&apos;s own mailbox</p>
      </header>
      <FigurePanel className="flex max-w-[560px] flex-col items-start gap-3 p-5" role="region" aria-label="Mail">
        <span className="bg-sunken text-ink-2 grid size-10 place-items-center rounded-xl">
          <InboxIcon className="size-4" aria-hidden="true" />
        </span>
        <h3 className="text-ink m-0 text-[16px] font-semibold tracking-[-0.01em]">Not available yet</h3>
        <p className="text-ink-2 m-0 text-[13px] leading-[1.55]">
          Club mailboxes aren&apos;t open yet. Your emails to attendees still go out from MyOtherApp as before.
        </p>
        <Link href="/" className="btn btn-secondary btn-sm">
          Back to the dashboard
        </Link>
      </FigurePanel>
    </div>
  );
}

/** The plan doesn't include it: what it is, the plan that has it, and that what's here stays. */
export function MailUpgradeNotice({ upgrade, className }: { upgrade: Upgrade | null | undefined; className?: string }) {
  const plan = upgrade?.required_plan_name;
  return (
    <Notice
      tone="accent"
      tag="Plan"
      className={className}
      action={
        <Link href={UPGRADE_PATH} className="btn btn-primary btn-sm">
          See plans
        </Link>
      }
    >
      <strong className="font-semibold">A club mailbox {plan ? `is part of ${plan} and Enterprise.` : "isn't on your plan."}</strong> Get an address like
      yourclub@mail.myotherapp.in, read what people send it here and answer from the dashboard.
    </Notice>
  );
}

/** The plan dropped the mailbox: closed, readable until a date, then export or delete. */
export function LapseNotice({ mailbox }: { mailbox: Mailbox }) {
  if (mailbox.state === "open") return null;
  if (mailbox.state === "expired") {
    return (
      <Notice
        tone="refuse"
        tag="Closed"
        action={
          <Link href="/mail/settings" className="btn btn-secondary btn-sm">
            Mail settings
          </Link>
        }
      >
        <strong className="font-semibold">Your plan no longer includes the mailbox and its 30 days are over.</strong> The mail can&apos;t be read here any more.
        The club&apos;s own account can export all of it, or delete it, from Mail settings. Upgrade to open it again, as it was.
      </Notice>
    );
  }
  return (
    <Notice
      tone="caution"
      tag="Closed"
      action={
        <Link href={UPGRADE_PATH} className="btn btn-secondary btn-sm">
          See plans
        </Link>
      }
    >
      <strong className="font-semibold">Your plan no longer includes the mailbox.</strong> Mail to {mailbox.address ?? "the club's address"} isn&apos;t accepted
      and nothing can be sent. What&apos;s here stays readable{mailbox.readable_until ? ` until ${formatDate(mailbox.readable_until)}` : " for 30 days"}; after
      that it can be exported or deleted.
    </Notice>
  );
}
