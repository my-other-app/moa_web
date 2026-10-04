"use client";

import { PlusIcon } from "lucide-react";
import { Button, DialogTrigger, cn } from "@moa/ui";
import { pressable } from "@moa/ui/motion";

import { OrgFormDialog } from "./org-form";

/**
 * Creating an organisation had no UI at all -- POST /orgs/create existed and
 * nothing called it, so the only way to add one was the CSV import.
 */
export function NewOrgButton() {
  return (
    <OrgFormDialog
      trigger={
        <DialogTrigger asChild>
          <Button size="sm" className={cn(pressable)}>
            <PlusIcon /> New organisation
          </Button>
        </DialogTrigger>
      }
    />
  );
}
