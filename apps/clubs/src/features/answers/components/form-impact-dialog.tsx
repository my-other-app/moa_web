"use client";

import * as React from "react";
import { ClipboardListIcon, Loader2Icon } from "lucide-react";
import { ANSWER_TYPE_WORDS } from "@moa/questions";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
} from "@moa/ui";

import { peopleTotal, peopleWord, type FormImpact } from "../schemas";

const num = (n: number) => n.toLocaleString("en-IN");
const typeWord = (t: string) => ANSWER_TYPE_WORDS[t] ?? t;

/** One kind of change, with its questions, in the dialog. */
function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-1">
      <h3 className="eyebrow m-0">{title}</h3>
      <ul className="text-ink-2 m-0 grid list-disc gap-0.5 pl-5 text-[12.5px] leading-[1.5]">{children}</ul>
    </section>
  );
}

const nameOf = (q: { key: string; label: string | null }) => `“${q.label?.trim() || q.key}”`;

/**
 * Before saving a changed form of an event people signed up for
 * (missing-answers contract §1.3, §3 item 1): what it does to them, kind by
 * kind — questions added, now required, choices taken away (and who had
 * picked them), reworded (their answers kept), removed, a new answer type
 * (and how many answers won't fit it) — then Save or back to editing.
 * Nothing anyone answered is ever deleted.
 */
export function FormImpactDialog({ impact, saving, onSave, onCancel }: { impact: FormImpact; saving: boolean; onSave: () => void; onCancel: () => void }) {
  const p = impact.people;
  const who = [p.registrations ? `${num(p.registrations)} registered` : null, p.requests ? `${num(p.requests)} under review` : null].filter(Boolean).join(" and ");
  return (
    <AlertDialog open onOpenChange={(o) => !o && !saving && onCancel()}>
      <AlertDialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-[560px]">
        <AlertDialogHeader>
          <AlertDialogTitle>Change the questions for {peopleWord(peopleTotal(p))}?</AlertDialogTitle>
          <AlertDialogDescription>
            {who ? `${who[0]!.toUpperCase()}${who.slice(1)} already answered this form.` : "People already answered this form."} Every answer they gave is kept. Here is what changes for them.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid gap-3">
          {impact.added.length ? (
            <Group title="Added">
              {impact.added.map((q) => (
                <li key={q.key}>
                  {nameOf(q)} {q.required ? "must be answered" : "is optional"} — {q.askable ? `${peopleWord(q.askable)} haven't answered it yet` : "nobody it applies to yet"}
                </li>
              ))}
            </Group>
          ) : null}
          {impact.now_required.length ? (
            <Group title="Now required">
              {impact.now_required.map((q) => (
                <li key={q.key}>
                  {nameOf(q)} — {q.missing ? `${peopleWord(q.missing)} left it blank` : "everyone it applies to has answered"}
                </li>
              ))}
            </Group>
          ) : null}
          {impact.options_removed.length ? (
            <Group title="Choices taken away">
              {impact.options_removed.map((o) => (
                <li key={`${o.key}:${o.option}`}>
                  “{o.option}” from {nameOf(o)} — {o.chosen_by ? `${peopleWord(o.chosen_by)} picked it; their answer is kept but no longer counts` : "nobody picked it"}
                </li>
              ))}
            </Group>
          ) : null}
          {impact.relabelled.length ? (
            <Group title="Reworded — answers kept">
              {impact.relabelled.map((r) => (
                <li key={r.key}>
                  “{r.from?.trim() || r.key}” → “{r.to?.trim() || r.key}”
                </li>
              ))}
            </Group>
          ) : null}
          {impact.type_changed.length ? (
            <Group title="New answer type">
              {impact.type_changed.map((t) => (
                <li key={t.key}>
                  {nameOf(t)}: {typeWord(t.from)} → {typeWord(t.to)}
                  {t.invalid_after ? ` — ${num(t.invalid_after)} ${t.invalid_after === 1 ? "answer doesn't" : "answers don't"} fit the new type` : ""}
                </li>
              ))}
            </Group>
          ) : null}
          {impact.removed.length ? (
            <Group title="Removed">
              {impact.removed.map((q) => (
                <li key={q.key}>
                  {nameOf(q)}
                  {q.answered ? ` — ${num(q.answered)} ${q.answered === 1 ? "answer stays" : "answers stay"} on their records, no longer asked` : " — nobody had answered it"}
                </li>
              ))}
            </Group>
          ) : null}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={saving}>Back to editing</AlertDialogCancel>
          <Button onClick={onSave} disabled={saving}>
            {saving ? <Loader2Icon className="animate-spin" /> : null}
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Saved, and some of the people already signed up have new questions to
 * answer: ask them now (the Ask panel, with those questions ticked), or not
 * now (they can be asked later from Attendees, Review or Messages).
 */
export function AskAfterSaveDialog({ people, onAsk, onLater }: { people: number; onAsk: () => void; onLater: () => void }) {
  return (
    <AlertDialog open onOpenChange={(o) => !o && onLater()}>
      <AlertDialogContent className="sm:max-w-[480px]">
        <AlertDialogHeader>
          <AlertDialogTitle>Saved. Ask the people already signed up?</AlertDialogTitle>
          <AlertDialogDescription>
            {people ? `Up to ${peopleWord(people)} haven't answered the new questions yet.` : "Some people haven't answered the new questions yet."} One message with a personal link lets them add just those answers; their ticket stays as it is.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          {/* Cancel closes the dialog, and closing it is "not now" (onOpenChange). */}
          <AlertDialogCancel>Not now</AlertDialogCancel>
          <Button onClick={onAsk}>
            <ClipboardListIcon /> Ask them now
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
