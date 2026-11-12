"use client";

import * as React from "react";
import Link from "next/link";
import { BookOpenIcon, ExternalLinkIcon, Link2Icon, Loader2Icon, ServerOffIcon, Trash2Icon } from "lucide-react";
import { ListFilters, ResourceList, formatDate, formatDateTime, relativeTime, useListParams } from "@moa/app-kit";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  EmptyState,
  Notice,
  StatusBadge,
  buttonVariants,
  cn,
  type DataTableColumn,
} from "@moa/ui";
import { pressable } from "@moa/ui/motion";

import { useCan } from "@/hooks/use-can";

import { docsTab, useAppDocsLinks, useDocsLinks, useDocsOnServer, useMakeAppDocsLink, useOpenDocs, useRevokeDocsLink } from "../queries";
import {
  DOCS_KIND_FILTERS,
  DOCS_LABEL_MAX,
  DOCS_SHARE_DAYS,
  DOCS_SHARE_WARNING,
  DOCS_STATUS_FILTERS,
  DOCS_STATUS_LABEL,
  byName,
  docsLinkFor,
  docsLinkName,
  docsLinkStatus,
  isSuspended,
  type DocsLink,
  type DocsLinkCreated,
  type PartnerApp,
} from "../schemas";
import { SecretOnce, ShownOnceWarning } from "./parts";

const STATUS_TONE = { active: "success", expired: "default", revoked: "default" } as const;

/**
 * "Open developer docs", in the Integrations header: a link of the admin's
 * own (7 days), opened in a new tab. Only for a role that may manage
 * content, on an API that has docs links.
 */
export function OpenDocsButton() {
  const manage = useCan("manage_content");
  const on = useDocsOnServer(manage);
  const open = useOpenDocs();
  if (!on) return null;
  return (
    <Button size="sm" variant="outline" className={pressable} onClick={() => open.mutate(docsTab.open())} disabled={open.isPending}>
      {open.isPending ? <Loader2Icon className="animate-spin" /> : <BookOpenIcon />} Open developer docs
      <ExternalLinkIcon aria-hidden="true" />
    </Button>
  );
}

/**
 * Integrations → Docs links: every link to the private developer docs —
 * clubs' (their own and those shared with their developers), partner apps'
 * and admins' own — with who made it, when it ends and when it was last
 * used. Any link that still works can be revoked; it stops within 5
 * minutes, as the website checks again that often.
 */
