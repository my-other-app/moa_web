"use client";

import * as React from "react";
import { CheckIcon, EyeOffIcon, ImagePlusIcon, Loader2Icon, LockIcon, PlayIcon, PlusIcon, SlidersHorizontalIcon, SquareIcon, TimerIcon, Trash2Icon, XIcon } from "lucide-react";
import {
  Button,
  CardLabel,
  Chip,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  FigurePanel,
  NativeSelect,
  ProgressBar,
  Segmented,
  Skeleton,
  StatusBadge,
  Switch,
  cn,
  type StatusTone,
} from "@moa/ui";

import { usePick } from "@/features/club";
import { useFeatureGate } from "@/features/plan";

import { useNotifyChoice } from "../notify";
import { useMedia, useModeratePollResponse, usePollMutations, usePollResponses, usePolls, useThemeMutations } from "../queries";
import { POLL_KINDS, type Poll, type PollKind, type PollSettings } from "../schemas";
import { useSecondsUntil } from "../stage/parts";
import { NotifySwitch } from "./notify-switch";

/**
 * Polls: multiple choice (one answer, or up to a few), a word cloud, a
 * rating (stars out of 5, or a score out of 10), a ranking, and open text
 * that waits for the host before anyone sees it. One is live at a time:
 * launching one closes the one that was up, and its results draw on every
 * phone and on the screen — or, as the poll says, only once it closes, or
 * never on the phones.
 *
 * A poll nobody tuned is sent with today's three fields only (api.ts), so
 * it is exactly the poll it always was.
 */

/** Every setting's default for a kind (CONTRACT 7.1): what "nobody tuned it" means. */
export function pollDefaults(kind: PollKind): PollSettings {
  return {
    max_choices: 1,
    scale: 5,
    style: "stars",
    results: "live",
    show: "both",
    chart: kind === "words" ? "cloud" : "bar",
    hide_results: false,
    anonymous: true,
    change_vote: true,
    seconds: null,
    moderate: true,
    option_images: [],
  };
}

/** The settings as the server resolves them (a server from before sends none: today's). */
export function settingsOfPoll(p: Poll): PollSettings {
  const d = pollDefaults(p.kind);
  const s = { ...d, ...(p.settings ?? {}) } as PollSettings;
  if (p.kind === "rating" && !p.settings?.style && s.scale === 10) s.style = "numbers";
  return s;
}

/** Only what differs from the kind's defaults: an untuned poll sends none. */
export function settingsChanges(kind: PollKind, s: PollSettings): Partial<PollSettings> {
  const d = pollDefaults(kind);
  const out: Partial<PollSettings> = {};
  for (const k of Object.keys(s) as (keyof PollSettings)[]) {
    if (JSON.stringify(s[k]) !== JSON.stringify(d[k])) (out as Record<string, unknown>)[k] = s[k];
  }
  // A 10-point rating's numbers are its default; saying so is harmless and keeps the intent.
  return out;
}

export function WordCloud({ words, className }: { words: { word: string; count: number }[]; className?: string }) {
  if (words.length === 0) return <p className={cn("text-ink-3 text-[12.5px]", className)}>Words appear as they come in.</p>;
  const max = Math.max(...words.map((w) => w.count));
  const min = Math.min(...words.map((w) => w.count));
  const size = (c: number) => 14 + (max === min ? 10 : (22 * (c - min)) / (max - min));
  return (
    <p className={cn("bg-sunken flex flex-wrap items-baseline justify-center gap-x-3 gap-y-1 rounded-xl px-4 py-5 text-center leading-[1.25]", className)}>
      {words.map((w, i) => (
        <span
          key={w.word}
          className={cn("font-semibold tracking-[-0.01em]", i === 0 ? "text-brand" : i < 4 ? "text-ink" : "text-ink-2")}
          style={{ fontSize: `${size(w.count)}px` }}
          title={`${w.count}`}
        >
          {w.word}
        </span>
      ))}
    </p>
  );
}

/** A choice's figure as the poll says to show it: percent, count, or both. */
const figure = (c: { count: number; pct: number }, show: PollSettings["show"]) => (show === "percent" ? `${c.pct}%` : show === "count" ? `${c.count}` : `${c.pct}%`);

