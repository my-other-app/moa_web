"use client";

import * as React from "react";
import { Loader2Icon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { CardLabel, FigurePanel, NativeSelect, Notice, Switch, Textarea, toast } from "@moa/ui";

import { askNotifyPermission, chime, notifyPermission, useBrowserNotify } from "../alerts";
import {
  errorText,
  useDeleteReply,
  useInboxSettings,
  useSaveReply,
  useSavedReplies,
  useUpdateInboxSettings,
  useUpdateMyNotifications,
} from "../queries";
import { ALERT_HOURS, REPLY_BODY_MAX, REPLY_TITLE_MAX, SHORTCUT_RE, type SavedReply } from "../schemas";
import { Field } from "./shared";

/**
 * The inbox's own settings, for the people who use it (the owner and the
 * members with the WhatsApp permission):
 *
 * - when a conversation has waited too long (the team is told once a wait);
 * - the automatic answers to STOP and START;
 * - each person's own mails, and this browser's notifications;
 * - the club's saved replies.
 *
 * Not on a server without them (its routes answer a bare 404): then none is shown.
 */
export function InboxSettingsPanels() {
  const q = useInboxSettings();
  if (q.data === null) return null;
  if (q.isError) return <Notice tone="refuse" tag="Inbox">{errorText(q.error, "Couldn't load the inbox's settings.")}</Notice>;
  return (
    <>
      <AlertsPanel />
      <NotificationsPanel />
      <AutoRepliesPanel />
      <SavedRepliesPanel />
    </>
  );
}

function AlertsPanel() {
  const q = useInboxSettings();
  const update = useUpdateInboxSettings();
  const s = q.data;
  const hours = s?.alert_after_hours ?? 4;
  const options = (ALERT_HOURS as readonly number[]).includes(hours) ? ALERT_HOURS : [...ALERT_HOURS, hours].sort((a, b) => a - b);
  return (
    <FigurePanel className="flex flex-col gap-3 p-4" role="region" aria-label="Waiting too long">
      <CardLabel>Waiting too long</CardLabel>
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <label htmlFor="wa-alert-hours" className="text-ink text-[13.5px] font-medium">
            Tell the team when someone has waited
          </label>
          <p id="wa-alert-hours-help" className="text-ink-3 m-0 mt-0.5 text-[12px] leading-[1.5]">
            A notice in the bell and a mail, once for each wait, when a message has had no answer this long.
          </p>
        </div>
        <NativeSelect
          id="wa-alert-hours"
          aria-describedby="wa-alert-hours-help"
          size="sm"
          className="w-[140px]"
          value={String(hours)}
          disabled={!s || update.isPending}
          onChange={(e) =>
            update.mutate(
              { alert_after_hours: Number(e.target.value) },
              { onSuccess: () => toast.success("Saved."), onError: (err) => toast.error(errorText(err)) },
            )
          }
        >
          {options.map((h) => (
            <option key={h} value={h}>
              {h} hour{h === 1 ? "" : "s"}
            </option>
          ))}
        </NativeSelect>
      </div>
    </FigurePanel>
  );
}

function NotificationsPanel() {
  const q = useInboxSettings();
  const update = useUpdateMyNotifications();
  const me = q.data?.me ?? { email_messages: true, email_assigned: true };
  const [browser, setBrowser] = useBrowserNotify();
  const [permission, setPermission] = React.useState(() => notifyPermission());
  const change = (body: Partial<typeof me>) => update.mutate(body, { onError: (err) => toast.error(errorText(err)) });
  const turnOn = async (on: boolean) => {
    if (!on) {
      setBrowser({ ...browser, enabled: false });
      return;
    }
    const answer = await askNotifyPermission();
    setPermission(answer);
    if (answer === "granted") setBrowser({ ...browser, enabled: true });
    else toast.error(answer === "unsupported" ? "This browser can't show notifications." : "The browser blocked notifications for this site. Allow them in its settings.");
  };
  return (
    <FigurePanel className="flex flex-col gap-3 p-4" role="region" aria-label="Your notifications">
      <CardLabel>Your notifications</CardLabel>
      <Toggle
        id="wa-email-messages"
        label="Mail me about unread messages"
        help="When a message has waited unread 15 minutes (at most one mail an hour), and when someone has waited too long. Names and counts only."
        checked={me.email_messages}
        disabled={!q.data || update.isPending}
        onChange={(on) => change({ email_messages: on })}
      />
      <Toggle
        id="wa-email-assigned"
        label="Mail me when a conversation is assigned to me"
        help="Who assigned it and the contact's name: nothing they wrote."
        checked={me.email_assigned}
        disabled={!q.data || update.isPending}
        onChange={(on) => change({ email_assigned: on })}
      />
      <div className="border-line-soft flex flex-col gap-3 border-t pt-3">
        <Toggle
          id="wa-browser"
          label="Notify me in this browser"
          help={
            permission === "unsupported"
              ? "This browser can't show notifications."
              : permission === "denied"
                ? "The browser blocks notifications for this site: allow them in its settings first."
                : "While the inbox is open in a tab you aren't looking at. This browser only; who wrote, never what."
          }
          checked={browser.enabled && permission === "granted"}
          disabled={permission === "unsupported"}
          onChange={(on) => void turnOn(on)}
        />
        <Toggle
          id="wa-sound"
          label="With a sound"
          help="A short chime with each new message."
          checked={browser.sound}
          disabled={!browser.enabled || permission !== "granted"}
          onChange={(on) => {
            setBrowser({ ...browser, sound: on });
            if (on) chime();
          }}
        />
      </div>
    </FigurePanel>
  );
}

function Toggle({ id, label, help, checked, disabled, onChange }: { id: string; label: string; help: string; checked: boolean; disabled?: boolean; onChange: (on: boolean) => void }) {
  return (
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className="text-ink text-[13.5px] font-medium">
          {label}
        </label>
        <p id={`${id}-help`} className="text-ink-3 m-0 mt-0.5 text-[12px] leading-[1.5]">
          {help}
        </p>
      </div>
      <Switch id={id} aria-describedby={`${id}-help`} checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  );
}

function AutoRepliesPanel() {
  const q = useInboxSettings();
  const update = useUpdateInboxSettings();
  const s = q.data;
  const [stop, setStop] = React.useState<string | null>(null);
  const [start, setStart] = React.useState<string | null>(null);
  const stopValue = stop ?? s?.stop_reply ?? "";
  const startValue = start ?? s?.start_reply ?? "";
  const dirty = stop !== null || start !== null;
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    update.mutate(
      { ...(stop !== null ? { stop_reply: stop } : {}), ...(start !== null ? { start_reply: start } : {}) },
      {
        onSuccess: () => {
          setStop(null);
          setStart(null);
          toast.success("Saved.");
        },
        onError: (err) => toast.error(errorText(err)),
      },
    );
  };
  return (
    <FigurePanel className="flex flex-col gap-3 p-4" role="region" aria-label="STOP and START">
      <CardLabel>STOP and START</CardLabel>
      <p className="text-ink-2 m-0 text-[12.5px] leading-[1.55]">
        Someone who writes STOP (or UNSUBSCRIBE, OPT OUT) gets no templates from your number, and their tickets skip WhatsApp. START opts them back in. Each is
        answered at once with these words; leave one empty for ours. {"{club}"} is your club&apos;s name.
      </p>
      <form onSubmit={save} className="flex flex-col gap-3">
        <Field id="wa-stop-reply" label="Answer to STOP">
          <Textarea id="wa-stop-reply" rows={2} maxLength={1000} placeholder={s?.stop_reply_default} value={stopValue} onChange={(e) => setStop(e.target.value)} />
        </Field>
        <Field id="wa-start-reply" label="Answer to START">
          <Textarea id="wa-start-reply" rows={2} maxLength={1000} placeholder={s?.start_reply_default} value={startValue} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <button type="submit" className="btn btn-secondary btn-sm self-start" disabled={!dirty || update.isPending}>
          {update.isPending ? <Loader2Icon className="size-3.5 animate-spin" /> : null} Save answers
        </button>
      </form>
    </FigurePanel>
  );
}

