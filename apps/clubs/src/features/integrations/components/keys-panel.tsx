"use client";

import * as React from "react";
import { KeyRoundIcon, Loader2Icon, PlusIcon, RefreshCwIcon, Trash2Icon } from "lucide-react";
import { formatDate, formatDateTime, relativeTime } from "@moa/app-kit";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  FigurePanel,
  NativeSelect,
  Notice,
  Segmented,
  Skeleton,
  StatusBadge,
  buttonVariants,
  cn,
} from "@moa/ui";

import { useApiKeys, useCreateKey, useRevokeKey, useRotateKey } from "../queries";
import {
  EMPTY_KEY_FORM,
  EXPIRY_CHOICES,
  KEY_MODES,
  keyBody,
  keyFormProblems,
  keyStatus,
  personLabel,
  type ApiKey,
  type ExpiryChoice,
  type IntegrationsStatus,
  type KeyForm,
  type KeyMode,
  type KeyWithSecret,
} from "../schemas";
import { ScopePicker, ScopeTags, SecretOnce } from "./parts";

const MODE_LABEL: Record<KeyMode, string> = { live: "Live", test: "Test" };
const field = "input h-10 w-full";

/**
 * API keys: one per system of the club's own that talks to MyOtherApp (its
 * website, an ERP, a college portal). Each has only the scopes ticked for
 * it, and may end on a date or work only from given addresses. The key
 * itself is shown once, when it is made or rotated; the list shows its first
 * characters to tell keys apart.
 */
export function KeysPanel({ status }: { status: IntegrationsStatus }) {
  const keys = useApiKeys();
  const [creating, setCreating] = React.useState(false);
  const [shown, setShown] = React.useState<{ secret: KeyWithSecret; rotated: boolean } | null>(null);
  const [now] = React.useState(() => new Date());
  const list = keys.data ?? [];
  const active = list.filter((k) => keyStatus(k, now) === "active").length;
  const full = active >= status.max_keys;

  return (
    <FigurePanel className="flex flex-col gap-3 p-4" role="region" aria-label="API keys">
      <CardLabel
        right={
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setCreating(true)} disabled={full || keys.isPending}>
            <PlusIcon className="size-3.5" /> Create key
          </button>
        }
      >
        API keys · {active} of {status.max_keys}
      </CardLabel>
      <p className="text-ink-3 m-0 text-[12.5px] leading-[1.5]">
        One key for each system that talks to MyOtherApp for your club. Test keys only see and change test events, which nobody else sees and which send no emails.
      </p>
      {full ? (
        <Notice tone="caution" tag="Limit">
          Your club has {status.max_keys} active keys, the most it may have. Revoke one to make another, or ask the MyOtherApp team for more.
        </Notice>
      ) : null}
      {keys.isPending ? (
        <div className="flex flex-col gap-2" aria-busy="true">
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
        </div>
      ) : keys.isError ? (
        <Notice tone="refuse" tag="Keys">
          We couldn&apos;t load your keys. Try reloading the page.
        </Notice>
      ) : list.length === 0 ? (
        <EmptyState size="sm" tone="muted" icon={<KeyRoundIcon />} title="No keys yet" description="Create one for each system that should reach your club's events, registrations and check-ins." />
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {list.map((k) => (
            <KeyRow key={k.id} k={k} now={now} onRotated={(secret) => setShown({ secret, rotated: true })} />
          ))}
        </ul>
      )}
      {creating ? (
        <CreateKeyDialog
          onClose={() => setCreating(false)}
          onCreated={(secret) => {
            setCreating(false);
            setShown({ secret, rotated: false });
          }}
        />
      ) : null}
      {shown ? <KeySecretDialog shown={shown} onClose={() => setShown(null)} /> : null}
    </FigurePanel>
  );
}

const STATUS_BADGE = {
  active: { label: "Active", tone: "success" },
  expired: { label: "Expired", tone: "default" },
  revoked: { label: "Revoked", tone: "default" },
} as const;

