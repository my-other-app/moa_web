"use client";

import * as React from "react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ClockIcon,
  EyeIcon,
  EyeOffIcon,
  ListChecksIcon,
  PencilIcon,
  PlusIcon,
  PrinterIcon,
  RefreshCwIcon,
  Trash2Icon,
  WandSparklesIcon,
} from "lucide-react";
import { formatNumber, plural } from "@moa/app-kit";
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
  Checkbox,
  ChoiceCard,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  FigurePanel,
  IconButton,
  NativeSelect,
  Textarea,
  toast,
} from "@moa/ui";

import { CODE_MAX, GROUP_LABEL, KIND_META, codeProblem, codeSheetHtml, fieldsOf, FALLBACK_CONFIG, generateCode, inputOf, kindLabel, ruleLine, suggestTitle } from "../lib/kinds";
import { errorCodeOf, errorText, fieldProblems, fromLocalInput, toLocalInput, windowText } from "../lib/time";
import { useCreateTask, useDeleteTask, useOrderTasks, useUpdateTask } from "../queries";
import { TASK_KINDS, TASK_TITLE_MAX, type QuestAdmin, type QuestTask, type TaskInput, type TaskTemplate, type TemplateField } from "../schemas";

const POINTS_MAX = 1000;

/** The kinds the picker offers: the server's templates in its order, else every kind this dashboard knows. */
export function pickerKinds(templates: TaskTemplate[] | null | undefined): string[] {
  return templates?.length ? templates.map((t) => t.kind) : [...TASK_KINDS];
}

