"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckIcon, CopyIcon, DownloadIcon, Loader2Icon, Trash2Icon } from "lucide-react";
import { formatDate } from "@moa/app-kit";
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
  EmptyState,
  FigurePanel,
  Input,
  NativeSelect,
  Notice,
  Skeleton,
  Switch,
  Textarea,
  buttonVariants,
  cn,
  toast,
} from "@moa/ui";

import { askNotifyPermission, notifyPermission } from "@/features/whatsapp/alerts";

import { useMailNotify } from "../alerts";
import { EXPORT_HREF, checkHandle } from "../api";
import { errorText, useMailbox, useSaveAddress, useSaveSettings, useSaveSignature, useWipeMail } from "../queries";
import { PRIVATE_MESSAGE, handleProblem, type HandleCheck, type Mailbox } from "../schemas";
import { LapseNotice, MailHeader, MailUnavailable, MailUpgradeNotice, NoAccessPanel } from "./shared";

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Copied");
  } catch {
    toast.error("Could not copy. Select it and copy by hand.");
  }
}

function useDebounced<T>(value: T, ms = 350): T {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/**
 * Whether a handle can be the club's, asked of the server a moment after
 * the typing stops (it holds the rules and knows who has what). The rules
 * this page knows are said at once, without asking.
 */
export function useHandleCheck(handle: string, enabled: boolean, check: (h: string) => Promise<HandleCheck> = checkHandle) {
  const value = handle.trim().toLowerCase();
  const local = handleProblem(value);
  const settled = useDebounced(value);
  const q = useQuery({
    queryKey: ["mailbox", "handle-check", settled],
    queryFn: () => check(settled),
    enabled: enabled && Boolean(settled) && !handleProblem(settled),
    staleTime: 10_000,
    retry: false,
  });
  const result = q.data && q.data.handle === value ? q.data : null;
  return { local, result, checking: Boolean(value && !local && (settled !== value || q.isFetching)) };
}

function AddressForm({ mb, check }: { mb: Mailbox; check?: (h: string) => Promise<HandleCheck> }) {
  const [handle, setHandle] = React.useState("");
  const save = useSaveAddress();
  const changing = mb.set_up;
  const locked = Boolean(mb.next_change_at);
  const { local, result, checking } = useHandleCheck(handle, !locked, check);
  const value = handle.trim().toLowerCase();
  const problem = local ?? (result && !result.available ? result.message || "That address can't be used." : null);
  const ok = Boolean(value && !local && result?.available);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ok || save.isPending) return;
    save.mutate(value, {
      onSuccess: (next) => {
        toast.success(changing ? `The club's address is now ${next.address}` : `The club's mailbox is ready: ${next.address}`);
        setHandle("");
      },
    });
  };
  if (changing && locked) {
    return <p className="text-ink-3 m-0 text-[12.5px]">The address can change once a month. The next change can be made on {formatDate(mb.next_change_at!)}.</p>;
  }
  return (
    <form className="flex flex-col gap-2" onSubmit={submit} aria-label={changing ? "Change the address" : "Pick the address"}>
      <label htmlFor="mail-handle" className="eyebrow">
        {changing ? "New address" : "The club's address"}
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <Input
            id="mail-handle"
            value={handle}
            onChange={(e) => setHandle(e.target.value.toLowerCase())}
            placeholder="yourclub"
            maxLength={30}
            autoComplete="off"
            aria-invalid={Boolean(problem) || undefined}
            aria-describedby="mail-handle-help"
            className="max-w-[260px]"
          />
          <span className="text-ink-2 text-[13px]">@{mb.domain}</span>
        </div>
        <button type="submit" className="btn btn-primary btn-sm" disabled={!ok || save.isPending}>
          {save.isPending ? <Loader2Icon className="size-3.5 animate-spin" aria-hidden="true" /> : null} {changing ? "Change the address" : "Set up the mailbox"}
        </button>
      </div>
      <p id="mail-handle-help" className={cn("m-0 text-[12px]", problem ? "text-refuse" : "text-ink-3")} role={problem ? "alert" : undefined}>
        {problem
          ? problem
          : checking
            ? "Checking…"
            : ok
              ? `${value}@${mb.domain} is free.`
              : "3 to 30 letters, numbers, dots and hyphens. It can change once a month."}
      </p>
      {changing ? (
        <p className="text-ink-3 m-0 text-[12px]">The old address keeps forwarding here for 90 days, so nobody&apos;s mail is lost while people catch up.</p>
      ) : null}
      {save.isError ? <p className="text-refuse m-0 text-[12px]">{errorText(save.error)}</p> : null}
    </form>
  );
}

