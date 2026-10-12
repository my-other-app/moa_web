"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CopyIcon, KeyRoundIcon, Loader2Icon, LogOutIcon, MonitorIcon, SmartphoneIcon, TabletIcon, type LucideIcon } from "lucide-react";
import { formatDateTime, relativeTime } from "@moa/app-kit";
import { CardLabel, Chip, EmptyState, FigurePanel, ProgressBar, Skeleton, StatTile, cn, toast } from "@moa/ui";

import { changePasswordSchema, useChangePassword, type ChangePasswordForm } from "@/features/club";

import { useDisableTwoFactor, useEnableTwoFactor, useNotifyNewDevice, useRevokeSession, useSecurity, useSignOutOthers, useStartTwoFactor } from "../queries";
import { METHODS, resultOf, type ActiveSession, type SecurityOverview } from "../schemas";

/**
 * Security: who is signed in, from where, and what happened at the door.
 *
 * The login is shared by a committee, so every device shows here with its
 * place and when it was last seen, and any of them can be ended from this
 * page — at once, not at its next refresh. Under it, the password, the
 * authenticator switch, where sign-ins come from, and the full history.
 */
const field = "input h-10 w-full";
const label = "eyebrow mb-1.5 block";

function delta(value: number | null, neutral = false): { delta?: string; trend: "none" | "up" | "down" } {
  if (value === null) return { trend: "none" };
  return { delta: `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value)}%`, trend: neutral ? "none" : value > 0 ? "up" : value < 0 ? "down" : "none" };
}

const KIND_ICON: Record<ActiveSession["kind"], LucideIcon> = { phone: SmartphoneIcon, tablet: TabletIcon, computer: MonitorIcon, unknown: MonitorIcon };

function seen(iso: string | null, now: number): string {
  if (!iso) return "—";
  const ago = now - new Date(iso).getTime();
  return ago < 2 * 60_000 ? "Active now" : relativeTime(iso, new Date(now));
}

// ─── Active sessions ─────────────────────────────────────────────────────

