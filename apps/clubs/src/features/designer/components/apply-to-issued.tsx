"use client";

import { Button, Notice } from "@moa/ui";
import * as React from "react";

import { useApplyDesignToIssued, useCertificateSummary } from "@/features/certificates";

import { ResetDialog } from "./dialogs";

/**
 * Certificates already issued keep the design they were issued with, so a
 * new design never quietly rewrites one a guest has (contract §6). When some
 * differ from the design in use now, this says so and offers the one way to
 * change them, after asking.
 */
export const ApplyToIssued = ({ eventId }: { eventId: number }) => {
  const summary = useCertificateSummary(eventId);
  const apply = useApplyDesignToIssued(eventId);
  const [open, setOpen] = React.useState(false);
  const n = summary.data?.other_design ?? 0;
  if (!n) return null;
  const them = n === 1 ? "1 certificate" : `${n} certificates`;
  return (
    <>
      <Notice
        tone="neutral"
        tag="Issued"
        action={
          <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
            Apply the current design
          </Button>
        }
      >
        {them} already issued {n === 1 ? "keeps" : "keep"} the design {n === 1 ? "it was" : "they were"} issued with. New certificates use the design in use now.
      </Notice>
      <ResetDialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Apply the current design to ${them}?`}
        body="Each is made again in the design its role uses now. Its number and verify link stay the same. Saved changes only: save the design first."
        confirm={`Apply to ${them}`}
        busy={apply.isPending}
        onConfirm={() =>
          apply.mutate(undefined, {
            onSuccess: () => setOpen(false),
          })
        }
      />
    </>
  );
};
