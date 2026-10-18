"use client";

import * as React from "react";
import { ArrowRightIcon, EyeIcon, EyeOffIcon, XIcon } from "lucide-react";
import { FigurePanel, IconButton, NativeSelect, Notice, ProgressBar, Segmented, cn } from "@moa/ui";

import { namesOf, tieAtCut, type TieAtCut } from "../errors";
import { useAdvance, usePatchSettings, usePatchTeam } from "../queries";
import { STAGE_LABEL, type BoardRow, type Competition, type Stage } from "../schemas";

type Round = "shortlisted" | "finalist";
const ROUND_WORD: Record<Round, string> = { shortlisted: "the shortlist", finalist: "the final" };

/**
 * A tie at the cut: the teams level on the score for the last place, and
 * nothing moved. The organiser picks who goes through -- a button per team
 * moves it by hand -- then advances again to fill what is left.
 */
function TieNotice({ tie, to, onMove, onClose }: { tie: TieAtCut; to: Round; onMove: (teamId: number) => void; onClose: () => void }) {
  const places = tie.places_left === 1 ? "the last place" : `the last ${tie.places_left} places`;
  const score = tie.score ?? tie.tied[0]?.score;
  return (
    <Notice tone="caution" tag="Tie at the cut">
      <div className="grid gap-2">
        <div className="flex items-start gap-2">
          <p className="min-w-0 flex-1">
            {namesOf(tie.tied.map((t) => t.name))} are level{score != null ? ` on ${score.toFixed(1)}` : ""} for {places} in {ROUND_WORD[to]}, so nobody was moved. Break the tie: move {tie.places_left === 1 ? "one" : tie.places_left} of them by hand, then advance again.
          </p>
          <IconButton label="Dismiss" variant="quiet" size="xs" onClick={onClose}>
            <XIcon />
          </IconButton>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {tie.tied.map((t) => (
            <button key={t.team_id} type="button" className="btn btn-secondary btn-xs" onClick={() => onMove(t.team_id)}>
              <ArrowRightIcon /> Move {t.name} to {ROUND_WORD[to]}
            </button>
          ))}
        </div>
      </div>
    </Notice>
  );
}

/**
 * Rounds: three columns — the entered, the shortlist, the final — and
 * two buttons that move the top of one into the next by score. Any team
 * can be moved by hand. The leaderboard is the same ranking, private to
 * the committee and judges until the organiser makes it public, when a
 * guest sees it on their ticket.
 */
function Column({ title, rows, count, size, children }: { title: string; rows: BoardRow[]; count: number; size?: number; children: (r: BoardRow) => React.ReactNode }) {
  return (
    <FigurePanel className="p-3">
      <div className="flex items-center justify-between px-1">
        <span className="eyebrow">
          {title}
          {size ? ` · top ${size}` : ""}
        </span>
        <span className="bg-sunken text-ink-2 rounded-full px-2 font-mono text-[11px]">{count}</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-ink-3 px-1 py-6 text-[12.5px]">Not decided yet</p>
      ) : (
        <ul className="mt-2 grid gap-1.5">
          {rows.map((r) => (
            <li key={r.team_id} className="border-line-soft bg-surface flex items-center gap-2 rounded-xl border px-3 py-2 text-[13px]">
              <span className="text-ink-3 w-5 font-mono text-[11px]">{r.rank ?? "–"}</span>
              <span className="text-ink min-w-0 flex-1 truncate font-medium">{r.name}</span>
              <span className="text-ink-2 font-mono text-[12px] tabular-nums">{r.score === null ? "—" : r.score.toFixed(1)}</span>
              {children(r)}
            </li>
          ))}
        </ul>
      )}
    </FigurePanel>
  );
}