export function PollResults({ poll, compact }: { poll: Poll; compact?: boolean }) {
  const r = poll.results;
  const s = settingsOfPoll(poll);
  if (poll.kind === "words") return <WordCloud words={r.words ?? []} className="mt-3" />;
  if (poll.kind === "rating") {
    const scale = r.rating?.scale ?? s.scale;
    return (
      <div className="mt-3 grid gap-1.5">
        {(r.rating?.histogram ?? []).map((h) => (
          <div key={h.value} className="grid grid-cols-[20px_1fr_40px] items-center gap-2 text-[12.5px]">
            <span className="text-ink-2 font-mono">{h.value}</span>
            <ProgressBar value={h.count} max={Math.max(1, r.responses)} tone="accent" />
            <span className="text-ink-3 text-right font-mono text-[11px] tabular-nums">{h.pct}%</span>
          </div>
        ))}
        {!compact ? (
          <p className="text-ink-3 mt-1 text-[12px]">
            Average {r.rating?.average ?? "–"} of {scale}
          </p>
        ) : null}
      </div>
    );
  }
  if (poll.kind === "ranking")
    return (
      <ol className="mt-3 grid gap-1.5">
        {(r.ranking ?? []).map((x, i) => (
          <li key={x.label} className="flex items-center gap-2 text-[12.5px]">
            <span className="text-ink-3 w-4 font-mono text-[11px] tabular-nums">{i + 1}</span>
            <span className="text-ink flex-1 truncate">{x.label}</span>
            {x.average != null ? <span className="text-ink-3 font-mono text-[11px] tabular-nums">avg {x.average}</span> : null}
          </li>
        ))}
        {(r.ranking ?? []).length === 0 ? <li className="text-ink-3 text-[12.5px]">The order shows once people answer.</li> : null}
      </ol>
    );
  if (poll.kind === "text") {
    const texts = r.texts ?? [];
    return (
      <div className="mt-3 grid gap-1.5">
        {texts.slice(0, compact ? 4 : 6).map((x) => (
          <p key={x.id} className="bg-sunken text-ink rounded-lg px-3 py-2 text-[12.5px] leading-snug">
            {x.text}
            {x.name ? <span className="text-ink-3"> — {x.name}</span> : null}
          </p>
        ))}
        {texts.length === 0 ? <p className="text-ink-3 text-[12.5px]">Approved answers show here, and on the screen.</p> : null}
      </div>
    );
  }
  return (
    <div className="mt-3 grid gap-2">
      {(r.choices ?? []).map((c) => (
        <div key={c.label}>
          <div className="flex items-center justify-between text-[12.5px]">
            <span className="text-ink">{c.label}</span>
            <span className="text-ink-3 font-mono text-[11px] tabular-nums">
              <span>{figure(c, s.show)}</span>
              {s.show === "both" ? <span className="opacity-70"> · {c.count}</span> : null}
            </span>
          </div>
          <ProgressBar value={c.count} max={Math.max(1, r.responses)} tone="accent" className="mt-1" />
        </div>
      ))}
    </div>
  );
}

const TONE: Record<Poll["status"], StatusTone> = { live: "success", closed: "default", draft: "info" };
const STATUS: Record<Poll["status"], string> = { live: "Live", closed: "Closed", draft: "Draft" };

/** What kind of poll it is, in a few words. */
function kindWords(poll: Poll): string {
  const s = settingsOfPoll(poll);
  if (poll.kind === "choice") return s.max_choices > 1 ? `Multiple choice, up to ${s.max_choices}` : "Multiple choice";
  if (poll.kind === "rating") return s.scale === 10 ? "Score out of 10" : "Rating out of 5";
  return POLL_KINDS.find((k) => k.value === poll.kind)?.label ?? poll.kind;
}

