"use client";

import * as React from "react";
import { CheckIcon, CircleIcon, HistoryIcon, UndoIcon, UsersIcon } from "lucide-react";
import { ExportMenu, formatDateTime, formatNumber, plural } from "@moa/app-kit";
import {
  Button,
  CardLabel,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  FigurePanel,
  NativeSelect,
  Pager,
  SearchField,
  Skeleton,
  Textarea,
  Toolbar,
  ToolbarEnd,
  cn,
  toast,
} from "@moa/ui";
import { useDebouncedValue } from "@moa/ui/hooks";

import { questExportUrl } from "../api";
import { errorText } from "../lib/time";
import { useGrantRevoke, useQuestAudit, useQuestGuest, useQuestGuests } from "../queries";
import { AUDIT_LABEL, CLAIM_STATUS_LABEL, type AuditRow, type GuestSort, type GuestTask, type QuestAdmin } from "../schemas";

const PAGE_SIZE = 25;
const NOTE_MAX = 300;

const SORTS: { value: GuestSort; label: string }[] = [
  { value: "points", label: "Most done first" },
  { value: "recent", label: "Latest first" },
  { value: "name", label: "By name" },
];

/** One task for one guest: done or not, how far, and the grant or revoke that changes it. */
function TaskLine({ t, mode, canEdit, onAct }: { t: GuestTask; mode: QuestAdmin["mode"]; canEdit: boolean; onAct: (t: GuestTask, grant: boolean) => void }) {
  const me = t.me;
  const done = !!me?.done;
  const revoked = !!me?.revoked && !done;
  return (
    <li className="border-line-soft flex items-center gap-3 border-t py-2.5 first:border-t-0">
      <span aria-hidden="true" className={cn("grid size-6 shrink-0 place-items-center rounded-full", done ? "bg-admit-soft text-admit" : "bg-sunken text-ink-3")}>
        {done ? <CheckIcon className="size-3.5" /> : <CircleIcon className="size-3" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-ink block text-[13px] font-medium">
          {t.title}
          {t.required ? <span className="text-ink-3 font-normal"> · required</span> : null}
        </span>
        <span className="text-ink-3 block text-[11.5px]">
          {done
            ? [me?.done_at ? `Done ${formatDateTime(me.done_at)}` : "Done", me?.source === "grant" ? "granted by hand" : null, mode === "points" && t.points ? `${t.points} pts` : null].filter(Boolean).join(" · ")
            : revoked
              ? "Revoked: it stays off until granted again"
              : t.target > 1
                ? `${formatNumber(me?.count ?? 0)} / ${formatNumber(t.target)}`
                : "Not yet"}
        </span>
      </span>
      {canEdit ? (
        done ? (
          <Button size="xs" variant="ghost" danger onClick={() => onAct(t, false)} aria-label={`Revoke ${t.title}`}>
            <UndoIcon /> Revoke
          </Button>
        ) : (
          <Button size="xs" variant="secondary" onClick={() => onAct(t, true)} aria-label={`Grant ${t.title}`}>
            <CheckIcon /> Grant
          </Button>
        )
      ) : null}
    </li>
  );
}

function AuditLine({ a }: { a: AuditRow }) {
  return (
    <li className="border-line-soft border-t py-2 text-[12px] first:border-t-0">
      <span className="text-ink font-medium">{AUDIT_LABEL[a.action] ?? a.action}</span>
      <span className="text-ink-2">
        {a.task ? ` “${a.task.title}”` : a.reward ? ` ${a.reward.name}` : ""}
        {a.name ? ` · ${a.name}` : ""}
      </span>
      <span className="text-ink-3 block">
        {[a.at ? formatDateTime(a.at) : null, a.by?.name ? `by ${a.by.name}` : null].filter(Boolean).join(" · ")}
        {a.note ? ` — “${a.note}”` : ""}
      </span>
    </li>
  );
}

/** One guest: every task with theirs, the milestones they reached and what they collected; grant or revoke with a reason. */
function GuestDialog({ eventId, q, registrationId, name, canEdit, onClose }: { eventId: number; q: QuestAdmin; registrationId: string; name: string; canEdit: boolean; onClose: () => void }) {
  const view = useQuestGuest(eventId, registrationId);
  const act = useGrantRevoke(eventId, registrationId);
  const [acting, setActing] = React.useState<{ t: GuestTask; grant: boolean } | null>(null);
  const [note, setNote] = React.useState("");
  const v = view.data;
  const submit = async () => {
    if (!acting) return;
    try {
      await act.mutateAsync({ taskId: acting.t.id, grant: acting.grant, note: note.trim() || null });
      toast.success(acting.grant ? `“${acting.t.title}” granted to ${name}` : `“${acting.t.title}” revoked for ${name}`, {
        description: acting.grant ? "Milestones they now reach unlock, and their rewards are held." : "A milestone they no longer reach is withdrawn; a reward not yet collected goes back to stock.",
      });
      setActing(null);
      setNote("");
    } catch (err) {
      toast.error(errorText(err));
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{name}</DialogTitle>
          <DialogDescription>
            {v?.me
              ? `${plural(v.me.tasks_done, "task")} done${q.mode === "points" ? ` · ${formatNumber(v.me.points)} points` : ""}${v.me.required_left ? ` · ${plural(v.me.required_left, "required task")} left` : ""}`
              : "Their quest so far."}
          </DialogDescription>
        </DialogHeader>
        {acting ? (
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <p className="text-ink text-[13px]">
              {acting.grant ? "Grant" : "Revoke"} <span className="font-medium">“{acting.t.title}”</span> for {name}?{" "}
              {acting.grant
                ? "It counts as done, logged as granted by you."
                : "It stops counting, and automatic checks won't tick it again until it is granted. A milestone they no longer reach is withdrawn."}
            </p>
            <div>
              <label htmlFor="quest-note" className="eyebrow mb-1.5 block">
                Why (kept in the log)
              </label>
              <Textarea id="quest-note" rows={2} maxLength={NOTE_MAX} value={note} placeholder={acting.grant ? "Submitted the hackathon project at the desk" : "Scanned a friend's ticket"} onChange={(e) => setNote(e.target.value)} />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setActing(null)}>
                Back
              </Button>
              <Button type="submit" variant={acting.grant ? "primary" : "destructive"} disabled={act.isPending || !note.trim()}>
                {act.isPending ? "Saving…" : acting.grant ? "Grant" : "Revoke"}
              </Button>
            </DialogFooter>
          </form>
        ) : v ? (
          <div className="grid gap-4">
            <section aria-label="Tasks">
              <p className="eyebrow">Tasks</p>
              <ul className="mt-1">
                {v.tasks.map((t) => (
                  <TaskLine key={t.id} t={t} mode={q.mode} canEdit={canEdit} onAct={(task, grant) => setActing({ t: task, grant })} />
                ))}
              </ul>
            </section>
            {v.milestones.length ? (
              <section aria-label="Milestones">
                <p className="eyebrow">Milestones</p>
                <ul className="mt-1 grid gap-1.5">
                  {v.milestones.map((m) => (
                    <li key={m.id} className="text-[12.5px]">
                      <span className={cn("font-medium", m.unlocked ? "text-ink" : "text-ink-3")}>
                        {m.unlocked ? "✓ " : ""}
                        {m.title}
                      </span>
                      {m.rewards.length ? (
                        <span className="text-ink-3">
                          {" · "}
                          {m.rewards
                            .map((r) => `${r.name}${r.claim ? `: ${CLAIM_STATUS_LABEL[r.claim.status] ?? r.claim.status}${r.claim.variant_label ? ` (${r.claim.variant_label})` : ""}` : ""}`)
                            .join(", ")}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            {v.audit.length ? (
              <section aria-label="Changes by hand">
                <p className="eyebrow">Changes by hand</p>
                <ul className="mt-1">
                  {v.audit.map((a, i) => (
                    <AuditLine key={`${a.at}-${i}`} a={a} />
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        ) : view.isError ? (
          <p role="alert" className="text-refuse text-[13px]">
            {errorText(view.error)}
          </p>
        ) : (
          <Skeleton className="h-48" />
        )}
      </DialogContent>
    </Dialog>
  );
}

function AuditPanel({ eventId }: { eventId: number }) {
  const [page, setPage] = React.useState(1);
  const audit = useQuestAudit(eventId, page);
  const a = audit.data;
  if (!a || a.total === 0) return null;
  return (
    <FigurePanel className="p-4">
      <CardLabel right={<span className="text-ink-3 font-mono text-[11px]">{plural(a.total, "change")}</span>}>
        <span className="inline-flex items-center gap-1.5">
          <HistoryIcon aria-hidden="true" className="size-3.5" /> Changes by hand
        </span>
      </CardLabel>
      <p className="text-ink-3 mt-1 text-[12px]">Every grant and revoke, rewards released or offered again, and who did it.</p>
      <ul className="mt-2">
        {a.items.map((row, i) => (
          <AuditLine key={`${row.at}-${i}`} a={row} />
        ))}
      </ul>
      {a.total > a.items.length ? <Pager page={page} pageCount={Math.max(1, Math.ceil(a.total / Math.max(a.items.length, 1)))} total={a.total} pageSize={Math.max(a.items.length, 1)} onPage={setPage} busy={audit.isFetching} className="mt-2" /> : null}
    </FigurePanel>
  );
}

/** Who is playing: points, tasks, milestones and rewards per guest, with search and filters; open one to grant or revoke. */
export function GuestsPanel({ eventId, q, canEdit, canExport }: { eventId: number; q: QuestAdmin; canEdit: boolean; canExport: boolean }) {
  const [search, setSearch] = React.useState("");
  const settled = useDebouncedValue(search.trim(), 300);
  const [milestoneId, setMilestoneId] = React.useState("");
  const [taskId, setTaskId] = React.useState("");
  const [claimStatus, setClaimStatus] = React.useState("");
  const [sort, setSort] = React.useState<GuestSort>("points");
  const [page, setPage] = React.useState(1);
  const [open, setOpen] = React.useState<{ id: string; name: string } | null>(null);
  const list = useQuestGuests(eventId, { q: settled || undefined, milestoneId: milestoneId || undefined, taskId: taskId || undefined, claimStatus: claimStatus || undefined, sort, page, pageSize: PAGE_SIZE });
  const l = list.data;
  const milestoneTitle = (id: string) => q.milestones.find((m) => m.id === id)?.title ?? "";
  const filtered = Boolean(settled || milestoneId || taskId || claimStatus);
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };
  return (
    <>
      <FigurePanel className="overflow-hidden p-0">
        <div className="flex flex-wrap items-start gap-3 px-4 pt-4">
          <div className="min-w-0 flex-1">
            <CardLabel right={l ? <span className="text-ink-3 font-mono text-[11px]">{plural(l.total, "guest")}</span> : null}>Guests</CardLabel>
            <p className="text-ink-3 mt-1 text-[12px] leading-[1.5]">Everyone with something done. Open a guest to grant a task the platform can&apos;t see, or take one back; both are logged with your reason.</p>
          </div>
          {canExport ? <ExportMenu size="sm" href={questExportUrl(eventId)} label="Export who earned what" title="One row per guest: points, every task, milestones reached, every reward with its size and when it was collected." /> : null}
        </div>
        <Toolbar className="px-4 pt-3">
          <SearchField label="Search guests" value={search} onChange={reset(setSearch)} placeholder="Name, email or ticket" size="sm" />
          <NativeSelect aria-label="Milestone" value={milestoneId} onChange={(e) => reset(setMilestoneId)(e.target.value)} className="w-auto">
            <option value="">Any milestone</option>
            {q.milestones.map((m) => (
              <option key={m.id} value={m.id}>
                Reached {m.title}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect aria-label="Task" value={taskId} onChange={(e) => reset(setTaskId)(e.target.value)} className="w-auto">
            <option value="">Any task</option>
            {q.tasks.map((t) => (
              <option key={t.id} value={t.id}>
                Did {t.title}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect aria-label="Reward" value={claimStatus} onChange={(e) => reset(setClaimStatus)(e.target.value)} className="w-auto">
            <option value="">Any reward</option>
            <option value="reserved">Held, to collect</option>
            <option value="collected">Collected</option>
            <option value="waitlisted">On the waiting list</option>
            <option value="sold_out">Sold out</option>
          </NativeSelect>
          <ToolbarEnd>
            <NativeSelect aria-label="Order" value={sort} onChange={(e) => reset(setSort)(e.target.value as GuestSort)} className="w-auto">
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </NativeSelect>
          </ToolbarEnd>
        </Toolbar>
        {!l ? (
          <div className="p-4">
            <Skeleton className="h-40" />
          </div>
        ) : l.items.length === 0 ? (
          <EmptyState size="sm" icon={<UsersIcon />} title={filtered ? "Nobody matches" : "Nobody has done anything yet"} description={filtered ? "Try fewer filters." : "Guests show here from their first task done."} />
        ) : (
          <table className="mt-2 w-full text-[12.5px]">
            <thead>
              <tr className="text-ink-3 font-mono text-[10px] tracking-[0.06em] uppercase">
                <th className="px-4 py-1.5 text-left font-normal">Guest</th>
                <th className="px-2 py-1.5 text-right font-normal">{q.mode === "points" ? "Points" : "Tasks"}</th>
                <th className="hidden px-2 py-1.5 text-left font-normal md:table-cell">Milestones</th>
                <th className="px-4 py-1.5 text-left font-normal">Rewards</th>
              </tr>
            </thead>
            <tbody>
              {l.items.map((g) => (
                <tr key={g.registration_id} className="border-line-soft hover:bg-sunken/50 border-t align-top">
                  <td className="px-4 py-2">
                    <button type="button" className="text-ink text-left font-medium hover:underline" onClick={() => setOpen({ id: g.registration_id, name: g.name })}>
                      {g.name}
                    </button>
                    <span className="text-ink-3 block truncate font-mono text-[11px]">
                      {[g.ticket_id, g.email, g.checked_in ? "checked in" : "not checked in"].filter(Boolean).join(" · ")}
                    </span>
                  </td>
                  <td className="text-ink px-2 py-2 text-right font-mono tabular-nums">
                    {formatNumber(q.mode === "points" ? g.points : g.tasks_done)}
                    {q.mode === "points" ? <span className="text-ink-3 block text-[11px]">{plural(g.tasks_done, "task")}</span> : null}
                  </td>
                  <td className="text-ink-2 hidden px-2 py-2 md:table-cell">{g.milestones.map(milestoneTitle).filter(Boolean).join(", ") || "—"}</td>
                  <td className="px-4 py-2">
                    {g.claims.length ? (
                      <ul className="grid gap-0.5">
                        {g.claims.map((c) => (
                          <li key={c.reward_id || c.name} className="text-ink-2">
                            {c.name}
                            <span className={cn("ml-1 text-[11px]", c.status === "collected" ? "text-admit" : c.status === "reserved" ? "text-ink-3" : "text-caution")}>
                              {CLAIM_STATUS_LABEL[c.status] ?? c.status}
                              {c.variant_label ? ` · ${c.variant_label}` : ""}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-ink-3">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {l && l.total > PAGE_SIZE ? (
          <div className="border-line-soft border-t px-4 py-2.5">
            <Pager page={page} pageCount={Math.max(1, Math.ceil(l.total / PAGE_SIZE))} total={l.total} pageSize={PAGE_SIZE} noun={["guest", "guests"]} busy={list.isFetching} onPage={setPage} />
          </div>
        ) : null}
      </FigurePanel>
      <AuditPanel eventId={eventId} />
      {open ? <GuestDialog eventId={eventId} q={q} registrationId={open.id} name={open.name} canEdit={canEdit} onClose={() => setOpen(null)} /> : null}
    </>
  );
}
