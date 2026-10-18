"use client";

import * as React from "react";
import { Loader2Icon } from "lucide-react";
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Notice } from "@moa/ui";

import { isAlreadyResolved, useResolveReport } from "../queries";
import {
  NOTE_MAX,
  hiddenFromUsers,
  reportCountText,
  suspendRemovesContent,
  suspendsClubAccount,
  targetLabel,
  type Report,
  type Resolution,
} from "../schemas";

/** "this comment", "this thread", "this user": what the report is about, in a sentence. */
function thisThing(r: Report): string {
  return `this ${targetLabel(r.target_type).toLowerCase()}`;
}

/** Every open report on the thing goes with this one: said when there is more than one. */
function others(r: Report): string {
  return r.report_count > 1 ? ` All ${reportCountText(r.report_count)} on it are resolved with this one.` : "";
}

function copy(r: Report, action: Resolution): { title: string; body: string; cta: string; destructive: boolean } {
  const thing = thisThing(r);
  if (action === "dismiss") {
    return {
      title: "Dismiss this report?",
      body: `Nothing is taken down.${hiddenFromUsers(r) ? " The comment shows to everyone again." : ""}${others(r)}`,
      cta: "Dismiss",
      destructive: false,
    };
  }
  if (action === "remove_content") {
    return {
      title: `Remove ${thing}?`,
      body: `It is taken down for everyone in the app.${others(r)}`,
      cta: "Remove",
      destructive: true,
    };
  }
  const name = r.target_author?.name || "the author";
  return {
    title: `Suspend ${name}?`,
    body: `${name} is signed out everywhere and cannot sign back in${suspendRemovesContent(r) ? `, and ${thing} is removed` : ""}. The account can be reinstated from its user page.${others(r)}`,
    cta: "Suspend author",
    destructive: true,
  };
}

/**
 * Deciding a report: what will happen, an optional note for the record,
 * and the server's words if it refuses. Already decided by someone else
 * (409), the dialog simply closes and the list is read again.
 */
export function ResolveDialog({ report, action, onClose }: { report: Report; action: Resolution; onClose: () => void }) {
  const resolve = useResolveReport();
  const [note, setNote] = React.useState("");
  const said = copy(report, action);
  const refused = resolve.error && !isAlreadyResolved(resolve.error) ? resolve.error.message || "That did not go through." : null;
  const clubName = report.club?.name ?? (report.target_type === "club" ? report.target_preview : null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    resolve.mutate(
      { reportId: report.id, action, note },
      {
        onSuccess: onClose,
        onError: (error) => {
          if (isAlreadyResolved(error)) onClose();
        },
      }
    );
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !resolve.isPending && onClose()}>
      <DialogContent className="sm:max-w-[480px]">
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{said.title}</DialogTitle>
            <DialogDescription>{said.body}</DialogDescription>
          </DialogHeader>

          {action === "suspend_author" && suspendsClubAccount(report) ? (
            <Notice tone="caution" tag="Club account">
              {report.target_type === "thread" ? "Threads are posted by the club's own account. " : ""}
              Suspending it closes {clubName ? `${clubName}'s` : "the club's"} dashboard for its whole team until it is reinstated.
            </Notice>
          ) : null}

          <label className="flex flex-col gap-1.5">
            <span className="eyebrow">Note (optional)</span>
            <textarea
              className="input min-h-[72px] py-2"
              value={note}
              maxLength={NOTE_MAX}
              disabled={resolve.isPending}
              placeholder="Why, for the record"
              onChange={(e) => {
                setNote(e.target.value);
                if (resolve.isError) resolve.reset();
              }}
            />
          </label>

          {/* The server's words (NOT_REMOVABLE, NO_AUTHOR, CANNOT_SUSPEND_SELF, …): nothing was changed. */}
          {refused ? <Notice tone="refuse">{refused.replace(/\.$/, "")}. Nothing was changed.</Notice> : null}

          <DialogFooter>
            <Button type="button" variant="secondary" disabled={resolve.isPending} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant={said.destructive ? "destructive" : "primary"} disabled={resolve.isPending}>
              {resolve.isPending ? <Loader2Icon className="size-4 animate-spin" /> : null} {said.cta}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
