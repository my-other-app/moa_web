"use client";

import * as React from "react";
import { Loader2Icon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { SectionTitle, formatDate } from "@moa/app-kit";
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Input,
  Label,
  NativeSelect,
  Skeleton,
  StatusBadge,
  Switch,
  TabRail,
  Textarea,
} from "@moa/ui";

import {
  useDeleteHelpAnswer,
  useDeleteLostReason,
  useDeleteSavedReply,
  useDeleteTopic,
  useDeskSettings,
  useEligibleAdmins,
  useHelpAnswers,
  useLostReasons,
  usePublicTopics,
  useSaveDeskSettings,
  useSaveHelpAnswer,
  useSaveLostReason,
  useSaveSavedReply,
  useSaveTopic,
  useSavedReplies,
  useSetTeamMembers,
  useTeamRights,
  useTeams,
  useTopics,
} from "../queries";
import {
  DAY_LABEL,
  DEFAULT_WORKING_HOURS,
  PRIORITIES,
  PRIORITY_LABEL,
  TEAM_KEYS,
  TEAM_LABEL,
  WEEK_DAYS,
  dayNames,
  encodeDays,
  membersOf,
  priorityLabel,
  workingHoursSchema,
  type HelpAnswer,
  type SavedReply,
  type TeamKey,
  type Topic,
} from "../schemas";
import { AwaySwitch } from "./away-switch";

const SECTIONS = [
  { key: "teams", label: "Teams" },
  { key: "topics", label: "Topics and rules" },
  { key: "replies", label: "Saved replies" },
  { key: "answers", label: "Help answers" },
  { key: "lost", label: "Lost reasons" },
  { key: "desk", label: "Desk settings" },
] as const;
type Section = (typeof SECTIONS)[number]["key"];

/** A small edit dialog: its form is mounted only while open, so each opening starts from the row. */
function EditDialog({ open, onOpenChange, title, children }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; children: React.ReactNode }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">{title}</DialogDescription>
        </DialogHeader>
        {open ? children : null}
      </DialogContent>
    </Dialog>
  );
}

function RowActions({ label, onEdit, onDelete, busy }: { label: string; onEdit: () => void; onDelete: () => void; busy?: boolean }) {
  return (
    <div className="flex shrink-0 gap-1">
      <Button size="icon-sm" variant="ghost" onClick={onEdit} aria-label={`Edit ${label}`}>
        <PencilIcon />
      </Button>
      <Button size="icon-sm" variant="ghost" className="text-refuse" disabled={busy} onClick={onDelete} aria-label={`Remove ${label}`}>
        <Trash2Icon />
      </Button>
    </div>
  );
}

// --- teams -----------------------------------------------------------------------------------------

function MembersDialog({ team, open, onOpenChange, current }: { team: TeamKey; open: boolean; onOpenChange: (open: boolean) => void; current: number[] }) {
  return (
    <EditDialog open={open} onOpenChange={onOpenChange} title={`${TEAM_LABEL[team]} team`}>
      <MembersForm team={team} current={current} onDone={() => onOpenChange(false)} />
    </EditDialog>
  );
}

/** The ticks, mounted only while the dialog is open: each opening starts from the team as it is. */
function MembersForm({ team, current, onDone }: { team: TeamKey; current: number[]; onDone: () => void }) {
  const eligible = useEligibleAdmins(true);
  const save = useSetTeamMembers();
  const [picked, setPicked] = React.useState<Set<number>>(() => new Set(current));
  return (
    <>
      <p className="text-ink-3 m-0 text-[12.5px]">Admin accounts in the team. Someone who isn&apos;t an admin yet gets a viewer admin account first; the team adds only its desk rights.</p>
      {eligible.isPending ? <Skeleton className="h-32 w-full" /> : null}
      <ul className="m-0 flex max-h-[50vh] list-none flex-col gap-1 overflow-y-auto p-0">
        {(eligible.data ?? []).map((a) => {
          const cid = `member-${team}-${a.user_id}`;
          return (
            <li key={a.user_id} className="flex items-center gap-2.5 rounded-lg px-1 py-1.5">
              <Checkbox
                id={cid}
                checked={picked.has(a.user_id)}
                onCheckedChange={(on) =>
                  setPicked((s) => {
                    const next = new Set(s);
                    if (on) next.add(a.user_id);
                    else next.delete(a.user_id);
                    return next;
                  })
                }
              />
              <Label htmlFor={cid} className="flex-1">
                {a.name}
                <span className="text-ink-3 ml-2 text-[12px]">
                  {a.email}
                  {a.admin_role ? ` · ${a.admin_role}` : ""}
                </span>
              </Label>
            </li>
          );
        })}
      </ul>
      <DialogFooter>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button disabled={save.isPending || eligible.isPending} onClick={() => save.mutate({ team, userIds: [...picked] }, { onSuccess: onDone })}>
          {save.isPending ? <Loader2Icon className="animate-spin" /> : null}
          Save team
        </Button>
      </DialogFooter>
    </>
  );
}

