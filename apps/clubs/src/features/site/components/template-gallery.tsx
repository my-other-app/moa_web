"use client";

import * as React from "react";
import { CheckIcon, Columns2Icon, LayoutTemplateIcon } from "lucide-react";
import { GATEWAY_PREFIX } from "@moa/auth";
import { CardLabel, FigurePanel, Segmented, cn } from "@moa/ui";

import { LockBadge, openUpgrade, usePlan } from "@/features/plan";

import type { SiteTemplate } from "../schemas";

/**
 * The templates, each as a picture of itself (the server's thumbnails, of
 * the desktop page or the phone one), with Use this. The plan includes the
 * first N; the one the site already uses stays, whatever its place.
 */

/** A thumbnail's address: the API's own paths go through the gateway, as every call does. */
export function assetUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("/api/v1/")) return `${GATEWAY_PREFIX}${url}`;
  return url;
}

function Thumb({ t, mobile }: { t: SiteTemplate; mobile: boolean }) {
  const src = assetUrl(mobile ? (t.thumb_mobile_url ?? t.thumb_url) : (t.thumb_url ?? t.thumb_mobile_url));
  const [broken, setBroken] = React.useState(false);
  return (
    <div className={cn("bg-sunken relative grid h-[150px] w-full place-items-center overflow-hidden rounded-lg", mobile && "py-2")}>
      {src && !broken ? (
        // A plain img: the thumbnails are small PNGs from the API, shown as they are.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={`${t.name}, ${mobile ? "on a phone" : "on a desktop"}`}
          loading="lazy"
          onError={() => setBroken(true)}
          className={cn(mobile ? "border-line h-full w-auto rounded-md border object-contain" : "h-full w-full object-cover object-top")}
        />
      ) : (
        <span className="text-ink-3 flex flex-col items-center gap-1 text-[12px]" aria-hidden="true">
          <LayoutTemplateIcon className="size-5" />
          {t.name}
        </span>
      )}
    </div>
  );
}

export function TemplateGallery({ templates, chosen, saved, onChoose }: { templates: SiteTemplate[]; chosen: string; saved: string; onChoose: (key: string) => void }) {
  const [view, setView] = React.useState<"desktop" | "mobile">("desktop");
  const plan = usePlan();
  const cap = plan.limit("website_templates");
  const lockFor = (i: number, key: string) => (cap !== null && i >= cap && key !== saved ? plan.limitLock("website_templates", Math.max(cap, 1)) : null);
  return (
    <FigurePanel className="p-4">
      <CardLabel
        right={
          <Segmented
            label="Thumbnails"
            value={view}
            options={[
              { value: "desktop", label: "Desktop" },
              { value: "mobile", label: "Mobile" },
            ]}
            onChange={(v) => setView(v)}
            className="h-8"
          />
        }
      >
        Template
      </CardLabel>
      <p className="text-ink-3 mt-2 text-[11.5px]">Each design keeps its own fonts and colours. Your sections, photos and words carry over when you switch.</p>
      <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {templates.map((t, i) => {
          const lock = lockFor(i, t.key);
          const on = t.key === chosen;
          return (
            <li key={t.key} className={cn("flex flex-col gap-2 rounded-xl border p-2 transition-colors", on ? "border-brand-line bg-brand-soft" : "border-line")} data-testid={`template-${t.key}`}>
              <Thumb t={t} mobile={view === "mobile"} />
              <div className="flex items-start justify-between gap-2 px-1">
                <div className="min-w-0">
                  <p className="text-ink flex items-center gap-1.5 text-[13px] font-medium">
                    {t.name}
                    {t.layout === "two_column" ? <Columns2Icon className="text-ink-3 size-3.5" aria-label="Two columns" /> : null}
                    <LockBadge lock={lock} />
                  </p>
                  {t.blurb ? <p className="text-ink-3 text-[11.5px] leading-snug">{t.blurb}</p> : null}
                </div>
              </div>
              <button
                type="button"
                aria-label={on ? `${t.name} is chosen` : `Use ${t.name}`}
                aria-pressed={on}
                onClick={() => (lock ? openUpgrade(lock) : onChoose(t.key))}
                className={cn("btn btn-sm mt-auto", on ? "btn-secondary" : "btn-primary")}
              >
                {on ? (
                  <>
                    <CheckIcon /> {t.key === saved ? "In use" : "Chosen"}
                  </>
                ) : (
                  "Use this"
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </FigurePanel>
  );
}
