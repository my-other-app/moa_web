"use client";

import * as React from "react";
import { AwardIcon, CalendarClockIcon, FlagIcon, GavelIcon, ListOrderedIcon, LockIcon, TrophyIcon, UploadIcon, UsersIcon } from "lucide-react";
import { formatNumber } from "@moa/app-kit";
import { Chip, EmptyState, FigurePanel, Notice, Skeleton, Switch, cn } from "@moa/ui";

import { LockBadge, LockedNotice, openUpgrade, useEventPlan } from "@/features/plan";

import { useCompetition, usePatchSettings } from "../queries";
import { VIEWS, VIEW_LABEL, type Competition, type View } from "../schemas";
import { HoursPanel } from "./hours-panel";
import { JudgingPanel } from "./judging-panel";
import { LeaderboardPanel, RoundsPanel } from "./rounds-board-panel";
import { SubmissionsPanel } from "./submissions-panel";
import { TeamsPanel } from "./teams-panel";
import { TracksPanel } from "./tracks-panel";

/**
 * The Competition tab of an event: off until the organiser turns it on,
 * then seven rooms behind seven pills, in the order a hackathon runs —
 * the tracks teams pick, the teams, what they submit, the judging, the
 * rounds, the board, the mentors' hours. Each pill carries the one number
 * that says where the night is. A competition belongs to its event, so it
 * lives here beside Live and Attendees, not on a page of its own.
 */
const ICONS: Record<View, React.ReactNode> = {
  tracks: <FlagIcon className="size-4" />,
  teams: <UsersIcon className="size-4" />,
  submissions: <UploadIcon className="size-4" />,
  judging: <GavelIcon className="size-4" />,
  rounds: <ListOrderedIcon className="size-4" />,
  leaderboard: <TrophyIcon className="size-4" />,
  hours: <CalendarClockIcon className="size-4" />,
};

/**
 * The plan flag behind each room: teams (and what hangs off them), judging,
 * and rounds with their board. Locked, a room still opens to read.
 */
const VIEW_FEATURE: Record<View, string> = {
  tracks: "teams",
  teams: "teams",
  submissions: "teams",
  judging: "judging",
  rounds: "rounds",
  leaderboard: "rounds",
  hours: "teams",
};

const readView = (): View => {
  if (typeof window === "undefined") return "tracks";
  const v = new URLSearchParams(window.location.search).get("view");
  return (VIEWS as readonly string[]).includes(v ?? "") ? (v as View) : "tracks";
};

function badgeOf(c: Competition, v: View): { text: string | null; tone?: "live" | "attention" } {
  const f = c.figures;
  switch (v) {
    case "tracks":
      return { text: c.tracks.length ? String(c.tracks.length) : null };
    case "teams":
      return { text: f.teams ? `${f.teams}${f.seekers ? ` · ${f.seekers} looking` : ""}` : null, tone: f.seekers ? "attention" : undefined };
    case "submissions":
      return { text: f.teams ? `${f.submitted}/${f.teams}` : null, tone: c.settings.submissions_open ? "live" : undefined };
    case "judging":
      return { text: f.judges ? `${f.scored_pairs}/${f.judges * f.teams} scored` : null };
    case "rounds":
      return { text: c.rounds.finalists.length ? `${c.rounds.finalists.length} final` : c.rounds.shortlisted.length ? `${c.rounds.shortlisted.length} shortlisted` : null };
    case "leaderboard":
      return { text: c.settings.leaderboard_public ? "public" : "private", tone: c.settings.leaderboard_public ? "live" : undefined };
    case "hours":
      return { text: c.mentors.length ? `${c.mentors.reduce((n, m) => n + m.slots.filter((s) => s.team_id).length, 0)} booked` : null };
  }
}

