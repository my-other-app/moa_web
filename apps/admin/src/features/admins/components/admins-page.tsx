"use client";

import * as React from "react";
import { MailIcon, UserMinusIcon, UserPlusIcon } from "lucide-react";
import { formatDate } from "@moa/app-kit";
import {
  Button,
  DataTable,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  NativeSelect,
  Notice,
  StatusBadge,
  type DataTableColumn,
} from "@moa/ui";

import { useCan } from "@/hooks/use-can";
import { ConfirmAction } from "@/features/ops";

import { useAdmins, useInviteAdmin, useRemoveAdmin, useResendInvite } from "../queries";
import { ADMIN_ROLES, ROLE_WORDS, inviteInputSchema, inviteLabel, type AdminAccount, type AdminRoleName } from "../schemas";

/** The form, inside the dialog's content: closing the dialog starts it afresh. */
function InviteForm({ onDone }: { onDone: () => void }) {
  const invite = useInviteAdmin();
  const [email, setEmail] = React.useState("");
  const [name, setName] = React.useState("");
  const [role, setRole] = React.useState<AdminRoleName>("viewer");
  const [error, setError] = React.useState<string | null>(null);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = inviteInputSchema.safeParse({ email, full_name: name || undefined, role });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the form");
      return;
    }
    setError(null);
    invite.mutate(parsed.data, { onSuccess: onDone });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Add an admin</DialogTitle>
        <DialogDescription>
          Their account is made an admin (or one is made for the address), and they are mailed a link to set a
          password. They set up two-factor before they can use the portal. Recorded in the activity log.
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="invite-email">Email</Label>
        <Input id="invite-email" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="invite-name">Name (for a new account)</Label>
        <Input id="invite-name" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="invite-role">Role</Label>
        <NativeSelect id="invite-role" value={role} onChange={(e) => setRole(e.target.value as AdminRoleName)}>
          {ADMIN_ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_WORDS[r]}
            </option>
          ))}
        </NativeSelect>
      </div>
      {error ? <Notice tone="refuse">{error}</Notice> : null}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone} disabled={invite.isPending}>
          Cancel
        </Button>
        <Button type="submit" disabled={invite.isPending}>
          <UserPlusIcon /> Add and send the link
        </Button>
      </DialogFooter>
    </form>
  );
}

function InviteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <InviteForm onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function RowActions({ account, canManage }: { account: AdminAccount; canManage: boolean }) {
  const remove = useRemoveAdmin();
  const resend = useResendInvite();
  const [confirm, setConfirm] = React.useState(false);
  if (!canManage) return null;
  const name = account.full_name || account.email || `#${account.id}`;
  return (
    <div className="flex justify-end gap-1.5">
      {account.invite && account.invite.state !== "accepted" ? (
        <Button size="xs" variant="outline" disabled={resend.isPending} onClick={() => resend.mutate(account.id)}>
          <MailIcon /> Resend link
        </Button>
      ) : null}
      <Button
        size="xs"
        variant="ghost"
        className="text-destructive"
        disabled={account.is_you || remove.isPending}
        title={account.is_you ? "You cannot remove your own admin access" : undefined}
        onClick={() => setConfirm(true)}
      >
        <UserMinusIcon /> Remove
      </Button>
      <ConfirmAction
        open={confirm}
        onOpenChange={setConfirm}
        title={`Remove ${name} as an admin?`}
        description="Their account becomes an ordinary app account and every session they hold ends. The last owner cannot be removed. Recorded in the activity log."
        confirmLabel="Remove admin access"
        destructive
        pending={remove.isPending}
        onConfirm={() => remove.mutate(account.id, { onSuccess: () => setConfirm(false) })}
      />
    </div>
  );
}

const ROLE_TONE: Record<string, "info" | "warning" | "default"> = { owner: "warning", support: "info", viewer: "default" };

export function AdminsPage() {
  const { data, isPending, isError } = useAdmins();
  const canManage = useCan("manage_admins") && (data?.can_manage ?? true);
  const [inviting, setInviting] = React.useState(false);

  const columns: DataTableColumn<AdminAccount>[] = [
    {
      key: "who",
      header: "Admin",
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium">
            {row.full_name || "—"} {row.is_you ? <span className="text-ink-3 text-xs font-normal">(you)</span> : null}
          </p>
          <p className="text-muted-foreground truncate text-xs">{row.email ?? "—"}</p>
        </div>
      ),
    },
    { key: "role", header: "Role", cell: (row) => <StatusBadge tone={ROLE_TONE[row.role] ?? "default"} label={row.role} /> },
    {
      key: "2fa",
      header: "Two-factor",
      cell: (row) => <StatusBadge tone={row.two_factor ? "success" : "destructive"} label={row.two_factor ? "On" : "Off"} />,
    },
    {
      key: "invite",
      header: "Invite",
      cell: (row) => {
        const label = inviteLabel(row);
        if (!label) return <span className="text-muted-foreground text-xs">—</span>;
        return (
          <span className="text-xs">
            {label}
            {row.invite?.state === "pending" && row.invite.expires_at ? (
              <span className="text-muted-foreground"> · until {formatDate(row.invite.expires_at)}</span>
            ) : null}
          </span>
        );
      },
    },
    {
      key: "since",
      header: "Since",
      className: "hidden md:table-cell",
      headerClassName: "hidden md:table-cell",
      cell: (row) => <span className="text-muted-foreground text-xs">{formatDate(row.created_at)}</span>,
    },
    { key: "actions", header: <span className="sr-only">Actions</span>, cell: (row) => <RowActions account={row} canManage={canManage} /> },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-ink-3 m-0 text-sm">
          {data
            ? `${data.items.length} admins · ${data.owners} ${data.owners === 1 ? "owner" : "owners"}${
                data.without_two_factor ? ` · ${data.without_two_factor} without two-factor` : ""
              }`
            : "Who can sign in to this portal"}
        </p>
        {canManage ? (
          <Button size="sm" onClick={() => setInviting(true)}>
            <UserPlusIcon /> Add an admin
          </Button>
        ) : null}
      </div>
      <DataTable
        columns={columns}
        data={data?.items}
        rowKey={(row) => row.id}
        isLoading={isPending}
        isError={isError}
        emptyMessage="No admins."
      />
      {canManage ? <InviteDialog open={inviting} onOpenChange={setInviting} /> : null}
    </div>
  );
}
