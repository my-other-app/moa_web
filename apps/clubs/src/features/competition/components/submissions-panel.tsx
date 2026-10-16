"use client";

import * as React from "react";
import { CheckCircle2Icon, CircleDashedIcon, LockIcon, LockOpenIcon, MinusIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { formatDateTime } from "@moa/app-kit";
import { FigurePanel, IconButton, StatusBadge, Switch, cn } from "@moa/ui";

import { usePatchSettings, useSubmissionsAction } from "../queries";
import type { Competition, Requirement } from "../schemas";

/**
 * Submissions: the clock, how many teams have everything in, the switch
 * that closes it now; what teams must hand in, each requirement on or
 * off; and every team's row — what is in, what is missing, where it
 * stands.
 */
function Countdown({ at }: { at: string | null }) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!at) return <p className="text-ink font-mono text-[40px] leading-none tracking-[-0.03em]">—</p>;
  const left = Math.max(0, Math.floor((new Date(at).getTime() - now) / 1000));
  const h = Math.floor(left / 3600);
  const m = Math.floor((left % 3600) / 60);
  const s = left % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return <p className={cn("font-mono text-[40px] leading-none tracking-[-0.03em] tabular-nums", left === 0 ? "text-ink-3" : "text-ink")}>{`${pad(h)}:${pad(m)}:${pad(s)}`}</p>;
}

/** A datetime-local value in the browser's zone for an ISO instant, and back. */
const toLocal = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 16);
};
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : null);

const STATUS = {
  complete: { label: "Complete", tone: "success" },
  in_progress: { label: "In progress", tone: "warning" },
  nothing: { label: "Nothing yet", tone: "default" },
} as const;

