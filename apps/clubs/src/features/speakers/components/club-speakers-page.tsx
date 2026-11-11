"use client";

import * as React from "react";
import { CalendarSyncIcon, FileSpreadsheetIcon, Loader2Icon, ServerOffIcon } from "lucide-react";
import { fetchExport, formatDate, formatNumber, saveBlob } from "@moa/app-kit";
import { Button, Checkbox, EmptyState, InitialsAvatar, Input, Label, Notice, Pager, SearchField, Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, Skeleton, Textarea, toast } from "@moa/ui";

import { clubSpeakersExportUrl } from "../api";
import { useApplyToUpcoming, useClubSpeaker, useClubSpeakers, useSaveContact } from "../queries";
import { LINK_LABEL, lastTalkLabel, needsConsent, type ClubSpeakerDetail } from "../schemas";

const PAGE = 50;

function Photo({ s, size = 36 }: { s: { name: string; photo?: { thumbnail?: string | null; medium?: string | null } | null }; size?: number }) {
  const src = s.photo?.thumbnail ?? s.photo?.medium ?? null;
  // eslint-disable-next-line @next/next/no-img-element -- the API's own small photo
  return src ? <img src={src} alt="" style={{ width: size, height: size }} className="rounded-full object-cover" /> : <InitialsAvatar name={s.name} size={size} />;
}

/** The club's own contact for a speaker: an email or phone it did not have needs the tick that they agreed. */
function ContactForm({ speaker }: { speaker: ClubSpeakerDetail }) {
  const save = useSaveContact(speaker.profile_id);
  const saved = speaker.contact ?? null;
  const [email, setEmail] = React.useState(saved?.email ?? "");
  const [phone, setPhone] = React.useState(saved?.phone ?? "");
  const [notes, setNotes] = React.useState(saved?.notes ?? "");
  const [consent, setConsent] = React.useState(false);
  const ask = needsConsent(saved, { email, phone });
  const ready = !ask || consent;
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) save.mutate({ email, phone, notes, consent: ask ? consent : Boolean(saved?.consent_at) }, { onSuccess: () => setConsent(false) });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="speaker-email">Email</Label>
          <Input id="speaker-email" type="email" value={email} maxLength={254} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="speaker-phone">Phone</Label>
          <Input id="speaker-phone" inputMode="tel" value={phone} maxLength={20} onChange={(e) => setPhone(e.target.value)} />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="speaker-notes">Notes (only your club)</Label>
        <Textarea id="speaker-notes" rows={3} value={notes} maxLength={1000} placeholder="Great with students; needs an HDMI projector." onChange={(e) => setNotes(e.target.value)} />
      </div>
      {ask ? (
        <label className="flex items-start gap-2 text-[13px]">
          <Checkbox checked={consent} onCheckedChange={(on) => setConsent(on === true)} aria-label="The speaker agreed to us keeping their email or phone" className="mt-0.5" />
          <span>The speaker agreed to us keeping their email or phone.</span>
        </label>
      ) : saved?.consent_at ? (
        <p className="text-ink-3 m-0 text-[12px]">
          They agreed on {formatDate(saved.consent_at)}
          {saved.consent_by ? ` (ticked by ${saved.consent_by})` : ""}.
        </p>
      ) : null}
      <p className="text-ink-3 m-0 text-[12px]">Your club&apos;s alone: other clubs never see it, and it isn&apos;t public.</p>
      <Button type="submit" size="sm" className="self-start" disabled={!ready || save.isPending}>
        {save.isPending ? <Loader2Icon className="animate-spin" /> : null}
        Save contact
      </Button>
    </form>
  );
}

