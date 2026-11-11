"use client";

import * as React from "react";
import { Loader2Icon, PlusIcon, UserPlusIcon } from "lucide-react";
import { formatDate } from "@moa/app-kit";
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, InitialsAvatar, SearchField } from "@moa/ui";
import { useDebouncedValue } from "@moa/ui/hooks";

import { useSpeakerSuggestions } from "../queries";
import type { Suggestion } from "../schemas";

function Row({ s, onPick }: { s: Suggestion; onPick: () => void }) {
  const photo = s.photo?.thumbnail ?? s.photo?.medium ?? null;
  const where = s.own ? (s.last_talk ? `spoke at ${s.last_talk.event_name}${s.last_talk.date ? `, ${formatDate(s.last_talk.date)}` : ""}` : "spoke at your events") : "has a public speaker profile";
  return (
    <li>
      <button type="button" onClick={onPick} className="hover:bg-sunken flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left" aria-label={`Pick ${s.name}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- the API's own small photo */}
        {photo ? <img src={photo} alt="" className="size-9 rounded-full object-cover" /> : <InitialsAvatar name={s.name} size={36} />}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-medium">{s.name}</span>
          <span className="text-ink-3 block truncate text-[12px]">{[s.headline, where].filter(Boolean).join(" · ")}</span>
        </span>
        <PlusIcon className="text-ink-3 size-4" aria-hidden="true" />
      </button>
    </li>
  );
}

/**
 * "Add a speaker": the club's past speakers first, found by name, so nobody
 * is typed twice; picking one fills in their photo, line, bio and link
 * (still editable for this event). Someone new starts a blank row with the
 * name typed.
 */
export function SpeakerPicker({
  open,
  onOpenChange,
  onPick,
  onNew,
  exclude = [],
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (s: Suggestion) => void;
  onNew: (name: string) => void;
  /** Profiles already on the event. */
  exclude?: readonly number[];
}) {
  const [q, setQ] = React.useState("");
  const typed = useDebouncedValue(q, 200);
  const found = useSpeakerSuggestions(typed, open);
  const list = (found.data ?? []).filter((s) => !exclude.includes(s.profile_id));
  const close = () => {
    onOpenChange(false);
    setQ("");
  };
  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a speaker</DialogTitle>
          <DialogDescription>Your club&apos;s past speakers come first. Pick one to fill in their details, or add someone new.</DialogDescription>
        </DialogHeader>
        <SearchField label="Find a speaker" placeholder="Type a name" value={q} onChange={setQ} autoFocus />
        <div className="max-h-[50vh] min-h-[120px] overflow-y-auto">
          {found.isPending ? <Loader2Icon className="text-ink-3 mx-auto my-6 size-5 animate-spin" /> : null}
          {!found.isPending && list.length === 0 ? (
            <p className="text-ink-3 m-0 py-4 text-center text-[13px]">{typed.trim() ? `Nobody called “${typed.trim()}” has spoken at your events yet.` : "No past speakers yet."}</p>
          ) : null}
          <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
            {list.map((s) => (
              <Row
                key={s.profile_id}
                s={s}
                onPick={() => {
                  onPick(s);
                  close();
                }}
              />
            ))}
          </ul>
        </div>
        <Button
          type="button"
          variant="outline"
          className="self-start"
          onClick={() => {
            onNew(q.trim());
            close();
          }}
        >
          <UserPlusIcon /> {q.trim() ? `Add “${q.trim()}” as someone new` : "Add someone new"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