function SendingAs({ mb }: { mb: Mailbox }) {
  const [name, setName] = React.useState(mb.display_name ?? "");
  const [months, setMonths] = React.useState(String(mb.retention_months));
  const save = useSaveSettings();
  const changed = name.trim() !== (mb.display_name ?? "") || Number(months) !== mb.retention_months;
  return (
    <form
      className="flex flex-col gap-3"
      aria-label="Sending and keeping"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate({ display_name: name.trim(), retention_months: Number(months) }, { onSuccess: () => toast.success("Saved"), onError: (err) => toast.error(errorText(err)) });
      }}
    >
      <div className="flex flex-col gap-1">
        <label htmlFor="mail-name" className="eyebrow">
          The name mail is sent as
        </label>
        <Input id="mail-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="The club's name" className="max-w-[360px]" />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="mail-retention" className="eyebrow">
          Keep mail for
        </label>
        <NativeSelect id="mail-retention" size="sm" value={months} onChange={(e) => setMonths(e.target.value)} className="w-[180px]">
          {[1, 3, 6, 12, 18, 24, 36].map((n) => (
            <option key={n} value={n}>
              {n === 1 ? "1 month" : `${n} months`}
            </option>
          ))}
        </NativeSelect>
        <p className="text-ink-3 m-0 text-[12px]">Older mail and its files are deleted for good.</p>
      </div>
      <div>
        <button type="submit" className="btn btn-primary btn-sm" disabled={!changed || save.isPending}>
          Save
        </button>
      </div>
    </form>
  );
}

function SignatureForm({ mb }: { mb: Mailbox }) {
  const [text, setText] = React.useState(mb.signature ?? "");
  const save = useSaveSignature();
  return (
    <form
      className="flex flex-col gap-2"
      aria-label="Signature"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(text, { onSuccess: () => toast.success("Signature saved"), onError: (err) => toast.error(errorText(err)) });
      }}
    >
      <label htmlFor="mail-signature" className="eyebrow">
        Signature
      </label>
      <Textarea id="mail-signature" value={text} onChange={(e) => setText(e.target.value)} rows={4} maxLength={2000} placeholder={"The Robotics Club\nIIT Madras"} />
      <p className="text-ink-3 m-0 text-[12px]">Added under what the team writes (each mail can leave it off).</p>
      <div>
        <button type="submit" className="btn btn-secondary btn-sm" disabled={text === (mb.signature ?? "") || save.isPending}>
          Save the signature
        </button>
      </div>
    </form>
  );
}

function BrowserNotifications() {
  const [prefs, setPrefs] = useMailNotify();
  const permission = notifyPermission();
  return (
    <div className="flex flex-col gap-2">
      <label className="text-ink inline-flex items-center gap-2 text-[13px]">
        <Switch
          aria-label="Notify me in this browser"
          checked={prefs.enabled}
          disabled={permission === "unsupported" || permission === "denied"}
          onCheckedChange={async (on) => {
            if (on && notifyPermission() !== "granted") {
              const got = await askNotifyPermission();
              if (got !== "granted") return toast.error("The browser didn't allow notifications.");
            }
            setPrefs({ ...prefs, enabled: on });
          }}
        />
        Notify me in this browser when mail comes while the tab is in the background
      </label>
      <p className="text-ink-3 m-0 text-[12px]">
        {permission === "unsupported"
          ? "This browser can't show notifications."
          : permission === "denied"
            ? "Notifications are blocked for this site in the browser's settings."
            : "Who wrote and how many, never what. Only this browser."}
      </p>
    </div>
  );
}