function SpeakerSheet({ profileId, onClose }: { profileId: number | null; onClose: () => void }) {
  const { data: s, isPending } = useClubSpeaker(profileId);
  const apply = useApplyToUpcoming(profileId ?? 0);
  const links = s ? Object.entries(s.links).filter(([, v]) => v && /^https?:\/\//i.test(v)) : [];
  return (
    <Sheet open={profileId !== null} onOpenChange={(open) => (open ? null : onClose())}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {isPending || !s ? (
          <>
            <SheetHeader>
              <SheetTitle>Speaker</SheetTitle>
              <SheetDescription className="sr-only">Loading</SheetDescription>
            </SheetHeader>
            <Skeleton className="m-4 h-64" />
          </>
        ) : (
          <>
            <SheetHeader>
              <div className="flex items-center gap-3">
                <Photo s={s} size={48} />
                <div className="min-w-0">
                  <SheetTitle>{s.name}</SheetTitle>
                  <SheetDescription>{s.headline ?? "No headline"}</SheetDescription>
                </div>
              </div>
            </SheetHeader>
            <div className="flex flex-col gap-5 px-4 pb-6">
              {s.bio ? <p className="m-0 text-[13px] leading-relaxed whitespace-pre-wrap">{s.bio}</p> : null}
              {links.length ? (
                <div className="flex flex-wrap gap-3 text-[12.5px]">
                  {links.map(([k, v]) => (
                    <a key={k} href={v!} target="_blank" rel="noreferrer" className="text-brand">
                      {LINK_LABEL[k] ?? k}
                    </a>
                  ))}
                </div>
              ) : null}
              <section className="flex flex-col gap-2">
                <h3 className="m-0 text-sm font-semibold">Talks at your events · {s.talks.length}</h3>
                <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[13px]">
                  {s.talks.map((t) => (
                    <li key={t.event_id}>
                      {t.event_name}
                      <span className="text-ink-3">
                        {t.date ? ` · ${formatDate(t.date)}` : ""}
                        {t.talk_title ? ` · “${t.talk_title}”` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
                {s.own ? (
                  <div className="flex flex-col gap-1">
                    <Button size="sm" variant="outline" className="self-start" disabled={apply.isPending} onClick={() => apply.mutate()}>
                      {apply.isPending ? <Loader2Icon className="animate-spin" /> : <CalendarSyncIcon />}
                      Apply to upcoming events
                    </Button>
                    <p className="text-ink-3 m-0 text-[12px]">Copies this profile&apos;s photo, line, bio and link onto your upcoming events with them. Past events keep what they showed.</p>
                  </div>
                ) : null}
              </section>
              <section className="flex flex-col gap-2">
                <h3 className="m-0 text-sm font-semibold">Your contact</h3>
                <ContactForm key={s.profile_id} speaker={s} />
              </section>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

/**
 * Club → Speakers: everyone who has spoken at the club's events, with the
 * club's own email, phone and notes, a workbook of the list, and a profile's
 * details copied onto the club's upcoming events.
 */
export function ClubSpeakersPage() {
  const [q, setQ] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [open, setOpen] = React.useState<number | null>(null);
  const [exporting, setExporting] = React.useState(false);
  const { data, isPending, isError, isFetching } = useClubSpeakers(search, page, PAGE);

  if (data === null) {
    return <EmptyState tone="muted" icon={<ServerOffIcon />} title="Speakers aren't available yet" description="Your speakers list arrives with the next update." />;
  }

  const exportList = async () => {
    setExporting(true);
    try {
      const file = await fetchExport(clubSpeakersExportUrl(search), "xlsx", "speakers");
      saveBlob(file.blob, file.filename);
    } catch (error) {
      toast.error(error instanceof Error && error.message ? error.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <SearchField
          label="Search speakers"
          placeholder="Search by name"
          value={q}
          onChange={setQ}
          onCommit={(v) => {
            setSearch(v.trim());
            setPage(1);
          }}
          className="w-[260px]"
        />
        <div className="flex-1" />
        <Button size="sm" variant="outline" disabled={exporting || !data || data.total === 0} onClick={() => void exportList()}>
          {exporting ? <Loader2Icon className="animate-spin" /> : <FileSpreadsheetIcon />}
          Export to Excel
        </Button>
      </div>
      <Notice tone="neutral" tag="Private">
        Emails, phones and notes here are your club&apos;s alone. Add an email or phone only with the speaker&apos;s agreement.
      </Notice>
      {isPending ? <Skeleton className="h-64 w-full" /> : null}
      {isError ? <EmptyState tone="muted" title="Your speakers could not be read" description="Try again in a moment." /> : null}
      {data && data.items.length === 0 ? <EmptyState tone="muted" title={search ? "Nobody matches" : "No speakers yet"} description={search ? undefined : "Speakers you add to your events show here."} /> : null}
      {data && data.items.length > 0 ? (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {data.items.map((s) => (
            <li key={s.profile_id}>
              <button type="button" onClick={() => setOpen(s.profile_id)} className="border-line-soft bg-surface hover:bg-sunken flex w-full items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left">
                <Photo s={s} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium">{s.name}</span>
                  <span className="text-ink-3 block truncate text-[12px]">{s.headline ?? ""}</span>
                </span>
                <span className="text-ink-3 hidden text-[12px] md:block">{lastTalkLabel(s.last_talk, formatDate)}</span>
                <span className="text-ink-3 hidden w-[180px] truncate text-right text-[12px] lg:block">{[s.contact?.email, s.contact?.phone].filter(Boolean).join(" · ") || "No contact"}</span>
                <span className="font-mono text-[12px] tabular-nums">
                  {formatNumber(s.talks_count)} talk{s.talks_count === 1 ? "" : "s"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {data && data.total > PAGE ? <Pager page={page} pageCount={Math.ceil(data.total / PAGE)} total={data.total} pageSize={PAGE} noun={["speaker", "speakers"]} busy={isFetching} onPage={setPage} /> : null}
      <SpeakerSheet profileId={open} onClose={() => setOpen(null)} />
    </div>
  );
}
