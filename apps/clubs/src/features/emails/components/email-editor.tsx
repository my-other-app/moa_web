"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowUpIcon,
  CheckIcon,
  ChevronDownIcon,
  Loader2Icon,
  MoreHorizontalIcon,
  PlusIcon,
  SendIcon,
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
  CardLabel,
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
  FigurePanel,
  IconButton,
  Notice,
  Popover,
  PopoverContent,
  PopoverTrigger,
  SearchField,
  Skeleton,
  StatusBadge,
  TabPanel,
  TabRail,
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
  useResetLibraryTemplate,
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
  isRequestStage,
  newBlock,
  tokensForStage,
  type BlockKind,
  type EmailBlock,
  type EmailContext,
  type EmailScope,
  type EmailTemplate,
  type EmailTemplateFields,
} from "../schemas";
import { BlockInspector } from "./block-inspector";
import { useDebounced, ui } from "./kit";
import { SendingPanel, SubjectPanel, ThemePanel } from "./panels";
import { isCustomised } from "./parts";
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
    return (
      <div className="grid gap-4">
        <Skeleton className="h-14 w-full max-w-md rounded-xl" />
        <div className="grid gap-4 xl:grid-cols-[250px_minmax(0,1fr)_340px]">
          <Skeleton className="h-[30rem] rounded-2xl" />
          <Skeleton className="h-[40rem] rounded-2xl" />
          <Skeleton className="h-[30rem] rounded-2xl" />
        </div>
      </div>
    );
  if (tpl.isError || ctx.isError || !tpl.data || !ctx.data)
    return (
      <FigurePanel className="p-0">
        <EmptyState
          title="This email could not be opened"
          description={`${tpl.error?.message ?? ctx.error?.message ?? "It may have been deleted."} Go back to the list and open it again.`}
          action={
            <Link href={scopeHref(scope)} className="btn btn-secondary">
              <ArrowLeftIcon />{" "}
              {scope.kind === "event" ? "Event emails" : "Email library"}
            </Link>
          }
        />
      </FigurePanel>
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

const blockLine = (b: EmailBlock) =>
  b.kind === "heading" || b.kind === "paragraph"
    ? b.text
    : b.kind === "button"
      ? b.label
      : b.kind === "list"
        ? b.items[0]
        : BLOCK_META[b.kind].label;

type Guest = { id: string; name: string };

/**
 * Whose values the preview shows: the sample guest, or a real one found by
 * name, email or ticket. The same field and list as the kit's combobox, but
 * the list is searched on the server, so a guest in a large event is found.
 */
function GuestPicker({
  eventId,
  value,
  onChange,
}: {
  eventId: number;
  value: Guest | null;
  onChange: (v: Guest | null) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const settled = useDebounced(search.trim(), 300);
  const regs = useRegistrations({
    eventId,
    search: settled || undefined,
    offset: 0,
    limit: 8,
  });
  const items = regs.data?.items ?? [];
  const pick = (v: Guest | null) => {
    onChange(v);
    setOpen(false);
    setSearch("");
  };
  const option = (active: boolean) =>
    cn(
      "flex cursor-pointer items-center justify-between gap-2 rounded-[var(--radius-sm)] px-2.5 py-1.5 text-[13px] hover:bg-sunken hover:text-ink",
      active ? "text-ink" : "text-ink-2",
    );
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={
            value
              ? `Previewing as ${value.name}; change the guest`
              : "Preview as a guest"
          }
          className="input input-sm flex w-60 max-w-full items-center justify-between gap-2 text-left"
        >
          <span className={cn("truncate", !value && "text-ink-3")}>
            {value ? `As ${value.name}` : "As the sample guest"}
          </span>
          <ChevronDownIcon
            className="text-ink-3 size-4 shrink-0"
            aria-hidden="true"
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-72 p-1.5"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <SearchField
          value={search}
          onChange={setSearch}
          label="Search guests"
          placeholder="Name, email or ticket"
          size="sm"
          autoFocus
        />
        <ul
          role="listbox"
          aria-label="Guests"
          className="scroll-thin mt-1.5 max-h-64 overflow-y-auto"
        >
          <li
            role="option"
            aria-selected={value === null}
            onClick={() => pick(null)}
            className={option(value === null)}
          >
            <span className="min-w-0">
              <span className="block truncate">The sample guest</span>
              <span className="text-ink-3 block truncate text-[11.5px]">
                Sample values for every token
              </span>
            </span>
            {value === null ? (
              <CheckIcon className="text-brand size-4 shrink-0" />
            ) : null}
          </li>
          {items.map((r) => {
            const name = r.full_name ?? r.email ?? r.id;
            return (
              <li
                key={r.id}
                role="option"
                aria-selected={value?.id === r.id}
                onClick={() => pick({ id: r.id, name })}
                className={option(value?.id === r.id)}
              >
                <span className="min-w-0">
                  <span className="block truncate">{r.full_name ?? "—"}</span>
                  <span className="text-ink-3 block truncate font-mono text-[11px]">
                    {r.email ?? r.ticket_id}
                  </span>
                </span>
                {value?.id === r.id ? (
                  <CheckIcon className="text-brand size-4 shrink-0" />
                ) : null}
              </li>
            );
          })}
          {items.length === 0 ? (
            <li className="text-ink-3 px-2.5 py-3 text-[12.5px]">
              {regs.isFetching ? "Searching…" : "No guest matches"}
            </li>
          ) : null}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

type InspectorTab = "block" | "theme" | "sending" | "subject";
const TABS: { key: InspectorTab; label: string }[] = [
  { key: "block", label: "Block" },
  { key: "theme", label: "Theme" },
  { key: "sending", label: "Sending" },
];
/** A registration review email's: no Sending (it goes by itself, always on), its subject on a tab of its own. */
const REVIEW_TABS: { key: InspectorTab; label: string }[] = [
  { key: "block", label: "Block" },
  { key: "theme", label: "Theme" },
  { key: "subject", label: "Subject" },
];

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
  const [tab, setTab] = React.useState<InspectorTab>("block");
  const [guest, setGuest] = React.useState<Guest | null>(null);
  const [testOpen, setTestOpen] = React.useState(false);
  const [testTo, setTestTo] = React.useState("");
  const [sendOpen, setSendOpen] = React.useState(false);
  const [confirm, setConfirm] = React.useState<"reset" | "default" | "delete" | null>(null);

  const save = useSaveTemplate(scope);
  const sendTest = useSendTest(eventId ?? 0);
  const toLibrary = useSaveToLibrary(eventId ?? 0);
  const reset = useResetTemplate(eventId ?? 0);
  const resetToDefault = useResetLibraryTemplate();
  const duplicate = useDuplicateTemplate(scope);
  const remove = useDeleteTemplate(scope);
  // A registration review email: the club's library only, always on, sent by itself as a registration moves.
  const review = isRequestStage(template.stage);
  // Its token menus offer the tokens its stage may use (the request tokens only to theirs).
  const tokens = React.useMemo(
    () => tokensForStage(context.tokens, template.stage),
    [context.tokens, template.stage],
  );

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
  const event = scope.kind === "event";
  // Inside an event the console's heading is the page's h1.
  const Title = event ? "h2" : "h1";

  return (
    <div className="grid gap-4">
      <div>
        <Link href={scopeHref(scope)} className="btn btn-ghost btn-sm">
          <ArrowLeftIcon /> {event ? "Event emails" : "Email library"}
        </Link>
      </div>

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 flex-1">
          <span className="eyebrow">
            {stageMeta.label}
            {event ? "" : " · library"} · v{template.version}
          </span>
          <Title
            className={cn(
              "m-0 truncate font-semibold tracking-[-0.02em]",
              event ? "mt-0.5 text-[17px]" : "page-title mt-1",
            )}
          >
            {fields.name || "Untitled email"}
          </Title>
          <p className="text-ink-3 mt-1 text-[12.5px]">
            {review ? (
              <>
                The club&apos;s email for every event that reviews
                registrations. Goes out {stageMeta.when}
                {/[.!?]$/.test(stageMeta.when ?? "") ? "" : "."} Always on.
              </>
            ) : (
              <>
                {event
                  ? isCustomised(template)
                    ? "This event's copy, changed from the club's version."
                    : "This event's copy of the club's version."
                  : "The club's version: every new event starts from it."}{" "}
                {fields.enabled
                  ? "Switched on."
                  : "Switched off: it does not go out."}
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge
            tone={dirty ? "warning" : "default"}
            label={dirty ? "Unsaved changes" : "Saved"}
          />
          {eventId !== undefined ? (
            <Button variant="secondary" onClick={() => setTestOpen(true)}>
              <SendIcon /> Send test
            </Button>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton label="More for this email" size="md">
                <MoreHorizontalIcon />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              {review ? (
                <DropdownMenuItem onSelect={() => setConfirm("default")}>
                  <span className="flex flex-col">
                    <span>Reset to default…</span>
                    <span className="text-ink-3 text-xs">
                      Back to MyOtherApp&apos;s words for this email.
                    </span>
                  </span>
                </DropdownMenuItem>
              ) : null}
              {eventId !== undefined && !review ? (
                <>
                  {template.stage === "INVITE" ? (
                    <DropdownMenuItem
                      onSelect={() =>
                        router.push(`/events/${eventId}/attendees`)
                      }
                    >
                      <span className="flex flex-col">
                        <span>Send tickets</span>
                        <span className="text-ink-3 text-xs">
                          From Attendees: the invite rides with each ticket.
                        </span>
                      </span>
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem
                      disabled={dirty}
                      onSelect={() => setSendOpen(true)}
                    >
                      <span className="flex flex-col">
                        <span>Send to the audience now…</span>
                        <span className="text-ink-3 text-xs">
                          {dirty
                            ? "Save first: a send uses the saved version."
                            : "Its audience, now, whatever its timer says."}
                        </span>
                      </span>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    disabled={dirty || toLibrary.isPending}
                    onSelect={() => toLibrary.mutate(template.id)}
                  >
                    <span className="flex flex-col">
                      <span>Make this the club&apos;s default</span>
                      <span className="text-ink-3 text-xs">
                        New events start from this version.
                      </span>
                    </span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setConfirm("reset")}>
                    <span className="flex flex-col">
                      <span>Back to the club&apos;s version…</span>
                      <span className="text-ink-3 text-xs">
                        Undo every change made for this event.
                      </span>
                    </span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              ) : null}
              {review ? null : (
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
              )}
              {template.stage === "CUSTOM" ? (
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => setConfirm("delete")}
                >
                  Delete…
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button disabled={!dirty || save.isPending} onClick={doSave}>
            {save.isPending ? (
              <Loader2Icon className="animate-spin" />
            ) : (
              <CheckIcon />
            )}
            Save
          </Button>
        </div>
      </header>
      {dirty && eventId !== undefined ? (
        <Notice tone="neutral" tag="Unsaved">
          A send to the audience and the club&apos;s default use the last saved
          version. Save to send what you see; a test sends it as it is.
        </Notice>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[250px_minmax(0,1fr)_340px]">
        {/* Blocks */}
        <FigurePanel className="h-fit p-3">
          <CardLabel
            className="mb-2.5"
            right={
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="secondary" size="xs">
                    <PlusIcon /> Add
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  {BLOCK_KINDS.map((k) => (
                    <DropdownMenuItem key={k} onSelect={() => add(k)}>
                      <span className="text-ink-3 w-4 shrink-0 text-center font-mono text-[11px]">
                        {BLOCK_META[k].glyph}
                      </span>
                      <span className="min-w-0">
                        <span className="text-ink block text-[12.5px]">
                          {BLOCK_META[k].label}
                        </span>
                        <span className="text-ink-3 block truncate text-[11px]">
                          {BLOCK_META[k].note}
                        </span>
                      </span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            }
          >
            Blocks · {blocks.length}
          </CardLabel>
          {blocks.length ? (
            // One column held to the panel: a long line truncates rather than running under the preview.
            <ol className="grid grid-cols-1 gap-1">
              {blocks.map((b, i) => {
                const on = selected === b.id;
                const line = blockLine(b) || "…";
                return (
                  <li
                    key={b.id}
                    className={cn(
                      "flex items-center gap-1 rounded-xl border py-1 pr-1 pl-2 transition-colors",
                      on
                        ? "border-brand-line bg-brand-soft"
                        : "hover:bg-sunken border-transparent",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSelected(b.id);
                        setTab("block");
                      }}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      aria-current={on ? "true" : undefined}
                    >
                      <span
                        className={cn(
                          "w-4 shrink-0 text-center font-mono text-[11px]",
                          on ? "text-brand" : "text-ink-3",
                        )}
                      >
                        {BLOCK_META[b.kind].glyph}
                      </span>
                      <span className="min-w-0">
                        <span className="eyebrow block">
                          {BLOCK_META[b.kind].label}
                        </span>
                        <span className="text-ink block truncate text-[12px]">
                          {line}
                        </span>
                      </span>
                    </button>
                    <IconButton
                      label={`Move ${BLOCK_META[b.kind].label.toLowerCase()} up`}
                      size="xs"
                      variant="quiet"
                      disabled={i === 0}
                      onClick={() => setBlocks(move(blocks, i, i - 1))}
                    >
                      <ArrowUpIcon />
                    </IconButton>
                    <IconButton
                      label={`Move ${BLOCK_META[b.kind].label.toLowerCase()} down`}
                      size="xs"
                      variant="quiet"
                      disabled={i === blocks.length - 1}
                      onClick={() => setBlocks(move(blocks, i, i + 1))}
                    >
                      <ArrowDownIcon />
                    </IconButton>
                  </li>
                );
              })}
            </ol>
          ) : (
            <EmptyState
              size="sm"
              title="No blocks yet"
              description="Add a heading to begin, then a paragraph and a button."
              action={
                <Button
                  size="xs"
                  variant="secondary"
                  onClick={() => add("heading")}
                >
                  <PlusIcon /> Add a heading
                </Button>
              }
            />
          )}
        </FigurePanel>

        {/* Preview */}
        <FigurePanel className="flex min-h-[40rem] flex-col p-3">
          <CardLabel
            className="mb-2"
            right={
              preview.isFetching ? (
                <span className="text-ink-3 flex items-center gap-1.5 text-[11px]">
                  <Loader2Icon className="size-3.5 animate-spin" /> Rendering
                </span>
              ) : (
                <span className="text-ink-3 text-[11px]">
                  as a guest&apos;s inbox shows it
                </span>
              )
            }
          >
            Preview
          </CardLabel>
          <div className="border-line-soft mb-3 flex flex-wrap items-center gap-2 border-b pb-3">
            <div className="min-w-0 flex-1">
              <span className="text-ink-3 text-[11px]">Subject</span>
              <p className="text-ink truncate text-[13.5px] font-medium">
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
              <span className="text-ink-3 text-[11.5px]">
                Shown with a sample guest.
              </span>
            )}
          </div>
          {problems.length ? (
            <Notice tone="caution" tag="Fix" className="mb-3">
              {problems.join(" · ")}
            </Notice>
          ) : null}
          {preview.isError ? (
            <Notice tone="refuse" tag="Preview" className="mb-3">
              {preview.error.message}
            </Notice>
          ) : null}
          {/* The mail's own surface: email clients draw it on white, whatever the dashboard's mode. */}
          <iframe
            title="Email preview"
            sandbox=""
            srcDoc={preview.data?.html ?? ""}
            className="border-line-soft min-h-[36rem] w-full flex-1 rounded-xl border bg-white"
          />
        </FigurePanel>

        {/* Inspector */}
        <FigurePanel className="h-fit p-3">
          <TabRail
            label="Edit"
            value={tab}
            onChange={(k) => setTab(k as InspectorTab)}
            items={review ? REVIEW_TABS : TABS}
            className="mb-3"
          />
          <TabPanel id={tab}>
            {tab === "block" ? (
              current ? (
                <BlockInspector
                  key={current.id}
                  block={current}
                  scope={scope}
                  tokens={tokens}
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
                <p className={ui.note}>
                  Pick a block on the left to change its words and its look, or
                  add one.
                </p>
              )
            ) : tab === "theme" ? (
              <ThemePanel
                theme={fields.design.theme}
                onChange={(theme) =>
                  setFields((f) => ({ ...f, design: { ...f.design, theme } }))
                }
                brandPrimary={context.brandPrimary}
                tokens={tokens}
                samples={context.sampleValues}
              />
            ) : review ? (
              <SubjectPanel
                fields={fields}
                onChange={setFields}
                stage={template.stage}
                tokens={tokens}
                samples={context.sampleValues}
              />
            ) : (
              <SendingPanel
                fields={fields}
                onChange={setFields}
                scope={scope}
                stage={template.stage}
                tokens={tokens}
                samples={context.sampleValues}
              />
            )}
          </TabPanel>
        </FigurePanel>
      </div>

      {eventId !== undefined ? (
        <>
          <Dialog open={testOpen} onOpenChange={setTestOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Send a test</DialogTitle>
                <DialogDescription>
                  The email as it stands now, saved or not,{" "}
                  {guest
                    ? `as ${guest.name} would get it`
                    : "with the sample guest"}
                  , to one address. Attached files come only with a real guest.
                </DialogDescription>
              </DialogHeader>
              <div>
                <label htmlFor="test-to" className={ui.label}>
                  Send to
                </label>
                <input
                  id="test-to"
                  type="email"
                  value={testTo}
                  placeholder="you@example.com"
                  onChange={(e) => setTestTo(e.target.value)}
                  className={ui.control}
                />
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setTestOpen(false)}>
                  Cancel
                </Button>
                <Button
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
                  {sendTest.isPending ? (
                    <Loader2Icon className="animate-spin" />
                  ) : (
                    <SendIcon />
                  )}
                  Send test
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
                : confirm === "default"
                  ? "Reset to the default words?"
                  : "Back to the club's version?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "delete"
                ? "Messages already sent from it stay in the history. This cannot be undone."
                : confirm === "default"
                  ? "Your changes to this email are replaced by MyOtherApp's default."
                  : "Everything you changed on this event's copy is replaced by the library's version of this email."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="secondary">Keep it</AlertDialogCancel>
            <AlertDialogAction
              variant={confirm === "delete" ? "destructive" : "primary"}
              disabled={
                remove.isPending || reset.isPending || resetToDefault.isPending
              }
              onClick={(e) => {
                e.preventDefault();
                if (confirm === "delete")
                  remove.mutate(template.id, {
                    onSuccess: () => router.push(scopeHref(scope)),
                  });
                else if (confirm === "default")
                  // Refused or done, the question is answered: a refusal is said in a toast.
                  resetToDefault.mutate(template.id, {
                    onSettled: () => setConfirm(null),
                  });
                else if (eventId !== undefined)
                  reset.mutate(template.id, {
                    onSuccess: () => setConfirm(null),
                  });
              }}
            >
              {confirm === "delete"
                ? "Delete"
                : confirm === "default"
                  ? "Reset"
                  : "Replace"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