export function CompetitionPage({ eventId }: { eventId: number }) {
  const [view, setView] = React.useState<View>(readView);
  const q = useCompetition(eventId);
  const settings = usePatchSettings(eventId);
  // The event's own view of the plan: a grandfathered event keeps its competition.
  const plan = useEventPlan(eventId);
  // Turning a competition on is the plan's `teams`; turning it off is always allowed.
  const teamsLock = plan.featureLock("teams");
  const c = q.data;
  const go = (v: View) => {
    setView(v);
    const url = new URL(window.location.href);
    url.searchParams.set("view", v);
    window.history.replaceState(null, "", url);
  };

  if (q.isError) return <EmptyState tone="muted" title="The competition could not load" description="Try again in a moment." />;
  if (!c)
    return (
      <div className="grid gap-4">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-[320px]" />
      </div>
    );

  const f = c.figures;
  const line = c.settings.enabled
    ? `${f.teams} ${f.teams === 1 ? "team" : "teams"} · ${formatNumber(f.people)} people · ${f.submitted} of ${f.teams} submitted · ${f.judges} ${f.judges === 1 ? "judge" : "judges"}${c.settings.leaderboard_public ? " · board public" : ""}`
    : "Tracks, teams, submissions, judging, rounds, a leaderboard and mentor hours, for a hackathon or any build challenge.";

  return (
    <div className="grid gap-5">
      <FigurePanel className="flex flex-wrap items-center gap-4 p-4">
        <span className="bg-brand-soft text-brand grid size-10 shrink-0 place-items-center rounded-xl">
          <AwardIcon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-ink flex flex-wrap items-center gap-1.5 text-[14px] font-semibold">
            {c.settings.enabled ? "This event is a competition" : "Run this event as a competition"}
            <LockBadge lock={teamsLock} />
          </p>
          <p className="text-ink-3 text-[12.5px]">{line}</p>
        </div>
        <label className="flex items-center gap-2 text-[13px]">
          <span className={cn(c.settings.enabled ? "text-ink" : "text-ink-3")}>{c.settings.enabled ? "On" : "Off"}</span>
          <Switch checked={c.settings.enabled} onCheckedChange={(on) => (on && teamsLock ? openUpgrade(teamsLock) : settings.mutate({ enabled: on }))} disabled={settings.isPending} aria-label="Run as a competition" />
        </label>
      </FigurePanel>

      {!c.settings.enabled ? (
        <Notice tone="neutral" tag="Off">
          Nothing shows on tickets until it is on. Set the tracks and the rules first, then turn it on and guests can form teams from their ticket.
        </Notice>
      ) : null}

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Competition">
        {VIEWS.map((v) => {
          const b = badgeOf(c, v);
          return (
            <Chip key={v} active={view === v} onClick={() => go(v)}>
              <span className={cn(view === v ? "text-brand-foreground" : "text-ink-3")}>{ICONS[v]}</span>
              {VIEW_LABEL[v]}
              {!plan.can(VIEW_FEATURE[v]) ? <LockIcon role="img" aria-label="Locked" className={cn("size-3", view === v ? "text-brand-foreground/80" : "text-ink-3")} /> : null}
              {b.text ? <span className={cn("font-mono text-[10.5px]", view === v ? "text-brand-foreground/80" : b.tone === "live" ? "text-admit" : b.tone === "attention" ? "text-caution" : "text-ink-3")}>{b.text}</span> : null}
            </Chip>
          );
        })}
      </div>

      <LockedNotice feature={VIEW_FEATURE[view]} eventId={eventId} />

      {view === "tracks" ? <TracksPanel eventId={eventId} c={c} /> : null}
      {view === "teams" ? <TeamsPanel eventId={eventId} c={c} /> : null}
      {view === "submissions" ? <SubmissionsPanel eventId={eventId} c={c} /> : null}
      {view === "judging" ? <JudgingPanel eventId={eventId} c={c} /> : null}
      {view === "rounds" ? <RoundsPanel eventId={eventId} c={c} /> : null}
      {view === "leaderboard" ? <LeaderboardPanel eventId={eventId} c={c} /> : null}
      {view === "hours" ? <HoursPanel eventId={eventId} c={c} /> : null}
    </div>
  );
}