function TeamsSection({ owner }: { owner: boolean }) {
  const teams = useTeams();
  const [editing, setEditing] = React.useState<TeamKey | null>(null);
  if (teams.isPending) return <Skeleton className="h-48 w-full" />;
  if (teams.isError) return <EmptyState tone="muted" title="The teams could not be read" />;
  return (
    <div className="flex flex-col gap-4">
      <AwaySwitch />
      <div className="grid gap-4 lg:grid-cols-2">
        {TEAM_KEYS.map((key) => {
          const members = membersOf(teams.data, key);
          return (
            <section key={key} className="border-line-soft bg-surface flex flex-col gap-3 rounded-2xl border p-4">
              <SectionTitle
                action={
                  owner ? (
                    <Button size="sm" variant="outline" onClick={() => setEditing(key)}>
                      Edit members
                    </Button>
                  ) : null
                }
              >
                {TEAM_LABEL[key]} · {members.length}
              </SectionTitle>
              {members.length === 0 ? <p className="text-ink-3 m-0 text-sm">Nobody yet.</p> : null}
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                {members.map((m) => (
                  <li key={m.user_id} className="flex items-center gap-2 text-[13px]">
                    <span className="flex-1 truncate">
                      {m.name || m.email}
                      <span className="text-ink-3 ml-2 text-[12px]">{m.email}</span>
                    </span>
                    {m.away ? <StatusBadge tone="warning" label={m.away_until ? `Away until ${formatDate(m.away_until)}` : "Away"} /> : null}
                  </li>
                ))}
              </ul>
              {owner ? <MembersDialog team={key} open={editing === key} onOpenChange={(o) => setEditing(o ? key : null)} current={members.map((m) => m.user_id)} /> : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}

// --- topics ----------------------------------------------------------------------------------------

function TopicForm({ topic, onDone }: { topic: Topic | null; onDone: () => void }) {
  const teams = useTeams();
  const save = useSaveTopic();
  const support = membersOf(teams.data, "support");
  const [key, setKey] = React.useState(topic?.key ?? "");
  const [label, setLabel] = React.useState(topic?.label ?? "");
  const [assign, setAssign] = React.useState<Topic["assign"]>(topic?.assign ?? "round_robin");
  const [assignee, setAssignee] = React.useState(topic?.assignee_id ? String(topic.assignee_id) : "");
  const [priority, setPriority] = React.useState(topic?.default_priority ?? "normal");
  const ready = key.trim() && label.trim() && (assign === "round_robin" || assignee);
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ready) return;
        save.mutate(
          {
            input: { key: key.trim(), label: label.trim(), assign, assignee_id: assign === "person" ? Number(assignee) : null, default_priority: priority },
            ...(topic ? { existingKey: topic.key } : {}),
          },
          { onSuccess: onDone }
        );
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="topic-label">Name</Label>
          <Input id="topic-label" value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="topic-key">Key</Label>
          <Input id="topic-key" value={key} maxLength={40} disabled={Boolean(topic)} onChange={(e) => setKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))} />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="topic-assign">New cases go to</Label>
          <NativeSelect id="topic-assign" value={assign} onChange={(e) => setAssign(e.target.value as Topic["assign"])}>
            <option value="round_robin">The Support team, in turn</option>
            <option value="person">One person</option>
          </NativeSelect>
        </div>
        {assign === "person" ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="topic-assignee">Person</Label>
            <NativeSelect id="topic-assignee" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
              <option value="">Pick someone</option>
              {support.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.name || m.email}
                </option>
              ))}
            </NativeSelect>
          </div>
        ) : null}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="topic-priority">Priority of a new case</Label>
        <NativeSelect id="topic-priority" value={priority} onChange={(e) => setPriority(e.target.value)} className="sm:w-[200px]">
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABEL[p]}
            </option>
          ))}
        </NativeSelect>
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={!ready || save.isPending}>
          Save topic
        </Button>
      </DialogFooter>
    </form>
  );
}

