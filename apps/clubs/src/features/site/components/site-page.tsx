"use client";

import * as React from "react";
import { CheckIcon, CopyIcon, ExternalLinkIcon, GlobeIcon, Loader2Icon, LockIcon, RefreshCwIcon } from "lucide-react";
import { formatDateTime } from "@moa/app-kit";
import { ApiError } from "@moa/api";
import { CardLabel, EmptyState, FigurePanel, Notice, Skeleton, TabPanel, TabRail, toast } from "@moa/ui";

import { useMyClub } from "@/features/club";
import { LockedNotice, useFeatureGate } from "@/features/plan";

import { EMPTY_LAYOUT, layoutFor, layoutPatch, line, mergeLayout, sameLayout, sortImages, templateOf } from "../layout";
import { usePatchSite, usePreview, usePublishSite, useSite } from "../queries";
import { DEFAULT_LIMITS, JOIN_TEXT_TOO_LONG, LEGACY_SECTION_LABEL, isV2, type Layout, type Site, type SitePatch, type SiteTemplate } from "../schemas";
import { useUploadQueue } from "../uploads";
import { DomainCard } from "./domain-card";
import { ImageSlots } from "./image-slots";
import { PhotoLibrary } from "./photo-library";
import { LegacySectionsPanel, SectionsPanel } from "./sections-panel";
import { SiteAnalytics } from "./site-analytics";
import { SitePreview } from "./site-preview";
import { TemplateGallery } from "./template-gallery";
import { TextPanel } from "./text-panel";

/**
 * The club's website: one public page, made from the club's own data and a
 * few choices. Pick one of the designer's templates, put its sections in
 * the order you want (or hide some, or retitle them), fill its photo places
 * from the club's photo library, write the hero's two lines, keep the
 * template's colour or use the club's; the preview follows every edit.
 * Publish puts the page at the public address; until then the changes are
 * the club's alone ("Unpublished changes"). The page rebuilds itself when
 * the club's events change, so it never goes stale between publishes.
 *
 * Photos are saved as they are added, ordered, described or deleted; the
 * rest is a draft here until Save draft or Publish.
 */

interface Draft {
  template?: string;
  /** Every section and slot set while editing, whichever template it was for (mergeLayout). */
  layout?: Layout;
  headline?: string;
  subline?: string;
  /** The older server's on/off map. */
  sections?: Record<string, boolean>;
}

type Tab = "template" | "sections" | "photos" | "text";

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** What the draft changes, as PATCH (and the preview) take it: only what differs from the saved site. */
function changesOf(site: Site, draft: Draft, template: SiteTemplate | undefined, imageIds: ReadonlySet<number>): SitePatch {
  const out: SitePatch = {};
  const key = draft.template ?? site.template;
  if (key !== site.template) out.template = key;
  if (draft.headline !== undefined && line(draft.headline) !== line(site.headline)) out.headline = line(draft.headline);
  if (draft.subline !== undefined && line(draft.subline) !== line(site.subline)) out.subline = line(draft.subline);
  if (site.layout) {
    const saved = layoutFor(template, site.layout, imageIds);
    const now = layoutFor(template, draft.layout ?? site.layout, imageIds);
    // A new template takes its layout with it, so what carried over is said, not guessed.
    if (out.template || !sameLayout(now, saved)) out.layout = layoutPatch(saved, now);
  } else if (draft.sections) {
    const keys = Object.keys(LEGACY_SECTION_LABEL);
    if (keys.some((k) => (draft.sections?.[k] ?? true) !== (site.sections?.[k] ?? true))) out.sections = { ...site.sections, ...draft.sections };
  }
  return out;
}

