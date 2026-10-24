"use client";

import * as React from "react";
import {
  CalendarIcon,
  CheckIcon,
  CopyIcon,
  IdCardIcon,
  KeyRoundIcon,
  LogInIcon,
  MailIcon,
  PauseCircleIcon,
  PencilIcon,
  PhoneIcon,
  RotateCcwIcon,
  Trash2Icon,
  UserCogIcon,
  XIcon,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  Skeleton,
  toast,
} from "@moa/ui";
import { PersonAvatar, formatDate } from "@moa/app-kit";

import { useCan } from "@/hooks/use-can";
import { ImpersonateButton } from "./impersonate-button";
import { providerLabel } from "@/components/provider-icon";
import { generatePassword } from "../password";
import {
  useDeleteUser,
  useResetUserPassword,
  useSetAdminRole,
  useSetUserActive,
  useUpdateUser,
  useUser,
  useUserClubs,
  useUserEvents,
} from "../queries";
import { userEditSchema, type AdminUser } from "../schemas";
import { ConfirmDialog } from "./confirm-dialog";

const TYPE_LABELS: Record<string, string> = {
  app_user: "App user",
  club: "Club",
  admin: "Admin",
  guest: "Guest",
};

function typeLabel(userType: string): string {
  return TYPE_LABELS[userType] ?? userType;
}

/** A label/value row under the fading rule. */
function Fact({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rule-fade grid grid-cols-[22px_110px_minmax(0,1fr)] items-center gap-2.5 py-2.5">
      <span className="text-ink-3">{icon}</span>
      <span className="text-[12.5px] text-ink-2">{label}</span>
      <span className="text-[13.5px] break-words">{value}</span>
    </div>
  );
}

/**
 * One of the drawer's lazy lists.
 *
 * Loaded only once the drawer is open, which is the point: the clubs a user
 * follows and the events they attended are two more paginated queries each,
 * and firing them for every row of a 25-row table would be 50 requests to
 * render one screen.
 */
function LazyList({
  title,
  endpoint,
  isPending,
  items,
  emptyText,
}: {
  title: string;
  endpoint: string;
  isPending: boolean;
  items: ReadonlyArray<{ key: React.Key; a: string; b: string }>;
  emptyText: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="micro">
        {title}{" "}
        <span className="font-mono text-ink-3 normal-case tracking-normal">
          {endpoint}
        </span>
      </span>

      {isPending ? (
        <>
          <Skeleton className="h-[34px] rounded-[var(--radius-md)]" />
          <Skeleton className="h-[34px] rounded-[var(--radius-md)] opacity-60" />
        </>
      ) : items.length === 0 ? (
        <span className="text-[13px] text-ink-3">{emptyText}</span>
      ) : (
        items.map((item) => (
          <div
            key={item.key}
            className="flex justify-between gap-2.5 rounded-[var(--radius-md)] bg-sunken px-2.5 py-2 text-[13px]"
          >
            <span className="min-w-0 truncate">{item.a}</span>
            <span className="shrink-0 text-ink-3">{item.b}</span>
          </div>
        ))
      )}
    </div>
  );
}

const ROLE_OPTIONS = [
  { value: "none", label: "No admin access" },
  { value: "viewer", label: "Viewer — read only" },
  { value: "support", label: "Support — moderate" },
  { value: "owner", label: "Owner — everything" },
] as const;

type Pending = "suspend" | "delete" | null;