export function DocsLinksPage() {
  const manage = useCan("manage_content");
  const params = useListParams();
  const kind = params.param("kind");
  const status = params.param("status");
  const query = { kind, status, search: params.search || undefined, offset: params.offset, limit: params.pageSize };
  const list = useDocsLinks(query, manage);
  const [now] = React.useState(() => new Date());

  if (!manage) {
    return (
      <Notice tone="neutral" tag="Docs links">
        Only admins who manage content can see and revoke docs links.
      </Notice>
    );
  }
  if (list.data === null) {
    return <EmptyState tone="muted" icon={<ServerOffIcon />} title="Not available on this server yet" description="Docs links arrive with a newer version of the API." />;
  }

  const filtered = Boolean(kind || status || params.search);
  const columns: DataTableColumn<DocsLink>[] = [
    {
      key: "link",
      header: "Link",
      cell: (l) => (
        <div className="min-w-0">
          <p className="m-0 truncate font-medium">{docsLinkName(l)}</p>
          {l.kind === "club" && l.club ? (
            <Link href={`/clubs/${l.club.id}`} className="text-muted-foreground block truncate text-[11.5px] hover:underline">
              {docsLinkFor(l)}
            </Link>
          ) : (
            <span className="text-muted-foreground block truncate text-[11.5px]">{docsLinkFor(l)}</span>
          )}
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (l) => {
        const st = docsLinkStatus(l, now);
        return <StatusBadge tone={STATUS_TONE[st]} label={DOCS_STATUS_LABEL[st]} />;
      },
    },
    {
      key: "made",
      header: "Made",
      className: "hidden md:table-cell",
      headerClassName: "hidden md:table-cell",
      cell: (l) => (
        <span className="text-muted-foreground text-xs">
          {l.created_at ? (
            <time dateTime={l.created_at} title={formatDateTime(l.created_at)}>
              {formatDate(l.created_at)}
            </time>
          ) : (
            "--"
          )}
          {byName(l.created_by) ? ` by ${byName(l.created_by)}` : ""}
        </span>
      ),
    },
    {
      key: "expires",
      header: "Ends",
      className: "hidden lg:table-cell",
      headerClassName: "hidden lg:table-cell",
      cell: (l) => <span className="text-muted-foreground text-xs">{l.revoked_at ? `Revoked ${formatDate(l.revoked_at)}` : l.expires_at ? formatDate(l.expires_at) : "--"}</span>,
    },
    {
      key: "used",
      header: "Last used",
      className: "hidden md:table-cell",
      headerClassName: "hidden md:table-cell",
      cell: (l) =>
        l.last_used_at ? (
          <time className="text-muted-foreground text-xs" dateTime={l.last_used_at} title={formatDateTime(l.last_used_at)}>
            {relativeTime(l.last_used_at, now)}
          </time>
        ) : (
          <span className="text-muted-foreground text-xs">Not used yet</span>
        ),
    },
    {
      key: "actions",
      header: <span className="block text-right">Action</span>,
      className: "text-right",
      headerClassName: "text-right",
      cell: (l) => (docsLinkStatus(l, now) === "active" ? <RevokeLink link={l} /> : <span className="text-muted-foreground text-xs">--</span>),
    },
  ];

  return (
    <ResourceList
      page={list.data}
      isPending={list.isPending}
      isError={list.isError}
      columns={columns}
      rowKey={(l) => l.id}
      params={params}
      searchPlaceholder="Label, club, app or who made it…"
      emptyTitle={filtered ? "No links match" : "No docs links yet"}
      emptyDescription={filtered ? "Clear the filters to see the rest." : "Links show here once a club, a partner app's developers or an admin opens the docs."}
      toolbar={
        <ListFilters
          params={params}
          filters={[
            { key: "kind", label: "Whose", options: DOCS_KIND_FILTERS },
            { key: "status", label: "Status", options: DOCS_STATUS_FILTERS },
          ]}
        />
      }
    />
  );
}

function RevokeLink({ link }: { link: DocsLink }) {
  const revoke = useRevokeDocsLink();
  const [asking, setAsking] = React.useState(false);
  const name = docsLinkName(link);
  return (
    <>
      <Button size="xs" variant="outline" danger className={pressable} onClick={() => setAsking(true)} disabled={revoke.isPending} aria-label={`Revoke ${name}`}>
        {revoke.isPending ? <Loader2Icon className="animate-spin" /> : <Trash2Icon />} Revoke
      </Button>
      <AlertDialog open={asking} onOpenChange={setAsking}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke &ldquo;{name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              {docsLinkFor(link)}: anyone using this link loses the docs within 5 minutes. This can&apos;t be undone; a new link can be made.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              className={cn(buttonVariants({ variant: "destructive" }))}
              onClick={() => {
                setAsking(false);
                revoke.mutate(link);
              }}
            >
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/**
 * On a partner app's sheet: a 30-day link to the private docs for the
 * app's developers, with an optional label. The link is shown once;
 * `onShowing` tells the sheet, so a click outside doesn't lose it.
 */
export function AppDocsLink({ app, onShowing }: { app: PartnerApp; onShowing?: (showing: boolean) => void }) {
  const links = useAppDocsLinks(app.id);
  const make = useMakeAppDocsLink(app.id);
  const [label, setLabel] = React.useState("");
  const [made, setMade] = React.useState<DocsLinkCreated | null>(null);
  const [now] = React.useState(() => new Date());
  const show = (next: DocsLinkCreated | null) => {
    setMade(next);
    onShowing?.(next !== null);
  };
  const list = links.data ?? [];
  const working = list.filter((l) => docsLinkStatus(l, now) === "active").length;
  const headingId = `docs-link-${app.id}`;

  return (
    <section aria-labelledby={headingId} className="border-line-soft flex flex-col gap-2.5 rounded-xl border p-3">
      <div>
        <h3 id={headingId} className="text-ink m-0 text-[13.5px] font-medium">
          Docs link for this app&apos;s developers
        </h3>
        <p className="text-ink-3 m-0 mt-0.5 text-[12px] leading-[1.5]">
          Opens the private guides, API reference and Postman file for {app.name}&apos;s developers. It lasts {DOCS_SHARE_DAYS} days.
        </p>
      </div>
      {made ? (
        <>
          <ShownOnceWarning>
            <strong className="font-semibold">Copy it now. It won&apos;t be shown again.</strong> {DOCS_SHARE_WARNING}
          </ShownOnceWarning>
          <SecretOnce label="Docs link" value={made.url} testId="docs-link" />
          <Button type="button" size="sm" variant="outline" className={cn(pressable, "self-start")} onClick={() => show(null)}>
            I&apos;ve copied it
          </Button>
        </>
      ) : isSuspended(app) ? (
        <Notice tone="caution" tag="Suspended">
          Resume the app to make a docs link for it.
        </Notice>
      ) : (
        <form
          className="flex flex-wrap items-end gap-2"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            make.mutate(label, { onSuccess: show });
          }}
        >
          <div className="min-w-[200px] flex-1">
            <label htmlFor={`${headingId}-label`} className="eyebrow mb-1.5 block">
              Who it&apos;s for (optional)
            </label>
            <input
              id={`${headingId}-label`}
              className="input h-9 w-full"
              value={label}
              maxLength={DOCS_LABEL_MAX}
              placeholder={`${app.name}'s developers`}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
          <Button type="submit" size="sm" className={pressable} disabled={make.isPending}>
            {make.isPending ? <Loader2Icon className="animate-spin" /> : <Link2Icon />} Make link
          </Button>
        </form>
      )}
      {list.length ? (
        <p className="text-ink-3 m-0 text-[12px]">
          {working === 1 ? "1 link for it works now." : `${working} links for it work now.`}{" "}
          <Link href={`/integrations/docs-links?kind=partner_app&q=${encodeURIComponent(app.name)}`} className="text-ink underline-offset-2 hover:underline">
            See them in Docs links
          </Link>
        </p>
      ) : null}
    </section>
  );
}