type Draft = { id: number | null; title: string; body: string; shortcut: string };
const NEW: Draft = { id: null, title: "", body: "", shortcut: "" };

/** A saved reply checked as the server will: the first problem, on its field. */
export function checkSavedReply(d: Draft): { field: "title" | "body" | "shortcut"; text: string } | null {
  if (!d.title.trim()) return { field: "title", text: "Give it a title." };
  if (d.title.trim().length > REPLY_TITLE_MAX) return { field: "title", text: `A title is at most ${REPLY_TITLE_MAX} characters.` };
  if (!d.body.trim()) return { field: "body", text: "Write the reply." };
  if (d.body.trim().length > REPLY_BODY_MAX) return { field: "body", text: `A reply is at most ${REPLY_BODY_MAX} characters.` };
  const sc = d.shortcut.trim().replace(/^\//, "").toLowerCase();
  if (sc && !SHORTCUT_RE.test(sc)) return { field: "shortcut", text: "One word: letters, digits, - and _ (like /parking)." };
  return null;
}

function SavedRepliesPanel() {
  const q = useSavedReplies();
  const save = useSaveReply();
  const remove = useDeleteReply();
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [problem, setProblem] = React.useState<{ field: string; text: string } | null>(null);
  const items = q.data?.items ?? [];
  const edit = (r: SavedReply) => {
    setProblem(null);
    setDraft({ id: r.id, title: r.title, body: r.body, shortcut: r.shortcut ?? "" });
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    const p = checkSavedReply(draft);
    if (p) {
      setProblem(p);
      return;
    }
    setProblem(null);
    save.mutate(
      { id: draft.id, body: { title: draft.title.trim(), body: draft.body.trim(), shortcut: draft.shortcut.trim().replace(/^\//, "").toLowerCase() || null } },
      {
        onSuccess: () => {
          setDraft(null);
          toast.success("Saved.");
        },
        onError: (err) => {
          const field = (err as { fieldErrors?: { field?: unknown } }).fieldErrors?.field;
          setProblem({ field: typeof field === "string" ? field : "form", text: errorText(err) });
        },
      },
    );
  };
  const err = (field: string) => (problem?.field === field ? problem.text : null);
  return (
    <FigurePanel className="flex flex-col gap-3 p-4" role="region" aria-label="Saved replies">
      <CardLabel
        right={
          draft ? null : (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDraft(NEW)}>
              <PlusIcon className="size-3.5" /> New
            </button>
          )
        }
      >
        Saved replies
      </CardLabel>
      <p className="text-ink-2 m-0 text-[12.5px] leading-[1.55]">
        Type <kbd className="font-mono">/</kbd> in the reply box to use one. {"{name}"} becomes the person&apos;s name.
      </p>
      {draft ? (
        <form onSubmit={submit} className="bg-sunken flex flex-col gap-2.5 rounded-xl p-3" aria-label={draft.id ? "Change the saved reply" : "New saved reply"} noValidate>
          <div className="grid gap-2.5 sm:grid-cols-[1fr_160px]">
            <Field id="wa-reply-title" label="Title" error={err("title")}>
              <input id="wa-reply-title" className="input h-9" maxLength={REPLY_TITLE_MAX} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            </Field>
            <Field id="wa-reply-shortcut" label="Shortcut (optional)" error={err("shortcut")}>
              <input
                id="wa-reply-shortcut"
                className="input h-9 font-mono"
                placeholder="/parking"
                maxLength={32}
                value={draft.shortcut}
                onChange={(e) => setDraft({ ...draft, shortcut: e.target.value })}
              />
            </Field>
          </div>
          <Field id="wa-reply-body" label="Reply" error={err("body")}>
            <Textarea id="wa-reply-body" rows={3} maxLength={REPLY_BODY_MAX} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
          </Field>
          {problem && problem.field === "form" ? (
            <Notice tone="refuse" tag="Not saved">
              {problem.text}
            </Notice>
          ) : null}
          <div className="flex gap-2">
            <button type="submit" className="btn btn-primary btn-sm" disabled={save.isPending}>
              {save.isPending ? <Loader2Icon className="size-3.5 animate-spin" /> : null} Save
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDraft(null)}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}
      {q.isPending ? (
        <p className="text-ink-3 m-0 text-[12.5px]">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-ink-3 m-0 text-[12.5px]">None yet.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {items.map((r) => (
            <li key={r.id} className="border-line-soft flex items-start gap-2 border-b py-2 last:border-0">
              <div className="min-w-0 flex-1">
                <p className="text-ink m-0 text-[13px] font-medium">
                  {r.title}
                  {r.shortcut ? <span className="text-ink-3 ml-1.5 font-mono text-[11.5px]">/{r.shortcut}</span> : null}
                </p>
                <p className="text-ink-3 m-0 line-clamp-2 text-[12px] whitespace-pre-wrap">{r.body}</p>
              </div>
              <button type="button" className="btn btn-ghost btn-xs" aria-label={`Change ${r.title}`} onClick={() => edit(r)}>
                <PencilIcon className="size-3.5" />
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-xs text-refuse"
                aria-label={`Delete ${r.title}`}
                disabled={remove.isPending}
                onClick={() => remove.mutate(r.id, { onSuccess: () => toast.success("Deleted."), onError: (err) => toast.error(errorText(err)) })}
              >
                <Trash2Icon className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </FigurePanel>
  );
}

