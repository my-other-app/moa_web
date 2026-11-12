"use client";

import * as React from "react";
import { ArrowRightIcon, ExternalLinkIcon, GlobeIcon, Loader2Icon, PencilIcon } from "lucide-react";
import { SectionTitle } from "@moa/app-kit";
import { Button, Card, CardContent, Input, toast } from "@moa/ui";

import { useCan } from "@/hooks/use-can";

import { slugErrorText, useChangeSlug } from "../queries";
import { SITE_HOST, clubSiteUrl, publicPath, publicUrl, slugProblem, type SlugKind } from "../schemas";

function ChangeForm({ kind, id, current, onDone }: { kind: SlugKind; id: number; current: string | null; onDone: () => void }) {
  const [value, setValue] = React.useState(current ?? "");
  const change = useChangeSlug(kind, id);
  const slug = value.trim().toLowerCase();
  const problem = slugProblem(kind, slug);
  const same = slug === (current ?? "");
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!slug || problem || same || change.isPending) return;
    change.mutate(slug, {
      onSuccess: (r) => {
        toast.success(`The web address is now ${SITE_HOST}${publicPath(kind, r.slug)}`);
        onDone();
      },
    });
  };
  return (
    <form className="flex flex-col gap-2" onSubmit={submit} aria-label="Change the web address">
      <label htmlFor={`slug-${kind}-${id}`} className="eyebrow">
        New web address
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-ink-2 text-[13px]">{`${SITE_HOST}/${kind === "club" ? "clubs" : "events"}/`}</span>
        <Input
          id={`slug-${kind}-${id}`}
          value={value}
          onChange={(e) => setValue(e.target.value.toLowerCase())}
          maxLength={60}
          autoComplete="off"
          aria-invalid={Boolean(problem) || undefined}
          aria-describedby={`slug-${kind}-${id}-help`}
          className="max-w-[280px]"
        />
        <Button type="submit" size="sm" disabled={!slug || Boolean(problem) || same || change.isPending}>
          {change.isPending ? <Loader2Icon className="animate-spin" /> : null} Change
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
      <p id={`slug-${kind}-${id}-help`} className={problem ? "text-destructive m-0 text-xs" : "text-muted-foreground m-0 text-xs"} role={problem ? "alert" : undefined}>
        {problem ??
          (kind === "club"
            ? "The old address keeps working for good and sends people here: links, printed QR codes, and the club's site at its old subdomain."
            : "The old address keeps working for good and sends people here: links and printed QR codes.")}
      </p>
      {change.isError ? (
        <p className="text-destructive m-0 text-xs" role="alert">
          {slugErrorText(change.error)}
        </p>
      ) : null}
    </form>
  );
}

/**
 * A club's or an event's web address, for an admin: the slug, its public
 * page (and a club's own site), the old ones that still redirect here, and
 * -- for owners and support, when the club asks -- a change. The old slug
 * becomes an alias the server keeps for good.
 */
export function WebAddressCard({ kind, id, slug, aliases }: { kind: SlugKind; id: number; slug: string | null | undefined; aliases: string[] }) {
  const canChange = useCan("moderate");
  const [editing, setEditing] = React.useState(false);
  return (
    <section className="space-y-3" aria-label="Web address">
      <SectionTitle>Web address</SectionTitle>
      <Card>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <span className="bg-brand-soft text-brand grid size-10 shrink-0 place-items-center rounded-xl" aria-hidden="true">
            <GlobeIcon className="size-4" />
          </span>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              {slug ? <code className="text-[15px] font-semibold break-all">{slug}</code> : <span className="text-muted-foreground text-sm">No web address yet.</span>}
              {canChange && !editing ? (
                <Button size="xs" variant="outline" onClick={() => setEditing(true)}>
                  <PencilIcon /> Change
                </Button>
              ) : null}
            </div>
            {slug ? (
              <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm" aria-label="Where it is">
                <li>
                  <a href={publicUrl(kind, slug)} target="_blank" rel="noopener noreferrer" className="text-brand inline-flex items-center gap-1 break-all hover:underline">
                    {SITE_HOST}
                    {publicPath(kind, slug)} <ExternalLinkIcon className="size-3" aria-hidden="true" />
                  </a>
                </li>
                {kind === "club" ? (
                  <li>
                    <a href={clubSiteUrl(slug)} target="_blank" rel="noopener noreferrer" className="text-brand inline-flex items-center gap-1 break-all hover:underline">
                      {slug}.{SITE_HOST} <ExternalLinkIcon className="size-3" aria-hidden="true" />
                    </a>
                    <span className="text-muted-foreground"> · its site, when it has one</span>
                  </li>
                ) : null}
              </ul>
            ) : null}
            {aliases.length ? (
              <div className="space-y-1">
                <p className="text-muted-foreground m-0 text-xs">Old addresses that still send people here</p>
                <ul className="m-0 flex list-none flex-col gap-0.5 p-0 text-sm" aria-label="Old addresses">
                  {aliases.map((a) => (
                    <li key={a} className="text-muted-foreground inline-flex flex-wrap items-center gap-1">
                      <code className="break-all">{a}</code>
                      <ArrowRightIcon className="size-3" aria-hidden="true" />
                      <span>{slug ?? "here"}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {editing ? <ChangeForm kind={kind} id={id} current={slug ?? null} onDone={() => setEditing(false)} /> : null}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
