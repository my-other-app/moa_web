"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CopyIcon, LockIcon } from "lucide-react";
import { formatDateTime, relativeTime } from "@moa/app-kit";
import { FigurePanel, Notice, StatusBadge, TabRail, cn, toast } from "@moa/ui";

import { UPGRADE_PATH } from "@/features/plan";

import { qualityLabel, qualityTone, type Upgrade } from "../schemas";

/** The section's three pages. */
const TABS = [
  { key: "inbox", label: "Inbox", href: "/whatsapp" },
  { key: "templates", label: "Templates", href: "/whatsapp/templates" },
  { key: "settings", label: "Settings", href: "/whatsapp/settings" },
];

export function WhatsAppHeader({ title, sub, right }: { title: string; sub: string; right?: React.ReactNode }) {
  const pathname = usePathname();
  const value = pathname.startsWith("/whatsapp/templates") ? "templates" : pathname.startsWith("/whatsapp/settings") ? "settings" : "inbox";
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
        label="WhatsApp sections"
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

/** GREEN / YELLOW / RED, in words: "Quality: High". */
export function QualityBadge({ rating }: { rating: string | null | undefined }) {
  return <StatusBadge label={`Quality: ${qualityLabel(rating)}`} tone={qualityTone(rating)} />;
}

/** A calm panel for someone the page isn't for: no permission, or an admin acting as the club. */
export function NoAccessPanel({ title, body }: { title: string; body: string }) {
  return (
    <FigurePanel className="flex max-w-[560px] flex-col items-start gap-3 p-5" role="region" aria-label="WhatsApp">
      <span className="bg-sunken text-ink-2 grid size-10 place-items-center rounded-xl">
        <LockIcon className="size-4" />
      </span>
      <h3 className="text-ink m-0 text-[16px] font-semibold tracking-[-0.01em]">{title}</h3>
      <p className="text-ink-2 m-0 text-[13px] leading-[1.55]">{body}</p>
    </FigurePanel>
  );
}

/** The plan doesn't include it: what it is, the plan that has it, and that what's here stays. */
export function UpgradeNotice({ upgrade, className }: { upgrade: Upgrade | null | undefined; className?: string }) {
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
      <strong className="font-semibold">
        {upgrade?.label || "Your own WhatsApp number"} {plan ? `is part of ${plan}.` : "isn't on your plan."}
      </strong>{" "}
      Reply to attendees from your club&apos;s own WhatsApp Business number, manage its templates and see its quality. Anything already here stays for you to
      look at; connecting or sending needs an upgrade.
    </Notice>
  );
}

export function When({ iso, fallback = "—" }: { iso: string | null | undefined; fallback?: string }) {
  const [now] = React.useState(() => new Date());
  if (!iso) return <>{fallback}</>;
  return (
    <time dateTime={iso} title={formatDateTime(iso)}>
      {relativeTime(iso, now)}
    </time>
  );
}

/** The time, again each `every` ms: what counts down (the 24-hour window) moves on by itself. */
export function useNow(every = 60_000): Date {
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const t = setInterval(() => setNow(new Date()), every);
    return () => clearInterval(t);
  }, [every]);
  return now;
}

export async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Copied");
  } catch {
    toast.error("Could not copy. Select it and copy by hand.");
  }
}

export function CopyRow({ label, value, hidden }: { label: string; value: string | null | undefined; hidden: string }) {
  return (
    <div className="mt-1.5 flex flex-col gap-1">
      <span className="text-ink-2 text-[12.5px]">{label}</span>
      {value ? (
        <div className="bg-sunken flex items-center gap-2 rounded-xl px-3 py-2">
          <code className="text-ink min-w-0 flex-1 text-[12.5px] break-all">{value}</code>
          <button type="button" className="btn btn-ghost btn-xs shrink-0" aria-label={`Copy the ${label.toLowerCase()}`} onClick={() => void copy(value)}>
            <CopyIcon className="size-3.5" /> Copy
          </button>
        </div>
      ) : (
        <span className="text-ink-3 text-[12.5px]">{hidden}</span>
      )}
    </div>
  );
}

export function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <span aria-hidden="true" className="bg-brand-soft text-brand grid size-6 shrink-0 place-items-center rounded-full text-[12px] font-semibold tabular-nums">
        {n}
      </span>
      <div className="text-ink min-w-0 flex-1 pt-0.5 leading-[1.5]">{children}</div>
    </li>
  );
}

/**
 * A labelled control with its help, or its error in place of the help. The
 * control is described by whichever is shown (aria-describedby), added to
 * any description it already has.
 */
export function Field({ id, label, error, help, children, className }: { id: string; label: string; error?: string | null; help?: React.ReactNode; children: React.ReactNode; className?: string }) {
  const describedBy = error ? `${id}-error` : help ? `${id}-help` : null;
  const control =
    describedBy && React.isValidElement<{ "aria-describedby"?: string }>(children)
      ? React.cloneElement(children, {
          "aria-describedby": [...new Set([...(children.props["aria-describedby"] ?? "").split(" "), describedBy])].filter(Boolean).join(" "),
        })
      : children;
  return (
    <div className={cn("min-w-0", className)}>
      <label htmlFor={id} className="eyebrow mb-1.5 block">
        {label}
      </label>
      {control}
      {error ? (
        <p id={`${id}-error`} className="text-refuse mt-1 text-[12px]">
          {error}
        </p>
      ) : help ? (
        <p id={`${id}-help`} className="text-ink-3 m-0 mt-1 text-[12px]">
          {help}
        </p>
      ) : null}
    </div>
  );
}