function KeyRow({ k, now, onRotated }: { k: ApiKey; now: Date; onRotated: (s: KeyWithSecret) => void }) {
  const st = keyStatus(k, now);
  const revoke = useRevokeKey();
  const rotate = useRotateKey();
  const [asking, setAsking] = React.useState<"revoke" | "rotate" | null>(null);
  const live = st === "active";
  return (
    <li className="border-line-soft flex flex-col gap-2 border-b py-3 last:border-0" aria-label={k.name}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-ink text-[14px] font-medium">{k.name}</span>
        <span className={cn("tag", k.mode === "test" && "text-caution")}>{MODE_LABEL[k.mode]}</span>
        <StatusBadge label={STATUS_BADGE[st].label} tone={STATUS_BADGE[st].tone} />
        <code className="bg-sunken text-ink-2 rounded px-1.5 py-0.5 font-mono text-[11.5px]">{k.prefix}…</code>
      </div>
      <ScopeTags scopes={k.scopes} />
      <p className="text-ink-3 m-0 text-[12px] leading-[1.5]">
        {k.last_used_at ? (
          <>
            Last used <time dateTime={k.last_used_at} title={formatDateTime(k.last_used_at)}>{relativeTime(k.last_used_at, now)}</time>
            {k.last_used_ip ? <> from <span className="font-mono">{k.last_used_ip}</span></> : null}
          </>
        ) : (
          "Never used"
        )}
        {k.created_at ? ` · made ${formatDate(k.created_at)}${k.created_by ? ` by ${personLabel(k.created_by)}` : ""}` : ""}
        {k.revoked_at ? ` · revoked ${formatDate(k.revoked_at)}` : k.expires_at ? ` · ${st === "expired" ? "ended" : "ends"} ${formatDate(k.expires_at)}` : " · never ends"}
        {k.ip_allowlist?.length ? ` · only from ${k.ip_allowlist.join(", ")}` : ""}
      </p>
      {live ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-secondary btn-xs" onClick={() => setAsking("rotate")} disabled={rotate.isPending}>
            {rotate.isPending ? <Loader2Icon className="size-3 animate-spin" /> : <RefreshCwIcon className="size-3" />} Rotate
          </button>
          <button type="button" className="btn btn-ghost btn-danger btn-xs" onClick={() => setAsking("revoke")} disabled={revoke.isPending}>
            {revoke.isPending ? <Loader2Icon className="size-3 animate-spin" /> : <Trash2Icon className="size-3" />} Revoke
          </button>
        </div>
      ) : null}
      <AlertDialog open={asking !== null} onOpenChange={(open) => !open && setAsking(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{asking === "rotate" ? `Rotate “${k.name}”?` : `Revoke “${k.name}”?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {asking === "rotate"
                ? "You get a new key with the same name and scopes, shown once. The one in use now stops working at once, so put the new one in your system straight away."
                : "Anything still using it is refused from that moment. This can't be undone; you can make a new key."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              className={cn(asking === "revoke" && buttonVariants({ variant: "destructive" }))}
              onClick={() => {
                const what = asking;
                setAsking(null);
                if (what === "revoke") revoke.mutate(k.id);
                else rotate.mutate(k.id, { onSuccess: onRotated });
              }}
            >
              {asking === "rotate" ? "Rotate" : "Revoke"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

function CreateKeyDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (s: KeyWithSecret) => void }) {
  const create = useCreateKey();
  const [form, setForm] = React.useState<KeyForm>(EMPTY_KEY_FORM);
  const [tried, setTried] = React.useState(false);
  const problems = keyFormProblems(form);
  const shownProblems = tried ? problems : {};
  const set = <K extends keyof KeyForm>(key: K, value: KeyForm[K]) => setForm((f) => ({ ...f, [key]: value }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (Object.keys(problems).length) return;
    create.mutate(keyBody(form), { onSuccess: onCreated });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !create.isPending && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Create an API key</DialogTitle>
          <DialogDescription>For one system of your club&apos;s. Tick only what it needs: you can make another key later.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <div>
            <label htmlFor="key-name" className="eyebrow mb-1.5 block">
              Name
            </label>
            <input
              id="key-name"
              className={field}
              value={form.name}
              maxLength={80}
              placeholder="College ERP"
              onChange={(e) => set("name", e.target.value)}
              aria-invalid={shownProblems.name ? true : undefined}
              aria-describedby={shownProblems.name ? "key-name-error" : undefined}
            />
            {shownProblems.name ? (
              <p id="key-name-error" className="text-refuse m-0 mt-1 text-[12px]">
                {shownProblems.name}
              </p>
            ) : null}
          </div>
          <div>
            <span className="eyebrow mb-1.5 block">Mode</span>
            <Segmented label="Mode" value={form.mode} options={KEY_MODES.map((m) => ({ value: m, label: m === "live" ? "Live: real events" : "Test: test events only" }))} onChange={(m) => set("mode", m)} />
          </div>
          <ScopePicker
            idPrefix="key-scope"
            value={form.scopes}
            onChange={(next) => set("scopes", next)}
            recipient={form.name.trim() || "this system"}
            noticeTicked={form.noticeTicked}
            onNoticeTicked={(next) => set("noticeTicked", next)}
            error={shownProblems.scopes}
            noticeError={shownProblems.notice}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="key-expiry" className="eyebrow mb-1.5 block">
                Stops working
              </label>
              <NativeSelect id="key-expiry" className="h-10 w-full" value={form.expiry} onChange={(e) => set("expiry", e.target.value as ExpiryChoice)}>
                {EXPIRY_CHOICES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </NativeSelect>
            </div>
            {form.expiry === "date" ? (
              <div>
                <label htmlFor="key-expiry-date" className="eyebrow mb-1.5 block">
                  Date
                </label>
                <input id="key-expiry-date" type="date" className={field} value={form.expiryDate} onChange={(e) => set("expiryDate", e.target.value)} aria-invalid={shownProblems.expiry ? true : undefined} />
              </div>
            ) : null}
            {shownProblems.expiry ? <p className="text-refuse m-0 text-[12px] sm:col-span-2">{shownProblems.expiry}</p> : null}
          </div>
          <div>
            <label htmlFor="key-ips" className="eyebrow mb-1.5 block">
              Only from these addresses (optional)
            </label>
            <textarea
              id="key-ips"
              className="input min-h-[72px] w-full py-2 font-mono text-[12.5px]"
              value={form.allowlist}
              placeholder={"203.0.113.10\n198.51.100.0/24"}
              onChange={(e) => set("allowlist", e.target.value)}
              aria-invalid={shownProblems.allowlist ? true : undefined}
              aria-describedby="key-ips-hint"
            />
            <p id="key-ips-hint" className={cn("m-0 mt-1 text-[12px]", shownProblems.allowlist ? "text-refuse" : "text-ink-3")}>
              {shownProblems.allowlist ?? "Your server's IP addresses or ranges, one a line. Left empty, it works from anywhere."}
            </p>
          </div>
          <DialogFooter>
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={create.isPending}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={create.isPending}>
              {create.isPending ? <Loader2Icon className="size-4 animate-spin" /> : <KeyRoundIcon className="size-4" />} Create key
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** The key itself, once: a new one, or the replacement for a rotated one. */
function KeySecretDialog({ shown, onClose }: { shown: { secret: KeyWithSecret; rotated: boolean }; onClose: () => void }) {
  const { key, secret } = shown.secret;
  return (
    // Not closed by a click outside: losing it by accident means making another.
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[560px]" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{shown.rotated ? `New key for “${key.name}”` : `“${key.name}” is ready`}</DialogTitle>
          <DialogDescription>
            {shown.rotated ? "The old key has stopped working. Put this one in your system now." : `A ${MODE_LABEL[key.mode].toLowerCase()} key. Send it as the Authorization header: Bearer, then the key.`}
          </DialogDescription>
        </DialogHeader>
        <SecretOnce label="Your API key" secret={secret}>
          <ScopeTags scopes={key.scopes} />
        </SecretOnce>
        <DialogFooter>
          <button type="button" className="btn btn-primary" onClick={onClose}>
            I&apos;ve copied it
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