function Editor({
  site,
  draft,
  setDraft,
  tab,
  setTab,
  joinError,
  onJoinEdit,
}: {
  site: Site;
  draft: Draft;
  setDraft: React.Dispatch<React.SetStateAction<Draft>>;
  tab: Tab;
  setTab: (t: Tab) => void;
  /** The API refused the Join line (too long): said under its field until it is edited. */
  joinError: string | null;
  onJoinEdit: () => void;
}) {
  const club = useMyClub();
  const v2 = isV2(site);
  const images = React.useMemo(() => sortImages(site.images ?? []), [site.images]);
  const imageIds = React.useMemo(() => new Set(images.map((i) => i.id)), [images]);
  const templateKey = draft.template ?? site.template;
  const template = templateOf(site, templateKey);
  const layout = layoutFor(template, draft.layout ?? site.layout ?? EMPTY_LAYOUT, imageIds);
  const limits = site.limits ?? DEFAULT_LIMITS;
  const uploads = useUploadQueue({ room: limits.images - images.length, limit: limits.images, maxMb: limits.image_mb });

  const setLayout = (next: Layout) => setDraft((d) => ({ ...d, layout: mergeLayout(d.layout ?? site.layout ?? EMPTY_LAYOUT, template, next) }));
  const dropImage = (id: number) =>
    setDraft((d) => (d.layout ? { ...d, layout: { ...d.layout, slots: Object.fromEntries(Object.entries(d.layout.slots).filter(([, v]) => v !== id)) } } : d));

  const tabs = [
    { key: "template", label: "Template" },
    { key: "sections", label: "Sections", count: v2 ? layout.order.length - layout.hidden.length : null },
    ...(v2 ? [{ key: "photos", label: "Photos", count: uploads.pending ? `${images.length} +${uploads.pending}` : images.length }] : []),
    { key: "text", label: v2 ? "Text and colour" : "Text" },
  ];

  return (
    <div className="grid content-start gap-4">
      {!v2 ? (
        <Notice tone="neutral" tag="Soon">
          Moving sections, the photo library and photo places arrive with the next server update. For now, pick a template, switch sections on or off and write the hero.
        </Notice>
      ) : null}
      <TabRail items={tabs} value={tab} onChange={(k) => setTab(k as Tab)} label="Website editor" />
      <TabPanel id={tab} className="grid gap-4">
        {tab === "template" ? (
          <TemplateGallery templates={site.templates} chosen={templateKey} saved={site.template} onChoose={(key) => setDraft((d) => ({ ...d, template: key }))} />
        ) : tab === "sections" ? (
          v2 ? (
            <SectionsPanel template={template} layout={layout} typed={(draft.layout ?? site.layout ?? EMPTY_LAYOUT).titles} onChange={setLayout} />
          ) : (
            <LegacySectionsPanel sections={draft.sections ?? site.sections ?? {}} available={site.available ?? {}} onChange={(sections) => setDraft((d) => ({ ...d, sections }))} />
          )
        ) : tab === "photos" && v2 ? (
          <>
            <PhotoLibrary images={images} limit={limits.images} maxMb={limits.image_mb} queue={uploads} template={template} layout={layout} onDeleted={dropImage} />
            <ImageSlots template={template} layout={layout} images={images} onChange={setLayout} />
          </>
        ) : (
          <TextPanel
            headline={draft.headline ?? site.headline ?? ""}
            subline={draft.subline ?? site.subline ?? ""}
            defaultHeadline={site.default_headline}
            defaultSubline={site.default_subline}
            onHeadline={(headline) => setDraft((d) => ({ ...d, headline }))}
            onSubline={(subline) => setDraft((d) => ({ ...d, subline }))}
            {...(v2
              ? {
                  accent: layout.accent,
                  templateAccent: template?.accent ?? null,
                  brand: site.club_colour ?? club.data?.brand_primary ?? null,
                  onAccent: (accent: string | null) => setLayout({ ...layout, accent }),
                  // As typed (the layout's is trimmed): a space between words stays while typing.
                  joinText: (draft.layout ?? site.layout ?? EMPTY_LAYOUT).join_text ?? "",
                  onJoinText: (join_text: string) => {
                    onJoinEdit();
                    setLayout({ ...layout, join_text });
                  },
                  joinError,
                }
              : {})}
          />
        )}
      </TabPanel>
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
  // Publishing the site is the plan's `website`; editing the draft is not.
  const web = useFeatureGate("website");
  const [draft, setDraft] = React.useState<Draft>({});
  const [tab, setTab] = React.useState<Tab>("template");
  const site = q.data;

  const images = React.useMemo(() => sortImages(site?.images ?? []), [site?.images]);
  const imageIds = React.useMemo(() => new Set(images.map((i) => i.id)), [images]);
  const template = site ? templateOf(site, draft.template ?? site.template) : undefined;
  const changes = site ? changesOf(site, draft, template, imageIds) : {};
  const changesKey = JSON.stringify(changes);
  const dirty = changesKey !== "{}";
  // Keyed on the text of the changes: a re-render with the same choices is no new preview. Half a
  // second of quiet keeps typing well under the API's 60 previews a minute.
  const settled = useDebounced(changesKey, 500);
  const previewBody = React.useMemo(() => JSON.parse(settled) as SitePatch, [settled]);
  const libraryVersion = images.map((i) => `${i.id}:${i.alt ?? ""}`).join(",");
  const preview = usePreview(previewBody, !!site, libraryVersion);
  const published = !!site?.published_at;
  const behind = dirty || !!site?.stale;

  // A draft not yet saved is lost with the tab: the browser asks first.
  React.useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const save = async (): Promise<boolean> => {
    if (!dirty) return true;
    try {
      await patch.mutateAsync(changes);
    } catch (error) {
      // Said by the mutation's toast; a Join line refused is also said under its field, shown.
      if (error instanceof ApiError && error.errorCode === JOIN_TEXT_TOO_LONG) setTab("text");
      return false;
    }
    setDraft({});
    return true;
  };
  const doPublish = async () => {
    if (!(await save())) return;
    try {
      await publish.mutateAsync();
    } catch {
      // said by the mutation's toast
    }
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

  const address = site?.url.replace(/^https?:\/\//, "") ?? "";
  const joinError = patch.error instanceof ApiError && patch.error.errorCode === JOIN_TEXT_TOO_LONG ? patch.error.message : null;
  const busy = publish.isPending || patch.isPending;

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Website</h1>
          <p className="text-ink-3 mt-1 text-[12.5px]">A public page built from your club and events. Pick a design, arrange it, add photos; the rest comes from Club profile and Events.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {site && (dirty || (published && site.stale)) ? (
            <span className="text-caution flex items-center gap-1.5 text-[12px] font-medium" data-testid="unpublished">
              <span className="bg-caution inline-block size-2 rounded-full" aria-hidden="true" /> Unpublished changes
            </span>
          ) : null}
          {published ? (
            <a href={site?.url} target="_blank" rel="noreferrer" className="btn btn-secondary">
              <ExternalLinkIcon /> Open site
            </a>
          ) : null}
          <button type="button" className="btn btn-secondary" onClick={() => void copy()} disabled={!site}>
            <CopyIcon /> Copy site link
          </button>
          {dirty ? (
            <button type="button" className="btn btn-secondary" onClick={() => void save()} disabled={busy}>
              {patch.isPending && !publish.isPending ? <Loader2Icon className="animate-spin" /> : <CheckIcon />} Save draft
            </button>
          ) : null}
          <button type="button" className="btn btn-primary" onClick={web.guard(() => void doPublish())} disabled={!site || busy}>
            {busy ? <Loader2Icon className="animate-spin" /> : web.locked ? <LockIcon /> : <RefreshCwIcon />} {!published ? "Publish site" : behind ? "Publish changes" : "Republish"}
          </button>
        </div>
      </div>

      <LockedNotice feature="website" />

      {!site ? (
        <Skeleton className="h-[72px]" />
      ) : published ? (
        <Notice
          tone={behind ? "caution" : "admit"}
          tag={behind ? "Unpublished changes" : "Live"}
          action={
            <a href={site.url} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">
              Open
            </a>
          }
        >
          {behind ? `The live page is from ${formatDateTime(site.published_at ?? "")}. Publish to put these changes on it.` : `Live · updated ${formatDateTime(site.published_at ?? "")} · ${address}`}
        </Notice>
      ) : (
        <Notice tone="neutral" tag="Not yet">
          Nothing is public until you publish. Set it up here, then Publish site puts the page at {address}.
        </Notice>
      )}

      {published ? <SiteAnalytics published /> : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)]">
        {!site ? (
          <Skeleton className="h-[640px]" />
        ) : (
          <Editor site={site} draft={draft} setDraft={setDraft} tab={tab} setTab={setTab} joinError={joinError} onJoinEdit={() => (joinError ? patch.reset() : undefined)} />
        )}
        <div className="lg:sticky lg:top-4 lg:self-start">
          <SitePreview html={preview.data} address={address} updating={preview.isFetching || changesKey !== settled} failed={preview.isError} />
        </div>
      </div>

      <DomainCard />
    </div>
  );
}
