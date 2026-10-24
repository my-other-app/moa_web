"use client";

import * as React from "react";
import { MailIcon, MessageCircleIcon, ShieldCheckIcon, Trash2Icon } from "lucide-react";
import { formatDate, initials } from "@moa/app-kit";
import {
  Button,
  CardLabel,
  DefinitionRows,
  EmptyState,
  FigurePanel,
  NativeSelect,
  Notice,
  Skeleton,
  StatTile,
  Switch,
} from "@moa/ui";

import { LimitMeter, openUpgrade, usePlan } from "@/features/plan";

import { useAccessList, useChangeRole, useRemoveMember, useResendInvite, useSetMemberWhatsApp } from "../queries";
import { DEFAULT_MEMBER_ROLE, type AccessList, type MemberRole, type MemberRow } from "../schemas";
import { InviteDialog, InviteLink } from "./invite-dialog";

/**
 * Access: who can sign in to the club's dashboard, and what each may do.
 *
 * The club's own account is the owner and is always first. Everyone else
 * signs in with their own email and password and a role; the owner invites,
 * changes roles and takes access away (their sessions end at once). An admin
 * can read this page; nobody else sees it.
 */
const WEEK = 7 * 24 * 60 * 60 * 1000;

function seen(at: string | null, now: number) {
  if (!at) return "Not signed in yet";
  const mins = Math.round((now - new Date(at).getTime()) / 60000);
  if (mins < 2) return "Active now";
  if (mins < 60) return `Active ${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `Active ${hours} h ago`;
  return `Last active ${formatDate(at)}`;
}

function Avatar({ name }: { name: string }) {
  return <span className="bg-brand-soft text-brand grid size-9 shrink-0 place-items-center rounded-full font-mono text-[11px] font-semibold">{initials(name)}</span>;
}

function MemberLine({ m, roles, canManage, now }: { m: MemberRow; roles: AccessList["roles"]; canManage: boolean; now: number }) {
  const changeRole = useChangeRole();
  const remove = useRemoveMember();
  const resend = useResendInvite();
  const whatsapp = useSetMemberWhatsApp();
  // Any role but the default is the plan's `roles`; a member who already has one keeps it.
  const rolesLock = usePlan().featureLock("roles");
  const [asking, setAsking] = React.useState(false);
  const [link, setLink] = React.useState<string | null>(null);
  const name = m.full_name ?? m.email;

  const status =
    m.status === "active" ? (
      <span className="text-ink-3">{seen(m.last_seen_at, now)}</span>
    ) : m.invite_expired ? (
      <span className="text-caution font-medium">Invite expired · resend it</span>
    ) : (
      <span className="text-ink-3">Invited {m.invited_at ? formatDate(m.invited_at) : ""} · not joined yet</span>
    );

  return (
    <li className="border-line-soft flex flex-col gap-2 border-b py-3 last:border-0">
      <div className="flex flex-wrap items-center gap-3">
        <Avatar name={name} />
        <div className="min-w-0 flex-1">
          <div className="text-ink truncate text-[14px] font-medium">{name}</div>
          <div className="text-ink-3 truncate text-[12.5px]">
            {m.full_name ? `${m.email} · ` : ""}
            {status}
          </div>
        </div>
        {/* Wraps under the name on a phone: the WhatsApp switch, the role, Resend and Remove don't fit one 375px row. */}
        <div className="flex min-w-0 flex-wrap items-center gap-2" data-slot="member-actions">
          {canManage ? (
            <label className="text-ink-2 inline-flex shrink-0 items-center gap-1.5 text-[12px]" title="Reads and answers the club's WhatsApp messages">
              <MessageCircleIcon className="size-3.5" aria-hidden="true" />
              WhatsApp
              <Switch
                aria-label={`WhatsApp permission for ${name}`}
                checked={m.whatsapp}
                disabled={whatsapp.isPending}
                onCheckedChange={(allowed) => whatsapp.mutate({ id: m.id, allowed })}
              />
            </label>
          ) : m.whatsapp ? (
            <span className="tag">WhatsApp</span>
          ) : null}
          {canManage ? (
            <NativeSelect
              size="sm"
              aria-label={`Role for ${name}`}
              value={m.role}
              disabled={changeRole.isPending}
              onChange={(e) => {
                const role = e.target.value as MemberRole;
                if (rolesLock && role !== DEFAULT_MEMBER_ROLE) return openUpgrade(rolesLock);
                changeRole.mutate({ id: m.id, role });
              }}
              className="w-[120px]"
            >
              {roles.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                  {rolesLock && r.key !== DEFAULT_MEMBER_ROLE && r.key !== m.role ? ` · ${rolesLock.requiredPlanName ?? "locked"}` : ""}
                </option>
              ))}
            </NativeSelect>
          ) : (
            <span className="tag">{m.role_label}</span>
          )}
          {canManage && m.status === "invited" ? (
            <Button
              variant="secondary"
              size="sm"
              disabled={resend.isPending}
              onClick={async () => setLink((await resend.mutateAsync(m.id)).invite_url)}
            >
              <MailIcon className="size-3.5" /> Resend
            </Button>
          ) : null}
          {canManage ? (
            <Button
              variant={asking ? "destructive" : "ghost"}
              danger={!asking}
              size="sm"
              disabled={remove.isPending}
              onBlur={() => setAsking(false)}
              onClick={() => (asking ? remove.mutate(m.id) : setAsking(true))}
            >
              <Trash2Icon className="size-3.5" /> {asking ? "Remove access?" : "Remove"}
            </Button>
          ) : null}
        </div>
      </div>
      {link ? (
        <div className="pl-12">
          <InviteLink url={link} />
        </div>
      ) : null}
    </li>
  );
}

export function AccessPage() {
  const q = useAccessList();
  const [now] = React.useState(() => Date.now());
  const a = q.data;
  const members = a?.members ?? [];
  const active = members.filter((m) => m.status === "active");
  const waiting = members.filter((m) => m.status === "invited" && !m.invite_expired);
  const expired = members.filter((m) => m.status === "invited" && m.invite_expired);
  const recent = active.filter((m) => m.last_seen_at && now - new Date(m.last_seen_at).getTime() < WEEK);
  // The server's count is the one that holds (members not removed, the club's own account not
  // counted); the list's own count is only for a server that does not send it.
  const plan = usePlan();
  const seatsUsed = plan.used("committee_seats") ?? active.length + waiting.length;

  return (
    <div className="flex flex-col gap-3.5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="page-title m-0 font-semibold tracking-[-0.02em]">Access</h2>
          <p className="text-ink-2 mt-1 text-[13px]">Who can sign in to the club&apos;s dashboard, and what each person may do.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Seats are the people who can sign in besides the club's own account. */}
          {a ? <LimitMeter limitKey="committee_seats" used={seatsUsed} /> : null}
          {a?.can_manage ? <InviteDialog roles={a.roles} seatsUsed={seatsUsed} /> : null}
        </div>
      </header>

      {q.isError ? (
        <EmptyState tone="muted" title="Could not load who has access" description="Try reloading the page." />
      ) : !a ? (
        <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-[120px] rounded-2xl" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile label="People with access" value={active.length + 1} note="The club account and everyone who joined" />
            <StatTile label="Active this week" value={recent.length} note="Team members who signed in" />
            <StatTile label="Invites waiting" value={waiting.length} note="Sent, not accepted yet" />
            <StatTile label="Expired invites" value={expired.length} note={expired.length ? "Resend to try again" : "None"} />
          </div>

          {!a.can_manage ? (
            <Notice tone="neutral" tag="Read only">
              Only the club&apos;s own account can invite people, change roles or take access away.
            </Notice>
          ) : null}

          <div className="grid gap-3.5 lg:grid-cols-[minmax(0,1fr)_320px]">
            <FigurePanel className="p-4">
              <CardLabel right={<span className="text-ink-3 text-[11px]">{members.length + 1} in all</span>}>Who can sign in</CardLabel>
              <ul className="mt-2 flex flex-col">
                <li className="border-line-soft flex items-center gap-3 border-b py-3">
                  <span className="bg-brand text-brand-foreground grid size-9 shrink-0 place-items-center rounded-full">
                    <ShieldCheckIcon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-ink truncate text-[14px] font-medium">The club account</div>
                    <div className="text-ink-3 truncate text-[12.5px]">{a.owner_email ?? "The club's own login"}</div>
                  </div>
                  <span className="tag">Owner</span>
                </li>
                {members.map((m) => (
                  <MemberLine key={m.id} m={m} roles={a.roles} canManage={a.can_manage} now={now} />
                ))}
              </ul>
              {members.length === 0 ? (
                <div className="mt-2">
                  <EmptyState
                    tone="muted"
                    title="Only the club account can sign in"
                    description="Invite the committee so each person has their own password, you can see who did what, and one person can leave without the password changing for everyone."
                  />
                </div>
              ) : null}
            </FigurePanel>

            <FigurePanel className="p-4">
              <CardLabel>What each role can do</CardLabel>
              <div className="mt-2">
                <DefinitionRows
                  rows={[
                    { k: "Owner", v: "Everything, including who can sign in." },
                    ...a.roles.map((r) => ({ k: r.label, v: r.description })),
                    { k: "WhatsApp", v: "Given person by person, whatever the role: reads and answers the club's WhatsApp messages." },
                  ]}
                />
              </div>
              <p className="text-ink-3 mt-3 text-[12px] leading-[1.55]">
                A role holds on every request, so a change applies at once. Removing someone ends their sessions on every device.
              </p>
            </FigurePanel>
          </div>
        </>
      )}
    </div>
  );
}