function TopicsSection({ owner }: { owner: boolean }) {
  const topics = useTopics();
  const teams = useTeams();
  const remove = useDeleteTopic();
  const [editing, setEditing] = React.useState<Topic | "new" | null>(null);
  const support = membersOf(teams.data, "support");
  const nameOf = (t: Topic) => t.assignee?.name || support.find((m) => m.user_id === t.assignee_id)?.name || "one person";
  if (topics.isPending) return <Skeleton className="h-48 w-full" />;
  return (
    <div className="flex flex-col gap-3">
      <SectionTitle action={owner ? <Button size="sm" variant="outline" onClick={() => setEditing("new")}><PlusIcon /> Add topic</Button> : null}>
        What people ask about, and who answers
      </SectionTitle>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {(topics.data ?? []).map((t) => (
          <li key={t.key} className="border-line-soft bg-surface flex items-center gap-3 rounded-xl border px-3.5 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="m-0 text-[13.5px] font-medium">{t.label}</p>
              <p className="text-ink-3 m-0 text-[12px]">
                {t.assign === "person" ? `To ${nameOf(t)}` : "Round robin across the Support team"} · {priorityLabel(t.default_priority)} priority
              </p>
            </div>
            {owner ? <RowActions label={t.label} onEdit={() => setEditing(t)} onDelete={() => remove.mutate(t.key)} busy={remove.isPending} /> : null}
          </li>
        ))}
      </ul>
      {owner ? (
        <EditDialog open={editing !== null} onOpenChange={(o) => (o ? null : setEditing(null))} title={editing === "new" ? "New topic" : "Edit topic"}>
          <TopicForm topic={editing === "new" ? null : editing} onDone={() => setEditing(null)} />
        </EditDialog>
      ) : null}
    </div>
  );
}

// --- saved replies ---------------------------------------------------------------------------------

function SavedReplyForm({ reply, onDone }: { reply: SavedReply | null; onDone: () => void }) {
  const topics = usePublicTopics();
  const save = useSaveSavedReply();
  const [title, setTitle] = React.useState(reply?.title ?? "");
  const [body, setBody] = React.useState(reply?.body ?? "");
  const [topic, setTopic] = React.useState(reply?.topic ?? "");
  const ready = title.trim() && body.trim();
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) save.mutate({ input: { title: title.trim(), body: body.trim(), topic: topic || null }, ...(reply ? { id: reply.id } : {}) }, { onSuccess: onDone });
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="reply-title">Title</Label>
        <Input id="reply-title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="reply-topic">Topic (optional)</Label>
        <NativeSelect id="reply-topic" value={topic} onChange={(e) => setTopic(e.target.value)}>
          <option value="">Any topic</option>
          {(topics.data ?? []).map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="reply-body">Reply</Label>
        <Textarea id="reply-body" rows={7} value={body} maxLength={5000} onChange={(e) => setBody(e.target.value)} />
        <p className="text-ink-3 m-0 text-[12px]">**bold**, *italic*, [links](https://…) and lists work, as in a reply.</p>
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={!ready || save.isPending}>
          Save reply
        </Button>
      </DialogFooter>
    </form>
  );
}