export function UserDrawer({
  /** The row that was clicked. Shown immediately; the full record follows. */
  row,
  open,
  onClose,
}: {
  row: AdminUser | null;
  open: boolean;
  onClose: () => void;
}) {
  const userId = row?.id ?? 0;
  // Nothing is fetched until the drawer is actually open: it stays mounted so
  // it can animate, and an always-on detail query would ask for whichever
  // user was last selected -- or for user 0 on a fresh page.
  const detail = useUser(userId, { enabled: open });

  const canModerate = useCan("moderate");
  const canManageAdmins = useCan("manage_admins");
  const canReset = useCan("reset_credentials");

  const setActive = useSetUserActive(userId);
  const update = useUpdateUser(userId);
  const remove = useDeleteUser();
  const setRole = useSetAdminRole(userId);
  const resetPassword = useResetUserPassword();

  // Only while open, and only the first page: this is an "is there anything
  // here" summary, not a browsable list. Firing these per table row would be
  // fifty requests to render one screen.
  const clubs = useUserClubs(userId, { offset: 0, limit: 5 }, { enabled: open });
  const events = useUserEvents(
    userId,
    { offset: 0, limit: 5, isAttended: true },
    { enabled: open }
  );

  const [editing, setEditing] = React.useState<null | {
    full_name: string;
    email: string;
    phone: string;
  }>(null);
  const [issued, setIssued] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [pending, setPending] = React.useState<Pending>(null);
  const [reason, setReason] = React.useState("");
  const [roleChoice, setRoleChoice] = React.useState("none");

  /*
   * Everything above is per-user, so it resets when the drawer points at a
   * different account. Keyed on the id rather than cleared in an effect: a
   * half-typed edit or, far worse, a password panel surviving from the
   * previous user is the kind of mix-up that ends with the wrong person's
   * credentials being sent.
   */
  const [shownId, setShownId] = React.useState(userId);
  if (shownId !== userId) {
    setShownId(userId);
    setEditing(null);
    setIssued(null);
    setCopied(false);
    setPending(null);
    setReason("");
    setRoleChoice("none");
  }

  // The fetched record once it lands, the clicked row until then, so the
  // header is populated on the first frame instead of flashing skeletons for
  // the name the table just displayed.
  const user = detail.data ?? row;
  if (!user) return null;

  const isSuspended = !(detail.data?.is_active ?? row?.is_active ?? true);
  const isAdmin = user.user_type === "admin";
  const name = user.full_name || user.username;
  const effectiveRole = detail.data?.admin_role ?? row?.admin_role ?? null;

  async function saveEdit() {
    if (!editing) return;
    const parsed = userEditSchema.safeParse(editing);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Check the details");
      return;
    }
    await update.mutateAsync(parsed.data);
    setEditing(null);
  }

  async function issuePassword() {
    const password = generatePassword();
    await resetPassword.mutateAsync({
      // Username, not email: an account can share an email with another of a
      // different user_type (the uniqueness constraint is on the pair), and
      // the endpoint would then have to guess which one was meant.
      emailOrUsername: user!.username,
      newPassword: password,
    });
    setIssued(password);
    setCopied(false);
  }

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (!next) onClose();
        }}
      >
        <SheetContent
          showClose={false}
          side="right"
          className="w-full gap-0 overflow-y-auto border-l-0 bg-surface p-0 shadow-[var(--shadow-lg)] sm:max-w-[480px]"
        >
          {/* The gradient header, with the accent tick bleeding off the top. */}
          <div className="relative flex flex-col gap-3 bg-brand-soft px-[22px] py-5">
            <span
              aria-hidden
              className="absolute top-0 left-[22px] h-0.5 w-12 bg-brand shadow-[0_0_14px_2px_var(--brand)]"
            />

            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[12px] text-ink-2">
                GET /user/admin/{user.id}
              </span>
              <button
                type="button"
                onClick={onClose}
                title="Close"
                aria-label="Close"
                className="btn btn-icon btn-secondary border-transparent"
              >
                <XIcon className="size-4" />
              </button>
            </div>

            <div className="flex items-center gap-3.5">
              <PersonAvatar
                name={name}
                photo={user.profile?.profile_pic}
                avatar={user.profile?.avatar?.image}
                size="medium"
                className="size-14"
                fallbackClassName="bg-brand-soft text-[20px] text-brand"
              />
              <div className="flex min-w-0 flex-col gap-0.5">
                <SheetTitle className="truncate text-[20px] font-normal">{name}</SheetTitle>
                <span className="truncate text-[13px] text-ink-2">
                  @{user.username} · {typeLabel(user.user_type)}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              <span className={isSuspended ? "tag tag-outline" : "tag tag-accent"}>
                {isSuspended ? "Suspended" : "Active"}
              </span>
              <span className="tag tag-neutral">{providerLabel(user.provider)} sign-in</span>
              {isAdmin && effectiveRole ? (
                <span className="tag tag-outline">Admin · {effectiveRole}</span>
              ) : null}
            </div>

            {isSuspended && detail.data?.suspended_reason ? (
              <span className="text-[12.5px] text-brand">
                Suspended: {detail.data.suspended_reason}
              </span>
            ) : null}
          </div>

          <div className="flex flex-col gap-[18px] px-[22px] pt-4 pb-6">
            <div className="flex flex-wrap gap-2">
              {canModerate ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={setActive.isPending}
                  onClick={() => {
                    // Reinstating is immediate; suspending asks, because it
                    // signs someone out and needs a reason on the record.
                    if (isSuspended) setActive.mutate({ isActive: true });
                    else {
                      setReason("");
                      setPending("suspend");
                    }
                  }}
                >
                  {isSuspended ? (
                    <RotateCcwIcon className="size-4" />
                  ) : (
                    <PauseCircleIcon className="size-4" />
                  )}
                  {isSuspended ? "Reinstate" : "Suspend"}
                </button>
              ) : null}

              {canManageAdmins ? (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() =>
                    setEditing({
                      full_name: user.full_name ?? "",
                      email: user.email ?? "",
                      phone: user.phone ?? "",
                    })
                  }
                >
                  <PencilIcon className="size-4" />
                  Edit
                </button>
              ) : null}

              {canReset ? (
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={resetPassword.isPending}
                  onClick={() => void issuePassword()}
                >
                  <KeyRoundIcon className="size-4" />
                  Set password
                </button>
              ) : null}

              {/* Brings its own capability and club-only checks, and its own
                  reason dialog. Reusing it keeps one implementation of the
                  most dangerous control in the product rather than two. */}
              <ImpersonateButton
                userId={user.id}
                name={name}
                userType={user.user_type}
              />
            </div>

            {editing ? (
              <div className="flex flex-col gap-2.5 rounded-[var(--radius-md)] bg-sunken p-3.5 shadow-[inset_0_0_0_1px_var(--brand-line)]">
                <div className="field">
                  <label htmlFor="drawer-name">Name</label>
                  <input
                    id="drawer-name"
                    className="input"
                    value={editing.full_name}
                    onChange={(e) => setEditing({ ...editing, full_name: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="drawer-email">Email</label>
                  <input
                    id="drawer-email"
                    className="input"
                    type="email"
                    value={editing.email}
                    onChange={(e) => setEditing({ ...editing, email: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="drawer-phone">Phone</label>
                  <input
                    id="drawer-phone"
                    className="input"
                    value={editing.phone}
                    onChange={(e) => setEditing({ ...editing, phone: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Username</label>
                  <div className="input flex items-center text-ink-3">
                    @{user.username} · fixed — it is in links and exports that already exist
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setEditing(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={update.isPending}
                    onClick={() => void saveEdit()}
                  >
                    <CheckIcon className="size-4" />
                    Save
                  </button>
                </div>
              </div>
            ) : null}

            {issued ? (
              <div className="flex flex-col gap-2 rounded-[var(--radius-md)] bg-sunken p-3.5 shadow-[inset_0_0_0_1px_var(--brand)]">
                <span className="text-[13px]">
                  New password — shown once. Copy it now; it cannot be shown again.
                </span>
                <div className="flex gap-2">
                  <code className="flex-1 rounded-[var(--radius-md)] bg-surface px-3 py-2.5 font-mono text-[15px] tracking-[0.06em] text-brand select-all">
                    {issued}
                  </code>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      // Can reject on an insecure origin or without focus;
                      // the code stays selectable either way.
                      navigator.clipboard?.writeText(issued).then(
                        () => setCopied(true),
                        () => toast.error("Could not copy — select it and copy by hand")
                      );
                    }}
                  >
                    {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost self-start"
                  onClick={() => setIssued(null)}
                >
                  I have saved it
                </button>
              </div>
            ) : null}

            <div className="flex flex-col">
              <Fact
                icon={<MailIcon className="size-4" />}
                label="Email"
                value={user.email || "—"}
              />
              <Fact
                icon={<PhoneIcon className="size-4" />}
                label="Phone"
                value={user.phone || "—"}
              />
              <Fact
                icon={<CalendarIcon className="size-4" />}
                label="Joined"
                value={formatDate(user.created_at)}
              />
              <Fact
                icon={<LogInIcon className="size-4" />}
                label="Signs in with"
                value={providerLabel(user.provider)}
              />
              <Fact
                icon={<IdCardIcon className="size-4" />}
                label="User ID"
                value={String(user.id)}
              />
            </div>

            <LazyList
              title="Follows"
              endpoint={`GET /user/admin/${user.id}/clubs`}
              isPending={clubs.isPending}
              items={(clubs.data?.items ?? []).map((club) => ({
                key: club.id,
                a: club.name,
                b: `${club.followers_count.toLocaleString("en-IN")} followers`,
              }))}
              emptyText="Not following any clubs."
            />

            <LazyList
              title="Attended"
              endpoint={`GET /user/admin/${user.id}/events`}
              isPending={events.isPending}
              items={(events.data?.items ?? []).map((registration) => ({
                key: registration.ticket_id,
                a: registration.event.name,
                b: formatDate(registration.event.event_datetime),
              }))}
              emptyText="Has not attended an event yet."
            />

            {canManageAdmins ? (
              <>
                <div className="flex flex-col gap-2 rounded-[var(--radius-md)] bg-sunken p-3.5">
                  <span className="text-[13.5px]">Admin role</span>
                  <div className="flex gap-2">
                    <select
                      className="input flex-1"
                      aria-label="Admin role"
                      value={roleChoice}
                      onChange={(e) => setRoleChoice(e.target.value)}
                    >
                      {ROLE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={setRole.isPending || roleChoice === "none"}
                      title={
                        roleChoice === "none"
                          ? "Removing admin access is not available through this endpoint"
                          : undefined
                      }
                      onClick={() => setRole.mutate(roleChoice)}
                    >
                      <UserCogIcon className="size-4" />
                      Apply
                    </button>
                  </div>
                  {/* Said plainly rather than offered and then refused: the
                      endpoint sets a role, and there is no "revoke" on it. */}
                  <span className="text-[12px] text-ink-3">
                    {effectiveRole
                      ? `Currently ${effectiveRole}. Removing admin access entirely needs a backend change.`
                      : "Granting a role makes this an admin account."}
                  </span>
                </div>

                <button
                  type="button"
                  className="btn btn-ghost self-start text-ink-2"
                  onClick={() => setPending("delete")}
                >
                  <Trash2Icon className="size-4" />
                  Delete user
                </button>
              </>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={pending === "suspend"}
        title={`Suspend ${name}?`}
        body="They are signed out and cannot sign in, register or post until reinstated. Their data stays."
        note="Reversible — prefer this to deleting. The reason is recorded in Activity."
        cta="Suspend"
        busy={setActive.isPending}
        reason={{
          value: reason,
          onChange: setReason,
          placeholder: "Reason — shown to the user and in Activity",
          required: true,
        }}
        onCancel={() => setPending(null)}
        onConfirm={async () => {
          await setActive.mutateAsync({ isActive: false, reason });
          setPending(null);
        }}
      />

      <ConfirmDialog
        open={pending === "delete"}
        title={`Delete ${name}?`}
        body="Signs them out everywhere and removes their account, follows and registrations from every list."
        note="Users are not kept in Trash — this cannot be undone from the dashboard. Suspending is reversible."
        cta="Delete user"
        busy={remove.isPending}
        onCancel={() => setPending(null)}
        onConfirm={async () => {
          await remove.mutateAsync(user!.id);
          setPending(null);
          onClose();
        }}
      />
    </>
  );
}
