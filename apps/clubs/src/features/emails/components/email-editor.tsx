"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowUpIcon,
  CheckIcon,
  MoreHorizontalIcon,
  PlusIcon,
  SendIcon,
  XIcon,
} from "lucide-react";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  InlineAlert,
  Skeleton,
  StatusBadge,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  cn,
  toast,
} from "@moa/ui";

import { useRegistrations } from "@/features/registrations";

import { scopeHref } from "../api";
import {
  useDeleteTemplate,
  useDuplicateTemplate,
  useEmailContext,
  usePreview,
  useResetTemplate,
  useSaveTemplate,
  useSaveToLibrary,
  useSendTest,
  useTemplate,
} from "../queries";
import {
  BLOCK_KINDS,
  BLOCK_META,
  STAGE_META,
  fieldsOf,
  newBlock,
  type BlockKind,
  type EmailBlock,
  type EmailContext,
  type EmailScope,
  type EmailTemplate,
  type EmailTemplateFields,
} from "../schemas";
import { BlockInspector } from "./block-inspector";
import { Busy, useDebounced, ui } from "./kit";
import { SendingPanel, ThemePanel } from "./panels";
import { SendTemplateDialog } from "./send-dialog";

/** Loads the template and its context, then hands a fresh editor the lot. */
export function EmailEditor({
  scope,
  templateId,
}: {
  scope: EmailScope;
  templateId: string;
}) {
  const tpl = useTemplate(scope, templateId);
  const ctx = useEmailContext(scope);
  if (tpl.isPending || ctx.isPending)
    return <Skeleton className="h-[40rem] w-full" />;
  if (tpl.isError || ctx.isError || !tpl.data || !ctx.data)
    return (
      <EmptyState
        tone="muted"
        title="This email could not be opened"
        description={tpl.error?.message ?? ctx.error?.message ?? "Try again."}
      />
    );
  return (
    <Editor
      key={`${tpl.data.id}:${tpl.data.version}`}
      scope={scope}
      template={tpl.data}
      context={ctx.data}
    />
  );
}

const move = (blocks: EmailBlock[], from: number, to: number) => {
  if (to < 0 || to >= blocks.length) return blocks;
  const next = blocks.slice();
  const [b] = next.splice(from, 1);
  next.splice(to, 0, b!);
  return next;
};