function SessionsPanel({ s }: { s: SecurityOverview }) {
  const [now] = React.useState(() => Date.now());
  const revoke = useRevokeSession();
  const [confirm, setConfirm] = React.useState<string | null>(null);
  return (
    <FigurePanel className="p-4">
      <CardLabel right={<span className="text-ink-3 text-[11px]">Shared login — every committee device shows here</span>}>Active sessions</CardLabel>
      <ul className="mt-3 flex flex-col">
        {s.sessions.map((x) => {
          const Icon = KIND_ICON[x.kind];
          const asking = confirm === x.id;
          return (
            <li key={x.id} className="border-line-soft flex items-center gap-3 border-b py-3 last:border-0">
              <span className="bg-sunken text-ink-2 grid size-10 shrink-0 place-items-center rounded-xl">
                <Icon className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-ink text-[14px] font-medium">{x.device}</span>
                  {x.current && <Chip tone="admit">This device</Chip>}
                </div>
                <div className="text-ink-3 mt-0.5 text-[12.5px]">
                  {x.place ?? "Unknown place"} · <span className="font-mono">{x.ip_address ?? "—"}</span> · signed in {formatDateTime(x.created_at)}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className={cn("text-[12.5px]", x.current ? "text-admit font-medium" : "text-ink-3")}>{x.current ? "Active now" : seen(x.last_seen_at, now)}</span>
                {!x.current && (
                  <button
                    type="button"
                    className={cn("btn btn-ghost h-8 px-2 text-[12.5px]", asking ? "text-refuse" : "text-brand")}
                    onClick={() => {
                      if (asking) {
                        revoke.mutate(x.id);
                        setConfirm(null);
                      } else setConfirm(x.id);
                    }}
                    disabled={revoke.isPending}
                  >
                    {asking ? "Sign out?" : "Revoke"}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </FigurePanel>
  );
}

// ─── Password ────────────────────────────────────────────────────────────

function PasswordCard() {
  const router = useRouter();
  const change = useChangePassword();
  const form = useForm<ChangePasswordForm>({ resolver: zodResolver(changePasswordSchema), defaultValues: { old_password: "", new_password: "", confirm_password: "" } });
  const { errors } = form.formState;
  const busy = change.isPending || form.formState.isSubmitting;
  const submit = async (values: ChangePasswordForm) => {
    await change.mutateAsync(values);
    toast.success("Password changed. Sign in again with the new one.");
    router.replace("/login");
    router.refresh();
  };
  return (
    <FigurePanel className="p-4">
      <CardLabel>Change password</CardLabel>
      <p className="text-ink-3 mt-1 text-[12.5px]">Everyone on the committee signs in with this password. Changing it signs out every device, this one too.</p>
      <form onSubmit={form.handleSubmit(submit)} noValidate className="mt-3 flex flex-col gap-3">
        {(
          [
            ["old_password", "Current password"],
            ["new_password", "New password"],
            ["confirm_password", "Repeat new password"],
          ] as const
        ).map(([name, text]) => (
          <div key={name}>
            <label htmlFor={`pw-${name}`} className={label}>{text}</label>
            <input id={`pw-${name}`} type="password" autoComplete={name === "old_password" ? "current-password" : "new-password"} className={field} disabled={busy} aria-invalid={errors[name] ? true : undefined} {...form.register(name)} />
            {errors[name] && <p className="text-refuse mt-1 text-[12px]">{errors[name]?.message}</p>}
          </div>
        ))}
        <div>
          <button type="submit" className="btn btn-secondary h-9" disabled={busy}>
            {busy ? <Loader2Icon className="size-4 animate-spin" /> : <KeyRoundIcon className="size-4" />} Update password
          </button>
        </div>
      </form>
    </FigurePanel>
  );
}

// ─── Two-factor ──────────────────────────────────────────────────────────

function TwoFactorCard({ s }: { s: SecurityOverview }) {
  const start = useStartTwoFactor();
  const enable = useEnableTwoFactor();
  const disable = useDisableTwoFactor();
  const [setup, setSetup] = React.useState<{ secret: string; provisioning_uri: string } | null>(null);
  const [code, setCode] = React.useState("");
  const [codes, setCodes] = React.useState<string[] | null>(null);
  const [turningOff, setTurningOff] = React.useState(false);
  const on = s.two_factor.enabled;

  const begin = async () => setSetup(await start.mutateAsync());
  const finish = async () => {
    const r = await enable.mutateAsync(code.trim());
    setCodes(r.recovery_codes);
    setSetup(null);
    setCode("");
  };
  const off = async () => {
    await disable.mutateAsync(code.trim());
    setTurningOff(false);
    setCode("");
  };
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied");
    } catch {
      toast.error("Could not copy");
    }
  };

  return (
    <FigurePanel className="p-4">
      <CardLabel right={<Chip tone={on ? "admit" : undefined}>{on ? "On" : "Off"}</Chip>}>Two-factor sign-in</CardLabel>
      <p className="text-ink-3 mt-1 text-[12.5px]">Ask for a 6-digit code from an authenticator app at sign-in. On a shared login, add it to the committee&apos;s shared authenticator so nobody gets locked out.</p>
      {codes ? (
        <div className="bg-sunken mt-3 rounded-xl p-3">
          <p className="text-ink text-[13px] font-medium">Recovery codes — shown once. Keep them somewhere safe.</p>
          <ul className="mt-2 grid grid-cols-2 gap-1 font-mono text-[12.5px]">
            {codes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <div className="mt-2 flex gap-2">
            <button type="button" className="btn btn-secondary h-8 text-[12.5px]" onClick={() => copy(codes.join("\n"))}>
              <CopyIcon className="size-3.5" /> Copy all
            </button>
            <button type="button" className="btn btn-ghost h-8 text-[12.5px]" onClick={() => setCodes(null)}>
              Done
            </button>
          </div>
        </div>
      ) : setup ? (
        <div className="mt-3 flex flex-col gap-2">
          <p className="text-ink-2 text-[12.5px]">Add this key to the authenticator app, then enter the code it shows.</p>
          <div className="bg-sunken flex items-center gap-2 rounded-xl px-3 py-2">
            <code className="text-ink flex-1 break-all text-[12.5px]">{setup.secret}</code>
            <button type="button" className="btn btn-ghost h-7 px-2" aria-label="Copy the key" onClick={() => copy(setup.secret)}>
              <CopyIcon className="size-3.5" />
            </button>
          </div>
          <a href={setup.provisioning_uri} className="text-brand text-[12.5px] underline-offset-2 hover:underline">
            Open in an authenticator app on this device
          </a>
          <div className="flex gap-2">
            <input aria-label="Authenticator code" className={cn(field, "w-[140px] font-mono tracking-[0.2em]")} inputMode="numeric" maxLength={8} placeholder="123456" value={code} onChange={(e) => setCode(e.target.value)} />
            <button type="button" className="btn btn-primary h-10" onClick={finish} disabled={enable.isPending || code.trim().length < 6}>
              Turn on
            </button>
            <button type="button" className="btn btn-ghost h-10" onClick={() => setSetup(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : turningOff ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input aria-label="Authenticator code" className={cn(field, "w-[140px] font-mono tracking-[0.2em]")} inputMode="numeric" maxLength={8} placeholder="123456" value={code} onChange={(e) => setCode(e.target.value)} />
          <button type="button" className="btn btn-secondary text-refuse h-10" onClick={off} disabled={disable.isPending || code.trim().length < 6}>
            Turn off
          </button>
          <button type="button" className="btn btn-ghost h-10" onClick={() => setTurningOff(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-3">
          {on ? (
            <>
              <button type="button" className="btn btn-secondary h-9" onClick={() => setTurningOff(true)}>
                Turn off
              </button>
              <span className="text-ink-3 text-[12px]">{s.two_factor.recovery_codes_remaining} recovery codes left</span>
            </>
          ) : (
            <button type="button" className="btn btn-secondary text-brand h-9" onClick={begin} disabled={start.isPending}>
              Turn on
            </button>
          )}
        </div>
      )}
    </FigurePanel>
  );
}

// ─── Places and the switch ───────────────────────────────────────────────

function PlacesCard({ s }: { s: SecurityOverview }) {
  const notify = useNotifyNewDevice();
  const max = Math.max(1, ...s.by_place.map((p) => p.total));
  return (
    <FigurePanel className="p-4">
      <CardLabel>Where sign-ins come from</CardLabel>
      {s.by_place.length === 0 ? (
        <p className="text-ink-3 mt-3 text-[13px]">No sign-ins in the last 30 days.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {s.by_place.map((p) => (
            <li key={p.place}>
              <div className="flex items-baseline justify-between gap-3 text-[13px]">
                <span className="text-ink truncate">{p.place}</span>
                <span className="text-ink-2 tabular-nums">
                  {p.total}
                  {p.failed > 0 && <span className="text-refuse"> · {p.failed} failed</span>}
                </span>
              </div>
              <ProgressBar value={p.total} max={max} tone={p.failed > 0 && p.failed === p.total ? "refuse" : "accent"} height={6} className="mt-1.5" label={`${p.place} sign-ins`} />
            </li>
          ))}
        </ul>
      )}
      <label className="border-line-soft mt-4 flex cursor-pointer items-center justify-between gap-3 border-t pt-3">
        <span>
          <span className="text-ink block text-[13px] font-medium">Email me about new devices</span>
          <span className="text-ink-3 text-[12px]">Sent to the account&apos;s email the first time a device signs in</span>
        </span>
        <input type="checkbox" role="switch" aria-label="Email me about new devices" checked={s.notify_new_device} disabled={notify.isPending} onChange={(e) => notify.mutate(e.target.checked)} className="accent-[var(--brand)] size-5" />
      </label>
    </FigurePanel>
  );
}

// ─── History ─────────────────────────────────────────────────────────────

function HistoryPanel({ s }: { s: SecurityOverview }) {
  const [failedOnly, setFailedOnly] = React.useState(false);
  const rows = failedOnly ? s.history.filter((h) => resultOf(h.result).failed) : s.history;
  const th = "eyebrow px-3 py-2 text-left";
  return (
    <FigurePanel className="overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-4">
        <CardLabel>Sign-in history</CardLabel>
        <div className="flex gap-1">
          <Chip active={!failedOnly} onClick={() => setFailedOnly(false)}>
            All
          </Chip>
          <Chip active={failedOnly} onClick={() => setFailedOnly(true)}>
            Failed only
          </Chip>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="text-ink-3 px-4 pb-4 pt-3 text-[13px]">Nothing to show.</p>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-line-soft border-b">
                <th className={th}>When</th>
                <th className={th}>Location</th>
                <th className={th}>Device</th>
                <th className={th}>IP address</th>
                <th className={th}>Method</th>
                <th className={th}>Result</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((h) => {
                const r = resultOf(h.result);
                return (
                  <tr key={h.id} className="border-line-soft border-b last:border-0">
                    <td className="text-ink px-3 py-2.5 whitespace-nowrap">{formatDateTime(h.at)}</td>
                    <td className="text-ink px-3 py-2.5">{h.place ?? "Unknown"}</td>
                    <td className="text-ink-2 px-3 py-2.5">{h.device}</td>
                    <td className="text-ink-2 px-3 py-2.5 font-mono text-[12.5px]">{h.ip_address ?? "—"}</td>
                    <td className="text-ink-2 px-3 py-2.5">{METHODS[h.method] ?? h.method}</td>
                    <td className="px-3 py-2.5">
                      <Chip tone={r.tone === "neutral" ? undefined : r.tone}>{r.label}</Chip>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </FigurePanel>
  );
}

// ─── The page ────────────────────────────────────────────────────────────

export function SecurityPage() {
  const q = useSecurity();
  const s = q.data;
  const others = useSignOutOthers();
  const [confirmAll, setConfirmAll] = React.useState(false);
  const otherCount = s ? s.sessions.filter((x) => !x.current).length : 0;

  return (
    <div className="flex flex-col gap-3.5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="page-title m-0 font-semibold tracking-[-0.02em]">Security</h2>
          <p className="text-ink-2 mt-1 text-[13px]">{s ? `Shared login · ${s.account}` : "Who is signed in, and what happened at the door"}</p>
        </div>
        <button
          type="button"
          className={cn("btn h-9", confirmAll ? "btn-primary" : "btn-secondary")}
          disabled={!s || otherCount === 0 || others.isPending}
          onClick={() => {
            if (confirmAll) {
              others.mutate();
              setConfirmAll(false);
            } else setConfirmAll(true);
          }}
        >
          <LogOutIcon className="size-4" /> {confirmAll ? `Sign out ${otherCount} other ${otherCount === 1 ? "session" : "sessions"}?` : "Sign out all other sessions"}
        </button>
      </header>

      {q.isError ? (
        <EmptyState tone="muted" title="Could not load security" description="Try reloading the page." />
      ) : !s ? (
        <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-[120px] rounded-2xl" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile label="Active sessions" value={s.counts.active_sessions} note="Devices signed in right now" />
            <StatTile label="Sessions created · 30 days" value={s.counts.sessions_30d} {...delta(s.counts.sessions_delta)} note={`${Math.min(s.history.length, 60)} most recent below`} />
            <StatTile label="Places" value={s.counts.places_30d} {...delta(s.counts.places_delta)} note="Cities sign-ins came from" />
            <StatTile
              label="Failed attempts"
              value={s.counts.failed_30d}
              {...delta(s.counts.failed_delta, true)}
              note={s.counts.last_blocked_place ? `${s.counts.last_blocked_place} was blocked after ${s.lockout.max_failed} tries` : `A door locks after ${s.lockout.max_failed} wrong passwords`}
            />
          </div>
          <div className="grid gap-3.5 lg:grid-cols-[1.45fr_1fr]">
            <SessionsPanel s={s} />
            <div className="flex flex-col gap-3.5">
              <PasswordCard />
              <TwoFactorCard s={s} />
              <PlacesCard s={s} />
            </div>
          </div>
          <HistoryPanel s={s} />
        </>
      )}
    </div>
  );
}
