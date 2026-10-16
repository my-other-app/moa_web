"use client";

import * as React from "react";
import { CheckIcon, CopyIcon, Loader2Icon, PlusIcon } from "lucide-react";
import { formatDate } from "@moa/app-kit";
import {
  ChoiceCard,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  IconButton,
  toast,
} from "@moa/ui";

import { useClubEvents } from "@/features/events";

import { useCreateLink } from "../queries";
import {
  MEDIUMS,
  SOURCES,
  linkFormSchema,
  sourceLabel,
  type LinkScope,
  type TrackingLink,
} from "../schemas";
import { Qr } from "./qr";

/**
 * Make a tracking link: say where it points and where you will share it,
 * and the short link is minted, copied, and drawn as a QR code on the
 * spot. One link per place you share it — that is what tells the places
 * apart later.
 */
const field = "input h-9 w-full";
const label = "eyebrow mb-1.5 block";

export async function copyText(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${what} copied`);
  } catch {
    toast.error("Could not copy — select the link and copy it by hand.");
  }
}

type Kind = "club" | "event";

export function NewLinkDialog({
  scope,
  size = "md",
  label: buttonLabel = "New link",
}: {
  scope: LinkScope;
  size?: "md" | "sm";
  label?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [kind, setKind] = React.useState<Kind>(scope.kind);
  const [eventId, setEventId] = React.useState(
    scope.kind === "event" ? String(scope.eventId) : "",
  );
  const [name, setName] = React.useState("");
  const [source, setSource] = React.useState<string>("instagram");
  const [customSource, setCustomSource] = React.useState("");
  const [medium, setMedium] = React.useState<string>("social");
  const [campaign, setCampaign] = React.useState<string | null>(null);
  const [content, setContent] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [made, setMade] = React.useState<TrackingLink | null>(null);
  const create = useCreateLink(scope);
  const events = useClubEvents({ offset: 0, limit: 100 });
  const list = events.data?.items ?? [];
  const picked = list.find((e) => String(e.id) === eventId);

  const target: LinkScope | null =
    kind === "club"
      ? { kind: "club" }
      : eventId
        ? { kind: "event", eventId: Number(eventId) }
        : null;
  const defaultCampaign =
    kind === "club" ? "club-page" : eventId ? `event-${eventId}` : "";
  const utmSource = source === "other" ? customSource : source;
  const campaignValue = campaign ?? defaultCampaign;
  const tagLine = `utm_source=${utmSource || "…"}&utm_medium=${medium}${campaignValue ? `&utm_campaign=${campaignValue}` : ""}${content ? `&utm_content=${content}` : ""}`;

  const pickSource = (value: string) => {
    setSource(value);
    const preset = SOURCES.find((x) => x.value === value);
    if (preset && value !== "other") setMedium(preset.medium);
  };

  const reset = () => {
    setKind(scope.kind);
    setEventId(scope.kind === "event" ? String(scope.eventId) : "");
    setName("");
    setSource("instagram");
    setCustomSource("");
    setMedium("social");
    setCampaign(null);
    setContent("");
    setErrors({});
    setMade(null);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!target) next.event = "Pick the event the link points to";
    const parsed = linkFormSchema.safeParse({
      name,
      utm_source: utmSource,
      utm_medium: medium,
      utm_campaign: campaignValue || undefined,
      utm_content: content || undefined,
    });
    if (!parsed.success)
      for (const i of parsed.error.issues)
        next[String(i.path[0] ?? "form")] = i.message;
    setErrors(next);
    if (!parsed.success || !target) return;
    const link = await create.mutateAsync({ form: parsed.data, target });
    setMade(link);
    void copyText(link.url, "Short link");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <button
          type="button"
          className={cn(
            "btn btn-primary",
            size === "sm" ? "h-8 px-2.5 text-[12px]" : "h-9",
          )}
        >
          <PlusIcon className="size-4" /> {buttonLabel}
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[640px]">
        {made ? (
          <>
            <DialogHeader>
              <DialogTitle>Your link is ready</DialogTitle>
              <DialogDescription>
                Share it in the one place it is for. Every opening lands on this
                page, and every sign-up that follows is credited to it.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
              <div className="flex min-w-0 flex-col gap-3">
                <div>
                  <span className={label}>
                    Short link · for stories, chats and posters
                  </span>
                  <div className="border-brand-line bg-brand-soft flex items-center gap-2 rounded-xl border px-3 py-2.5">
                    <span className="text-ink min-w-0 flex-1 truncate font-mono text-[13px]">
                      {made.url}
                    </span>
                    <button
                      type="button"
                      onClick={() => void copyText(made.url, "Short link")}
                      className="btn btn-secondary btn-sm"
                    >
                      <CopyIcon className="size-3.5" /> Copy
                    </button>
                  </div>
                </div>
                <div>
                  <span className={label}>
                    Full link · if a tool wants the UTM tags
                  </span>
                  <div className="bg-sunken flex items-center gap-2 rounded-xl px-3 py-2">
                    <span className="text-ink-2 min-w-0 flex-1 truncate font-mono text-[11px]">
                      {made.destination}
                    </span>
                    <IconButton
                      label="Copy the full link"
                      variant="ghost"
                      size="xs"
                      onClick={() =>
                        void copyText(made.destination, "Full link")
                      }
                    >
                      <CopyIcon />
                    </IconButton>
                  </div>
                </div>
                <p className="text-ink-3 text-[11.5px]">
                  {made.name} · {sourceLabel(made.utm_source)} /{" "}
                  {made.utm_medium} · points to{" "}
                  {kind === "club"
                    ? "your club page"
                    : (picked?.name ?? "the event")}
                  .
                </p>
              </div>
              <Qr url={made.url} code={made.code} />
            </div>
            <DialogFooter>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => reset()}
              >
                <PlusIcon className="size-4" /> Another link
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setOpen(false)}
              >
                <CheckIcon className="size-4" /> Done
              </button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={save} noValidate className="grid gap-4">
            <DialogHeader>
              <DialogTitle>New tracking link</DialogTitle>
              <DialogDescription>
                One per place you share it. The short link counts every opening
                and credits every sign-up that follows.
              </DialogDescription>
            </DialogHeader>

            {scope.kind === "club" ? (
              <div>
                <span className={label}>Points to</span>
                <div
                  className="grid gap-2 sm:grid-cols-2"
                  role="radiogroup"
                  aria-label="Points to"
                >
                  <ChoiceCard
                    checked={kind === "club"}
                    onClick={() => setKind("club")}
                    title="Your club page"
                    hint="Counts follows"
                  />
                  <ChoiceCard
                    checked={kind === "event"}
                    onClick={() => setKind("event")}
                    title="An event's page"
                    hint="Counts registrations"
                  />
                </div>
                {kind === "event" ? (
                  <select
                    aria-label="Event"
                    className={cn(field, "mt-2")}
                    value={eventId}
                    onChange={(e) => setEventId(e.target.value)}
                  >
                    <option value="">
                      {events.isPending
                        ? "Loading events…"
                        : list.length === 0
                          ? "No events yet"
                          : "Choose an event"}
                    </option>
                    {list.map((ev) => (
                      <option key={ev.id} value={String(ev.id)}>
                        {ev.name}
                        {ev.event_datetime
                          ? ` · ${formatDate(ev.event_datetime)}`
                          : ""}
                      </option>
                    ))}
                  </select>
                ) : null}
                {errors.event ? (
                  <p className="text-refuse mt-1 text-[12px]">{errors.event}</p>
                ) : null}
              </div>
            ) : null}

            <div>
              <label htmlFor="link-name" className={label}>
                Name it (only you see this)
              </label>
              <input
                id="link-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Instagram story, Friday"
                className={field}
                autoFocus
              />
              {errors.name ? (
                <p className="text-refuse mt-1 text-[12px]">{errors.name}</p>
              ) : null}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label htmlFor="link-source" className={label}>
                  Source · utm_source
                </label>
                <select
                  id="link-source"
                  value={source}
                  onChange={(e) => pickSource(e.target.value)}
                  className={cn(field, "py-0")}
                >
                  {SOURCES.map((x) => (
                    <option key={x.value} value={x.value}>
                      {x.label}
                    </option>
                  ))}
                </select>
                {source === "other" ? (
                  <input
                    aria-label="Source name"
                    value={customSource}
                    onChange={(e) => setCustomSource(e.target.value)}
                    placeholder="e.g. college_notice_board"
                    className={cn(field, "mt-2")}
                  />
                ) : null}
                {errors.utm_source ? (
                  <p className="text-refuse mt-1 text-[12px]">
                    {errors.utm_source}
                  </p>
                ) : null}
              </div>
              <div>
                <label htmlFor="link-medium" className={label}>
                  Medium · utm_medium
                </label>
                <select
                  id="link-medium"
                  value={medium}
                  onChange={(e) => setMedium(e.target.value)}
                  className={cn(field, "py-0")}
                >
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
                <input
                  id="link-campaign"
                  value={campaignValue}
                  onChange={(e) => setCampaign(e.target.value)}
                  className={field}
                />
              </div>
            </div>
            <div>
              <label htmlFor="link-content" className={label}>
                Content · utm_content
              </label>
              <input
                id="link-content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="optional, e.g. story-2 — tells two links on one channel apart"
                className={field}
              />
            </div>
            <div className="bg-sunken text-ink-2 rounded-xl px-3.5 py-2.5 font-mono text-[11.5px] leading-[1.6] break-all">
              <span className="text-ink-3">?</span>
              {tagLine}
            </div>
            <DialogFooter>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setOpen(false)}
                disabled={create.isPending}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={create.isPending}
              >
                {create.isPending ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <PlusIcon className="size-4" />
                )}{" "}
                {create.isPending ? "Minting…" : "Save link"}
              </button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