function GuestPicker({
  eventId,
  value,
  onChange,
}: {
  eventId: number;
  value: { id: string; name: string } | null;
  onChange: (v: { id: string; name: string } | null) => void;
}) {
  const [search, setSearch] = React.useState("");
  const settled = useDebounced(search.trim(), 300);
  const regs = useRegistrations({
    eventId,
    search: settled || undefined,
    offset: 0,
    limit: 8,
  });
  const [open, setOpen] = React.useState(false);
  const items = regs.data?.items ?? [];
  return (
    <div className="relative min-w-0 flex-1">
      {value ? (
        <div className="flex h-8 items-center gap-1.5 rounded-md border bg-muted/40 px-2 text-[12.5px]">
          <span className="truncate">Previewing as {value.name}</span>
          <button
            type="button"
            aria-label="Back to the sample guest"
            onClick={() => onChange(null)}
            className={ui.iconBtn}
          >
            <XIcon className="size-3.5" />
          </button>
        </div>
      ) : (
        <input
          aria-label="Preview as a guest"
          placeholder="Preview as a guest… (type a name)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          className={cn(ui.control, "h-8 text-[12.5px]")}
        />
      )}
      {open && !value && items.length ? (
        <ul className="absolute top-9 right-0 left-0 z-20 max-h-64 overflow-y-auto rounded-md border bg-card py-1 shadow-md">
          {items.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className="flex w-full items-baseline justify-between gap-2 px-2.5 py-1.5 text-left text-[12.5px] hover:bg-muted"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange({ id: r.id, name: r.full_name ?? r.email ?? r.id });
                  setOpen(false);
                }}
              >
                <span className="truncate">{r.full_name ?? "—"}</span>
                <span className="truncate font-mono text-[10.5px] text-muted-foreground">
                  {r.email ?? r.ticket_id}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Editor({
  scope,
  template,
  context,
}: {
  scope: EmailScope;
  template: EmailTemplate;
  context: EmailContext;
}) {
  const router = useRouter();
  const eventId = scope.kind === "event" ? scope.eventId : undefined;
  const [fields, setFields] = React.useState<EmailTemplateFields>(() =>
    fieldsOf(template),
  );
  const [baseline, setBaseline] = React.useState(() =>
    JSON.stringify(fieldsOf(template)),
  );
  const dirty = JSON.stringify(fields) !== baseline;
  const [selected, setSelected] = React.useState<string | null>(
    template.design.blocks[0]?.id ?? null,
  );
  const [tab, setTab] = React.useState<"block" | "theme" | "sending">("block");
  const [guest, setGuest] = React.useState<{ id: string; name: string } | null>(
    null,
  );
  const [testOpen, setTestOpen] = React.useState(false);
  const [testTo, setTestTo] = React.useState("");
  const [sendOpen, setSendOpen] = React.useState(false);
  const [confirm, setConfirm] = React.useState<"reset" | "delete" | null>(null);

  const save = useSaveTemplate(scope);
  const sendTest = useSendTest(eventId ?? 0);
  const toLibrary = useSaveToLibrary(eventId ?? 0);
  const reset = useResetTemplate(eventId ?? 0);
  const duplicate = useDuplicateTemplate(scope);
  const remove = useDeleteTemplate(scope);

  const previewBody = useDebounced(
    React.useMemo(
      () => ({
        subject: fields.subject,
        design: fields.design,
        registrationId: guest?.id ?? null,
      }),
      [fields.subject, fields.design, guest],
    ),
    450,
  );
  const preview = usePreview(scope, previewBody);

  React.useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const blocks = fields.design.blocks;
  const current = blocks.find((b) => b.id === selected) ?? null;
  const setBlocks = (next: EmailBlock[]) =>
    setFields((f) => ({ ...f, design: { ...f.design, blocks: next } }));
  const add = (kind: BlockKind) => {
    const b = newBlock(kind);
    const at = selected
      ? blocks.findIndex((x) => x.id === selected) + 1
      : blocks.length;
    setBlocks([...blocks.slice(0, at), b, ...blocks.slice(at)]);
    setSelected(b.id);
    setTab("block");
  };

  const doSave = () =>
    save.mutate(
      { templateId: template.id, fields },
      {
        onSuccess: (saved) => {
          setBaseline(JSON.stringify(fieldsOf(saved)));
          setFields(fieldsOf(saved));
          toast.success("Saved", {
            description:
              saved.version > template.version
                ? `Version ${saved.version}.`
                : undefined,
          });
        },
      },
    );

  const stageMeta = STAGE_META[template.stage];
  const problems = preview.data?.problems ?? [];

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href={scopeHref(scope)}>
          <ArrowLeftIcon />{" "}
          {scope.kind === "event" ? "Event emails" : "Email library"}
        </Link>
      </Button>

      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className={ui.heading}>
            {stageMeta.label}
            {scope.kind === "library" ? " · library" : ""} · v{template.version}
          </p>
          <h1 className="truncate text-2xl font-medium">
            {fields.name || "Untitled email"}
          </h1>
        </div>
        {dirty ? (
          <StatusBadge tone="warning" label="Unsaved changes" />
        ) : (
          <StatusBadge tone="default" label="Saved" />
        )}
        {eventId !== undefined ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setTestOpen(true)}
          >
            <SendIcon /> Send test
          </Button>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="sm" aria-label="More">
              <MoreHorizontalIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {eventId !== undefined ? (
              <>
                {template.stage === "INVITE" ? (
                  <DropdownMenuItem
                    onSelect={() =>
                      router.push(
                        `/events/${scope.kind === "event" ? scope.eventId : ""}`,
                      )
                    }
                  >
                    Send tickets (attendees page)
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    disabled={dirty}
                    onSelect={() => setSendOpen(true)}
                  >
                    Send to the audience now…
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  disabled={dirty || toLibrary.isPending}
                  onSelect={() => toLibrary.mutate(template.id)}
                >
                  Make this the club&apos;s default
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setConfirm("reset")}>
                  Back to the club&apos;s version…
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            ) : null}
            <DropdownMenuItem
              onSelect={() =>
                duplicate.mutate(template.id, {
                  onSuccess: (t) =>
                    router.push(
                      scope.kind === "event"
                        ? `/events/${scope.eventId}/emails/${t.id}`
                        : `/emails/${t.id}`,
                    ),
                })
              }
            >
              Duplicate
            </DropdownMenuItem>
            {template.stage === "CUSTOM" ? (
              <DropdownMenuItem
                className="text-destructive"
                onSelect={() => setConfirm("delete")}
              >
                Delete…
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          type="button"
          size="sm"
          disabled={!dirty || save.isPending}
          onClick={doSave}
        >
          <Busy on={save.isPending} />
          {save.isPending ? null : <CheckIcon />} Save
        </Button>
      </div>
      {dirty && eventId !== undefined ? (
        <p className={ui.note}>
          Save before sending: a send goes out with the last saved version.
        </p>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[250px_minmax(0,1fr)_340px]">
        {/* Blocks */}
        <aside className={cn(ui.panel, "p-3")}>
          <div className="mb-2 flex items-center justify-between">
            <p className={ui.heading}>Blocks</p>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="xs">
                  <PlusIcon /> Add
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                {BLOCK_KINDS.map((k) => (
                  <DropdownMenuItem key={k} onSelect={() => add(k)}>
                    <span className="mr-2 w-4 text-center font-mono text-[11px] text-muted-foreground">
                      {BLOCK_META[k].glyph}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[12.5px]">
                        {BLOCK_META[k].label}
                      </span>
                      <span className="block truncate text-[10.5px] text-muted-foreground">
                        {BLOCK_META[k].note}
                      </span>
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {blocks.length ? (
            <ol className="space-y-1">
              {blocks.map((b, i) => {
                const label =
                  b.kind === "heading" || b.kind === "paragraph"
                    ? b.text
                    : b.kind === "button"
                      ? b.label
                      : b.kind === "list"
                        ? b.items[0]
                        : BLOCK_META[b.kind].label;
                return (
                  <li
                    key={b.id}
                    className={cn(
                      "group flex items-center gap-1 rounded-md border px-1.5 py-1",
                      selected === b.id
                        ? "border-primary bg-primary/5"
                        : "border-transparent hover:bg-muted/60",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSelected(b.id);
                        setTab("block");
                      }}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      aria-current={selected === b.id ? "true" : undefined}
                    >
                      <span className="w-4 shrink-0 text-center font-mono text-[11px] text-muted-foreground">
                        {BLOCK_META[b.kind].glyph}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
                          {BLOCK_META[b.kind].label}
                        </span>
                        <span className="block truncate text-[12px]">
                          {label || "…"}
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-label="Move up"
                      disabled={i === 0}
                      onClick={() => setBlocks(move(blocks, i, i - 1))}
                      className={ui.iconBtn}
                    >
                      <ArrowUpIcon className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label="Move down"
                      disabled={i === blocks.length - 1}
                      onClick={() => setBlocks(move(blocks, i, i + 1))}
                      className={ui.iconBtn}
                    >
                      <ArrowDownIcon className="size-3.5" />
                    </button>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className={ui.note}>No blocks yet. Add a heading to begin.</p>
          )}
        </aside>

        {/* Preview */}
        <section className={cn(ui.panel, "flex min-h-[40rem] flex-col p-3")}>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className={ui.heading}>Subject</p>
              <p className="truncate text-[13.5px]">
                {preview.data?.subject ?? fields.subject}
              </p>
            </div>
            {eventId !== undefined ? (
              <GuestPicker
                eventId={eventId}
                value={guest}
                onChange={setGuest}
              />
            ) : (
              <p className={ui.note}>Shown with a sample guest.</p>
            )}
            {preview.isFetching ? <Busy on /> : null}
          </div>
          {problems.length ? (
            <InlineAlert
              tone="warning"
              title="Something to fix"
              className="mb-2"
            >
              {problems.join(" · ")}
            </InlineAlert>
          ) : null}
          {preview.isError ? (
            <InlineAlert
              tone="destructive"
              title="Preview failed"
              className="mb-2"
            >
              {preview.error.message}
            </InlineAlert>
          ) : null}
          <iframe
            title="Email preview"
            sandbox=""
            srcDoc={preview.data?.html ?? ""}
            className="min-h-[36rem] w-full flex-1 rounded-lg border bg-white"
          />
        </section>

        {/* Inspector */}
        <aside className={cn(ui.panel, "p-3")}>
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList className="w-full">
              <TabsTrigger value="block" className="flex-1">
                Block
              </TabsTrigger>
              <TabsTrigger value="theme" className="flex-1">
                Theme
              </TabsTrigger>
              <TabsTrigger value="sending" className="flex-1">
                Sending
              </TabsTrigger>
            </TabsList>
            <TabsContent value="block" className="pt-3">
              {current ? (
                <BlockInspector
                  key={current.id}
                  block={current}
                  scope={scope}
                  tokens={context.tokens}
                  samples={context.sampleValues}
                  textColor={fields.design.theme.text}
                  onChange={(b) =>
                    setBlocks(blocks.map((x) => (x.id === b.id ? b : x)))
                  }
                  onRemove={() => {
                    const i = blocks.findIndex((x) => x.id === current.id);
                    const next = blocks.filter((x) => x.id !== current.id);
                    setBlocks(next);
                    setSelected(next[Math.max(0, i - 1)]?.id ?? null);
                  }}
                />
              ) : (
                <p className={ui.note}>Pick a block on the left, or add one.</p>
              )}
            </TabsContent>
            <TabsContent value="theme" className="pt-3">
              <ThemePanel
                theme={fields.design.theme}
                onChange={(theme) =>
                  setFields((f) => ({ ...f, design: { ...f.design, theme } }))
                }
                brandPrimary={context.brandPrimary}
                tokens={context.tokens}
                samples={context.sampleValues}
              />
            </TabsContent>
            <TabsContent value="sending" className="pt-3">
              <SendingPanel
                fields={fields}
                onChange={setFields}
                scope={scope}
                stage={template.stage}
                tokens={context.tokens}
                samples={context.sampleValues}
              />
            </TabsContent>
          </Tabs>
        </aside>
      </div>

      {eventId !== undefined ? (
        <>
          <Dialog open={testOpen} onOpenChange={setTestOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Send a test</DialogTitle>
                <DialogDescription>
                  The email as it stands now,{" "}
                  {guest
                    ? `as ${guest.name} would get it`
                    : "with the sample guest"}
                  , to one address. Attached files come only with a real guest.
                </DialogDescription>
              </DialogHeader>
              <label htmlFor="test-to" className={ui.label}>
                Send to
              </label>
              <input
                id="test-to"
                type="email"
                value={testTo}
                placeholder="you@example.com"
                onChange={(e) => setTestTo(e.target.value)}
                className={cn(ui.control, ui.input)}
              />
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setTestOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={!/.+@.+\..+/.test(testTo) || sendTest.isPending}
                  onClick={() =>
                    sendTest.mutate(
                      {
                        to: testTo.trim(),
                        subject: fields.subject,
                        design: fields.design,
                        attachments: fields.attachments,
                        registrationId: guest?.id ?? null,
                      },
                      { onSuccess: () => setTestOpen(false) },
                    )
                  }
                >
                  <Busy on={sendTest.isPending} /> Send test
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <SendTemplateDialog
            eventId={eventId}
            template={{ ...fields, id: template.id }}
            open={sendOpen}
            onOpenChange={setSendOpen}
          />
        </>
      ) : null}

      <AlertDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === "delete"
                ? `Delete “${fields.name}”?`
                : "Back to the club's version?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "delete"
                ? "Messages already sent from it stay in the history. This cannot be undone."
                : "Everything you changed on this event's copy is replaced by the library's version of this email."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              className={
                confirm === "delete"
                  ? "bg-destructive text-white hover:bg-destructive/90"
                  : undefined
              }
              onClick={(e) => {
                e.preventDefault();
                if (confirm === "delete")
                  remove.mutate(template.id, {
                    onSuccess: () => router.push(scopeHref(scope)),
                  });
                else if (eventId !== undefined)
                  reset.mutate(template.id, {
                    onSuccess: () => setConfirm(null),
                  });
              }}
            >
              {confirm === "delete" ? "Delete" : "Replace"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
