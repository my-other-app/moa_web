"use client";

import * as React from "react";
import { Loader2Icon, PencilIcon } from "lucide-react";
import {
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@moa/ui";

import { useUpdateLink } from "../queries";
import { MEDIUMS, SOURCES, linkFormSchema, type LinkRow, type LinkScope } from "../schemas";

const field = "input h-9 w-full";
const label = "eyebrow mb-1.5 block";

/**
 * Rename or retag a link that is already out there. Its short code, its QR
 * and everything it brought stay as they are: only what the club calls it,
 * and the tags it adds to the page address, change.
 */
export function EditLinkDialog({ scope, link }: { scope: LinkScope; link: LinkRow }) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(link.name);
  const [source, setSource] = React.useState(link.utm_source);
  const [medium, setMedium] = React.useState(link.utm_medium);
  const [campaign, setCampaign] = React.useState(link.utm_campaign ?? "");
  const [content, setContent] = React.useState(link.utm_content ?? "");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const update = useUpdateLink(scope);

  const reset = () => {
    setName(link.name);
    setSource(link.utm_source);
    setMedium(link.utm_medium);
    setCampaign(link.utm_campaign ?? "");
    setContent(link.utm_content ?? "");
    setErrors({});
  };

  // An event's link opened from the club page is changed at that event's address.
  const target: LinkScope =
    link.target.kind === "event" && link.target.id ? { kind: "event", eventId: link.target.id } : { kind: "club" };
  const sources = SOURCES.some((s) => s.value === link.utm_source)
    ? SOURCES.map((s) => ({ value: s.value as string, label: s.label as string }))
    : [{ value: link.utm_source, label: link.utm_source }, ...SOURCES.map((s) => ({ value: s.value as string, label: s.label as string }))];
  const mediums: string[] = (MEDIUMS as readonly string[]).includes(link.utm_medium) ? [...MEDIUMS] : [link.utm_medium, ...MEDIUMS];

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = linkFormSchema.safeParse({
      name,
      utm_source: source,
      utm_medium: medium,
      utm_campaign: campaign || undefined,
      utm_content: content || undefined,
    });
    const next: Record<string, string> = {};
    if (!parsed.success) for (const i of parsed.error.issues) next[String(i.path[0] ?? "form")] = i.message;
    setErrors(next);
    if (!parsed.success) return;
    try {
      await update.mutateAsync({
        id: link.id,
        target,
        patch: {
          name: parsed.data.name,
          utm_source: parsed.data.utm_source,
          utm_medium: parsed.data.utm_medium,
          utm_campaign: parsed.data.utm_campaign || null,
          utm_content: parsed.data.utm_content || null,
        },
      });
      setOpen(false);
    } catch {
      // Said by the mutation's toast; the dialog stays open to fix it.
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) reset();
      }}
    >
      <DialogTrigger asChild>
        <button type="button" className="btn btn-ghost btn-sm w-fit">
          <PencilIcon className="size-3.5" /> Rename or retag
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[560px]">
        <form onSubmit={save} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Edit “{link.name}”</DialogTitle>
            <DialogDescription>
              The short link, its QR and everything it already brought stay the same. Posters carrying it keep working.
            </DialogDescription>
          </DialogHeader>
          <div>
            <label htmlFor="edit-link-name" className={label}>
              Name (only you see this)
            </label>
            <input id="edit-link-name" value={name} onChange={(e) => setName(e.target.value)} className={field} autoFocus />
            {errors.name ? <p className="text-refuse mt-1 text-[12px]">{errors.name}</p> : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="edit-link-source" className={label}>
                Source · utm_source
              </label>
              <select id="edit-link-source" value={source} onChange={(e) => setSource(e.target.value)} className={cn(field, "py-0")}>
                {sources.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
              {errors.utm_source ? <p className="text-refuse mt-1 text-[12px]">{errors.utm_source}</p> : null}
            </div>
            <div>
              <label htmlFor="edit-link-medium" className={label}>
                Medium · utm_medium
              </label>
              <select id="edit-link-medium" value={medium} onChange={(e) => setMedium(e.target.value)} className={cn(field, "py-0")}>
                {mediums.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="edit-link-campaign" className={label}>
                Campaign · utm_campaign
              </label>
              <input id="edit-link-campaign" value={campaign} onChange={(e) => setCampaign(e.target.value)} className={field} />
            </div>
            <div>
              <label htmlFor="edit-link-content" className={label}>
                Content · utm_content
              </label>
              <input id="edit-link-content" value={content} onChange={(e) => setContent(e.target.value)} className={field} />
            </div>
          </div>
          <DialogFooter>
            <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)} disabled={update.isPending}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={update.isPending}>
              {update.isPending ? <Loader2Icon className="size-4 animate-spin" /> : null}
              {update.isPending ? "Saving…" : "Save"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
