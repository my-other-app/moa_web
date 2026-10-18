"use client";

import * as React from "react";
import { ChevronRightIcon, CopyIcon, ExternalLinkIcon, GlobeIcon, Loader2Icon, LockIcon, RefreshCwIcon, Trash2Icon } from "lucide-react";
import { formatDateTime } from "@moa/app-kit";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  CardLabel,
  DefinitionRows,
  FigurePanel,
  Notice,
  Skeleton,
  StatusBadge,
  buttonVariants,
  cn,
  toast,
} from "@moa/ui";

import { useAccess } from "@/features/access";
import { LockBadge, LockedNotice, openUpgrade, useFeatureGate, usePlan } from "@/features/plan";

import { useCheckDomain, useConnectDomain, useRemoveDomain, useSiteDomain } from "../queries";
import {
  connectProblem,
  currentDomain,
  domainStatus,
  hostProblem,
  isRoleRefusal,
  normaliseHost,
  purposeLabel,
  shortName,
  sslStatus,
  zoneOf,
  type CustomDomain,
  type DnsRecord,
  type SiteDomain,
} from "../domain";

/**
 * Custom domain: the club's website at an address of its own
 * (www.theirclub.org), as well as at {slug}.myotherapp.in.
 *
 * Growth and up. The club types its domain, gets the DNS records to add at
 * its registrar, and the card waits (reading the domain again every 30 s)
 * until the records resolve and the certificate is issued. Only the club's
 * owner and its admins may change it; everyone else who can open the
 * Website page sees where it stands, and a 403 that is not the plan's turns
 * the card read-only whatever the role said.
 */
const FEATURE = "custom_domain";
const WRITERS = new Set(["owner", "admin"]);

type Connect = ReturnType<typeof useConnectDomain>;
type Check = ReturnType<typeof useCheckDomain>;
type Remove = ReturnType<typeof useRemoveDomain>;

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Copied");
  } catch {
    toast.error("Could not copy. Select it and copy by hand.");
  }
}

function CopyButton({ value, label }: { value: string; label: string }) {
  return (
    <button type="button" className="btn btn-ghost btn-xs btn-icon shrink-0" aria-label={label} title={label} onClick={() => void copy(value)}>
      <CopyIcon className="size-3.5" />
    </button>
  );
}

function Step({ n, title, children }: { n: number; title: string; children?: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <span aria-hidden="true" className="bg-brand-soft text-brand grid size-6 shrink-0 place-items-center rounded-full text-[12px] font-semibold tabular-nums">
        {n}
      </span>
      <div className="min-w-0 flex-1 pt-0.5 leading-[1.5]">
        <p className="text-ink m-0 text-[13px] font-medium">{title}</p>
        {children}
      </div>
    </li>
  );
}

// ─── The records ──────────────────────────────────────────────────────────

const PURPOSE_SHORT: Record<string, string> = { route: "routing", ownership: "ownership", ssl: "certificate" };