export function SubmissionsPanel({ eventId, c }: { eventId: number; c: Competition }) {
  const settings = usePatchSettings(eventId);
  const act = useSubmissionsAction(eventId);
  const s = c.settings;
  const [adding, setAdding] = React.useState("");
  const setReqs = (next: Requirement[]) => settings.mutate({ requirements: next });
  const toggle = (key: string, required: boolean) => setReqs(s.requirements.map((r) => (r.key === key ? { ...r, required } : r)));
  const removeReq = (key: string) => setReqs(s.requirements.filter((r) => r.key !== key));
  const addReq = () => {
    const label = adding.trim();
    if (!label) return;
    const key = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 30) || `item_${s.requirements.length + 1}`;
    if (s.requirements.some((r) => r.key === key)) return;
    setReqs([...s.requirements, { key, label, required: true }]);
    setAdding("");
  };
  const open = s.submissions_open;
  const complete = c.teams.filter((t) => t.submission.status === "complete").length;

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 lg:grid-cols-2">
        <FigurePanel className="p-4">
          <p className="text-ink-3 text-[12.5px]">{s.submissions_closed_at ? `Closed by hand ${formatDateTime(s.submissions_closed_at)}` : s.submissions_close_at ? `Submissions close ${formatDateTime(s.submissions_close_at)}` : "No close set — submissions stay open until you close them."}</p>
          <div className="mt-2">{s.submissions_closed_at ? <p className="text-ink-3 font-mono text-[40px] leading-none tracking-[-0.03em]">closed</p> : <Countdown at={s.submissions_close_at} />}</div>
          <p className="text-ink-2 mt-2 text-[13px]">
            {complete} of {c.teams.length} {c.teams.length === 1 ? "team has" : "teams have"} everything in
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {open ? (
              <button type="button" className="btn btn-secondary" onClick={() => act.mutate("close")} disabled={act.isPending}>
                <LockIcon /> Close submissions now
              </button>
            ) : (
              <button type="button" className="btn btn-secondary" onClick={() => act.mutate("reopen")} disabled={act.isPending}>
                <LockOpenIcon /> Reopen submissions
              </button>
            )}
            <label className="flex items-center gap-2 text-[12.5px]">
              <span className="text-ink-3">Close at</span>
              <input type="datetime-local" aria-label="Submissions close at" className="input input-sm w-auto" value={toLocal(s.submissions_close_at)} onChange={(e) => settings.mutate({ submissions_close_at: fromLocal(e.target.value) })} />
            </label>
          </div>
        </FigurePanel>
        <FigurePanel className="p-4">
          <h3 className="text-ink text-[15px] font-semibold">What teams must submit</h3>
          <ul className="mt-3 grid gap-2">
            {s.requirements.map((r) => (
              <li key={r.key} className="flex items-center gap-2 text-[13px]">
                <span className={cn("min-w-0 flex-1 truncate", r.required ? "text-ink" : "text-ink-3")}>{r.label}</span>
                <span className="text-ink-3 text-[11px]">{r.required ? "required" : "optional"}</span>
                <Switch checked={r.required} onCheckedChange={(on) => toggle(r.key, on)} aria-label={`${r.label} required`} />
                <IconButton label={`Remove ${r.label}`} variant="quiet" size="xs" danger onClick={() => removeReq(r.key)}>
                  <Trash2Icon />
                </IconButton>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex gap-2">
            <input className="input input-sm" placeholder="Something else to hand in" aria-label="New requirement" value={adding} onChange={(e) => setAdding(e.target.value)} onKeyDown={(e) => (e.key === "Enter" ? (e.preventDefault(), addReq()) : null)} maxLength={80} />
            <button type="button" className="btn btn-secondary btn-sm" onClick={addReq} disabled={!adding.trim()}>
              <PlusIcon /> Add
            </button>
          </div>
          <p className="text-ink-3 mt-2 text-[11.5px]">Each is a link the team pastes from their ticket. A team is complete once every required one is in.</p>
        </FigurePanel>
      </div>

      <FigurePanel className="p-0">
        <div className={cn("text-ink-3 hidden gap-3 px-4 py-2 font-mono text-[10px] tracking-[0.06em] uppercase sm:grid", "sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_repeat(var(--n),100px)_120px]")} style={{ "--n": s.requirements.length } as React.CSSProperties}>
          <span>Team</span>
          <span>Track</span>
          {s.requirements.map((r) => (
            <span key={r.key} className="truncate">
              {r.label.split(" ")[0]}
            </span>
          ))}
          <span className="text-right">Status</span>
        </div>
        {c.teams.length === 0 ? (
          <p className="text-ink-3 px-4 py-6 text-center text-[12.5px]">No teams yet, so nothing to hand in.</p>
        ) : (
          <ul>
            {c.teams.map((t) => {
              const st = STATUS[t.submission.status];
              return (
                <li key={t.id} className="border-line-soft grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t px-4 py-2.5 text-[12.5px] sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_repeat(var(--n),100px)_120px]" style={{ "--n": s.requirements.length } as React.CSSProperties}>
                  <span className="text-ink truncate font-medium">{t.name}</span>
                  <span className="text-ink-2 hidden truncate sm:block">{t.track ?? "—"}</span>
                  {s.requirements.map((r) => {
                    const v = t.submission.fields[r.key];
                    return (
                      <span key={r.key} className="hidden items-center gap-1 sm:flex">
                        {v ? (
                          <a href={v} target="_blank" rel="noreferrer" className="text-admit flex items-center gap-1 hover:underline">
                            <CheckCircle2Icon className="size-3.5" /> Added
                          </a>
                        ) : r.required ? (
                          <span className="text-caution flex items-center gap-1">
                            <CircleDashedIcon className="size-3.5" /> Missing
                          </span>
                        ) : (
                          <span className="text-ink-3 flex items-center gap-1">
                            <MinusIcon className="size-3.5" /> Optional
                          </span>
                        )}
                      </span>
                    );
                  })}
                  <span className="text-right">
                    <StatusBadge tone={st.tone} label={st.label} />
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </FigurePanel>
    </div>
  );
}
