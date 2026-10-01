"use client";

import * as React from "react";
import { PaletteIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  Skeleton,
  buttonVariants,
  cn,
} from "@moa/ui";
import { hoverLift, pressable, stagger } from "@moa/ui/motion";

import { useDeleteTemplate, useTemplates } from "../queries";
import type { CertificateTemplate, TicketTemplate } from "../schemas";
import { TemplateDesigner } from "./template-designer";

type Kind = "ticket" | "certificate";
type Editing = { mode: "new" } | { mode: "edit"; template: TicketTemplate | CertificateTemplate };

export function TemplatesPanel({ kind }: { kind: Kind }) {
  const { data, isPending, isError } = useTemplates(kind);
  const remove = useDeleteTemplate(kind);
  const [editing, setEditing] = React.useState<Editing | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<number | null>(null);

  if (editing) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" className="-ml-2" onClick={() => setEditing(null)}>
          ← Back to templates
        </Button>
        <TemplateDesigner
          kind={kind}
          existing={editing.mode === "edit" ? editing.template : undefined}
          onDone={() => setEditing(null)}
        />
      </div>
    );
  }

  if (isPending) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <Card className="p-0">
        <EmptyState
          icon={<PaletteIcon />}
          title="Could not load templates"
          description="Try reloading the page."
        />
      </Card>
    );
  }

  const templates = data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" className={pressable} onClick={() => setEditing({ mode: "new" })}>
          <PlusIcon /> New {kind} template
        </Button>
      </div>

      {templates.length === 0 ? (
        <Card className="p-0">
          <EmptyState
            icon={<PaletteIcon />}
            title={`No ${kind} templates yet`}
            description={
              kind === "ticket"
                ? "Events use the platform default until you create one."
                : "Certificates use the platform default until you create one."
            }
            action={
              <Button size="sm" onClick={() => setEditing({ mode: "new" })}>
                <PlusIcon /> Create one
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((template, i) => {
            const config = template.config as Record<string, string | undefined>;
            return (
              <Card
                key={template.id}
                style={stagger(i)}
                className={cn(
                  "animate-in fade-in-0 slide-in-from-bottom-2 overflow-hidden duration-300 motion-reduce:animate-none",
                  hoverLift
                )}
              >
                {/* A colour strip gives an at-a-glance sense of each template
                    without rendering a full preview per card. */}
                <div
                  className="h-2 w-full"
                  style={{ backgroundColor: config.accent_color ?? "#1db9a0" }}
                />
                <CardContent className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 truncate font-medium">{template.name}</p>
                    {template.is_default ? <Badge variant="secondary">Default</Badge> : null}
                  </div>
                  <div className="flex gap-1.5">
                    {(["bg_color", "text_color", "accent_color", "border_color"] as const).map(
                      (key) => (
                        <span
                          key={key}
                          title={key}
                          className="size-4 rounded-full border"
                          style={{ backgroundColor: config[key] ?? "#000" }}
                        />
                      )
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="xs"
                      variant="outline"
                      className={pressable}
                      onClick={() => setEditing({ mode: "edit", template })}
                    >
                      <PencilIcon /> Edit
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      className={cn("text-destructive hover:text-destructive", pressable)}
                      onClick={() => setPendingDelete(template.id)}
                    >
                      <Trash2Icon /> Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this template?</AlertDialogTitle>
            <AlertDialogDescription>
              Events already using it fall back to the platform default. Tickets and
              certificates already issued keep the design they were generated with.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={cn(buttonVariants({ variant: "destructive" }))}
              onClick={() => {
                if (pendingDelete !== null) remove.mutate(pendingDelete);
                setPendingDelete(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