function SavedRepliesSection({ owner }: { owner: boolean }) {
  const replies = useSavedReplies();
  const remove = useDeleteSavedReply();
  const [editing, setEditing] = React.useState<SavedReply | "new" | null>(null);
  if (replies.isPending) return <Skeleton className="h-48 w-full" />;
  return (
    <div className="flex flex-col gap-3">
      <SectionTitle action={owner ? <Button size="sm" variant="outline" onClick={() => setEditing("new")}><PlusIcon /> Add saved reply</Button> : null}>Answers the team sends often</SectionTitle>
      {replies.data?.length === 0 ? <p className="text-ink-3 m-0 text-sm">No saved replies yet.</p> : null}
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {(replies.data ?? []).map((r) => (
          <li key={r.id} className="border-line-soft bg-surface flex items-start gap-3 rounded-xl border px-3.5 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="m-0 text-[13.5px] font-medium">{r.title}</p>
              <p className="text-ink-3 m-0 line-clamp-2 text-[12px] whitespace-pre-wrap">{r.body}</p>
            </div>
            {owner ? <RowActions label={r.title} onEdit={() => setEditing(r)} onDelete={() => remove.mutate(r.id)} busy={remove.isPending} /> : null}
          </li>
        ))}
      </ul>
      {owner ? (
        <EditDialog open={editing !== null} onOpenChange={(o) => (o ? null : setEditing(null))} title={editing === "new" ? "New saved reply" : "Edit saved reply"}>
          <SavedReplyForm reply={editing === "new" ? null : editing} onDone={() => setEditing(null)} />
        </EditDialog>
      ) : null}
    </div>
  );
}

// --- help answers ----------------------------------------------------------------------------------

function HelpAnswerForm({ answer, nextOrder, onDone }: { answer: HelpAnswer | null; nextOrder: number; onDone: () => void }) {
  const topics = usePublicTopics();
  const save = useSaveHelpAnswer();
  const [question, setQuestion] = React.useState(answer?.question ?? "");
  const [text, setText] = React.useState(answer?.answer ?? "");
  const [topic, setTopic] = React.useState(answer?.topic ?? "");
  const [published, setPublished] = React.useState(answer?.published ?? true);
  const [order, setOrder] = React.useState(String(answer?.order ?? nextOrder));
  const ready = question.trim() && text.trim();
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) save.mutate({ input: { question: question.trim(), answer: text.trim(), topic: topic || null, published, order: Number(order) || 0 }, ...(answer ? { id: answer.id } : {}) }, { onSuccess: onDone });
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="answer-question">Question</Label>
        <Input id="answer-question" value={question} maxLength={200} onChange={(e) => setQuestion(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="answer-text">Answer</Label>
        <Textarea id="answer-text" rows={6} value={text} maxLength={4000} onChange={(e) => setText(e.target.value)} />
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_110px]">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="answer-topic">Topic</Label>
          <NativeSelect id="answer-topic" value={topic} onChange={(e) => setTopic(e.target.value)}>
            <option value="">General</option>
            {(topics.data ?? []).map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="answer-order">Order</Label>
          <Input id="answer-order" type="number" min={0} value={order} onChange={(e) => setOrder(e.target.value)} />
        </div>
      </div>
      <div className="flex items-center gap-2.5">
        <Switch id="answer-published" checked={published} onCheckedChange={setPublished} />
        <Label htmlFor="answer-published">Published in the app, on the website and in the club dashboard</Label>
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={!ready || save.isPending}>
          Save answer
        </Button>
      </DialogFooter>
    </form>
  );
}

