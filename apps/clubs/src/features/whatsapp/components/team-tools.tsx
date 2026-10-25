"use client";

import * as React from "react";
import { BanIcon, Loader2Icon, MoreHorizontalIcon, StickyNoteIcon, Trash2Icon, UserRoundIcon } from "lucide-react";
import { formatDateTime } from "@moa/app-kit";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  NativeSelect,
  Notice,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Textarea,
  buttonVariants,
  cn,
  toast,
} from "@moa/ui";

import { isPlanLockError } from "@/features/plan";

import { errorText, offersLocalBlock, useAddNote, useAssign, useBlock, useDeleteNote, useNotes, useOptOut, useTeam, useUnblock } from "../queries";
import { NOTE_MAX, blockedText, contactName, optOutText, type Conversation } from "../schemas";

/**
 * What the team sees above a conversation: that they opted out (and why),
 * or that the club blocked them. Calm, in words, and always shown while it holds.
 */
export function ThreadBanners({ conv }: { conv: Conversation }) {
  const unblock = useUnblock();
  return (
    <>
      {conv.blocked ? (
        <Notice
          tone="refuse"
          tag="Blocked"
          action={
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={unblock.isPending}
              onClick={() =>
                unblock.mutate(
                  { id: conv.id },
                  { onSuccess: () => toast.success("Unblocked."), onError: (e) => (isPlanLockError(e) ? null : toast.error(errorText(e))) },
                )
              }
            >
              {unblock.isPending ? <Loader2Icon className="size-3.5 animate-spin" /> : null} Unblock
            </button>
          }
        >
          {blockedText(conv.blocked)}
        </Notice>
      ) : null}
      {conv.opt_out ? (
        <Notice tone={conv.opt_out.scope === "all" ? "caution" : "neutral"} tag={conv.opt_out.scope === "all" ? "Opted out" : "No marketing"}>
          {optOutText(conv.opt_out)}
        </Notice>
      ) : null}
    </>
  );
}

/** Who answers it: nobody yet, the owner, or a member with the WhatsApp permission. */
export function AssignControl({ conv }: { conv: Conversation }) {
  const team = useTeam();
  const assign = useAssign();
  const value = conv.assignee?.key ?? (conv.assignee?.kind === "owner" ? "owner" : conv.assignee?.member_id ? `member:${conv.assignee.member_id}` : "");
  const people = team.data?.items ?? [];
  const known = people.some((p) => p.key === value);
  return (
    <label className="flex items-center gap-1.5">
      <UserRoundIcon className="text-ink-3 size-3.5" aria-hidden="true" />
      <span className="sr-only">Assigned to</span>
      <NativeSelect
        size="sm"
        aria-label="Assigned to"
        className="w-[160px]"
        value={value}
        disabled={assign.isPending || team.isPending}
        onChange={(e) => {
          const next = e.target.value;
          const memberId = next.startsWith("member:") ? Number(next.slice(7)) : null;
          assign.mutate(
            { id: conv.id, owner: next === "owner", memberId },
            {
              onSuccess: (c) => toast.success(c.assignee ? `Assigned to ${c.assignee.name ?? "them"}.` : "Unassigned."),
              onError: (e) => (isPlanLockError(e) ? null : toast.error(errorText(e))),
            },
          );
        }}
      >
        <option value="">Unassigned</option>
        {people.map((p) => (
          <option key={p.key} value={p.key}>
            {p.me ? `${p.name} (you)` : p.name}
          </option>
        ))}
        {value && !known ? <option value={value}>{conv.assignee?.name ?? "Someone"}</option> : null}
      </NativeSelect>
    </label>
  );
}

type Asking = null | "block" | "local" | "optout" | "optin";

/**
 * The conversation's other actions: block them (at WhatsApp, or -- after 24
 * hours, or when WhatsApp says no -- here only), and opt them out or back in
 * on their word. Each asks first, and says what it does.
 */
