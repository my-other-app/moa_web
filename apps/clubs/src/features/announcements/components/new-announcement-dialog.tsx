"use client";

import * as React from "react";
import { Loader2Icon, MegaphoneIcon, SendIcon } from "lucide-react";
import { formatDate } from "@moa/app-kit";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, cn } from "@moa/ui";

import { useClubEvents } from "@/features/events";

import { useSendAnnouncement } from "../queries";
import { AUDIENCES, sendAnnouncementSchema } from "../schemas";

/**
 * Send an announcement from the Announcements page itself: pick the event,
 * the audience, write the title and the message. The same endpoint the
 * event console uses; when it declines (nobody registered, nobody with the
 * app), its reason is shown instead of a false "sent".
 */
const field = "input h-10 w-full";
const label = "eyebrow mb-1.5 block";

export function NewAnnouncementDialog() {
  const [open, setOpen] = React.useState(false);
  const [eventId, setEventId] = React.useState("");
  const [audience, setAudience] = React.useState<(typeof AUDIENCES)[number]["value"]>("all");
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const events = useClubEvents({ offset: 0, limit: 100 });
  const send = useSendAnnouncement();
  const list = events.data?.items ?? [];

  const reset = () => {
    setEventId("");
    setAudience("all");
    setTitle("");
    setBody("");
    setErrors({});
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!eventId) next.event = "Pick the event";
    const parsed = sendAnnouncementSchema.safeParse({ title, body, audience });
    if (!parsed.success) for (const i of parsed.error.issues) next[String(i.path[0] ?? "form")] = i.message;
    setErrors(next);
    if (Object.keys(next).length > 0 || !parsed.success) return;
    await send.mutateAsync({ eventId: Number(eventId), input: parsed.data });
    reset();
    setOpen(false);
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
        <button type="button" className="btn btn-primary h-9">
          <MegaphoneIcon className="size-4" /> New announcement
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New announcement</DialogTitle>
          <DialogDescription>A push notification to the phones of people registered for one event. It cannot be unsent.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="flex flex-col gap-3">
          <div>
            <label htmlFor="ann-event" className={label}>Event</label>
            <select id="ann-event" className={cn(field, "py-0")} value={eventId} onChange={(e) => setEventId(e.target.value)} disabled={send.isPending}>
              <option value="">{events.isPending ? "Loading events…" : list.length === 0 ? "No events yet" : "Choose an event"}</option>
              {list.map((ev) => (
                <option key={ev.id} value={String(ev.id)}>
                  {ev.name}
                  {ev.event_datetime ? ` · ${formatDate(ev.event_datetime)}` : ""}
                </option>
              ))}
            </select>
            {errors.event && <p className="text-refuse mt-1 text-[12px]">{errors.event}</p>}
          </div>
          <div>
            <label htmlFor="ann-audience" className={label}>Who gets it</label>
            <select id="ann-audience" className={cn(field, "py-0")} value={audience} onChange={(e) => setAudience(e.target.value as typeof audience)} disabled={send.isPending}>
              {AUDIENCES.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="ann-title" className={label}>Title</label>
            <input id="ann-title" className={field} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Venue change" maxLength={120} disabled={send.isPending} />
            {errors.title && <p className="text-refuse mt-1 text-[12px]">{errors.title}</p>}
          </div>
          <div>
            <label htmlFor="ann-body" className={label}>Message</label>
            <textarea id="ann-body" rows={4} className="input min-h-[96px] w-full py-2" value={body} onChange={(e) => setBody(e.target.value)} placeholder="We've moved to Hall B." maxLength={1000} disabled={send.isPending} />
            <div className="flex items-baseline justify-between">
              {errors.body ? <p className="text-refuse mt-1 text-[12px]">{errors.body}</p> : <span />}
              <p className="micro text-ink-3 mt-1">{body.trim().length} / 1,000</p>
            </div>
          </div>
          <DialogFooter>
            <button type="button" className="btn btn-ghost h-9" onClick={() => setOpen(false)} disabled={send.isPending}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary h-9" disabled={send.isPending}>
              {send.isPending ? <Loader2Icon className="size-4 animate-spin" /> : <SendIcon className="size-4" />} {send.isPending ? "Sending…" : "Send"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