function HelpAnswersSection({ owner }: { owner: boolean }) {
  const answers = useHelpAnswers();
  const remove = useDeleteHelpAnswer();
  const [editing, setEditing] = React.useState<HelpAnswer | "new" | null>(null);
  if (answers.isPending) return <Skeleton className="h-48 w-full" />;
  const list = [...(answers.data ?? [])].sort((a, b) => a.order - b.order);
  return (
    <div className="flex flex-col gap-3">
      <SectionTitle action={owner ? <Button size="sm" variant="outline" onClick={() => setEditing("new")}><PlusIcon /> Add answer</Button> : null}>Short answers people see before they write</SectionTitle>
      {list.length === 0 ? <p className="text-ink-3 m-0 text-sm">No answers yet.</p> : null}
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {list.map((a) => (
          <li key={a.id} className="border-line-soft bg-surface flex items-start gap-3 rounded-xl border px-3.5 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="m-0 text-[13.5px] font-medium">{a.question}</p>
              <p className="text-ink-3 m-0 line-clamp-2 text-[12px]">{a.answer}</p>
            </div>
            {!a.published ? <StatusBadge label="Draft" /> : null}
            {owner ? <RowActions label={a.question} onEdit={() => setEditing(a)} onDelete={() => remove.mutate(a.id)} busy={remove.isPending} /> : null}
          </li>
        ))}
      </ul>
      {owner ? (
        <EditDialog open={editing !== null} onOpenChange={(o) => (o ? null : setEditing(null))} title={editing === "new" ? "New help answer" : "Edit help answer"}>
          <HelpAnswerForm answer={editing === "new" ? null : editing} nextOrder={(list.at(-1)?.order ?? 0) + 1} onDone={() => setEditing(null)} />
        </EditDialog>
      ) : null}
    </div>
  );
}

// --- lost reasons ----------------------------------------------------------------------------------

function LostReasonsSection({ owner }: { owner: boolean }) {
  const reasons = useLostReasons();
  const save = useSaveLostReason();
  const remove = useDeleteLostReason();
  const [label, setLabel] = React.useState("");
  const [editing, setEditing] = React.useState<{ id: number; label: string } | null>(null);
  if (reasons.isPending) return <Skeleton className="h-48 w-full" />;
  return (
    <div className="flex flex-col gap-3">
      <SectionTitle>Why leads are lost</SectionTitle>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {(reasons.data ?? []).map((r) =>
          editing?.id === r.id ? (
            <li key={r.id} className="flex gap-2">
              <Input aria-label="Reason" value={editing.label} maxLength={80} onChange={(e) => setEditing({ id: r.id, label: e.target.value })} />
              <Button size="sm" disabled={!editing.label.trim() || save.isPending} onClick={() => save.mutate({ label: editing.label.trim(), id: r.id }, { onSuccess: () => setEditing(null) })}>
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                Cancel
              </Button>
            </li>
          ) : (
            <li key={r.id} className="border-line-soft bg-surface flex items-center gap-3 rounded-xl border px-3.5 py-2">
              <span className="flex-1 text-[13.5px]">{r.label}</span>
              {owner ? <RowActions label={r.label} onEdit={() => setEditing(r)} onDelete={() => remove.mutate(r.id)} busy={remove.isPending} /> : null}
            </li>
          )
        )}
      </ul>
      {owner ? (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (label.trim()) save.mutate({ label: label.trim() }, { onSuccess: () => setLabel("") });
          }}
        >
          <Input aria-label="New lost reason" placeholder="No budget, timing, chose another…" value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} className="max-w-sm" />
          <Button type="submit" size="sm" variant="outline" disabled={!label.trim() || save.isPending}>
            <PlusIcon /> Add reason
          </Button>
        </form>
      ) : null}
    </div>
  );
}

// --- desk settings ---------------------------------------------------------------------------------

