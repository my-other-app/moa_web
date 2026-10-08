"use client";

import * as React from "react";
import { CheckIcon, CopyIcon, Loader2Icon, RefreshCwIcon } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, toast } from "@moa/ui";

import { generatePassword, useResetUserPassword } from "@/features/users";
import { ConfirmDialog } from "@/features/users";
import { useCreateClub } from "../queries";

/**
 * Create a club, in the two steps it actually takes.
 *
 * The service generates a random password and deliberately does not return
 * it, so a club created here cannot sign in. Reporting success after step one
 * would leave an account nobody can use and no sign that anything is wrong --
 * which is why the password is a step of this flow rather than a thing to
 * remember to do afterwards.
 *
 * Leaving at step two is allowed, but it is a dialog rather than a silent
 * close, because the club is in exactly that unusable state.
 */
export function CreateClubWizard({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const create = useCreateClub();
  const setPassword = useResetUserPassword();

  const [step, setStep] = React.useState<1 | 2>(1);
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword_] = React.useState("");
  const [copied, setCopied] = React.useState(false);
  const [error, setError] = React.useState("");
  const [confirmLeave, setConfirmLeave] = React.useState(false);

  /*
   * Reset on each opening rather than in an effect, so a half-filled form --
   * or worse, the previous club's password -- is never waiting there when the
   * dialog comes back.
   */
  const [wasOpen, setWasOpen] = React.useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) {
      setStep(1);
      setName("");
      setEmail("");
      setPassword_("");
      setCopied(false);
      setError("");
    }
  }

  async function next() {
    if (step === 1) {
      if (name.trim().length < 3) {
        setError("Enter the club name — at least 3 characters.");
        return;
      }
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
        setError("Enter a valid email.");
        return;
      }
      try {
        await create.mutateAsync({ name, email });
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Could not create the club.");
        return;
      }
      setPassword_(generatePassword());
      setError("");
      setStep(2);
      return;
    }

    try {
      await setPassword.mutateAsync({
        emailOrUsername: email.trim(),
        newPassword: password,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not set the password.");
      return;
    }
    onOpenChange(false);
    toast.success(`${name.trim()} can sign in now`);
  }

  function cancel() {
    // Step two is the dangerous one to walk away from: the club exists and
    // nobody -- including us -- knows its password.
    if (step === 2) setConfirmLeave(true);
    else onOpenChange(false);
  }

  const busy = create.isPending || setPassword.isPending;

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) cancel();
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="flex w-[min(480px,100%)] flex-col gap-2.5 rounded-[var(--radius-lg)] border-0 bg-[var(--color-surface)] p-3.5 shadow-[var(--shadow-lg)] sm:max-w-[480px]"
        >
          <span className="text-[12px] text-[var(--color-neutral-400)]">
            Step {step} of 2
          </span>
          <DialogTitle className="text-[20px] font-medium">
            {step === 1 ? "Create a club" : "Set the club’s password"}
          </DialogTitle>

          {step === 1 ? (
            <>
              <div className="field">
                <label htmlFor="wizard-club-name">Club name</label>
                <input
                  id="wizard-club-name"
                  className="input"
                  value={name}
                  disabled={busy}
                  onChange={(event) => {
                    setName(event.target.value);
                    setError("");
                  }}
                />
              </div>
              <div className="field">
                <label htmlFor="wizard-club-email">Login email</label>
                <input
                  id="wizard-club-email"
                  className="input"
                  type="email"
                  value={email}
                  disabled={busy}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setError("");
                  }}
                />
              </div>
              <span className="text-[12.5px] text-pretty text-[var(--color-neutral-400)]">
                The service creates the account with a random password it does not
                return — so the next step sets one the club can actually use.
              </span>
            </>
          ) : (
            <>
              <span className="text-[13.5px] text-[var(--color-neutral-300)]">
                {name.trim()} is created but cannot sign in yet. Set its password and send
                it to the committee.
              </span>
              <div className="flex gap-2">
                <code className="flex-1 rounded-[var(--radius-md)] bg-[var(--color-bg)] px-3 py-2.5 font-mono text-[15px] text-[var(--color-accent-200)] select-all">
                  {password}
                </code>
                <button
                  type="button"
                  className="btn btn-secondary whitespace-nowrap"
                  onClick={() =>
                    navigator.clipboard?.writeText(password).then(
                      () => setCopied(true),
                      () => toast.error("Could not copy — select it and copy by hand")
                    )
                  }
                >
                  {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
                  {copied ? "Copied" : "Copy"}
                </button>
                <button
                  type="button"
                  className="btn btn-icon btn-secondary"
                  title="Generate another"
                  aria-label="Generate another password"
                  onClick={() => {
                    setPassword_(generatePassword());
                    setCopied(false);
                  }}
                >
                  <RefreshCwIcon className="size-4" />
                </button>
              </div>
              <span className="text-[12px] text-[var(--color-neutral-500)]">
                Shown once. After you close this, nobody can see it again.
              </span>
            </>
          )}

          {error ? (
            <span role="alert" className="text-[12.5px] text-[var(--color-accent-300)]">
              {error}
            </span>
          ) : null}

          <div className="mt-1.5 flex justify-end gap-1.5">
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={cancel}>
              {step === 1 ? "Cancel" : "Finish later"}
            </button>
            <button
              type="button"
              className="btn btn-primary whitespace-nowrap"
              disabled={busy}
              onClick={() => void next()}
            >
              {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
              {step === 1 ? "Create and continue" : "Set password and finish"}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmLeave}
        title="Leave without a password?"
        body={`${name.trim()} exists but nobody can sign in to it — the service never returned its random password.`}
        note="You can set one later from the club’s entry on the Users screen."
        cta="Leave it unusable"
        onCancel={() => setConfirmLeave(false)}
        onConfirm={() => {
          setConfirmLeave(false);
          onOpenChange(false);
        }}
      />
    </>
  );
}
