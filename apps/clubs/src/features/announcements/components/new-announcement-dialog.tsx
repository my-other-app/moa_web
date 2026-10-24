"use client";

import * as React from "react";
import { Loader2Icon, LockIcon, MegaphoneIcon, SendIcon } from "lucide-react";
import { formatDate, formatNumber } from "@moa/app-kit";
import {
  ChoiceCard,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@moa/ui";

import { WriteWithAi } from "@/features/ai";
import { useClubEvents } from "@/features/events";
import { useLimitGate } from "@/features/plan";

import { usePushAudience, useSendAnnouncement } from "../queries";
import { AUDIENCES, sendAnnouncementSchema } from "../schemas";

/**
 * Send an announcement from the Announcements page: pick the event, see
 * who each audience reaches before choosing one, write the title and the
 * message, and see the notification as the phone shows it. The same
 * endpoint the event console uses; when it declines (nobody registered,
 * nobody with the app), its reason is shown instead of a false "sent".
 */
const field = "input h-10 w-full";
const label = "eyebrow mb-1.5 block";

export function NewAnnouncementDialog() {
  const [open, setOpen] = React.useState(false);
  const [eventId, setEventId] = React.useState("");
  const [audience, setAudience] =
    React.useState<(typeof AUDIENCES)[number]["value"]>("all");
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const events = useClubEvents({ offset: 0, limit: 100 });
  const reach = usePushAudience(eventId ? Number(eventId) : null);
  const send = useSendAnnouncement();
  // The month's announcements are counted: at the cap the button opens the upgrade dialog.
  const monthly = useLimitGate("announcements_per_month");
  const list = events.data?.items ?? [];
  const picked = list.find((e) => String(e.id) === eventId);
  const r = reach.data?.by_audience[audience];

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
    if (!parsed.success)
      for (const i of parsed.error.issues)
        next[String(i.path[0] ?? "form")] = i.message;
    setErrors(next);
    if (Object.keys(next).length > 0 || !parsed.success) return;
    await send.mutateAsync({ eventId: Number(eventId), input: parsed.data });
    reset();
    setOpen(false);
  };

  if (monthly.locked) {
    return (
      <button type="button" className="btn btn-primary" onClick={monthly.prompt}>
        <LockIcon className="size-4" /> New announcement
      </button>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <button type="button" className="btn btn-primary">
          <MegaphoneIcon className="size-4" /> New announcement
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>New announcement</DialogTitle>
          <DialogDescription>
            A push notification to the phones of people registered for one
            event. It cannot be unsent.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={submit}
          noValidate
          className="grid gap-4 sm:grid-cols-[1fr_220px]"
        >
          <div className="flex flex-col gap-3">
            <div>
              <label htmlFor="ann-event" className={label}>
                Event
              </label>
              <select
                id="ann-event"
                className={field}
                value={eventId}
                onChange={(e) => setEventId(e.target.value)}
                disabled={send.isPending}
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
              {errors.event && (
                <p className="text-refuse mt-1 text-[12px]">{errors.event}</p>
              )}
            </div>
            <div>
              <span className={label}>Who gets it</span>
              <div
                className="grid gap-1.5"
                role="radiogroup"
                aria-label="Who gets it"
              >
                {AUDIENCES.map((a) => {
                  const n = reach.data?.by_audience[a.value];
                  return (
                    <ChoiceCard
                      key={a.value}
                      checked={audience === a.value}
                      onClick={() => setAudience(a.value)}
                      disabled={send.isPending}
                      title={a.label}
                      right={
                        n
                          ? `${formatNumber(n.reachable)} of ${formatNumber(n.people)} reachable`
                          : eventId
                            ? "…"
                            : ""
                      }
                    />
                  );
                })}
              </div>
              {r && r.people > 0 && r.reachable === 0 ? (
                <p className="text-caution mt-1.5 text-[12px]">
                  Nobody in this audience is signed in to the app on a phone, so
                  the push would reach no one. An email would.
                </p>
              ) : null}
            </div>
            <div>
              <label htmlFor="ann-title" className={label}>
                Title
              </label>
              <input
                id="ann-title"
                className={field}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Venue change"
                maxLength={120}
                disabled={send.isPending}
              />
              {errors.title && (
                <p className="text-refuse mt-1 text-[12px]">{errors.title}</p>
              )}
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <label htmlFor="ann-body" className="eyebrow">
                  Message
                </label>
                <WriteWithAi
                  kind="announcement"
                  eventId={eventId ? Number(eventId) : null}
                  value={body}
                  onChange={setBody}
                  // The reply's subject is the push's title.
                  subject={{ value: title, onChange: (t) => setTitle(t.slice(0, 120)) }}
                  maxLength={1000}
                />
              </div>
              <textarea
                id="ann-body"
                rows={4}
                className="input min-h-[96px] w-full py-2"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="We've moved to Hall B — same time."
                maxLength={1000}
                disabled={send.isPending}
              />
              <div className="flex items-baseline justify-between">
                {errors.body ? (
                  <p className="text-refuse mt-1 text-[12px]">{errors.body}</p>
                ) : (
                  <span className="text-ink-3 mt-1 text-[11.5px]">
                    The first line is what shows on a locked phone.
                  </span>
                )}
                <p className="micro text-ink-3 mt-1">
                  {body.trim().length} / 1,000
                </p>
              </div>
            </div>
          </div>

          <aside className="flex flex-col gap-2">
            <span className={label}>On the phone</span>
            <div className="bg-sunken rounded-[22px] p-3">
              <div className="bg-surface shadow-card rounded-2xl p-3">
                <div className="flex items-center gap-2">
                  <span className="bg-brand grid size-5 place-items-center rounded-md text-[9px] font-bold text-white">
                    M
                  </span>
                  <span className="text-ink-3 text-[10px] tracking-[0.04em] uppercase">
                    MyOtherApp · now
                  </span>
                </div>
                <p className="text-ink mt-1.5 truncate text-[13px] font-semibold">
                  {title.trim() || "Title"}
                </p>
                <p className="text-ink-2 line-clamp-3 text-[12.5px] leading-[1.4]">
                  {body.trim() ||
                    "Your message, as it reads on a locked phone."}
                </p>
              </div>
            </div>
            {picked ? (
              <p className="text-ink-3 text-[11.5px]">
                Opens the page for {picked.name}.
              </p>
            ) : null}
          </aside>

          <DialogFooter className="sm:col-span-2">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setOpen(false)}
              disabled={send.isPending}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={send.isPending}
            >
              {send.isPending ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <SendIcon className="size-4" />
              )}{" "}
              {send.isPending
                ? "Sending…"
                : r
                  ? `Send to ${formatNumber(r.reachable)} ${r.reachable === 1 ? "phone" : "phones"}`
                  : "Send"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
