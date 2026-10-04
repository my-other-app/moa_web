"use client";

import { PlusIcon } from "lucide-react";
import { Button, DialogTrigger, cn } from "@moa/ui";
import { pressable } from "@moa/ui/motion";

import { BadgeFormDialog } from "./badge-form";

/** POST /badges/admin existed and nothing called it. */
export function NewBadgeButton() {
  return (
    <BadgeFormDialog
      trigger={
        <DialogTrigger asChild>
          <Button size="sm" className={cn(pressable)}>
            <PlusIcon /> New badge
          </Button>
        </DialogTrigger>
      }
    />
  );
}
