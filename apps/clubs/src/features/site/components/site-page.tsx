"use client";

import * as React from "react";
import { CheckIcon, CopyIcon, ExternalLinkIcon, GlobeIcon, Loader2Icon, LockIcon, MonitorIcon, MoonIcon, RefreshCwIcon, SmartphoneIcon, SunIcon } from "lucide-react";
import { formatDateTime } from "@moa/app-kit";
import { CardLabel, ChoiceCard, EmptyState, FigurePanel, NativeSelect, Notice, Segmented, Skeleton, Switch, cn, toast } from "@moa/ui";

import { LockBadge, LockedNotice, openUpgrade, useFeatureGate, usePlan } from "@/features/plan";

import { usePatchSite, usePreview, usePublishSite, useSite } from "../queries";
import { SECTIONS, SECTION_EMPTY, SECTION_LABEL, type Site, type SitePatch, type Template, type Theme } from "../schemas";
import { DomainCard } from "./domain-card";
import { SiteAnalytics } from "./site-analytics";

/**
 * The club's website: a public page made from the club's own data and a
 * handful of choices. Pick a template, a look and a font, write the hero
 * line, switch sections on and off, and watch the page as you edit; then
 * Update site puts that page at the public address as one HTML file. The
 * page rebuilds itself whenever the club's events change, so it never
 * goes stale between updates.
 */
const field = "input w-full";

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function TemplateMini({ k }: { k: Template }) {
  const bar = "bg-ink-3/40 h-1.5 rounded-full";
  const card = "bg-brand/40 h-4 rounded-sm";
  return (
    <div className="bg-sunken flex h-16 w-full flex-col gap-1.5 rounded-lg p-2" aria-hidden="true">
      {k === "launchpad" ? (
        <>
          <span className={cn(bar, "mx-auto w-1/2")} />
          <span className={cn(bar, "mx-auto w-1/3")} />
          <div className="mt-auto grid grid-cols-3 gap-1">
            <span className={card} />
            <span className={card} />
            <span className={card} />
          </div>
        </>
      ) : k === "chapter" ? (
        <>
          <span className={cn(bar, "w-2/3")} />
          <span className={cn(bar, "w-1/3")} />
          <span className="bg-brand/40 mt-auto h-2 w-full rounded-sm" />
          <span className="bg-brand/40 h-2 w-full rounded-sm" />
        </>
      ) : k === "campus" ? (
        <>
          <span className="bg-brand/50 h-6 w-full rounded-md" />
          <div className="mt-auto grid grid-cols-3 gap-1">
            <span className={card} />
            <span className={card} />
            <span className={card} />
          </div>
        </>
      ) : (
        <>
          <span className={cn(bar, "w-1/2")} />
          <div className="flex gap-1">
            <span className="bg-brand/60 h-4 w-6 rounded-sm" />
            <span className="bg-brand/60 h-4 w-6 rounded-sm" />
            <span className="bg-brand/60 h-4 w-6 rounded-sm" />
          </div>
          <span className="bg-brand/40 mt-auto h-3 w-full rounded-sm" />
        </>
      )}
    </div>
  );
}