/** An open-text poll's answers waiting for the host: approve one and it shows on the screen and the phones. */
function Moderation({ eventId, poll }: { eventId: number; poll: Poll }) {
  const pending = usePollResponses(eventId, poll.id, "pending", poll.status === "live");
  const moderate = useModeratePollResponse(eventId, poll.id);
  const rows = pending.data ?? [];
  return (
    <div className="border-line-soft mt-3 border-t pt-3">
      <CardLabel right={<span className="text-ink-3 font-mono text-[11px]">{rows.length}</span>}>Waiting for you</CardLabel>
      {rows.length === 0 ? (
        <p className="text-ink-3 mt-2 text-[12px]">{pending.isPending ? "Reading…" : "Nothing waiting."}</p>
      ) : (
        <ul className="mt-2 grid gap-1.5">
          {rows.slice(0, 20).map((x) => (
            <li key={x.id} className="bg-sunken flex items-start gap-2 rounded-lg px-2.5 py-2 text-[12.5px]">
              <span className="text-ink min-w-0 flex-1 leading-snug">
                {x.text}
                {x.name ? <span className="text-ink-3"> — {x.name}</span> : null}
              </span>
              <Button size="icon-xs" variant="ghost" aria-label={`Approve "${x.text}"`} onClick={() => moderate.mutate({ id: x.id, action: "approve" })} disabled={moderate.isPending}>
                <CheckIcon className="text-admit size-4" />
              </Button>
              <Button size="icon-xs" variant="ghost" aria-label={`Reject "${x.text}"`} onClick={() => moderate.mutate({ id: x.id, action: "reject" })} disabled={moderate.isPending}>
                <XIcon className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  const id = React.useId();
  return (
    <label className="flex cursor-pointer items-start gap-2.5" htmlFor={id}>
      <Switch id={id} checked={checked} onCheckedChange={onChange} className="mt-0.5" aria-label={label} />
      <span className="leading-tight">
        <span className="text-ink block text-[12.5px] font-medium">{label}</span>
        {hint ? <span className="text-ink-3 block text-[11.5px]">{hint}</span> : null}
      </span>
    </label>
  );
}

const TIMERS = [null, 15, 30, 45, 60, 90, 120, 180, 300, 600] as const;
const timerLabel = (s: number | null) => (s === null ? "No timer" : s < 60 ? `${s} seconds` : `${s / 60} min`);

/**
 * How a poll shows: when guests see results, as what, whether they may
 * change their vote, a timer. Any of these may change while it runs; what
 * it asks and how it counts (the answers, how many may be picked, the
 * scale) only while it is a draft.
 */
function DisplaySettings({ kind, s, set, draft }: { kind: PollKind; s: PollSettings; set: (c: Partial<PollSettings>) => void; draft: boolean }) {
  const charts = kind === "choice" ? (["bar", "column", "donut"] as const) : null;
  return (
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        <span className="text-ink text-[12.5px] font-medium">Guests see the results</span>
        <Segmented
          label="When guests see the results"
          value={s.hide_results ? "never" : s.results}
          options={[
            { value: "live", label: "As votes come in" },
            { value: "closed", label: "Once it closes" },
            { value: "never", label: "Never" },
          ]}
          onChange={(v) => set(v === "never" ? { hide_results: true } : { hide_results: false, results: v })}
        />
        <span className="text-ink-3 text-[11.5px]">The console and the big screen always have them.</span>
      </div>
      {kind === "choice" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <span className="text-ink text-[12.5px] font-medium">Show</span>
            <Segmented label="Show results as" value={s.show} options={[{ value: "both", label: "Both" }, { value: "percent", label: "%" }, { value: "count", label: "Count" }]} onChange={(show) => set({ show })} />
          </div>
          {charts ? (
            <div className="grid gap-1.5">
              <span className="text-ink text-[12.5px] font-medium">Chart</span>
              <Segmented label="Chart" value={s.chart === "cloud" ? "bar" : s.chart} options={charts.map((c) => ({ value: c, label: c === "bar" ? "Bars" : c === "column" ? "Columns" : "Donut" }))} onChange={(chart) => set({ chart })} />
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-[12.5px]">
          <TimerIcon className="text-ink-3 size-4" aria-hidden="true" />
          <NativeSelect size="sm" className="w-[130px]" aria-label="Poll timer" value={s.seconds ?? ""} onChange={(e) => set({ seconds: e.target.value === "" ? null : Number(e.target.value) })}>
            {TIMERS.map((t) => (
              <option key={t ?? "none"} value={t ?? ""}>
                {timerLabel(t)}
              </option>
            ))}
          </NativeSelect>
          {!draft && s.seconds ? <span className="text-ink-3 text-[11.5px]">counts from the next launch</span> : null}
        </label>
      </div>
      <Toggle label="Guests can change their answer" hint="Until the poll closes." checked={s.change_vote} onChange={(change_vote) => set({ change_vote })} />
      {kind === "text" ? (
        <>
          <Toggle label="Approve answers before they show" hint="Off: every answer goes straight to the screen and the phones." checked={s.moderate} onChange={(moderate) => set({ moderate })} />
          <Toggle label="Show who wrote each answer" hint="Off: every answer is anonymous." checked={!s.anonymous} onChange={(v) => set({ anonymous: !v })} />
        </>
      ) : null}
    </div>
  );
}

/** A picture on one answer (choice and ranking polls). */
function OptionImage({ eventId, label, value, onChange, url }: { eventId: number; label: string; value: string | null; onChange: (id: string | null) => void; url: string | null }) {
  const { upload } = useThemeMutations(eventId);
  const pick = usePick((file) => upload.mutateAsync({ file, kind: "option" }).then((m) => (m.id ? onChange(m.id) : undefined)), "picture");
  return (
    <li className="flex items-center gap-2 text-[12.5px]">
      <span className="border-line bg-sunken grid size-9 shrink-0 place-items-center overflow-hidden rounded-md border">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="size-full object-cover" />
        ) : null}
      </span>
      <span className="text-ink min-w-0 flex-1 truncate">{label}</span>
      <Button size="xs" variant="outline" onClick={pick.open} disabled={upload.isPending || pick.preparing} aria-label={`Picture for ${label}`}>
        {upload.isPending ? <Loader2Icon className="size-3.5 animate-spin" /> : <ImagePlusIcon className="size-3.5" />} {value ? "Change" : "Picture"}
      </Button>
      {value ? (
        <Button size="icon-xs" variant="ghost" aria-label={`Remove the picture for ${label}`} onClick={() => onChange(null)}>
          <XIcon className="size-3.5" />
        </Button>
      ) : null}
      {pick.input}
    </li>
  );
}

function PollSettingsDialog({ eventId, poll, open, onOpenChange }: { eventId: number; poll: Poll; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { patch } = usePollMutations(eventId);
  const saved = settingsOfPoll(poll);
  const [s, setS] = React.useState(saved);
  const [was, setWas] = React.useState(poll);
  if (open && was !== poll) {
    setWas(poll);
    setS(saved);
  }
  const media = useMedia(eventId);
  const library = new Map((media.data ?? []).filter((m) => m.id).map((m) => [m.id!, m]));
  const images = poll.options.map((_, i) => s.option_images[i] ?? null);
  const change: Partial<PollSettings> = {};
  for (const k of Object.keys(s) as (keyof PollSettings)[]) if (JSON.stringify(s[k]) !== JSON.stringify(saved[k])) (change as Record<string, unknown>)[k] = s[k];
  const draft = poll.status === "draft";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>How “{poll.prompt}” shows</DialogTitle>
          <DialogDescription>{draft ? "Change anything before it launches." : "These change on every phone and the screen at once."}</DialogDescription>
        </DialogHeader>
        <DisplaySettings kind={poll.kind} s={s} set={(c) => setS((x) => ({ ...x, ...c }))} draft={draft} />
        {(poll.kind === "choice" || poll.kind === "ranking") && poll.options.length ? (
          <div className="border-line-soft grid gap-2 border-t pt-3">
            <span className="text-ink text-[12.5px] font-medium">Pictures on the answers</span>
            <ul className="grid gap-1.5">
              {poll.options.map((label, i) => {
                const id = images[i];
                const m = id ? library.get(id) : undefined;
                const url = m?.thumbnail ?? m?.medium ?? poll.option_images?.[i]?.thumbnail ?? null;
                return (
                  <OptionImage
                    key={`${i}-${label}`}
                    eventId={eventId}
                    label={label}
                    value={id}
                    url={id ? url : null}
                    onChange={(v) => setS((x) => ({ ...x, option_images: poll.options.map((_, j) => (j === i ? v : (x.option_images[j] ?? null))) }))}
                  />
                );
              })}
            </ul>
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => patch.mutate({ id: poll.id, body: { settings: change } }, { onSuccess: () => onOpenChange(false) })} disabled={!Object.keys(change).length || patch.isPending}>
            {patch.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PollCard({ eventId, poll, notify }: { eventId: number; poll: Poll; notify: boolean }) {
  const { status, remove } = usePollMutations(eventId);
  const gate = useFeatureGate("polls", { eventId });
  const [tuning, setTuning] = React.useState(false);
  const s = settingsOfPoll(poll);
  const closesIn = useSecondsUntil(poll.status === "live" ? poll.closes_at : null);
  const hidden = s.hide_results ? "Guests never see the results" : s.results === "closed" && poll.status === "live" ? "Guests see the results once it closes" : null;
  return (
    <FigurePanel className={cn("flex flex-col p-4", poll.status === "live" && "border-brand-line")}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-ink text-[14px] leading-[1.35] font-semibold">{poll.prompt}</p>
        <StatusBadge tone={TONE[poll.status]} label={STATUS[poll.status]} />
      </div>
      <p className="text-ink-3 mt-1 text-[12px]">
        {kindWords(poll)} · {poll.results.responses} {poll.results.responses === 1 ? "response" : "responses"}
        {closesIn !== null ? ` · closes in ${Math.floor(closesIn / 60)}:${String(closesIn % 60).padStart(2, "0")}` : s.seconds && poll.status === "draft" ? ` · ${timerLabel(s.seconds)} timer` : ""}
      </p>
      {hidden ? (
        <p className="text-ink-3 mt-1 flex items-center gap-1.5 text-[11.5px]">
          <EyeOffIcon className="size-3.5" aria-hidden="true" /> {hidden}
        </p>
      ) : null}
      <PollResults poll={poll} />
      {poll.kind === "text" && s.moderate ? <Moderation eventId={eventId} poll={poll} /> : null}
      <div className="mt-auto flex items-center justify-between gap-2 pt-4">
        {poll.status === "live" ? (
          <Button size="sm" variant="outline" onClick={() => status.mutate({ id: poll.id, status: "closed" })} disabled={status.isPending}>
            <SquareIcon className="size-3.5" /> Close poll
          </Button>
        ) : (
          <Button size="sm" variant={poll.status === "draft" ? "default" : "outline"} onClick={gate.guard(() => status.mutate({ id: poll.id, status: "live", notify }))} disabled={status.isPending}>
            <PlayIcon className="size-3.5" /> {poll.status === "draft" ? "Launch" : "Reopen"}
          </Button>
        )}
        <span className="flex items-center gap-1">
          {poll.settings !== undefined ? (
            <Button size="icon-xs" variant="ghost" aria-label={`How ${poll.prompt} shows`} onClick={() => setTuning(true)}>
              <SlidersHorizontalIcon className="size-4" />
            </Button>
          ) : null}
          <Button size="icon-xs" variant="ghost" aria-label={`Remove poll ${poll.prompt}`} onClick={() => remove.mutate(poll.id)}>
            <Trash2Icon className="size-4" />
          </Button>
        </span>
      </div>
      {poll.settings !== undefined ? <PollSettingsDialog eventId={eventId} poll={poll} open={tuning} onOpenChange={setTuning} /> : null}
    </FigurePanel>
  );
}

const PLACEHOLDER: Record<PollKind, string> = {
  choice: "How comfortable are you with embedded C?",
  words: "What are you building tonight?",
  rating: "Rate the keynote",
  ranking: "Which talk should run first next time?",
  text: "One thing you'd change about tonight",
};

function NewPoll({ eventId, onDone }: { eventId: number; onDone: () => void }) {
  const { create } = usePollMutations(eventId);
  const [kind, setKind] = React.useState<PollKind>("choice");
  const [prompt, setPrompt] = React.useState("");
  const [options, setOptions] = React.useState("");
  const [s, setS] = React.useState<PollSettings>(() => pollDefaults("choice"));
  const [more, setMore] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const opts = options
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
  const listed = kind === "choice" || kind === "ranking";
  const pickKind = (k: PollKind) => {
    setKind(k);
    // A kind starts from its own defaults, keeping how and when results show.
    setS((x) => ({ ...pollDefaults(k), results: x.results, hide_results: x.hide_results, seconds: x.seconds, change_vote: x.change_vote }));
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return setError("Ask the room something.");
    if (listed && opts.length < 2) return setError(kind === "ranking" ? "Give a ranking at least two answers to put in order, one per line." : "Give a multiple-choice poll at least two answers, one per line.");
    if (listed && opts.length > 8) return setError("A poll takes up to eight answers.");
    setError(null);
    const settings = settingsChanges(kind, { ...s, max_choices: kind === "choice" ? Math.min(s.max_choices, opts.length) : 1 });
    await create.mutateAsync({ kind, prompt: prompt.trim(), options: listed ? opts : [], settings });
    onDone();
  };
  return (
    <FigurePanel className="border-brand-line p-4">
      <form onSubmit={submit} noValidate className="grid gap-3">
        <CardLabel>New poll</CardLabel>
        <div className="flex flex-wrap gap-1.5">
          {POLL_KINDS.map((k) => (
            <Chip key={k.value} active={kind === k.value} onClick={() => pickKind(k.value)}>
              {k.label}
            </Chip>
          ))}
        </div>
        <p className="text-ink-3 -mt-1 text-[12px]">{POLL_KINDS.find((k) => k.value === kind)?.hint}</p>
        <div>
          <label htmlFor="poll-prompt" className="eyebrow mb-1.5 block">
            Question
          </label>
          <input id="poll-prompt" className="input h-9 w-full" value={prompt} onChange={(e) => setPrompt(e.target.value)} maxLength={300} placeholder={PLACEHOLDER[kind]} />
        </div>
        {listed ? (
          <div>
            <label htmlFor="poll-options" className="eyebrow mb-1.5 block">
              Answers, one per line
            </label>
            <textarea
              id="poll-options"
              className="input min-h-[96px] w-full py-2"
              value={options}
              onChange={(e) => setOptions(e.target.value)}
              placeholder={kind === "ranking" ? "Hardware demos\nThe keynote\nLightning talks" : "Never touched it\nA little\nComfortable\nI dream in pointers"}
            />
          </div>
        ) : null}
        {kind === "choice" ? (
          <label className="flex flex-wrap items-center gap-2 text-[12.5px]">
            <span className="text-ink-2">People can pick</span>
            <NativeSelect size="sm" className="w-[150px]" aria-label="How many answers people can pick" value={s.max_choices} onChange={(e) => setS({ ...s, max_choices: Number(e.target.value) })}>
              <option value={1}>one answer</option>
              {Array.from({ length: Math.max(0, Math.min(8, opts.length) - 1) }, (_, i) => i + 2).map((n) => (
                <option key={n} value={n}>
                  up to {n}
                </option>
              ))}
            </NativeSelect>
          </label>
        ) : null}
        {kind === "rating" ? (
          <div className="flex flex-wrap items-center gap-3">
            <Segmented
              label="Rating scale"
              value={String(s.scale) as "5" | "10"}
              options={[
                { value: "5", label: "Out of 5" },
                { value: "10", label: "Out of 10" },
              ]}
              onChange={(v) => setS({ ...s, scale: Number(v), style: v === "10" ? "numbers" : "stars" })}
            />
            <Segmented label="Rating style" value={s.style} options={[{ value: "stars", label: "Stars" }, { value: "numbers", label: "Numbers" }]} onChange={(style) => setS({ ...s, style })} />
          </div>
        ) : null}
        <button type="button" className="text-ink-3 hover:text-ink justify-self-start text-[12px] underline-offset-2 hover:underline" aria-expanded={more} onClick={() => setMore((m) => !m)}>
          {more ? "Fewer options" : "Results, timer and more"}
        </button>
        {more ? <DisplaySettings kind={kind} s={s} set={(c) => setS((x) => ({ ...x, ...c }))} draft /> : null}
        {error ? <p className="text-refuse text-[12px]">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? "Saving…" : "Save as draft"}
          </Button>
        </div>
      </form>
    </FigurePanel>
  );
}

export function PollsPanel({
  eventId,
  checkedIn,
}: {
  eventId: number;
  /** The room's checked-in count, when the console already has it. */
  checkedIn?: number | null;
}) {
  const polls = usePolls(eventId);
  const [adding, setAdding] = React.useState(false);
  const [notify, setNotify] = useNotifyChoice(eventId, "poll");
  const gate = useFeatureGate("polls", { eventId });
  if (polls.isPending) return <Skeleton className="h-72" />;
  if (polls.isError || !polls.data) return <EmptyState tone="muted" title="Polls could not load" description="Try again in a moment." />;
  const list = polls.data;
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="page-title text-[20px]">Polls and word clouds</h2>
          <p className="text-ink-3 mt-1 text-[12.5px]">Launch one at a time — it appears on every attendee&apos;s phone and on the host screen.</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          {/* One switch for every Launch and Reopen below. */}
          <NotifySwitch checked={notify} onCheckedChange={setNotify} checkedIn={checkedIn} hint="A push to vote, as each poll launches" />
          <Button onClick={gate.guard(() => setAdding(true))} disabled={adding}>
            {gate.locked ? <LockIcon className="size-4" /> : <PlusIcon className="size-4" />} New poll
          </Button>
        </div>
      </div>
      {adding ? <NewPoll eventId={eventId} onDone={() => setAdding(false)} /> : null}
      {list.length === 0 && !adding ? (
        <EmptyState
          tone="muted"
          title="No polls yet"
          description="A word cloud to open the night, a multiple choice to take the room's pulse, a rating after each talk, a ranking or an open question."
          action={<Button onClick={gate.guard(() => setAdding(true))}>Write the first</Button>}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.map((p) => (
            <PollCard key={p.id} eventId={eventId} poll={p} notify={notify} />
          ))}
        </div>
      )}
    </div>
  );
}