export function RoundsPanel({ eventId, c }: { eventId: number; c: Competition }) {
  const advance = useAdvance(eventId);
  const settings = usePatchSettings(eventId);
  const patch = usePatchTeam(eventId);
  const move = (id: number, stage: Stage) => patch.mutate({ id, body: { stage } });
  const [tie, setTie] = React.useState<{ tie: TieAtCut; to: Round } | null>(null);
  const advanceTo = (to: Round) =>
    advance.mutate(
      { to },
      {
        onSuccess: () => setTie(null),
        onError: (error) => {
          const t = tieAtCut(error);
          setTie(t ? { tie: t, to } : null);
        },
      }
    );
  const Move = ({ r, to, label }: { r: BoardRow; to: Stage; label: string }) => (
    <button type="button" className="btn btn-quiet btn-xs" aria-label={`${label} ${r.name}`} title={label} onClick={() => move(r.team_id, to)}>
      {to === "entered" ? "↩" : <ArrowRightIcon />}
    </button>
  );
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-ink text-[17px] font-semibold tracking-[-0.01em]">Rounds</h2>
          <p className="text-ink-3 text-[12.5px]">Advance uses the judging scores; unscored teams stay put. Move any team by hand with the arrows.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-[12.5px]">
            <span className="text-ink-3">Shortlist</span>
            <NativeSelect aria-label="Shortlist size" size="sm" className="w-16" value={c.settings.shortlist_size} onChange={(e) => settings.mutate({ shortlist_size: Number(e.target.value) })}>
              {[2, 3, 4, 5, 6, 8, 10, 12, 16].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </NativeSelect>
          </label>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => advanceTo("shortlisted")} disabled={advance.isPending || c.rounds.entered.every((r) => r.score === null)}>
            <ArrowRightIcon /> Advance to shortlist
          </button>
          <label className="flex items-center gap-1.5 text-[12.5px]">
            <span className="text-ink-3">Final</span>
            <NativeSelect aria-label="Final size" size="sm" className="w-16" value={c.settings.final_size} onChange={(e) => settings.mutate({ final_size: Number(e.target.value) })}>
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </NativeSelect>
          </label>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => advanceTo("finalist")} disabled={advance.isPending || c.rounds.shortlisted.every((r) => r.score === null)}>
            <ArrowRightIcon /> Advance to final
          </button>
        </div>
      </div>
      {tie ? (
        <TieNotice
          tie={tie.tie}
          to={tie.to}
          onClose={() => setTie(null)}
          onMove={(teamId) => {
            move(teamId, tie.to);
            setTie(null);
          }}
        />
      ) : null}
      <div className="grid gap-3 lg:grid-cols-3">
        <Column title="Round 1 · entered" rows={c.rounds.entered} count={c.rounds.entered.length}>
          {(r) => <Move r={r} to="shortlisted" label="Shortlist" />}
        </Column>
        <Column title="Shortlist" rows={c.rounds.shortlisted} count={c.rounds.shortlisted.length} size={c.settings.shortlist_size}>
          {(r) => (
            <>
              <Move r={r} to="entered" label="Send back" />
              <Move r={r} to="finalist" label="Make a finalist" />
            </>
          )}
        </Column>
        <Column title="Final" rows={c.rounds.finalists} count={c.rounds.finalists.length} size={c.settings.final_size}>
          {(r) => <Move r={r} to="shortlisted" label="Send back to the shortlist" />}
        </Column>
      </div>
    </div>
  );
}

export function LeaderboardPanel({ eventId, c }: { eventId: number; c: Competition }) {
  const settings = usePatchSettings(eventId);
  const pub = c.settings.leaderboard_public;
  const max = Math.max(1, ...c.board.map((r) => r.score ?? 0));
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-ink text-[17px] font-semibold tracking-[-0.01em]">Leaderboard</h2>
          <p className="text-ink-3 text-[12.5px]">{pub ? "Public — every registered guest sees it on their ticket." : "Private — only your committee and judges can see scores."}</p>
        </div>
        <Segmented label="Who sees the board" value={pub ? "public" : "private"} options={[{ value: "private", label: "Private" }, { value: "public", label: "Public" }]} onChange={(v) => settings.mutate({ leaderboard_public: v === "public" })} />
      </div>
      {pub ? (
        <Notice tone="admit" tag="Public">
          <span className="flex items-center gap-2">
            <EyeIcon className="size-4" /> Teams can see where they stand; scores update as judges score.
          </span>
        </Notice>
      ) : (
        <Notice tone="neutral" tag="Private">
          <span className="flex items-center gap-2">
            <EyeOffIcon className="size-4" /> Make it public when the scores are settled, or keep the reveal for the stage.
          </span>
        </Notice>
      )}
      <FigurePanel className="p-0">
        {c.board.length === 0 ? (
          <p className="text-ink-3 px-4 py-8 text-center text-[12.5px]">No teams yet.</p>
        ) : (
          <ol>
            {c.board.map((r) => (
              <li key={r.team_id} className={cn("border-line-soft grid grid-cols-[32px_minmax(0,1fr)_minmax(0,160px)_72px] items-center gap-3 border-t px-4 py-3 first:border-t-0", r.rank === 1 && "bg-brand-soft/40")}>
                <span className={cn("font-mono text-[18px] tabular-nums", r.rank === 1 ? "text-brand" : "text-ink-3")}>{r.rank ?? "–"}</span>
                <span className="min-w-0">
                  <span className="text-ink block truncate text-[14px] font-semibold">{r.name}</span>
                  <span className="text-ink-3 block truncate text-[11.5px]">
                    {r.track ?? "No track"} · {r.judges_scored} of {r.judges_total} judges
                    {r.stage !== "entered" ? ` · ${STAGE_LABEL[r.stage]}` : ""}
                  </span>
                </span>
                <ProgressBar value={r.score ?? 0} max={max} tone={r.rank === 1 ? "admit" : "accent"} label={`${r.name} score`} className="hidden sm:block" />
                <span className="text-ink text-right font-mono text-[16px] tabular-nums">{r.score === null ? "—" : r.score.toFixed(1)}</span>
              </li>
            ))}
          </ol>
        )}
      </FigurePanel>
    </div>
  );
}
