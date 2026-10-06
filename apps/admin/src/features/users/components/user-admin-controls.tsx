"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon, PencilIcon, ShieldIcon, Trash2Icon } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  buttonVariants,
  cn,
} from "@moa/ui";
import { pressable } from "@moa/ui/motion";

import { useDeleteUser, useSetAdminRole, useUpdateUser } from "../queries";
import { ADMIN_ROLES, type AdminUserDetail } from "../schemas";

import { useCan } from "@/hooks/use-can";

/**
 * Editing, deleting and granting a role.
 *
 * Admins could suspend an account but not correct a typo'd email, and roles
 * were enforced from the day they existed while only being changeable with a
 * direct database update.
 */
function EditDialog({
  user,
  open,
  onOpenChange,
}: {
  user: AdminUserDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const update = useUpdateUser(user.id);
  // Keyed by the caller, so these initialise fresh each time it opens.
  const [fullName, setFullName] = React.useState(user.full_name ?? "");
  const [email, setEmail] = React.useState(user.email ?? "");
  const [phone, setPhone] = React.useState(user.phone ?? "");

  const valid = fullName.trim().length >= 2 && /\S+@\S+\.\S+/.test(email.trim());

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Edit {user.full_name || user.username}</DialogTitle>
        <DialogDescription>
          The username is fixed — it appears in links and exports that already
          exist.
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-name">Name</Label>
        <Input
          id="edit-name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          disabled={update.isPending}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-email">Email</Label>
        <Input
          id="edit-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={update.isPending}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-phone">Phone</Label>
        <Input
          id="edit-phone"
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          disabled={update.isPending}
        />
      </div>

      <DialogFooter>
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button
          disabled={!valid || update.isPending}
          onClick={async () => {
            await update.mutateAsync({
              full_name: fullName.trim(),
              email: email.trim(),
              phone,
            });
            onOpenChange(false);
          }}
        >
          {update.isPending ? <Loader2Icon className="animate-spin" /> : null}
          Save changes
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

export function UserAdminControls({ user }: { user: AdminUserDetail }) {
  /*
   * Editing an account, deleting it and granting a role are all
   * manage_admins: anyone who can hand out a role can hand themselves one.
   *
   * Hidden rather than disabled: a greyed-out control still implies the
   * action exists for you and merely needs something, which is not the
   * case. The endpoint enforces this regardless.
   */
  const allowed = useCan("manage_admins");
  const router = useRouter();
  const remove = useDeleteUser();
  const setRole = useSetAdminRole(user.id);
  const [editOpen, setEditOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);

  if (!allowed) return null;

  const isAdmin = user.user_type === "admin";

  return (
    <>
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <Button
          size="sm"
          variant="outline"
          className={pressable}
          onClick={() => setEditOpen(true)}
        >
          <PencilIcon /> Edit
        </Button>
        {/* Keyed so the form reinitialises from the current record each time
            rather than keeping the values from a previous opening. */}
        {editOpen ? (
          <EditDialog
            key={`${user.id}-${user.email}`}
            user={user}
            open={editOpen}
            onOpenChange={setEditOpen}
          />
        ) : null}
      </Dialog>

      {isAdmin ? (
        <div className="flex items-center gap-1.5">
          <ShieldIcon className="text-muted-foreground size-4" />
          <Select
            value={user.admin_role ?? "owner"}
            onValueChange={(next) => setRole.mutate(next)}
            disabled={setRole.isPending}
          >
            <SelectTrigger size="sm" aria-label="Admin role" className="w-[9rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ADMIN_ROLES.map((role) => (
                <SelectItem key={role.value} value={role.value}>
                  <span className="flex flex-col">
                    <span>{role.label}</span>
                    <span className="text-muted-foreground text-xs">{role.hint}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <Button
        size="sm"
        variant="ghost"
        className={cn("text-destructive hover:text-destructive", pressable)}
        onClick={() => setDeleteOpen(true)}
      >
        <Trash2Icon /> Delete
      </Button>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {user.full_name || user.username}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              They are signed out everywhere and the account disappears from
              the platform. <strong>Suspending is the reversible option</strong>{" "}
              and is usually what you want — this is not undoable from here.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={cn(buttonVariants({ variant: "destructive" }))}
              disabled={remove.isPending}
              onClick={async (event) => {
                event.preventDefault();
                await remove.mutateAsync(user.id);
                router.replace("/users");
              }}
            >
              Delete account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
