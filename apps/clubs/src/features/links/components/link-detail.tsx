"use client";

import * as React from "react";
import { CopyIcon, Trash2Icon } from "lucide-react";
import { formatDate, formatDateTime, formatNumber } from "@moa/app-kit";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  cn,
  IconButton,
  ProgressBar,
  Skeleton,
} from "@moa/ui";

import { useDeleteLink, useLinkDetail } from "../queries";
import { DEVICE_LABEL, type LinkRow, type LinkScope } from "../schemas";
import { copyText } from "./new-link-dialog";
import { Qr } from "./qr";

/** Day or month bars; the label line under them thins out so it stays readable. */
export function Bars({
  points,
  grain,
  height = 72,
  label,
  tone = "brand",
}: {
  points: { date: string; clicks: number; conversions?: number }[];
  grain: "day" | "month";
  height?: number;
  label: string;
  tone?: "brand" | "ink";
}) {
  const max = Math.max(1, ...points.map((p) => p.clicks));
  const every =
    grain === "month"
      ? 1
      : points.length > 60
        ? 15
        : points.length > 14
          ? 7
          : 1;
  const name = (d: string) =>
    grain === "month"
      ? new Date(`${d}-01T00:00:00`).toLocaleString("en-IN", { month: "short" })
      : new Date(`${d}T00:00:00`).toLocaleString("en-IN", {
          day: "numeric",
          month: "short",
        });
  if (points.length === 0) return null;
  return (
    <div>
      <div
        className="flex items-end gap-px"
        style={{ height }}
        role="img"
        aria-label={label}
      >
        {points.map((p) => {
          const h = p.clicks ? Math.max(3, (p.clicks / max) * (height - 4)) : 2;
          const c = p.conversions
            ? Math.max(2, (p.conversions / max) * (height - 4))
            : 0;
          return (
            <div
              key={p.date}
              className="relative flex h-full flex-1 items-end"
              title={`${name(p.date)}: ${p.clicks} opened${p.conversions !== undefined ? `, ${p.conversions} brought` : ""}`}
            >
              <span
                className={cn(
                  "block w-full rounded-t-[2px]",
                  p.clicks
                    ? tone === "brand"
                      ? "bg-brand/45"
                      : "bg-ink/35"
                    : "bg-sunken",
                )}
                style={{ height: h }}
              />
              {c ? (
                <span
                  className="bg-brand absolute inset-x-0 bottom-0 block rounded-t-[2px]"
                  style={{ height: c }}
                />
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="text-ink-3 mt-1 flex font-mono text-[9.5px] tracking-[0.04em] uppercase">
        {points.map((p, k) => (
          <span key={p.date} className="flex-1 truncate">
            {k % every === 0 ||
            (grain === "day" &&
              k === points.length - 1 &&
              every > 1 &&
              (points.length - 1) % every > every / 2)
              ? name(p.date)
              : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

function Share({
  title,
  rows,
  empty,
}: {
  title: string;
  rows: { name: string; clicks: number }[];
  empty: string;
}) {
  const total = rows.reduce((n, r) => n + r.clicks, 0);
  return (
    <div>
      <span className="eyebrow block">{title}</span>
      {rows.length === 0 ? (
        <p className="text-ink-3 mt-2 text-[12px]">{empty}</p>
      ) : (
        <ul className="mt-2 grid gap-1.5">
          {rows.map((r) => (
            <li key={r.name}>
              <div className="flex items-center justify-between gap-2 text-[12px]">
                <span className="text-ink truncate">{r.name}</span>
                <span className="text-ink-3 shrink-0 font-mono text-[11px] tabular-nums">
                  {formatNumber(r.clicks)} ·{" "}
                  {total ? Math.round((100 * r.clicks) / total) : 0}%
                </span>
              </div>
              <ProgressBar
                value={r.clicks}
                max={Math.max(1, total)}
                tone="accent"
                className="mt-0.5"
                height={5}
                label={`${r.name} openings`}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Hours({ hours }: { hours: { hour: number; clicks: number }[] }) {
  const max = Math.max(1, ...hours.map((h) => h.clicks));
  const any = hours.some((h) => h.clicks > 0);
  const best = any
    ? hours.reduce((a, b) => (b.clicks > a.clicks ? b : a))
    : null;
  return (
    <div>
      <span className="eyebrow block">
        When it is opened
        {best ? (
          <span className="text-admit ml-2 normal-case tracking-normal">
            · most at {best.hour}:00–{best.hour + 1}:00
          </span>
        ) : null}
      </span>
      {!any ? (
        <p className="text-ink-3 mt-2 text-[12px]">
          The hours of the day fill in as it is opened.
        </p>
      ) : (
        <>
          <div
            className="mt-2 flex items-end gap-px"
            style={{ height: 36 }}
            role="img"
            aria-label="Openings by hour of day"
          >
            {hours.map((h) => (
              <span
                key={h.hour}
                className={cn(
                  "block flex-1 rounded-t-[2px]",
                  h.clicks ? "bg-brand/60" : "bg-sunken",
                )}
                style={{
                  height: h.clicks ? Math.max(3, (h.clicks / max) * 34) : 2,
                }}
                title={`${h.hour}:00 · ${h.clicks}`}
              />
            ))}
          </div>
          <div className="text-ink-3 mt-1 flex justify-between font-mono text-[9.5px]">
            <span>0h</span>
            <span>6h</span>
            <span>12h</span>
            <span>18h</span>
            <span>24h</span>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * One link, opened under its row: the two links to copy and the QR to
 * print, then what the period says about it — its days, where the openings
 * came from, the devices, the hours — and the one thing that can be done
 * to it, which is to retire it.
 */
export function LinkDetailPanel({
  scope,
  link,
  days,
  grain,
}: {
  scope: LinkScope;
  link: LinkRow;
  days: number;
  grain: "day" | "month";
}) {
  const target: LinkScope =
    link.target.kind === "event" && link.target.id
      ? { kind: "event", eventId: link.target.id }
      : { kind: "club" };
  const q = useLinkDetail(target, link.id, days);
  const remove = useDeleteLink(scope);
  const d = q.data;
  return (
    <div className="bg-sunken/60 border-line-soft grid gap-5 border-t px-4 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
      <div className="flex flex-col gap-3">
        <div>
          <span className="eyebrow block">Short link · share this</span>
          <div className="border-brand-line bg-brand-soft mt-1.5 flex items-center gap-2 rounded-xl border px-3 py-2">
            <span className="text-ink min-w-0 flex-1 truncate font-mono text-[12.5px]">
              {link.url}
            </span>
            <button
              type="button"
              onClick={() => void copyText(link.url, "Short link")}
              className="btn btn-secondary btn-sm"
            >
              <CopyIcon className="size-3.5" /> Copy
            </button>
          </div>
        </div>
        <div>
          <span className="eyebrow block">Full link · with the UTM tags</span>
          <div className="bg-surface border-line mt-1.5 flex items-center gap-2 rounded-xl border px-3 py-1.5">
            <span className="text-ink-2 min-w-0 flex-1 truncate font-mono text-[11px]">
              {link.destination}
            </span>
            <IconButton
              label={`Copy the full link of ${link.name}`}
              variant="ghost"
              size="xs"
              onClick={() => void copyText(link.destination, "Full link")}
            >
              <CopyIcon />
            </IconButton>
          </div>
        </div>
        <div className="flex items-start justify-between gap-3">
          <dl className="text-ink-3 grid gap-1 text-[11.5px]">
            <div>
              <dt className="inline">Made </dt>
              <dd className="text-ink-2 inline">
                {formatDate(link.created_at)}
              </dd>
            </div>
            <div>
              <dt className="inline">Opened ever </dt>
              <dd className="text-ink-2 inline">
                {formatNumber(link.clicks_ever)}
              </dd>
            </div>
            <div>
              <dt className="inline">Last opened </dt>
              <dd className="text-ink-2 inline">
                {link.last_click_at
                  ? formatDateTime(link.last_click_at)
                  : "never"}
              </dd>
            </div>
            {link.utm_campaign || link.utm_content ? (
              <div>
                <dt className="inline">Tags </dt>
                <dd className="text-ink-2 inline font-mono">
                  {link.utm_campaign ?? ""}
                  {link.utm_content ? ` · ${link.utm_content}` : ""}
                </dd>
              </div>
            ) : null}
          </dl>
          <Qr url={link.url} code={link.code} size={96} />
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button
              type="button"
              className="btn btn-ghost btn-sm w-fit btn-danger"
            >
              <Trash2Icon className="size-3.5" /> Retire this link
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Retire “{link.name}”?</AlertDialogTitle>
              <AlertDialogDescription>
                Opening it will still land on the page, but nothing more is
                counted. What it already brought stays counted. Posters carrying
                its QR keep working.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep it</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => remove.mutate({ id: link.id, target })}
              >
                Retire
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {q.isPending ? (
        <div className="grid gap-3">
          <Skeleton className="h-[88px]" />
          <Skeleton className="h-[88px]" />
        </div>
      ) : q.isError || !d ? (
        <p className="text-ink-3 text-[12.5px]">
          Could not read this link&apos;s openings.
        </p>
      ) : (
        <div className="grid content-start gap-4">
          <div>
            <span className="eyebrow block">
              Opened, {grain === "month" ? "month by month" : "day by day"}
              <span className="text-ink-3 ml-2 font-mono normal-case tracking-normal">
                {formatNumber(d.clicks)} in{" "}
                {days >= 3650 ? "all time" : `${days} days`} ·{" "}
                {formatNumber(d.uniques)} people
              </span>
            </span>
            {d.clicks === 0 ? (
              <p className="text-ink-3 mt-2 text-[12px]">
                Not opened in this period. Share it, and its days fill in here.
              </p>
            ) : (
              <Bars
                points={d.series}
                grain={grain}
                height={64}
                label={`Openings of ${link.name} by ${grain}`}
              />
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Share
              title="Opened from"
              rows={d.referrers.map((r) => ({
                name: r.referrer,
                clicks: r.clicks,
              }))}
              empty="Where an opening came from shows once there is one."
            />
            <Share
              title="On which device"
              rows={d.devices.map((r) => ({
                name: DEVICE_LABEL[r.device] ?? r.device,
                clicks: r.clicks,
              }))}
              empty="Phone or desktop, once it is opened."
            />
          </div>
          <Hours hours={d.hours} />
        </div>
      )}
    </div>
  );
}