function WholeMailbox({ mb }: { mb: Mailbox }) {
  const [confirming, setConfirming] = React.useState(false);
  const [typed, setTyped] = React.useState("");
  const wipe = useWipeMail();
  return (
    <div className="flex flex-col gap-3">
      <p className="text-ink-2 m-0 text-[13px]">
        {mb.state === "expired"
          ? "The mailbox's 30 days are over: download all of its mail to keep it, or delete it."
          : "Download all of the club's mail, received and sent, as one mbox file any mail program opens."}
      </p>
      <div className="flex flex-wrap gap-2">
        <a href={EXPORT_HREF} download="club-mail.mbox" className="btn btn-secondary btn-sm">
          <DownloadIcon className="size-3.5" aria-hidden="true" /> Export all mail
        </a>
        <button type="button" className={cn(buttonVariants({ variant: "destructive", size: "sm" }))} onClick={() => setConfirming(true)}>
          <Trash2Icon className="size-3.5" aria-hidden="true" /> Delete all mail
        </button>
      </div>
      <AlertDialog
        open={confirming}
        onOpenChange={(o) => {
          setConfirming(o);
          if (!o) setTyped("");
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete all of the club&apos;s mail?</AlertDialogTitle>
            <AlertDialogDescription>
              Every conversation and file, received and sent, is deleted for good, for everyone on the team. The address stays. Export it first if you want to keep
              it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <label htmlFor="mail-wipe" className="eyebrow">
            Type DELETE to confirm
          </label>
          <Input id="mail-wipe" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          <AlertDialogFooter>
            <AlertDialogCancel>Keep the mail</AlertDialogCancel>
            <AlertDialogAction
              className={cn(buttonVariants({ variant: "destructive" }))}
              disabled={typed !== "DELETE" || wipe.isPending}
              onClick={(e) => {
                e.preventDefault();
                wipe.mutate(undefined, {
                  onSuccess: (r) => {
                    toast.success(`Deleted ${r.deleted_threads ?? 0} conversation${r.deleted_threads === 1 ? "" : "s"}`);
                    setConfirming(false);
                    setTyped("");
                  },
                  onError: (err) => toast.error(errorText(err)),
                });
              }}
            >
              Delete all mail
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/**
 * Mail settings: the club's address (picked once, changed at most once a
 * month, the old one forwarding 90 days), the name it sends as and how long
 * mail is kept (owner and admins), the signature (the Mail people), this
 * browser's notifications, and -- for the club's own account -- export or
 * delete everything. The plan's lock and a lapse are said at the top.
 */
export function MailSettingsPage({ checkHandleFn }: { checkHandleFn?: (h: string) => Promise<HandleCheck> } = {}) {
  const status = useMailbox();
  const mb = status.data;
  if (mb && (!mb.on_server || !mb.available)) return <MailUnavailable />;
  return (
    <div className="flex flex-col gap-3.5">
      <MailHeader title="Mail settings" sub={mb?.address ? mb.address : "The club's own mailbox"} />
      {status.isError ? (
        <EmptyState tone="muted" title="Could not load Mail" description={errorText(status.error, "Try reloading the page.")} />
      ) : !mb ? (
        <Skeleton className="h-[320px] rounded-2xl" />
      ) : (
        <>
          {mb.impersonated ? (
            <Notice tone="neutral" tag="Private">
              {PRIVATE_MESSAGE}
            </Notice>
          ) : null}
          {!mb.plan_allows && mb.state === "open" ? <MailUpgradeNotice upgrade={mb.upgrade} /> : null}
          <LapseNotice mailbox={mb} />
          {!mb.can_manage && !mb.can_mail ? (
            <NoAccessPanel title="Mail isn't open to you" body="Ask the club's owner for the Mail permission." />
          ) : (
            <div className="grid gap-3.5 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="flex flex-col gap-3.5">
                <FigurePanel className="flex flex-col gap-3 p-4" role="region" aria-label="The address">
                  <CardLabel>The address</CardLabel>
                  {mb.set_up && mb.address ? (
                    <div className="bg-sunken flex items-center gap-2 rounded-xl px-3 py-2">
                      <code className="text-ink min-w-0 flex-1 text-[14px] break-all">{mb.address}</code>
                      <button type="button" className="btn btn-ghost btn-xs" onClick={() => void copy(mb.address!)} aria-label="Copy the address">
                        <CopyIcon className="size-3.5" aria-hidden="true" /> Copy
                      </button>
                    </div>
                  ) : (
                    <p className="text-ink-2 m-0 text-[13px]">
                      Your club gets one address on {mb.domain}. Mail sent to it arrives in the dashboard; the team reads and answers it there.
                    </p>
                  )}
                  {mb.previous.length ? (
                    <ul className="m-0 flex list-none flex-col gap-1 p-0" aria-label="Earlier addresses">
                      {mb.previous.map((p) => (
                        <li key={p.address} className="text-ink-3 text-[12.5px]">
                          {p.address} still forwards here{p.forward_until ? ` until ${formatDate(p.forward_until)}` : ""}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {mb.can_manage && mb.plan_allows && mb.state === "open" ? (
                    <AddressForm mb={mb} check={checkHandleFn} />
                  ) : !mb.set_up && !mb.can_manage ? (
                    <p className="text-ink-3 m-0 text-[12.5px]">The club&apos;s owner or an admin picks the address.</p>
                  ) : null}
                </FigurePanel>
                {mb.set_up && mb.can_manage ? (
                  <FigurePanel className="p-4" role="region" aria-label="Sending and keeping">
                    <CardLabel>Sending and keeping</CardLabel>
                    <div className="mt-2">
                      <SendingAs mb={mb} />
                    </div>
                  </FigurePanel>
                ) : null}
                {mb.set_up && mb.can_mail ? (
                  <FigurePanel className="p-4" role="region" aria-label="Signature">
                    <SignatureForm mb={mb} />
                  </FigurePanel>
                ) : null}
                {mb.set_up && mb.is_owner ? (
                  <FigurePanel className="p-4" role="region" aria-label="All of the mail">
                    <CardLabel>All of the mail</CardLabel>
                    <div className="mt-2">
                      <WholeMailbox mb={mb} />
                    </div>
                  </FigurePanel>
                ) : null}
              </div>
              <div className="flex flex-col gap-3.5">
                <FigurePanel className="p-4">
                  <CardLabel>How it works</CardLabel>
                  <div className="mt-2">
                    <DefinitionRows
                      rows={[
                        { k: "Sending", v: `Always from the club's address. Up to ${mb.limits.per_hour} mails an hour and ${mb.limits.per_day} a day, each to at most ${mb.limits.recipients} people.` },
                        { k: "Files", v: `Up to ${mb.limits.attachments_mb} MB together on one mail.` },
                        { k: "Credits", v: mb.credits_left == null ? "Each mail sent is one email credit." : `Each mail sent is one email credit; ${mb.credits_left.toLocaleString("en-IN")} left.` },
                        { k: "Spam", v: "Mail that looks like spam goes to Spam; mail with a virus is never kept." },
                        { k: "Kept", v: `${mb.retention_months} months, then deleted.` },
                      ]}
                    />
                  </div>
                </FigurePanel>
                {mb.can_mail ? (
                  <FigurePanel className="p-4" role="region" aria-label="Notifications">
                    <CardLabel>Notifications</CardLabel>
                    <div className="mt-2">
                      <BrowserNotifications />
                    </div>
                  </FigurePanel>
                ) : null}
                {mb.set_up && mb.state === "open" && mb.plan_allows ? (
                  <p className="text-ink-3 m-0 inline-flex items-center gap-1.5 text-[12px]">
                    <CheckIcon className="size-3.5" aria-hidden="true" /> Receiving at {mb.address}
                  </p>
                ) : null}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
