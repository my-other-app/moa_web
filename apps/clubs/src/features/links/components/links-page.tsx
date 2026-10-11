"use client";

import * as React from "react";
import { CopyIcon, LinkIcon, SaveIcon, Trash2Icon } from "lucide-react";
import { formatNumber } from "@moa/app-kit";
import { CardLabel, EmptyState, FigurePanel, ProgressBar, Skeleton, StatTile, cn, toast } from "@moa/ui";

import { useCreateLink, useDeleteLink, useLinks } from "../queries";
import { MEDIUMS, PERIODS, SOURCES, linkFormSchema, sourceLabel, type LinkScope, type LinksSummary, type TrackingLink } from "../schemas";

/**
 * Tracking links: where the people came from.
 *
 * Build a link for one place you share it; the short link counts every
 * opening and carries a code the sign-up (or the follow) brings back. The
 * page then reads, per channel and per link, how many clicked, how many
 * converted, and what the converted did next — came through the door, or
 * registered for an event later.
 */
const plural = (noun: string, n: number) => (n === 1 ? noun : `${noun}s`);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function delta(value: number | null, unit = "%"): { delta?: string; trend: "none" | "up" | "down" } {
  if (value === null) return { trend: "none" };
  return { delta: `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value)}${unit}`, trend: value > 0 ? "up" : value < 0 ? "down" : "none" };
}

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copied`);
  } catch {
    toast.error("Could not copy — select the link and copy it by hand.");
  }
}

const field = "input h-9 w-full";
const label = "eyebrow mb-1.5 block";

function BuildLink({ scope, s }: { scope: LinkScope; s: LinksSummary }) {
  const create = useCreateLink(scope);
  const defaultCampaign = scope.kind === "event" ? `event-${scope.eventId}` : "club-page";
  const [name, setName] = React.useState("");
  const [source, setSource] = React.useState<string>("instagram");
  const [customSource, setCustomSource] = React.useState("");
  const [medium, setMedium] = React.useState<string>("social");
  const [campaign, setCampaign] = React.useState(defaultCampaign);
  const [content, setContent] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [made, setMade] = React.useState<TrackingLink | null>(null);

  const pickSource = (value: string) => {
    setSource(value);
    const preset = SOURCES.find((x) => x.value === value);
    if (preset && value !== "other") setMedium(preset.medium);
  };
  const utmSource = source === "other" ? customSource : source;
  const tagLine = `utm_source=${utmSource || "…"}&utm_medium=${medium}${campaign ? `&utm_campaign=${campaign}` : ""}${content ? `&utm_content=${content}` : ""}`;

  const save = async () => {
    const parsed = linkFormSchema.safeParse({ name, utm_source: utmSource, utm_medium: medium, utm_campaign: campaign || undefined, utm_content: content || undefined });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrors({});
    const link = await create.mutateAsync(parsed.data);
    setMade(link);
    setName("");
    setContent("");
    void copy(link.url, "Short link");
  };

  return (
    <FigurePanel>
      <CardLabel className="mb-1">Build a tracking link</CardLabel>
      <p className="text-ink-2 mb-4 text-[12.5px]">
        {scope.kind === "event" ? "Points to this event's public page." : "Points to your club page."} Use one per place you share it.
      </p>
      <div className="flex flex-col gap-3.5">
        <div>
          <label htmlFor="link-name" className={label}>
            Name it (only you see this)
          </label>
          <input id="link-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Instagram story, Friday" className={field} />
          {errors.name ? <p className="text-refuse mt-1 text-[12px]">{errors.name}</p> : null}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor="link-source" className={label}>
              Source · utm_source
            </label>
            <select id="link-source" value={source} onChange={(e) => pickSource(e.target.value)} className={field}>
              {SOURCES.map((x) => (
                <option key={x.value} value={x.value}>
                  {x.label}
                </option>
              ))}
            </select>
            {source === "other" ? <input aria-label="Source name" value={customSource} onChange={(e) => setCustomSource(e.target.value)} placeholder="e.g. college_notice_board" className={cn(field, "mt-2")} /> : null}
            {errors.utm_source ? <p className="text-refuse mt-1 text-[12px]">{errors.utm_source}</p> : null}
          </div>
          <div>
            <label htmlFor="link-medium" className={label}>
              Medium · utm_medium
            </label>
            <select id="link-medium" value={medium} onChange={(e) => setMedium(e.target.value)} className={field}>
              {MEDIUMS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="link-campaign" className={label}>
              Campaign · utm_campaign
            </label>
            <input id="link-campaign" value={campaign} onChange={(e) => setCampaign(e.target.value)} className={field} />
          </div>
        </div>
        <div>
          <label htmlFor="link-content" className={label}>
            Content · utm_content
          </label>
          <input id="link-content" value={content} onChange={(e) => setContent(e.target.value)} placeholder="optional, e.g. story-2" className={cn(field, "sm:w-1/2")} />
        </div>
        <div className="bg-sunken text-ink-2 rounded-xl px-3.5 py-3 font-mono text-[11.5px] leading-[1.6] break-all">
          <span className="text-ink-3">?</span>
          {tagLine}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void save()} disabled={create.isPending} className="btn btn-primary">
            <SaveIcon className="size-4" />
            {create.isPending ? "Saving…" : "Save link"}
          </button>
          <span className="text-ink-3 text-[11.5px]">The short link to share is minted on save and copied for you.</span>
        </div>
        {made ? (
          <div className="border-brand-line bg-brand-soft flex flex-wrap items-center gap-2 rounded-xl border px-3.5 py-2.5">
            <LinkIcon className="text-brand size-4 shrink-0" aria-hidden="true" />
            <span className="text-ink min-w-0 flex-1 truncate font-mono text-[12px]">{made.url}</span>
            <button type="button" onClick={() => void copy(made.url, "Short link")} className="btn btn-secondary h-8 px-2.5 text-[12px]">
              <CopyIcon className="size-3.5" /> Copy
            </button>
          </div>
        ) : null}
      </div>
    </FigurePanel>
  );
}

function BySource({ s }: { s: LinksSummary }) {
  const noun = s.conversion_noun;
  const max = Math.max(1, ...s.by_source.map((r) => r.conversions));
  return (
    <FigurePanel>
      <CardLabel className="mb-3" right={<span className="text-ink-3 text-[11px]">tracked links only</span>}>
        {cap(plural(noun, 2))} by source
      </CardLabel>
      {s.by_source.length === 0 ? <p className="text-ink-2 py-6 text-center text-[12.5px]">Each channel shows its share once a link of it is opened.</p> : null}
      {s.by_source.map((r) => (
        <div key={r.source} className="border-line-soft border-t py-2 first:border-t-0">
          <div className="flex items-baseline justify-between gap-2">
            <span className="min-w-0 truncate text-[12.5px] font-medium">{sourceLabel(r.source)}</span>
            <span className="text-ink-2 shrink-0 font-mono text-[11.5px] tabular-nums">
              {formatNumber(r.conversions)} {plural(noun, r.conversions)} · {formatNumber(r.clicks)} clicks · {r.rate}%
            </span>
          </div>
          <ProgressBar value={r.conversions} max={max} height={7} className="mt-1.5" label={`${sourceLabel(r.source)} ${plural(noun, 2)}`} tone="admit" />
        </div>
      ))}
      {s.untracked.total > 0 ? (
        <p className="text-ink-3 mt-3 text-[11.5px] leading-[1.5]">
          {formatNumber(s.untracked.conversions)} of your {formatNumber(s.untracked.total)} {plural(noun, s.untracked.total)} in this period came without a link — the app&apos;s discovery feed, event pages and search.
        </p>
      ) : null}
    </FigurePanel>
  );
}

function LinksTable({ scope, s }: { scope: LinkScope; s: LinksSummary }) {
  const remove = useDeleteLink(scope);
  const noun = s.conversion_noun;
  const cols = "grid-cols-[minmax(0,2fr)_minmax(0,1.1fr)_72px_84px_64px_92px_72px]";
  return (
    <FigurePanel className="p-0">
      <div className="border-line-soft flex items-center justify-between border-b px-4 py-3">
        <CardLabel>Links</CardLabel>
        <span className="text-ink-3 font-mono text-[11px] tabular-nums">{s.links.length}</span>
      </div>
      {s.links.length === 0 ? (
        <EmptyState icon={<LinkIcon />} title="No links yet" description="Build one above. Every opening, and every sign-up that follows it, lands here." />
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[760px]">
            <div className={cn("text-ink-3 grid gap-3 px-4 py-2 font-mono text-[10px] tracking-[0.06em] uppercase", cols)}>
              <span>Link</span>
              <span>Source / medium</span>
              <span className="text-right">Clicks</span>
              <span className="text-right">{plural(noun, 2)}</span>
              <span className="text-right">Rate</span>
              <span className="text-right">{s.second_noun}</span>
              <span />
            </div>
            {s.links.map((l) => (
              <div key={l.id} className={cn("border-line-soft grid items-center gap-3 border-t px-4 py-2.5 text-[12.5px]", cols)}>
                <span className="min-w-0">
                  <span className="block truncate font-medium">{l.name}</span>
                  <span className="text-ink-3 block truncate font-mono text-[11px]">{l.url.replace(/^https?:\/\//, "")}</span>
                </span>
                <span className="text-ink-2 truncate">
                  {sourceLabel(l.utm_source)} / {l.utm_medium}
                  {l.utm_content ? <span className="text-ink-3"> · {l.utm_content}</span> : null}
                </span>
                <span className="text-right font-mono tabular-nums" title={`${formatNumber(l.uniques)} unique`}>
                  {formatNumber(l.clicks)}
                </span>
                <span className="text-right font-mono tabular-nums">{formatNumber(l.conversions)}</span>
                <span className={cn("text-right font-mono tabular-nums", l.clicks === 0 ? "text-ink-3" : l.rate >= 10 ? "text-admit" : "text-ink")}>{l.clicks === 0 ? "—" : `${l.rate}%`}</span>
                <span className="text-ink-2 text-right font-mono tabular-nums">{formatNumber(l.second)}</span>
                <span className="flex items-center justify-end gap-1">
                  <button type="button" onClick={() => void copy(l.url, "Short link")} aria-label={`Copy ${l.name}`} className="border-line bg-surface text-ink-2 hover:bg-sunken hover:text-ink grid size-7 place-items-center rounded-full border">
                    <CopyIcon className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => window.confirm(`Retire “${l.name}”? Opening it will land on the page without counting; what it already brought stays counted.`) && remove.mutate(l.id)}
                    aria-label={`Retire ${l.name}`}
                    className="border-line bg-surface text-ink-2 hover:border-refuse-line hover:text-refuse grid size-7 place-items-center rounded-full border"
                  >
                    <Trash2Icon className="size-3.5" />
                  </button>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </FigurePanel>
  );
}

export function LinksPage({ scope }: { scope: LinkScope }) {
  const [days, setDays] = React.useState(30);
  const q = useLinks(scope, days);
  const s = q.data;

  return (
    <div className="flex flex-col gap-3.5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className={cn("m-0 font-semibold tracking-[-0.02em]", scope.kind === "club" ? "page-title" : "text-[17px]")}>Tracking links</h2>
          <p className="text-ink-2 mt-1 text-[13px]">{scope.kind === "event" ? "Short links to this event's page · see which channels bring sign-ups" : "UTM links to your club page · see which channels bring followers"}</p>
        </div>
        <select aria-label="Period" value={days} onChange={(e) => setDays(Number(e.target.value))} className="input h-9 w-[150px] py-0">
          {PERIODS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </header>

      {q.isError ? (
        <EmptyState tone="muted" title="Could not load the links" description="Try reloading the page." />
      ) : !s ? (
        <div className="grid gap-3.5 lg:grid-cols-[1.4fr_1fr]">
          <Skeleton className="h-[340px] rounded-2xl" />
          <Skeleton className="h-[340px] rounded-2xl" />
        </div>
      ) : (
        <>
          <div className="grid gap-3.5 lg:grid-cols-[1.4fr_1fr]">
            <BuildLink scope={scope} s={s} />
            <BySource s={s} />
          </div>
          <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Tracked clicks" value={formatNumber(s.totals.clicks)} {...delta(s.deltas.clicks)} note={`${s.links.length} ${plural("link", s.links.length)}`} />
            <StatTile label={`${cap(plural(s.conversion_noun, 2))} from links`} value={formatNumber(s.totals.conversions)} {...delta(s.deltas.conversions)} note={`${s.totals.share_of_all}% of all ${plural(s.conversion_noun, 2)}`} />
            <StatTile label={`Click → ${s.conversion_noun}`} value={`${s.totals.rate}%`} {...delta(s.deltas.rate_pts, " pts")} note="across tracked links" />
            <StatTile label="Best channel" value={s.totals.best_source ? sourceLabel(s.totals.best_source) : "—"} note={s.totals.best_source ? `${formatNumber(s.totals.best_conversions)} ${plural(s.conversion_noun, s.totals.best_conversions)}` : "no conversions tracked yet"} />
          </div>
          <LinksTable scope={scope} s={s} />
        </>
      )}
    </div>
  );
}