export function ConversationActions({ conv }: { conv: Conversation }) {
  const block = useBlock();
  const unblock = useUnblock();
  const opt = useOptOut();
  const [open, setOpen] = React.useState(false);
  const [asking, setAsking] = React.useState<Asking>(null);
  const [offerLocal, setOfferLocal] = React.useState<string | null>(null);
  const busy = block.isPending || unblock.isPending || opt.isPending;
  const name = contactName(conv);
  const optedOutAll = conv.opt_out?.scope === "all";
  const theirs = conv.opt_out && conv.opt_out.source !== "team" && conv.opt_out.source !== "keyword";

  const fail = (e: unknown) => {
    if (!isPlanLockError(e)) toast.error(errorText(e));
  };
  const doBlock = (localOnly: boolean) =>
    block.mutate(
      { id: conv.id, localOnly },
      {
        onSuccess: () => {
          setOfferLocal(null);
          toast.success(localOnly ? `Blocked ${name} here.` : `Blocked ${name}.`);
        },
        onError: (e) => {
          if (!localOnly && offersLocalBlock(e)) setOfferLocal(errorText(e));
          else fail(e);
        },
      },
    );

  const pick = (what: Asking) => {
    setOpen(false);
    setAsking(what);
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button type="button" className="btn btn-ghost btn-sm" aria-label="More actions" disabled={busy}>
            {busy ? <Loader2Icon className="size-4 animate-spin" /> : <MoreHorizontalIcon className="size-4" />}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="flex w-[240px] flex-col p-1">
          {conv.blocked ? (
            <button type="button" className="hover:bg-sunken rounded-lg px-2.5 py-2 text-left text-[13px]" onClick={() => {
              setOpen(false);
              unblock.mutate({ id: conv.id }, { onSuccess: () => toast.success("Unblocked."), onError: fail });
            }}>
              Unblock
            </button>
          ) : (
            <>
              <button type="button" className="hover:bg-sunken text-refuse rounded-lg px-2.5 py-2 text-left text-[13px]" onClick={() => pick("block")}>
                <BanIcon className="mr-1.5 inline size-3.5" aria-hidden="true" />
                Block {name}
              </button>
              <button type="button" className="hover:bg-sunken rounded-lg px-2.5 py-2 text-left text-[13px]" onClick={() => pick("local")}>
                Block here only
              </button>
            </>
          )}
          {optedOutAll ? (
            <button type="button" className="hover:bg-sunken rounded-lg px-2.5 py-2 text-left text-[13px]" onClick={() => pick("optin")}>
              Opt them back in
            </button>
          ) : (
            <button type="button" className="hover:bg-sunken rounded-lg px-2.5 py-2 text-left text-[13px]" onClick={() => pick("optout")}>
              Opt them out of WhatsApp
            </button>
          )}
          {theirs ? <p className="text-ink-3 m-0 px-2.5 py-1.5 text-[11.5px]">They stopped marketing in WhatsApp themselves: only they can undo that.</p> : null}
        </PopoverContent>
      </Popover>

      {offerLocal ? (
        <Notice
          tone="caution"
          tag="Not blocked"
          className="basis-full"
          action={
            <div className="flex gap-1.5">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => doBlock(true)} disabled={busy}>
                Block here instead
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOfferLocal(null)}>
                Not now
              </button>
            </div>
          }
        >
          {offerLocal}
        </Notice>
      ) : null}

      <AlertDialog open={asking !== null} onOpenChange={(o) => (o ? null : setAsking(null))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {asking === "block"
                ? `Block ${name}?`
                : asking === "local"
                  ? `Block ${name} here only?`
                  : asking === "optout"
                    ? `Opt ${name} out of your WhatsApp?`
                    : `Opt ${name} back in?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {asking === "block"
                ? "They won't be able to write to your number, and nothing is sent to them. WhatsApp allows this only within 24 hours of their last message."
                : asking === "local"
                  ? "WhatsApp isn't told: they can still write, but their messages go to Blocked with no alerts, and nothing can be sent to them."
                  : asking === "optout"
                    ? "Only on their word. No templates go to them, and their tickets and reminders skip WhatsApp (email still goes). You can still answer when they write."
                    : "Only if they asked you to. Templates and their tickets on WhatsApp go to them again."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={cn(asking === "block" || asking === "local" ? buttonVariants({ variant: "destructive" }) : undefined)}
              onClick={() => {
                const what = asking;
                setAsking(null);
                if (what === "block") doBlock(false);
                else if (what === "local") doBlock(true);
                else if (what === "optout") opt.mutate({ id: conv.id, out: true }, { onSuccess: () => toast.success("Opted out."), onError: fail });
                else if (what === "optin") opt.mutate({ id: conv.id, out: false }, { onSuccess: () => toast.success("Opted back in."), onError: fail });
              }}
            >
              {asking === "block" ? "Block" : asking === "local" ? "Block here" : asking === "optout" ? "Opt out" : "Opt in"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/**
 * The team's notes on a conversation: for the people who can read the inbox,
 * never sent. Whoever wrote one, or the club's owner, can delete it.
 */
export function NotesPanel({ conv }: { conv: Conversation }) {
  const notes = useNotes(conv.id);
  const add = useAddNote(conv.id);
  const remove = useDeleteNote(conv.id);
  const [text, setText] = React.useState("");
  const id = React.useId();
  const items = notes.data?.items ?? [];
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body || add.isPending) return;
    add.mutate(body, { onSuccess: () => setText(""), onError: (err) => toast.error(errorText(err)) });
  };
  return (
    <section className="bg-sunken/60 border-line-soft flex shrink-0 flex-col gap-2 border-b p-3" aria-label="Team notes">
      <div className="flex items-center gap-1.5">
        <StickyNoteIcon className="text-ink-3 size-3.5" aria-hidden="true" />
        <span className="eyebrow">Notes for the team · never sent</span>
      </div>
      {notes.isPending ? (
        <p className="text-ink-3 m-0 text-[12px]">Loading notes…</p>
      ) : items.length === 0 ? (
        <p className="text-ink-3 m-0 text-[12px]">No notes yet.</p>
      ) : (
        <ul className="m-0 flex max-h-40 list-none flex-col gap-1.5 overflow-y-auto p-0">
          {items.map((n) => (
            <li key={n.id} className="bg-surface flex items-start gap-2 rounded-lg px-2.5 py-1.5 text-[12.5px]">
              <div className="min-w-0 flex-1">
                <p className="text-ink m-0 break-words whitespace-pre-wrap">{n.body}</p>
                <p className="text-ink-3 m-0 text-[11px]">
                  {n.author} · <time dateTime={n.created_at}>{formatDateTime(n.created_at)}</time>
                </p>
              </div>
              {n.can_delete ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-xs text-refuse"
                  aria-label={`Delete the note by ${n.author}`}
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(n.id, { onError: (err) => toast.error(errorText(err)) })}
                >
                  <Trash2Icon className="size-3.5" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={submit} className="flex items-end gap-2">
        <Textarea
          id={id}
          aria-label="New note"
          placeholder="A note for the team"
          rows={1}
          maxLength={NOTE_MAX}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="min-h-[36px] flex-1 resize-y text-[12.5px]"
        />
        <button type="submit" className="btn btn-secondary btn-sm" disabled={add.isPending || !text.trim()}>
          {add.isPending ? <Loader2Icon className="size-3.5 animate-spin" /> : null} Add note
        </button>
      </form>
      {text.length > NOTE_MAX - 100 ? <p className="text-ink-3 m-0 text-[11px]">{NOTE_MAX - text.length} characters left</p> : null}
    </section>
  );
}