function RecordsTable({ records, zone }: { records: DnsRecord[]; zone: string }) {
  if (records.length === 0) return null;
  return (
    <div className="border-line mt-2 overflow-x-auto rounded-xl border">
      <table className="w-full min-w-[560px] border-collapse text-left text-[12.5px]" aria-label="DNS records">
        <thead className="bg-sunken text-ink-3 font-mono text-[10px] tracking-[0.08em] uppercase">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">
              Type
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Name
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Value
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              Purpose
            </th>
          </tr>
        </thead>
        <tbody>
          {records.map((r, i) => {
            const short = shortName(r.name, zone);
            const what = PURPOSE_SHORT[r.purpose] ?? r.purpose;
            return (
              <tr key={`${r.type}-${r.name}-${i}`} className="border-line-soft border-t align-top">
                <td className="text-ink px-3 py-2.5 font-mono font-semibold">{r.type}</td>
                <td className="px-3 py-2.5">
                  <div className="flex items-start gap-1">
                    <code className="text-ink min-w-0 flex-1 break-all">{r.name}</code>
                    <CopyButton value={r.name} label={`Copy ${r.type} name (${what})`} />
                  </div>
                  {short ? (
                    <div className="text-ink-3 mt-0.5 flex items-center gap-1 text-[11.5px]">
                      <span>
                        Short form: <code className="text-ink-2">{short}</code>
                      </span>
                      <CopyButton value={short} label={`Copy ${r.type} short name (${what})`} />
                    </div>
                  ) : null}
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-start gap-1">
                    <code className="text-ink min-w-0 flex-1 break-all">{r.value}</code>
                    <CopyButton value={r.value} label={`Copy ${r.type} value (${what})`} />
                  </div>
                </td>
                <td className="text-ink-2 px-3 py-2.5">{purposeLabel(r.purpose)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Where each popular provider keeps its DNS, and the one thing each tends to trip on. */
const PROVIDER_TIPS: { name: string; tip: string }[] = [
  {
    name: "GoDaddy",
    tip: "Domain Portfolio → your domain → DNS → Add New Record. Put the short form in Name. GoDaddy already has a www CNAME pointing to @: edit that one rather than adding a second.",
  },
  {
    name: "Hostinger",
    tip: "hPanel → Domains → your domain → DNS / Nameservers. Put the short form in Name. If a www record is already there, delete it first.",
  },
  {
    name: "Namecheap",
    tip: "Domain List → Manage → Advanced DNS → Add New Record. Put the short form in Host. Delete the default www CNAME (parkingpage.namecheap.com) first.",
  },
  {
    name: "Cloudflare",
    tip: "DNS → Records → Add record. Name takes the short form or the full one. Set the CNAME's Proxy status to DNS only (grey cloud): with the orange cloud on, the domain will not connect.",
  },
];

function ProviderHelp() {
  return (
    <details className="group border-line rounded-xl border px-3.5 py-2.5 text-[12.5px]">
      <summary className="text-ink-2 flex cursor-pointer list-none items-center gap-1.5 font-medium select-none [&::-webkit-details-marker]:hidden">
        <ChevronRightIcon className="size-3.5 transition-transform group-open:rotate-90" aria-hidden="true" />
        Help for GoDaddy, Hostinger, Namecheap and Cloudflare
      </summary>
      <dl className="mt-2.5 grid gap-2.5">
        {PROVIDER_TIPS.map((p) => (
          <div key={p.name}>
            <dt className="text-ink font-semibold">{p.name}</dt>
            <dd className="text-ink-2 m-0 leading-[1.55]">{p.tip}</dd>
          </div>
        ))}
        <div>
          <dt className="text-ink font-semibold">Somewhere else?</dt>
          <dd className="text-ink-2 m-0 leading-[1.55]">Add the records wherever your domain&apos;s nameservers point: that may be your web host or Cloudflare rather than where you bought it.</dd>
        </div>
      </dl>
    </details>
  );
}

// ─── Actions ──────────────────────────────────────────────────────────────

function CheckButton({ check, label }: { check: Check; label: string }) {
  return (
    <button type="button" className="btn btn-secondary btn-sm" onClick={() => check.mutate()} disabled={check.isPending}>
      {check.isPending ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />} {label}
    </button>
  );
}

function RemoveButton({ remove, host, label, description }: { remove: Remove; host: string; label: string; description: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button type="button" className="btn btn-ghost btn-danger btn-sm" onClick={() => setOpen(true)} disabled={remove.isPending}>
        {remove.isPending ? <Loader2Icon className="animate-spin" /> : <Trash2Icon />} {label}
      </button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {host}?</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction className={cn(buttonVariants({ variant: "destructive" }))} onClick={() => remove.mutate()}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ─── The states ───────────────────────────────────────────────────────────

function ConnectForm({ connect }: { connect: Connect }) {
  const [raw, setRaw] = React.useState("");
  // What was last sent, for the www. suggestion a bare domain earns.
  const [sent, setSent] = React.useState("");
  const host = normaliseHost(raw);
  const problem = hostProblem(host);
  const refusal = connect.isError ? connectProblem(connect.error, sent) : null;

  const send = (h: string) => {
    setSent(h);
    connect.mutate(h);
  };

  return (
    <form
      className="grid gap-2"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (host && !problem) send(host);
      }}
    >
      <label htmlFor="custom-domain-host" className="eyebrow block">
        Your domain
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="custom-domain-host"
          className="input w-full font-mono"
          placeholder="www.yourclub.org"
          value={raw}
          onChange={(e) => {
            setRaw(e.target.value);
            if (connect.isError) connect.reset();
          }}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          inputMode="url"
          aria-invalid={Boolean(problem || refusal) || undefined}
          aria-describedby="custom-domain-hint"
        />
        <button type="submit" className="btn btn-primary shrink-0" disabled={!host || Boolean(problem) || connect.isPending}>
          {connect.isPending ? <Loader2Icon className="animate-spin" /> : <GlobeIcon />} Connect
        </button>
      </div>
      <p id="custom-domain-hint" className="m-0 min-h-[18px] text-[12px]" aria-live="polite">
        {host && problem ? (
          <span className="text-refuse">{problem}</span>
        ) : host ? (
          <span className="text-ink-3">
            We&apos;ll connect <code className="text-ink">{host}</code>
          </span>
        ) : null}
      </p>
      {refusal ? (
        <Notice
          tone="refuse"
          tag="Not connected"
          action={
            refusal.suggestion ? (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setRaw(refusal.suggestion!);
                  send(refusal.suggestion!);
                }}
              >
                Use {refusal.suggestion}
              </button>
            ) : undefined
          }
        >
          {refusal.message}
        </Notice>
      ) : null}
      <p className="text-ink-3 m-0 text-[11.5px] leading-[1.5]">Use www or another subdomain. Forward your bare domain (yourclub.org) to it at your registrar.</p>
    </form>
  );
}

function Pending({ domain, canWrite, check, remove, defaultHost }: { domain: CustomDomain; canWrite: boolean; check: Check; remove: Remove; defaultHost: string }) {
  const zone = zoneOf(domain.host);
  return (
    <div className="grid gap-3">
      <p className="text-ink-2 m-0 text-[13px]">
        Connecting <strong className="text-ink font-mono">{domain.host}</strong>. Until it&apos;s done, your site stays at {defaultHost}.
      </p>
      <ol className="m-0 flex list-none flex-col gap-3.5 p-0" aria-label="Setup steps">
        <Step n={1} title="Sign in where you bought your domain (GoDaddy, Hostinger, Namecheap, Google/Squarespace, Cloudflare…)" />
        <Step n={2} title="Add these records">
          <RecordsTable records={domain.records} zone={zone} />
          <p className="text-ink-3 m-0 mt-2 text-[11.5px] leading-[1.5]">
            Tip: GoDaddy, Hostinger, Namecheap and Squarespace add <code>{zone}</code> to the name themselves, so enter only the short form shown under each name (like <code>www</code>). Cloudflare takes either.
          </p>
        </Step>
        <Step n={3} title="We check automatically. This usually takes a few minutes, but can take up to 24 hours.">
          {canWrite ? (
            <div className="mt-2">
              <CheckButton check={check} label="Check now" />
            </div>
          ) : null}
          {domain.last_error ? (
            <Notice tone="caution" tag="Last check" className="mt-2">
              {domain.last_error}
            </Notice>
          ) : null}
        </Step>
      </ol>
      <ProviderHelp />
      {canWrite ? (
        <div>
          <RemoveButton remove={remove} host={domain.host} label="Remove" description={`We stop setting it up and your site stays at ${defaultHost}. You can take the records off at your provider.`} />
        </div>
      ) : null}
    </div>
  );
}

function Active({ domain, canWrite, remove, defaultHost }: { domain: CustomDomain; canWrite: boolean; remove: Remove; defaultHost: string }) {
  const url = `https://${domain.host}`;
  const ssl = sslStatus(domain.ssl_status);
  return (
    <div className="grid gap-3">
      <Notice
        tone="admit"
        tag="Live"
        action={
          <div className="flex gap-1.5">
            <a href={url} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">
              <ExternalLinkIcon /> Open
            </a>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => void copy(url)}>
              <CopyIcon /> Copy
            </button>
          </div>
        }
      >
        Your site is live at <strong className="font-mono">{url}</strong>
      </Notice>
      <p className="text-ink-2 m-0 text-[12.5px]">{defaultHost} now forwards here.</p>
      <DefinitionRows
        rows={[
          { k: "SSL", v: <StatusBadge label={ssl.label} tone={ssl.tone} /> },
          { k: "Connected", v: domain.verified_at ? formatDateTime(domain.verified_at) : "—" },
        ]}
      />
      {canWrite ? (
        <div>
          <RemoveButton remove={remove} host={domain.host} label="Remove domain" description={`Your site goes back to ${defaultHost}, and ${domain.host} stops showing it. You can connect a domain again later.`} />
        </div>
      ) : null}
    </div>
  );
}

function Paused({ domain, canWrite, remove, defaultHost }: { domain: CustomDomain; canWrite: boolean; remove: Remove; defaultHost: string }) {
  const plan = usePlan();
  return (
    <div className="grid gap-3">
      <p className="text-ink m-0 font-mono text-[13px]">{domain.host}</p>
      <Notice tone="caution" tag="Paused">
        Paused — your plan no longer includes custom domains. Visitors are sent to {defaultHost}. Upgrade within 30 days to keep it.
      </Notice>
      {canWrite ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-primary btn-sm" onClick={() => openUpgrade(plan.lockFor(FEATURE))}>
            <LockIcon /> Upgrade
          </button>
          <RemoveButton remove={remove} host={domain.host} label="Remove" description={`${domain.host} is taken off now rather than in 30 days. Your site stays at ${defaultHost}.`} />
        </div>
      ) : null}
    </div>
  );
}

function Failed({ domain, canWrite, check, remove, defaultHost }: { domain: CustomDomain; canWrite: boolean; check: Check; remove: Remove; defaultHost: string }) {
  const known = domain.status === "failed";
  return (
    <div className="grid gap-3">
      <p className="text-ink m-0 font-mono text-[13px]">{domain.host}</p>
      <Notice tone={known ? "refuse" : "neutral"} tag={known ? "Failed" : domainStatus(domain.status).label}>
        {domain.last_error ?? `We couldn't connect ${domain.host}. Check the records below, then check again.`}
      </Notice>
      {domain.records.length > 0 ? (
        <div>
          <p className="text-ink-2 m-0 text-[12.5px]">The records it needs:</p>
          <RecordsTable records={domain.records} zone={zoneOf(domain.host)} />
        </div>
      ) : null}
      {domain.records.length > 0 ? <ProviderHelp /> : null}
      {canWrite ? (
        <div className="flex flex-wrap gap-2">
          <CheckButton check={check} label="Check again" />
          <RemoveButton remove={remove} host={domain.host} label="Remove" description={`Your site stays at ${defaultHost}. You can take the records off at your provider.`} />
        </div>
      ) : null}
    </div>
  );
}

function Locked({ d }: { d: SiteDomain }) {
  return (
    <div className="grid gap-3">
      <LockedNotice feature={FEATURE} locked dialog>
        {(lock) => <>Use your own domain, like www.yourclub.org — on {lock.requiredPlanName ?? "Growth"} and up.</>}
      </LockedNotice>
      <p className="text-ink-2 m-0 flex items-center gap-2 text-[12.5px]">
        <GlobeIcon className="text-ink-3 size-4" aria-hidden="true" /> Your site is at <code className="text-ink">{d.default_host}</code>
      </p>
    </div>
  );
}

// ─── The card ─────────────────────────────────────────────────────────────

export function DomainCard() {
  const q = useSiteDomain();
  const access = useAccess();
  const plan = usePlan();
  const gate = useFeatureGate(FEATURE);
  const connect = useConnectDomain();
  const check = useCheckDomain();
  const remove = useRemoveDomain();

  const d = q.data;
  const domain = currentDomain(d);
  const unreadable = q.isError && isRoleRefusal(q.error);
  // The role's answer first; a write the server refused for the role (not the plan) settles it.
  const refused = [connect.error, check.error, remove.error].some(isRoleRefusal);
  const canWrite = WRITERS.has(access.role) && !refused && !unreadable;

  let badge: React.ReactNode = null;
  if (domain) {
    const s = domainStatus(domain.status);
    badge = <StatusBadge label={s.label} tone={s.tone} />;
  } else if (d?.available && !d.entitled) {
    badge = <LockBadge lock={gate.lock ?? plan.lockFor(FEATURE)} />;
  }

  let body: React.ReactNode;
  if (q.isPending) body = <Skeleton className="h-24" />;
  else if (unreadable) body = <p className="text-ink-2 m-0 text-[12.5px]">Only the club&apos;s owner and admins can see or change the custom domain.</p>;
  else if (q.isError || !d) body = <p className="text-ink-2 m-0 text-[12.5px]">The custom domain could not load. Try again in a moment.</p>;
  else if (!d.available) body = <p className="text-ink-2 m-0 text-[12.5px]">Custom domains are coming soon.</p>;
  else if (domain?.status === "pending") body = <Pending domain={domain} canWrite={canWrite} check={check} remove={remove} defaultHost={d.default_host} />;
  else if (domain?.status === "active") body = <Active domain={domain} canWrite={canWrite} remove={remove} defaultHost={d.default_host} />;
  else if (domain?.status === "paused") body = <Paused domain={domain} canWrite={canWrite} remove={remove} defaultHost={d.default_host} />;
  else if (domain) body = <Failed domain={domain} canWrite={canWrite} check={check} remove={remove} defaultHost={d.default_host} />;
  else if (!d.entitled) body = <Locked d={d} />;
  else if (canWrite) body = <ConnectForm connect={connect} />;
  else
    body = (
      <p className="text-ink-2 m-0 text-[12.5px]">
        No custom domain yet. Your site is at <code className="text-ink">{d.default_host}</code>.
      </p>
    );

  // Said once, under whatever the card shows, to anyone who may look but not change.
  const readOnly = Boolean(d?.available) && !unreadable && !canWrite && (domain !== null || Boolean(d?.entitled));

  return (
    <FigurePanel className="flex flex-col gap-3 p-4" role="region" aria-label="Custom domain">
      <CardLabel right={badge}>Custom domain</CardLabel>
      {body}
      {readOnly ? <p className="text-ink-3 m-0 text-[11.5px]">Only the club&apos;s owner and admins can change this.</p> : null}
    </FigurePanel>
  );
}