function DeskSection({ owner }: { owner: boolean }) {
  const settings = useDeskSettings();
  const save = useSaveDeskSettings();
  const data = settings.data;
  const parsed = workingHoursSchema.safeParse(data?.working_hours);
  // Hours the server sends in another shape are kept as they are: this edits only days, start and end.
  const hours = parsed.success && parsed.data.start ? parsed.data : DEFAULT_WORKING_HOURS;
  const [days, setDays] = React.useState<string[] | null>(null);
  const [start, setStart] = React.useState<string | null>(null);
  const [end, setEnd] = React.useState<string | null>(null);
  const [retention, setRetention] = React.useState<string | null>(null);
  const [firstReply, setFirstReply] = React.useState<string | null>(null);
  const [resolution, setResolution] = React.useState<string | null>(null);
  if (settings.isPending) return <Skeleton className="h-48 w-full" />;
  if (!data) return <EmptyState tone="muted" title="The desk settings could not be read" />;
  const shownDays = days ?? dayNames(hours);
  const value = {
    start: start ?? hours.start ?? "09:30",
    end: end ?? hours.end ?? "18:30",
    retention: retention ?? String(data.retention_days),
    firstReply: firstReply ?? String(data.first_reply_target_hours),
    resolution: resolution ?? String(data.resolution_target_hours),
  };
  return (
    <form
      className="flex max-w-2xl flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate({
          working_hours: { ...hours, days: encodeDays(shownDays, hours.days), start: value.start, end: value.end },
          retention_days: Number(value.retention) || data.retention_days,
          first_reply_target_hours: Number(value.firstReply) || data.first_reply_target_hours,
          resolution_target_hours: Number(value.resolution) || data.resolution_target_hours,
        });
      }}
    >
      <fieldset className="flex flex-col gap-2" disabled={!owner}>
        <legend className="mb-2 text-[13.5px] font-medium">Working hours ({hours.timezone ?? "Asia/Kolkata"})</legend>
        <p className="text-ink-3 m-0 text-[12px]">The reply and resolution timers count only these hours.</p>
        <div className="flex flex-wrap gap-3">
          {WEEK_DAYS.map((d) => (
            <label key={d} className="flex items-center gap-1.5 text-[13px]">
              <Checkbox checked={shownDays.includes(d)} onCheckedChange={(on) => setDays(on ? [...shownDays, d] : shownDays.filter((x) => x !== d))} aria-label={DAY_LABEL[d]} />
              {DAY_LABEL[d]}
            </label>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="desk-start">From</Label>
            <Input id="desk-start" type="time" value={value.start} onChange={(e) => setStart(e.target.value)} className="w-[130px]" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="desk-end">To</Label>
            <Input id="desk-end" type="time" value={value.end} onChange={(e) => setEnd(e.target.value)} className="w-[130px]" />
          </div>
        </div>
      </fieldset>
      <fieldset className="grid gap-3 sm:grid-cols-3" disabled={!owner}>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="desk-first">First reply within (working hours)</Label>
          <Input id="desk-first" type="number" min={1} value={value.firstReply} onChange={(e) => setFirstReply(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="desk-resolution">Resolved within (working hours)</Label>
          <Input id="desk-resolution" type="number" min={1} value={value.resolution} onChange={(e) => setResolution(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="desk-retention">Keep closed cases (days)</Label>
          <Input id="desk-retention" type="number" min={30} value={value.retention} onChange={(e) => setRetention(e.target.value)} />
        </div>
      </fieldset>
      <p className="text-ink-3 m-0 text-[12px]">After the retention period a closed case&apos;s messages are deleted; its counts stay for the reports.</p>
      {owner ? (
        <Button type="submit" className="self-start" disabled={save.isPending}>
          {save.isPending ? <Loader2Icon className="animate-spin" /> : null}
          Save desk settings
        </Button>
      ) : null}
    </form>
  );
}

/**
 * Settings → Teams: who is in Support and Sales (and away), the topics and
 * their rules, saved replies, help answers, lost reasons and the desk's
 * hours. Everyone reads; only an admin owner changes (the server says the
 * same), so the owner's controls are not offered to anyone else.
 */
export function TeamworkSettingsPage() {
  const rights = useTeamRights();
  const [section, setSection] = React.useState<Section>("teams");
  const owner = rights.owner;
  return (
    <div className="flex flex-col gap-5">
      <TabRail label="Team settings" items={SECTIONS.map((s) => ({ key: s.key, label: s.label }))} value={section} onChange={(k) => setSection(k as Section)} />
      {!owner ? <p className="text-ink-3 m-0 text-[12.5px]">Only an admin owner changes these. You can mark yourself away.</p> : null}
      {section === "teams" ? <TeamsSection owner={owner} /> : null}
      {section === "topics" ? <TopicsSection owner={owner} /> : null}
      {section === "replies" ? <SavedRepliesSection owner={owner} /> : null}
      {section === "answers" ? <HelpAnswersSection owner={owner} /> : null}
      {section === "lost" ? <LostReasonsSection owner={owner} /> : null}
      {section === "desk" ? <DeskSection owner={owner} /> : null}
    </div>
  );
}
