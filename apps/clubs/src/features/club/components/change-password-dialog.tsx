"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { EyeIcon, EyeOffIcon, Loader2Icon } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
  cn,
  toast,
} from "@moa/ui";
import { pressable } from "@moa/ui/motion";

import { useChangePassword } from "../queries";
import { changePasswordSchema, type ChangePasswordForm } from "../schemas";

/**
 * "Change password" from the profile header (node 251:1035).
 *
 * A dialog rather than a page: it is a three-field task that should not cost
 * the club their place on the profile. On success the session is already dead
 * server-side -- the endpoint bumps `token_version`, which the auth dependency
 * checks on every request -- so this signs the user out rather than leaving
 * them on a page where everything 401s.
 */
function PasswordField({
  id,
  label,
  error,
  autoComplete,
  disabled,
  registration,
}: {
  id: string;
  label: string;
  error?: string;
  autoComplete: string;
  disabled: boolean;
  registration: ReturnType<ReturnType<typeof useForm<ChangePasswordForm>>["register"]>;
}) {
  const [visible, setVisible] = React.useState(false);

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-xs font-normal text-foreground">
        {label}
      </Label>
      <div className="relative">
        <Input
          id={id}
          variant="design"
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="pr-10"
          {...registration}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          tabIndex={-1}
          aria-label={visible ? "Hide password" : "Show password"}
          className="absolute inset-y-0 right-0 grid w-10 place-items-center text-muted-foreground hover:text-foreground"
        >
          {visible ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
        </button>
      </div>
      {error ? (
        <p id={`${id}-error`} className="text-destructive text-xs">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function ChangePasswordDialog() {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  const change = useChangePassword();

  const form = useForm<ChangePasswordForm>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { old_password: "", new_password: "", confirm_password: "" },
  });

  const { errors } = form.formState;
  const isSaving = change.isPending || form.formState.isSubmitting;

  async function onSubmit(values: ChangePasswordForm) {
    await change.mutateAsync(values);
    setOpen(false);
    form.reset();
    toast.success("Password changed. Sign in again with your new password.");
    // No logout call: the cookie we would send it with is already rejected.
    // Replacing the route lets the proxy clear the dead session.
    router.replace("/login");
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) form.reset();
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="lg"
          className={cn(
            "w-full sm:w-auto",
            pressable
          )}
        >
          Change password
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="text-lg font-medium">
            Change password
          </DialogTitle>
          <DialogDescription>
            You will be signed out and will need to sign in again with the new
            password. Any other device signed in as this club is signed out too.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <PasswordField
            id="old-password"
            label="Current password"
            autoComplete="current-password"
            disabled={isSaving}
            error={errors.old_password?.message}
            registration={form.register("old_password")}
          />
          <PasswordField
            id="new-password"
            label="New password"
            autoComplete="new-password"
            disabled={isSaving}
            error={errors.new_password?.message}
            registration={form.register("new_password")}
          />
          <PasswordField
            id="confirm-password"
            label="Repeat new password"
            autoComplete="new-password"
            disabled={isSaving}
            error={errors.confirm_password?.message}
            registration={form.register("confirm_password")}
          />

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving} className={cn(pressable)}>
              {isSaving ? <Loader2Icon className="animate-spin" /> : null}
              {isSaving ? "Changing…" : "Change password"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