/** Open the printable code sheet in a new tab; it prints itself once loaded. */
export function printCodeSheet(eventName: string, q: QuestAdmin) {
  const html = codeSheetHtml(eventName, q.tasks, q.mode);
  const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  const w = window.open(url, "_blank");
  if (!w) toast.error("The browser blocked the new tab", { description: "Allow pop-ups for this page, then try again." });
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// ─── The task form ───────────────────────────────────────────────────────

interface TaskDraft {
  title: string;
  description: string;
  points: string;
  required: boolean;
  starts: string;
  ends: string;
  config: Record<string, string>;
}

const asText = (v: unknown, input: string) => {
  if (v === null || v === undefined) return "";
  if (input === "datetime") return toLocalInput(String(v));
  return String(v);
};

function draftFor(kind: string, templates: TaskTemplate[] | null | undefined, task?: QuestTask): TaskDraft {
  const t = templates?.find((x) => x.kind === kind);
  const config = task?.config ?? (t && Object.keys(t.default_config).length ? t.default_config : (FALLBACK_CONFIG[kind] ?? {}));
  const fields = fieldsOf(kind, templates);
  return {
    title: task?.title ?? (t?.default_title || KIND_META[kind]?.label || ""),
    description: task?.description ?? "",
    points: String(task?.points ?? 10),
    required: task?.required ?? false,
    starts: toLocalInput(task?.starts_at),
    ends: toLocalInput(task?.ends_at),
    config: Object.fromEntries(fields.map((f) => [f.key, asText(config[f.key], inputOf(f))])),
  };
}

/** The rule as the server takes it: numbers as numbers, times as ISO, empties as null. */
function configOut(fields: TemplateField[], d: TaskDraft): Record<string, unknown> {
  return Object.fromEntries(
    fields.map((f) => {
      const v = (d.config[f.key] ?? "").trim();
      const input = inputOf(f);
      if (!v) return [f.key, null];
      if (input === "number") return [f.key, Number(v)];
      if (input === "datetime") return [f.key, fromLocalInput(v)];
      return [f.key, v];
    })
  );
}

/** What is wrong with the task as written, field by field. */
export function taskProblems(fields: TemplateField[], d: TaskDraft, otherCodes: string[], mode: "checkmarks" | "points"): Record<string, string> {
  const out: Record<string, string> = {};
  if (!d.title.trim()) out.title = "Give it a title guests understand.";
  if (mode === "points") {
    const p = Number(d.points);
    if (!Number.isInteger(p) || p < 0 || p > POINTS_MAX) out.points = `A whole number from 0 to ${POINTS_MAX}.`;
  }
  if (d.starts && d.ends && new Date(d.ends) <= new Date(d.starts)) out.ends = "It must end after it starts.";
  for (const f of fields) {
    const v = (d.config[f.key] ?? "").trim();
    const input = inputOf(f);
    if (!v) {
      // Only a time may be left empty ("checked in before" is optional); every other rule needs its value.
      if (input !== "datetime") out[f.key] = input === "station" ? "Pick the station." : "Fill this in.";
      continue;
    }
    if (input === "number") {
      const x = Number(v);
      if (!Number.isFinite(x) || !Number.isInteger(x)) out[f.key] = "A whole number.";
      else if (f.min != null && x < f.min) out[f.key] = `At least ${formatNumber(f.min)}.`;
      else if (f.max != null && x > f.max) out[f.key] = `At most ${formatNumber(f.max)}.`;
    }
    if (input === "code") {
      const problem = codeProblem(v, otherCodes);
      if (problem) out[f.key] = problem;
    }
  }
  return out;
}

function ConfigField({
  field,
  value,
  onChange,
  problem,
  q,
  id,
}: {
  field: TemplateField;
  value: string;
  onChange: (v: string) => void;
  problem?: string;
  q: QuestAdmin;
  id: string;
}) {
  const input = inputOf(field);
  const fid = `${id}-${field.key}`;
  const stations = q.stations.filter((s) => s.purpose === "station" && s.active);
  const label = field.label || field.key.replace(/_/g, " ");
  return (
    <div>
      <label htmlFor={fid} className="eyebrow mb-1.5 block">
        {label}
      </label>
      {input === "select" ? (
        <NativeSelect id={fid} value={value} onChange={(e) => onChange(e.target.value)}>
          {field.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label ?? o.value.replace(/_/g, " ")}
            </option>
          ))}
        </NativeSelect>
      ) : input === "station" ? (
        stations.length ? (
          <NativeSelect id={fid} value={value} onChange={(e) => onChange(e.target.value)}>
            <option value="">Pick a station</option>
            {stations.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </NativeSelect>
        ) : (
          <p id={fid} className="text-caution text-[12.5px] leading-[1.5]">
            No station yet. Add one under Stations below: it can make its own task.
          </p>
        )
      ) : input === "code" ? (
        <div className="flex gap-2">
          <input id={fid} className="input min-w-0 flex-1 font-mono uppercase" value={value} maxLength={CODE_MAX} autoComplete="off" spellCheck={false} onChange={(e) => onChange(e.target.value)} />
          <Button type="button" variant="secondary" onClick={() => onChange(generateCode())}>
            <WandSparklesIcon /> Generate
          </Button>
        </div>
      ) : input === "datetime" ? (
        <input id={fid} type="datetime-local" className="input w-auto" value={value} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input
          id={fid}
          className="input w-32"
          type={input === "number" ? "number" : "text"}
          inputMode={input === "number" ? "numeric" : undefined}
          min={field.min ?? undefined}
          max={field.max ?? undefined}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {problem ? (
        <p className="text-refuse mt-1 text-[11.5px]">{problem}</p>
      ) : input === "number" && (field.min != null || field.max != null) ? (
        <p className="text-ink-3 mt-1 text-[11.5px]">
          {field.min != null && field.max != null ? `${formatNumber(field.min)} to ${formatNumber(field.max)}` : field.min != null ? `At least ${formatNumber(field.min)}` : `At most ${formatNumber(field.max!)}`}
        </p>
      ) : input === "code" ? (
        <p className="text-ink-3 mt-1 text-[11.5px]">Case and spaces don&apos;t matter when guests type it. It is never shown to guests.</p>
      ) : null}
    </div>
  );
}

function TaskForm({
  eventId,
  q,
  templates,
  kind,
  task,
  onBack,
  onDone,
}: {
  eventId: number;
  q: QuestAdmin;
  templates: TaskTemplate[] | null | undefined;
  kind: string;
  task?: QuestTask;
  onBack?: () => void;
  onDone: () => void;
}) {
  const create = useCreateTask(eventId);
  const update = useUpdateTask(eventId);
  const [typed, setDraft] = React.useState<TaskDraft>(() => draftFor(kind, templates, task));
  // A new task's title follows its rule ("Meet 5 people") until the organiser types one of their own.
  const [titleTouched, setTitleTouched] = React.useState(Boolean(task));
  const draft = titleTouched ? typed : { ...typed, title: suggestTitle(kind, templates, typed.config, q.stations) };
  const [server, setServer] = React.useState<Record<string, string>>({});
  const id = React.useId();
  const fields = fieldsOf(kind, templates);
  const otherCodes = q.tasks.filter((t) => t.kind === "code" && t.id !== task?.id).map((t) => String(t.config.code ?? ""));
  const problems = { ...taskProblems(fields, draft, otherCodes, q.mode), ...server };
  const busy = create.isPending || update.isPending;
  const meta = KIND_META[kind];
  const set = (patch: Partial<TaskDraft>) => {
    setServer({});
    setDraft((d) => ({ ...d, ...patch }));
  };

  const submit = async () => {
    const local = taskProblems(fields, draft, otherCodes, q.mode);
    if (Object.keys(local).length) return;
    const body: TaskInput = {
      title: draft.title.trim(),
      description: draft.description.trim() || null,
      points: q.mode === "points" ? Number(draft.points) : task?.points ?? 0,
      required: draft.required,
      starts_at: fromLocalInput(draft.starts),
      ends_at: fromLocalInput(draft.ends),
      config: configOut(fields, draft),
    };
    try {
      if (task) await update.mutateAsync({ taskId: task.id, body });
      else await create.mutateAsync({ ...body, kind });
      toast.success(task ? `${body.title} saved` : `${body.title} added`, {
        description: task ? "Guests who have it keep it." : "What guests already did is counted for it now.",
      });
      onDone();
    } catch (err) {
      const code = errorCodeOf(err);
      if (code === "QUEST_CODE_TAKEN") return setServer({ code: "Another code task already uses this code." });
      if (code === "QUEST_STATION_NOT_FOUND") return setServer({ door_id: "That station is gone: pick another." });
      const fp = fieldProblems(err);
      if (Object.keys(fp).length) return setServer(fp);
      toast.error(errorText(err));
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="grid gap-4"
    >
      <DialogHeader>
        <DialogTitle>{task ? `Edit ${task.title}` : kindLabel(kind, templates)}</DialogTitle>
        <DialogDescription>{templates?.find((t) => t.kind === kind)?.description || meta?.proof || "A task of a kind this dashboard doesn't know yet."}</DialogDescription>
      </DialogHeader>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px]">
        <div>
          <label htmlFor={`${id}-title`} className="eyebrow mb-1.5 block">
            Title guests see
          </label>
          <input id={`${id}-title`} className="input" value={draft.title} maxLength={TASK_TITLE_MAX} onChange={(e) => (setTitleTouched(true), set({ title: e.target.value }))} />
          {problems.title ? <p className="text-refuse mt-1 text-[11.5px]">{problems.title}</p> : null}
        </div>
        {q.mode === "points" ? (
          <div>
            <label htmlFor={`${id}-points`} className="eyebrow mb-1.5 block">
              Points
            </label>
            <input id={`${id}-points`} type="number" inputMode="numeric" min={0} max={POINTS_MAX} className="input" value={draft.points} onChange={(e) => set({ points: e.target.value })} />
            {problems.points ? <p className="text-refuse mt-1 text-[11.5px]">{problems.points}</p> : null}
          </div>
        ) : (
          <p className="text-ink-3 self-end pb-2 text-[11.5px] leading-[1.5]">Checkmarks: every task counts one.</p>
        )}
      </div>
      <div>
        <label htmlFor={`${id}-desc`} className="eyebrow mb-1.5 block">
          How to do it (optional)
        </label>
        <Textarea id={`${id}-desc`} rows={2} maxLength={300} value={draft.description} placeholder="Scan the QR codes of people you meet, in the app's Network tab." onChange={(e) => set({ description: e.target.value })} />
      </div>
      {fields.length ? (
        <div className="bg-sunken grid gap-3 rounded-xl p-3 sm:grid-cols-2">
          {fields.map((f) => (
            <ConfigField key={f.key} id={id} q={q} field={f} value={draft.config[f.key] ?? ""} problem={problems[f.key]} onChange={(v) => set({ config: { ...draft.config, [f.key]: v } })} />
          ))}
          {kind === "network" ? (
            <p className="text-ink-3 text-[11.5px] leading-[1.5] sm:col-span-2">
              Counted: distinct people met by scanning a personal QR in the app&apos;s Network section, both checked in at this event, during it. Each person counts once;
              beyond the per-minute limit, extra people that minute don&apos;t count.
            </p>
          ) : null}
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <span className="eyebrow mb-1.5 block">Open (optional)</span>
          <div className="flex flex-wrap items-center gap-1.5">
            <input type="datetime-local" aria-label="Task opens" className="input w-auto" value={draft.starts} onChange={(e) => set({ starts: e.target.value })} />
            <span className="text-ink-3 text-[11px]">to</span>
            <input type="datetime-local" aria-label="Task closes" className="input w-auto" value={draft.ends} onChange={(e) => set({ ends: e.target.value })} />
          </div>
          <p className={problems.ends ? "text-refuse mt-1 text-[11.5px]" : "text-ink-3 mt-1 text-[11.5px]"}>{problems.ends ?? "Empty: the quest's own hours."}</p>
        </div>
        <label className="flex items-start gap-2.5 self-center">
          <Checkbox checked={draft.required} onCheckedChange={(v) => set({ required: v === true })} className="mt-0.5" aria-label="Required" />
          <span className="min-w-0">
            <span className="text-ink block text-[13px] font-medium">Required</span>
            <span className="text-ink-3 block text-[11.5px] leading-[1.5]">No reward unlocks until every required task is done.</span>
          </span>
        </label>
      </div>
      <DialogFooter>
        {onBack ? (
          <Button type="button" variant="ghost" onClick={onBack}>
            Back
          </Button>
        ) : null}
        <Button type="submit" disabled={busy || Object.keys(problems).length > 0}>
          {busy ? "Saving…" : task ? "Save task" : "Add task"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Add a task: pick a kind from the templates, then fill in its rule. Or edit one. */
function TaskDialog({
  eventId,
  q,
  templates,
  editing,
  open,
  onClose,
}: {
  eventId: number;
  q: QuestAdmin;
  templates: TaskTemplate[] | null | undefined;
  editing: QuestTask | null;
  open: boolean;
  onClose: () => void;
}) {
  const [kind, setKind] = React.useState<string | null>(null);
  const kinds = pickerKinds(templates);
  const groups = Object.entries(GROUP_LABEL)
    .map(([g, label]) => ({ g, label, kinds: kinds.filter((k) => (KIND_META[k]?.group ?? "you") === g) }))
    .filter((x) => x.kinds.length);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setKind(null);
          onClose();
        }
      }}
    >
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-[620px]">
        {editing ? (
          <TaskForm key={editing.id} eventId={eventId} q={q} templates={templates} kind={editing.kind} task={editing} onDone={onClose} />
        ) : kind ? (
          <TaskForm key={kind} eventId={eventId} q={q} templates={templates} kind={kind} onBack={() => setKind(null)} onDone={() => (setKind(null), onClose())} />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Add a task</DialogTitle>
              <DialogDescription>Every task is proven by what happens: a check-in, a scan, a code, the live room, or you. Guests never tick their own.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4">
              {groups.map((grp) => (
                <section key={grp.g} aria-label={grp.label}>
                  <p className="eyebrow mb-1.5">{grp.label}</p>
                  <div role="radiogroup" aria-label={grp.label} className="grid gap-2 sm:grid-cols-2">
                    {grp.kinds.map((k) => (
                      <ChoiceCard
                        key={k}
                        checked={false}
                        onClick={() => setKind(k)}
                        title={kindLabel(k, templates)}
                        hint={(templates?.find((t) => t.kind === k)?.description || KIND_META[k]?.proof || "").split(". ")[0]}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── The list ────────────────────────────────────────────────────────────

/** A code task's code: hidden until asked (screens get shared), with a new one a click away. */
function CodeLine({ eventId, task, canEdit }: { eventId: number; task: QuestTask; canEdit: boolean }) {
  const [shown, setShown] = React.useState(false);
  const [confirm, setConfirm] = React.useState(false);
  const update = useUpdateTask(eventId);
  const code = typeof task.config.code === "string" ? task.config.code : "";
  const rotate = async () => {
    try {
      await update.mutateAsync({ taskId: task.id, body: { config: { ...task.config, code: generateCode() } } });
      setConfirm(false);
      setShown(true);
      toast.success("New code made", { description: "The old one no longer works. Guests who typed it keep their tick." });
    } catch (err) {
      toast.error(errorText(err));
    }
  };
  return (
    <span className="mt-1 flex flex-wrap items-center gap-1.5">
      <code className="bg-sunken text-ink rounded-md px-2 py-0.5 font-mono text-[12.5px] tracking-[0.08em]" aria-label={shown ? `Code ${code}` : "Code hidden"}>
        {shown ? code || "—" : "••••••"}
      </code>
      <Button type="button" size="xs" variant="ghost" onClick={() => setShown((s) => !s)} aria-label={shown ? `Hide the code of ${task.title}` : `Show the code of ${task.title}`}>
        {shown ? <EyeOffIcon /> : <EyeIcon />} {shown ? "Hide" : "Show"}
      </Button>
      {canEdit ? (
        <Button type="button" size="xs" variant="ghost" onClick={() => setConfirm(true)} aria-label={`New code for ${task.title}`}>
          <RefreshCwIcon /> New code
        </Button>
      ) : null}
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Make a new code for {task.title}?</AlertDialogTitle>
            <AlertDialogDescription>The current code stops working at once: reprint the code sheet and change the slide. Guests who already typed it keep their tick.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="secondary">Keep this code</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void rotate();
              }}
            >
              Make a new code
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </span>
  );
}

function TaskRow({
  eventId,
  q,
  task,
  index,
  templates,
  canEdit,
  onEdit,
  onMove,
}: {
  eventId: number;
  q: QuestAdmin;
  task: QuestTask;
  index: number;
  templates: TaskTemplate[] | null | undefined;
  canEdit: boolean;
  onEdit: () => void;
  onMove: (by: -1 | 1) => void;
}) {
  const remove = useDeleteTask(eventId);
  const [confirm, setConfirm] = React.useState(false);
  const last = index === q.tasks.length - 1;
  const windowed = task.starts_at || task.ends_at;
  return (
    <li className="border-line-soft flex flex-wrap items-start gap-3 border-t px-4 py-3 first:border-t-0">
      <span className="bg-brand-soft text-brand grid size-8 shrink-0 place-items-center rounded-lg font-mono text-[12px] font-semibold tabular-nums" aria-hidden="true">
        {index + 1}
      </span>
      <div className="min-w-[200px] flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-ink text-[13.5px] font-medium">{task.title}</span>
          <span className="tag tag-neutral">{kindLabel(task.kind, templates)}</span>
          {task.required ? <span className="tag tag-accent">Required</span> : null}
          {q.mode === "points" ? <span className="text-ink-2 font-mono text-[11.5px]">{task.points} pts</span> : null}
        </div>
        <p className="text-ink-3 mt-0.5 text-[12px]">
          {ruleLine(task, q.stations)}
          {windowed ? (
            <span className="inline-flex items-center gap-1">
              {" "}
              · <ClockIcon aria-hidden="true" className="size-3" /> {windowText(task.starts_at, task.ends_at)}
            </span>
          ) : null}
        </p>
        {task.kind === "code" ? <CodeLine eventId={eventId} task={task} canEdit={canEdit} /> : null}
      </div>
      <span className="w-[72px] text-right">
        <span className="text-ink block font-mono text-[13px] tabular-nums">{formatNumber(task.done_count)}</span>
        <span className="text-ink-3 block text-[11px]">done</span>
      </span>
      {canEdit ? (
        <span className="flex items-center gap-0.5">
          <IconButton label={`Move ${task.title} up`} disabled={index === 0} onClick={() => onMove(-1)}>
            <ArrowUpIcon />
          </IconButton>
          <IconButton label={`Move ${task.title} down`} disabled={last} onClick={() => onMove(1)}>
            <ArrowDownIcon />
          </IconButton>
          <IconButton label={`Edit ${task.title}`} onClick={onEdit}>
            <PencilIcon />
          </IconButton>
          <IconButton label={`Delete ${task.title}`} danger onClick={() => setConfirm(true)}>
            <Trash2Icon />
          </IconButton>
        </span>
      ) : null}
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {task.title}?</AlertDialogTitle>
            <AlertDialogDescription>
              {task.done_count
                ? `${plural(task.done_count, "guest has", "guests have")} it. It stops counting towards milestones (a milestone a guest no longer reaches is withdrawn, and a reward not yet collected goes back to stock); it stays in the export for the record.`
                : "Nobody has done it yet, so nothing is lost."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="secondary">Keep it</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={(e) => {
                e.preventDefault();
                remove.mutate(task.id, {
                  onSuccess: () => {
                    setConfirm(false);
                    toast.success(`${task.title} deleted`);
                  },
                });
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

/** The quest's tasks, in the order guests see them: what each is, its rule, its points, how many have it. */
export function TasksPanel({
  eventId,
  q,
  templates,
  canEdit,
  eventName,
}: {
  eventId: number;
  q: QuestAdmin;
  templates: TaskTemplate[] | null | undefined;
  canEdit: boolean;
  eventName: string;
}) {
  const order = useOrderTasks(eventId);
  const [adding, setAdding] = React.useState(false);
  const [editing, setEditing] = React.useState<QuestTask | null>(null);
  const tasks = q.tasks;
  const codes = tasks.filter((t) => t.kind === "code").length;
  const move = (i: number, by: -1 | 1) => {
    const ids = tasks.map((t) => t.id);
    const j = i + by;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    order.mutate(ids);
  };
  return (
    <FigurePanel className="overflow-hidden p-0">
      <div className="flex flex-wrap items-start gap-3 px-4 pt-4">
        <div className="min-w-0 flex-1">
          <CardLabel right={tasks.length ? <span className="text-ink-3 font-mono text-[11px]">{plural(tasks.length, "task")}</span> : null}>Tasks</CardLabel>
          <p className="text-ink-3 mt-1 text-[12px] leading-[1.5]">
            What guests do. {q.mode === "points" ? "Each is worth its points." : "Each counts one tick."} Milestones below turn them into rewards.
          </p>
        </div>
        <span className="flex flex-wrap gap-2">
          {codes ? (
            <Button variant="secondary" size="sm" onClick={() => printCodeSheet(eventName, q)}>
              <PrinterIcon /> Print the code sheet
            </Button>
          ) : null}
          {canEdit ? (
            <Button size="sm" onClick={() => setAdding(true)}>
              <PlusIcon /> Add a task
            </Button>
          ) : null}
        </span>
      </div>
      {tasks.length === 0 ? (
        <EmptyState
          size="sm"
          icon={<ListChecksIcon />}
          title="No tasks yet"
          description="Start with what the event has anyway: checked in, met 3 people in Network, visited the sponsor booths, typed the code from the keynote."
          action={
            canEdit ? (
              <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>
                <PlusIcon /> Add the first task
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="mt-2">
          {tasks.map((t, i) => (
            <TaskRow key={t.id} eventId={eventId} q={q} task={t} index={i} templates={templates} canEdit={canEdit} onEdit={() => setEditing(t)} onMove={(by) => move(i, by)} />
          ))}
        </ul>
      )}
      <TaskDialog eventId={eventId} q={q} templates={templates} editing={editing} open={adding || editing !== null} onClose={() => (setAdding(false), setEditing(null))} />
    </FigurePanel>
  );
}
