"use client";

import Link from "next/link";
import { ArrowUpRightIcon } from "lucide-react";
import { SectionTitle, formatCurrency, formatDate } from "@moa/app-kit";
import { DefinitionRows, StatusBadge } from "@moa/ui";

import { words } from "@/features/teamwork";

import { PANEL_SECTIONS, itemAmount, itemName, itemStatus, linkTargets, panelItems, safePath, type CaseLinks, type PanelItem } from "../schemas";

const KNOWN = new Set(["account", "matched_by", ...PANEL_SECTIONS.map((s) => s.key)]);

function OpenLink({ path, label }: { path: string | null | undefined; label: string }) {
  const href = safePath(path);
  if (!href) return null;
  return (
    <Link href={href} className="text-brand inline-flex shrink-0 items-center gap-0.5 text-[12px]" aria-label={`Open ${label}`}>
      Open <ArrowUpRightIcon className="size-3" aria-hidden="true" />
    </Link>
  );
}

function Item({ item }: { item: PanelItem }) {
  const name = itemName(item);
  const when = item.at ?? item.created_at;
  const amount = itemAmount(item);
  const status = itemStatus(item);
  return (
    <li className="flex items-start gap-2 py-1.5">
      <div className="min-w-0 flex-1">
        <p className="m-0 truncate text-[13px]">{name}</p>
        <p className="text-ink-3 m-0 truncate text-[12px]">
          {[item.subtitle, amount !== null ? formatCurrency(amount) : null, when ? formatDate(when) : null].filter(Boolean).join(" · ")}
        </p>
      </div>
      {status ? <StatusBadge label={words(status)} /> : null}
      <OpenLink path={item.path ?? item.admin_path} label={name} />
    </li>
  );
}

function Section({ label, items }: { label: string; items: PanelItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col">
      <h4 className="text-ink-3 m-0 font-mono text-[10.5px] tracking-[0.08em] uppercase">{label}</h4>
      <ul className="divide-line-soft m-0 list-none divide-y p-0">
        {items.map((it, i) => (
          <Item key={`${it.id ?? i}`} item={it} />
        ))}
      </ul>
    </div>
  );
}

/** The person's account at a glance: plain facts as rows, its page as a link. */
function Account({ account }: { account: Record<string, unknown> }) {
  const rows = Object.entries(account)
    .filter(([k, v]) => !["path", "admin_path", "id", "created_at"].includes(k) && (typeof v === "string" || typeof v === "number" || typeof v === "boolean" || (Array.isArray(v) && v.every((x) => typeof x === "string"))))
    .map(([k, v]) => ({ k: words(k), v: typeof v === "boolean" ? (v ? "Yes" : "No") : Array.isArray(v) ? v.join(", ") || "—" : String(v) }));
  const path = typeof account.path === "string" ? account.path : typeof account.admin_path === "string" ? account.admin_path : null;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <h4 className="text-ink-3 m-0 font-mono text-[10.5px] tracking-[0.08em] uppercase">Account</h4>
        <OpenLink path={path} label="the account" />
      </div>
      <DefinitionRows rows={rows} />
    </div>
  );
}

/**
 * Beside the case: the person's account, registrations and tickets,
 * payments, refunds and disputes, and the clubs they run, each with the
 * admin page that acts on it (refund, resend ticket, suspend keep their own
 * permissions there). Only the portal's own paths are followed.
 */
export function LinkedPanel({ panel, links }: { panel: Record<string, unknown> | null | undefined; links: CaseLinks }) {
  const targets = linkTargets(links);
  const account = panel?.account && typeof panel.account === "object" && !Array.isArray(panel.account) ? (panel.account as Record<string, unknown>) : null;
  const extra = Object.keys(panel ?? {}).filter((k) => !KNOWN.has(k) && Array.isArray(panel?.[k]));
  const empty = !account && targets.length === 0 && PANEL_SECTIONS.every((s) => panelItems(panel, s.key).length === 0) && extra.length === 0;
  return (
    <section className="border-line-soft bg-surface flex flex-col gap-4 rounded-2xl border p-4" aria-label="Linked records">
      <SectionTitle>Linked records</SectionTitle>
      {empty ? <p className="text-ink-3 m-0 text-[12.5px]">Nothing on the platform is linked to this case yet.</p> : null}
      {targets.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {targets.map((t) => (
            <Link key={t.href + t.label} href={t.href} className="border-line hover:bg-sunken rounded-lg border px-2 py-1 text-[12px]">
              {t.label}
            </Link>
          ))}
        </div>
      ) : null}
      {account ? <Account account={account} /> : null}
      {PANEL_SECTIONS.map((s) => (
        <Section key={s.key} label={s.label} items={panelItems(panel, s.key)} />
      ))}
      {extra.map((k) => (
        <Section key={k} label={words(k)} items={panelItems(panel, k)} />
      ))}
    </section>
  );
}
