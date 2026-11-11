"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeftIcon, BriefcaseIcon, EyeIcon, EyeOffIcon, Loader2Icon, MailIcon, PencilIcon, Undo2Icon, UserXIcon } from "lucide-react";
import { PersonAvatar, SectionTitle, formatDate, formatDateTime } from "@moa/app-kit";
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, EmptyState, Input, Label, Notice, Skeleton, StatusBadge, cn } from "@moa/ui";

import { useCan } from "@/hooks/use-can";
import { ConfirmAction } from "@/features/ops";

import { useHideSpeaker, useInviteSpeaker, useRemoveOnRequest, useSpeaker, useUnhideSpeaker, useUnmergeSpeaker } from "../queries";
import { LINK_LABEL, STATUS_LABEL, STATUS_TONE, historyLabel, makeLeadHref, orgFromHeadline, safeLink, type SpeakerDetail } from "../schemas";
import { useTeamworkProbe } from "../teamwork-probe";
import { EditSpeakerDialog, SpeakerPhotoButton } from "./edit-speaker";

function Panel({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("border-line-soft bg-surface flex flex-col gap-3 rounded-2xl border p-4", className)} aria-label={title}>
      <SectionTitle>{title}</SectionTitle>
      {children}
    </section>
  );
}

function InviteDialog({ speaker, onOpenChange }: { speaker: SpeakerDetail; onOpenChange: (open: boolean) => void }) {
  const invite = useInviteSpeaker();
  const [email, setEmail] = React.useState("");
  const ok = /^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/.test(email.trim());
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite {speaker.name} to claim the profile</DialogTitle>
          <DialogDescription>They get a link to sign in and keep their own profile up to date. A newer invite replaces an older one.</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (ok) invite.mutate({ id: speaker.id, email: email.trim() }, { onSuccess: () => onOpenChange(false) });
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invite-email">Their email</Label>
            <Input id="invite-email" type="email" value={email} maxLength={254} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!ok || invite.isPending}>
              {invite.isPending ? <Loader2Icon className="animate-spin" /> : <MailIcon />}
              Send the invite
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * One speaker: the profile, every talk with its event and club, each club's
 * contact (email and phone; a club's notes stay its own), the history, and
 * what an admin does with it — edit the profile and its photo, hide, remove
 * on request, invite to claim, take back a merge, and "Make a lead" for
 * Sales from the organisation in the headline.
 */
export function SpeakerPage({ speakerId }: { speakerId: number }) {
  const { data: s, isPending, isError, error } = useSpeaker(speakerId);
  const canChange = useCan("manage_content");
  const teamwork = useTeamworkProbe();
  const hide = useHideSpeaker();
  const unhide = useUnhideSpeaker();
  const remove = useRemoveOnRequest();
  const unmerge = useUnmergeSpeaker();
  const [removing, setRemoving] = React.useState(false);
  const [inviting, setInviting] = React.useState(false);
  const [editing, setEditing] = React.useState(false);

  if (isPending) return <Skeleton className="h-[480px] w-full" />;
  if (isError || !s) return <EmptyState tone="muted" title="This speaker could not be opened" description={error instanceof Error ? error.message : undefined} />;

  const merged = s.status === "merged";
  const links = Object.entries(s.links).flatMap(([k, v]) => (safeLink(v) ? [{ kind: k, url: safeLink(v)! }] : []));
  const org = orgFromHeadline(s.headline);
  const page = safeLink(s.page_url);
  const invite = s.invites[0];
  return (
    <div className="flex flex-col gap-4">
      <Link href="/speakers" className="text-ink-3 hover:text-ink inline-flex items-center gap-1 text-[12.5px]">
        <ArrowLeftIcon className="size-3.5" /> Speakers
      </Link>
      <header className="flex flex-wrap items-start gap-4">
        <div className="flex flex-col items-center gap-1">
          <PersonAvatar name={s.name} photo={s.photo?.medium ?? s.photo?.thumbnail ?? null} size="medium" className="size-16" />
          {canChange && !merged ? <SpeakerPhotoButton speaker={s} /> : null}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="m-0 text-[26px] leading-tight tracking-[-0.01em]">{s.name}</h1>
          {s.headline ? <p className="text-ink-2 m-0 mt-0.5 text-[14px]">{s.headline}</p> : null}
          <p className="text-ink-3 m-0 mt-1 text-[12.5px]">
            {[s.city, s.topics.map((t) => t.name).join(", "), `${s.talks_count} talk${s.talks_count === 1 ? "" : "s"}`, s.followers_count ? `${s.followers_count} following` : null].filter(Boolean).join(" · ")}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <StatusBadge tone={STATUS_TONE[s.status] ?? "default"} label={STATUS_LABEL[s.status] ?? s.status} />
            {s.claimed ? <StatusBadge tone="info" label={`Claimed${s.claimed_at ? ` ${formatDate(s.claimed_at)}` : ""}`} /> : null}
            {s.removed_at ? <StatusBadge tone="destructive" label={`Removed on request ${formatDate(s.removed_at)}`} /> : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {teamwork && !merged ? (
            <Button size="sm" variant="outline" asChild>
              <Link href={makeLeadHref(s.headline)} title={org ? `A sponsor lead for ${org}` : "A lead for Sales"}>
                <BriefcaseIcon /> Make a lead
              </Link>
            </Button>
          ) : null}
          {canChange && !merged ? (
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              <PencilIcon /> Edit profile
            </Button>
          ) : null}
          {canChange && !merged && !s.claimed && s.status === "active" ? (
            <Button size="sm" variant="outline" onClick={() => setInviting(true)}>
              <MailIcon /> Invite to claim
            </Button>
          ) : null}
          {canChange && s.status === "active" ? (
            <Button size="sm" variant="outline" disabled={hide.isPending} onClick={() => hide.mutate(s.id)}>
              <EyeOffIcon /> Hide
            </Button>
          ) : null}
          {canChange && s.status === "hidden" ? (
            <Button size="sm" variant="outline" disabled={unhide.isPending} onClick={() => unhide.mutate(s.id)}>
              <EyeIcon /> Unhide
            </Button>
          ) : null}
          {canChange && !merged && !s.removed_at ? (
            <Button size="sm" variant="outline" className="text-refuse" onClick={() => setRemoving(true)}>
              <UserXIcon /> Remove on request
            </Button>
          ) : null}
          {canChange && merged ? (
            <Button size="sm" variant="outline" disabled={unmerge.isPending} onClick={() => unmerge.mutate(s.id)}>
              <Undo2Icon /> Unmerge
            </Button>
          ) : null}
        </div>
      </header>

      {merged && s.merged_into ? (
        <Notice tone="neutral" tag="Merged">
          Merged into{" "}
          <Link href={`/speakers/${s.merged_into.id}`} className="underline">
            {s.merged_into.name}
          </Link>
          . Unmerge brings this profile and its talks back on their own.
        </Notice>
      ) : null}
      {s.merged_from.length > 0 ? (
        <Notice tone="neutral" tag="Merged in">
          {s.merged_from.map((m, i) => (
            <React.Fragment key={m.id}>
              {i > 0 ? ", " : ""}
              <Link href={`/speakers/${m.id}`} className="underline">
                {m.name}
              </Link>
            </React.Fragment>
          ))}{" "}
          {s.merged_from.length === 1 ? "was" : "were"} merged into this profile; open one to take it back out.
        </Notice>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Panel title="About">
            {s.bio ? <p className="m-0 text-[13.5px] leading-relaxed whitespace-pre-wrap">{s.bio}</p> : <p className="text-ink-3 m-0 text-sm">No bio yet.</p>}
            {links.length > 0 ? (
              <div className="flex flex-wrap gap-3">
                {links.map((l) => (
                  <a key={l.kind} href={l.url} target="_blank" rel="noreferrer" className="text-brand text-[12.5px]">
                    {LINK_LABEL[l.kind] ?? l.kind}
                  </a>
                ))}
              </div>
            ) : null}
            {page ? (
              <a href={page} target="_blank" rel="noreferrer" className="text-ink-3 text-[12px] underline">
                Their speaker page
              </a>
            ) : null}
          </Panel>
          <Panel title={`Talks · ${s.talks_count}`}>
            {s.talks.length === 0 ? <p className="text-ink-3 m-0 text-sm">No talks linked.</p> : null}
            <ul className="divide-line-soft m-0 flex list-none flex-col divide-y p-0">
              {s.talks.map((t) => (
                <li key={t.event_id} className="flex flex-col gap-0.5 py-2">
                  <Link href={`/events/${t.event_id}`} className="text-[13.5px] font-medium hover:underline">
                    {t.event_name}
                  </Link>
                  <span className="text-ink-3 text-[12px]">
                    {[t.club?.name, t.date ? formatDate(t.date) : null, t.talk_title ? `“${t.talk_title}”` : null, t.status && t.status !== "published" ? t.status : null].filter(Boolean).join(" · ")}
                  </span>
                  {t.sessions.length > 0 ? <span className="text-ink-3 text-[12px]">Sessions: {t.sessions.map((x) => x.title).join(", ")}</span> : null}
                </li>
              ))}
            </ul>
          </Panel>
        </div>
        <div className="flex flex-col gap-4">
          <Panel title="Contact, per club">
            <p className="text-ink-3 m-0 text-[12px]">Each club&apos;s own: never shown to other clubs, and not for sales outreach.</p>
            {s.contacts.length === 0 ? <p className="text-ink-3 m-0 text-sm">No club has kept a contact.</p> : null}
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {s.contacts.map((c) => (
                <li key={c.club.id} className="text-[13px]">
                  <Link href={`/clubs/${c.club.id}`} className="font-medium hover:underline">
                    {c.club.name}
                  </Link>
                  <p className="text-ink-2 m-0 [overflow-wrap:anywhere]">{[c.email, c.phone].filter(Boolean).join(" · ") || "—"}</p>
                  {c.consent_at ? (
                    <p className="text-ink-3 m-0 text-[12px]">
                      Agreed {formatDate(c.consent_at)}
                      {c.consent_by ? `, ticked by ${c.consent_by}` : ""}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="Where it came from">
            <p className="m-0 text-[13px]">
              {s.created_by_club ? (
                <>
                  Added by{" "}
                  <Link href={`/clubs/${s.created_by_club.id}`} className="underline">
                    {s.created_by_club.name}
                  </Link>
                </>
              ) : (
                "Made from existing event speakers"
              )}
              {s.claimed_by ? ` · claimed by ${s.claimed_by.name ?? s.claimed_by.email ?? "the speaker"}` : ""}
            </p>
            {invite ? (
              <p className="text-ink-3 m-0 text-[12px]">
                Last invite to {invite.email_masked ?? "them"} {formatDate(invite.created_at)}
                {invite.used_at ? " (used)" : invite.revoked_at ? " (replaced)" : invite.expires_at ? `, expires ${formatDate(invite.expires_at)}` : ""}
              </p>
            ) : null}
          </Panel>
          <Panel title="History">
            {s.history.length === 0 ? <p className="text-ink-3 m-0 text-sm">Nothing yet.</p> : null}
            <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
              {s.history.map((h) => (
                <li key={h.id} className="text-[12.5px]">
                  <span className="font-medium">{historyLabel(h.action)}</span>
                  <span className="text-ink-3">
                    {" · "}
                    {h.actor_name ?? h.actor_kind ?? "the system"} · {formatDateTime(h.created_at)}
                  </span>
                </li>
              ))}
            </ol>
          </Panel>
        </div>
      </div>

      {canChange ? (
        <>
          <ConfirmAction
            open={removing}
            onOpenChange={setRemoving}
            title={`Remove ${s.name} on their request?`}
            description="The profile is hidden at once (not suggested to clubs, no public page) and every club's email, phone and notes for them are deleted. Past event pages keep the name each club published. This can't be undone."
            confirmLabel="Remove"
            destructive
            pending={remove.isPending}
            onConfirm={() => remove.mutate(s.id, { onSuccess: () => setRemoving(false) })}
          />
          {inviting ? <InviteDialog speaker={s} onOpenChange={setInviting} /> : null}
          {editing ? <EditSpeakerDialog speaker={s} onOpenChange={setEditing} /> : null}
        </>
      ) : null}
    </div>
  );
}