function Editor({ site, draft, setDraft }: { site: Site; draft: SitePatch; setDraft: (next: SitePatch) => void }) {
  const theme = draft.theme ?? site.theme;
  const plan = usePlan();
  // The plan includes the first N templates; the one the site already uses stays, whatever its place.
  const cap = plan.limit("website_templates");
  const templateLock = cap === null ? null : plan.limitLock("website_templates", Math.max(cap, 1));
  return (
    <div className="grid gap-4">
      <FigurePanel className="p-4">
        <CardLabel>Template</CardLabel>
        <div className="mt-3 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Template">
          {site.templates.map((t, i) => {
            const lock = cap !== null && i >= cap && t.key !== site.template ? templateLock : null;
            return (
              <ChoiceCard
                key={t.key}
                checked={(draft.template ?? site.template) === t.key}
                onClick={() => (lock ? openUpgrade(lock) : setDraft({ ...draft, template: t.key as Template }))}
                title={
                  <span className="flex flex-col gap-2">
                    <TemplateMini k={t.key as Template} />
                    <span className="flex items-center gap-1.5">
                      {t.name}
                      <LockBadge lock={lock} />
                    </span>
                  </span>
                }
                hint={t.blurb}
              />
            );
          })}
        </div>
      </FigurePanel>
      <FigurePanel className="p-4">
        <CardLabel>Look</CardLabel>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Segmented label="Theme" value={theme} options={[{ value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} onChange={(v) => setDraft({ ...draft, theme: v as Theme })} />
          <span className="text-ink-3">{theme === "dark" ? <MoonIcon className="size-4" /> : <SunIcon className="size-4" />}</span>
          <NativeSelect aria-label="Font" className="w-auto min-w-40" value={draft.font ?? site.font} onChange={(e) => setDraft({ ...draft, font: e.target.value as SitePatch["font"] })}>
            {site.fonts.map((f) => (
              <option key={f.key} value={f.key}>
                {f.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <p className="text-ink-3 mt-2 flex items-center gap-1.5 text-[11.5px]">
          <span className="bg-brand inline-block size-2.5 rounded-full" /> Brand colour, logo and cover come from Club profile.
        </p>
      </FigurePanel>
      <FigurePanel className="p-4">
        <CardLabel>Hero</CardLabel>
        <label htmlFor="site-headline" className="eyebrow mt-3 mb-1.5 block">
          Headline
        </label>
        <input id="site-headline" className={field} value={draft.headline ?? site.headline ?? ""} placeholder={site.default_headline} onChange={(e) => setDraft({ ...draft, headline: e.target.value })} maxLength={120} />
        <label htmlFor="site-subline" className="eyebrow mt-3 mb-1.5 block">
          Subline
        </label>
        <input id="site-subline" className={field} value={draft.subline ?? site.subline ?? ""} placeholder={site.default_subline ?? "One line on what the club does."} onChange={(e) => setDraft({ ...draft, subline: e.target.value })} maxLength={240} />
        <p className="text-ink-3 mt-2 text-[11.5px]">Left empty, the headline is your tagline and the subline the first line of your about.</p>
      </FigurePanel>
      <FigurePanel className="p-4">
        <CardLabel>Sections</CardLabel>
        <ul className="mt-3 grid gap-2">
          {SECTIONS.map((k) => {
            const on = (draft.sections ?? site.sections)[k] ?? true;
            const has = site.available[k] ?? true;
            return (
              <li key={k} className="flex items-center justify-between gap-3 text-[13px]">
                <span className={cn(on && has ? "text-ink" : "text-ink-3")}>
                  {SECTION_LABEL[k]}
                  {!has ? <span className="text-ink-3 ml-2 text-[11px]">{SECTION_EMPTY[k] ?? "nothing to show yet"}</span> : null}
                </span>
                <Switch checked={on} onCheckedChange={(v) => setDraft({ ...draft, sections: { ...(draft.sections ?? site.sections), [k]: v } })} aria-label={SECTION_LABEL[k]} />
              </li>
            );
          })}
        </ul>
      </FigurePanel>
      <FigurePanel className="p-4">
        <CardLabel>Address</CardLabel>
        <p className="text-ink mt-2 flex items-center gap-2 font-mono text-[12.5px]">
          <GlobeIcon className="text-ink-3 size-4" /> {site.url.replace(/^https?:\/\//, "")}
        </p>
        <p className="text-ink-3 mt-2 text-[11.5px]">Your club&apos;s address on MyOtherApp. To use a domain of your own, see Custom domain below.</p>
      </FigurePanel>
    </div>
  );
}

export function SitePage() {
  const q = useSite();
  const patch = usePatchSite();
  const publish = usePublishSite();
  // Publishing (and updating) the site is the plan's `website`; editing the draft is not.
  const web = useFeatureGate("website");
  const [draft, setDraft] = React.useState<SitePatch>({});
  const [device, setDevice] = React.useState<"desktop" | "mobile">("desktop");
  const debounced = useDebounced(draft, 400);
  const site = q.data;
  const preview = usePreview(debounced, !!site);
  const dirty = Object.keys(draft).length > 0;

  const save = async () => {
    if (!dirty) return;
    await patch.mutateAsync(draft);
    setDraft({});
  };
  const update = async () => {
    if (dirty) await patch.mutateAsync(draft);
    setDraft({});
    await publish.mutateAsync();
  };
  const copy = async () => {
    if (!site) return;
    try {
      await navigator.clipboard.writeText(site.url);
      toast.success("Site link copied");
    } catch {
      toast.error("Could not copy the link");
    }
  };

  if (q.isError) return <EmptyState tone="muted" title="The website could not load" description="Try again in a moment." />;

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Website</h1>
          <p className="text-ink-3 mt-1 text-[12.5px]">A public site built from your club and events, as one page. Pick a template and a look; the data comes from Club profile and Events.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {site?.published_at ? (
            <a href={site.url} target="_blank" rel="noreferrer" className="btn btn-secondary">
              <ExternalLinkIcon /> Open site
            </a>
          ) : null}
          <button type="button" className="btn btn-secondary" onClick={() => void copy()} disabled={!site}>
            <CopyIcon /> Copy site link
          </button>
          {dirty ? (
            <button type="button" className="btn btn-secondary" onClick={() => void save()} disabled={patch.isPending}>
              {patch.isPending ? <Loader2Icon className="animate-spin" /> : <CheckIcon />} Save
            </button>
          ) : null}
          <button type="button" className="btn btn-primary" onClick={web.guard(() => void update())} disabled={!site || publish.isPending || patch.isPending}>
            {publish.isPending ? <Loader2Icon className="animate-spin" /> : web.locked ? <LockIcon /> : <RefreshCwIcon />} {site?.published_at ? "Update site" : "Publish site"}
          </button>
        </div>
      </div>

      <LockedNotice feature="website" />

      {!site ? (
        <Skeleton className="h-[72px]" />
      ) : site.published_at ? (
        <Notice tone={site.stale || dirty ? "caution" : "admit"} tag={site.stale || dirty ? "Behind" : "Live"} action={<a href={site.url} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">Open</a>}>
          {site.stale || dirty ? `The live page is from ${formatDateTime(site.published_at)}; update it to show these changes.` : `Live · updated ${formatDateTime(site.published_at)} · ${site.url.replace(/^https?:\/\//, "")}`}
        </Notice>
      ) : (
        <Notice tone="neutral" tag="Not yet">
          Nothing is public until you publish. Set the look, then Publish site puts the page at {site.url.replace(/^https?:\/\//, "")}.
        </Notice>
      )}

      {site?.published_at ? <SiteAnalytics published /> : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        {!site ? <Skeleton className="h-[640px]" /> : <Editor site={site} draft={draft} setDraft={setDraft} />}
        <div className="grid content-start gap-2">
          <div className="flex items-center justify-between">
            <span className="text-ink-3 text-[12.5px]">Live preview · updates as you edit</span>
            <Segmented
              label="Preview device"
              value={device}
              options={[
                { value: "desktop", label: "Desktop" },
                { value: "mobile", label: "Mobile" },
              ]}
              onChange={(v) => setDevice(v as "desktop" | "mobile")}
            />
          </div>
          <FigurePanel className="overflow-hidden p-0">
            <div className="border-line-soft bg-sunken flex items-center gap-1.5 border-b px-3 py-2">
              <span className="bg-ink-3/40 size-2.5 rounded-full" />
              <span className="bg-ink-3/40 size-2.5 rounded-full" />
              <span className="bg-ink-3/40 size-2.5 rounded-full" />
              <span className="text-ink-3 mx-auto font-mono text-[11px]">{site?.url.replace(/^https?:\/\//, "")}</span>
              <span className="text-ink-3">{device === "desktop" ? <MonitorIcon className="size-3.5" /> : <SmartphoneIcon className="size-3.5" />}</span>
            </div>
            <div className={cn("bg-sunken flex justify-center", device === "mobile" && "py-4")}>
              {preview.data ? (
                <iframe title="Site preview" srcDoc={preview.data} sandbox="allow-same-origin" className={cn("bg-white", device === "desktop" ? "h-[720px] w-full" : "border-line h-[720px] w-[390px] rounded-[28px] border-8 border-black/80")} />
              ) : (
                <Skeleton className="h-[720px] w-full" />
              )}
            </div>
          </FigurePanel>
        </div>
      </div>

      <DomainCard />
    </div>
  );
}
