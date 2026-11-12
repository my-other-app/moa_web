"use client";

import * as React from "react";
import Link from "next/link";
import { BookOpenIcon, BuildingIcon, KeyRoundIcon, Loader2Icon, PauseCircleIcon, PencilIcon, PlayCircleIcon, PlusIcon, UnplugIcon } from "lucide-react";
import { ListFilters, ResourceList, formatDate, formatDateTime, relativeTime, useListParams, type CsvColumn } from "@moa/app-kit";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  InitialsAvatar,
  NativeSelect,
  Notice,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Skeleton,
  StatusBadge,
  buttonVariants,
  cn,
  type DataTableColumn,
} from "@moa/ui";
import { pressable } from "@moa/ui/motion";

import { ExportButton } from "@/components/export-button";
import { useCan } from "@/hooks/use-can";

import { fetchPartnerApps } from "../api";
import {
  useCreatePartnerApp,
  useDisconnectPartnerClub,
  useDocsOnServer,
  usePartnerApp,
  usePartnerApps,
  useRotatePartnerSecret,
  useSuspendPartnerApp,
  useUpdatePartnerApp,
} from "../queries";
import {
  EMPTY_PARTNER_FORM,
  RATE_TIERS,
  TIER_INFO,
  byName,
  isSuspended,
  orderScopes,
  partnerBody,
  partnerFormFrom,
  partnerProblems,
  scopeLabel,
  tierLabel,
  type PartnerApp,
  type PartnerAppForm,
  type PartnerAppWithSecret,
  type RateTier,
} from "../schemas";
import { AppDocsLink } from "./docs-links-page";
import { ScopeChecklist, ScopeTags, SecretOnce, ShownOnceWarning } from "./parts";

export const PARTNER_COLUMNS: CsvColumn<PartnerApp>[] = [
  { header: "App", value: (a) => a.name },
  { header: "Client ID", value: (a) => a.client_id },
  { header: "Status", value: (a) => (isSuspended(a) ? "Suspended" : "Active") },
  { header: "Why suspended", value: (a) => a.suspended_reason ?? "" },
  { header: "About", value: (a) => a.description ?? "" },
  { header: "Website", value: (a) => a.website ?? "" },
  { header: "Contact", value: (a) => a.contact_email ?? "" },
  { header: "Rate tier", value: (a) => tierLabel(a.rate_tier) },
  { header: "Redirect URIs", value: (a) => a.redirect_uris.join(" ") },
  { header: "May ask for", value: (a) => orderScopes(a.allowed_scopes).join(" ") },
  { header: "Clubs connected", value: (a) => a.clubs_connected },
  { header: "Registered", value: (a) => a.created_at ?? "" },
];

const STATUS_FILTERS = [
  { value: "active", label: "Active" },
  { value: "suspended", label: "Suspended" },
];

/**
 * Integrations → Partner apps: other platforms MyOtherApp lets act for the
 * clubs that connect them. Only an admin registers one (there is no
 * self-registration), choosing what it may ever ask a club for; each club
 * then allows some or all of that. The client secret is shown once. An app's
 * sheet has the clubs connected to it and a docs link for its developers.
 */
export function PartnerAppsPage() {
  const params = useListParams();
  const status = params.param("status");
  const manage = useCan("manage_content");
  const canExport = useCan("export_data");
  // Docs links on this API, for a role that may make them.
  const docs = useDocsOnServer(manage) === true;
  const query = { status, search: params.search || undefined, offset: params.offset, limit: params.pageSize };
  const list = usePartnerApps(query);
  const [editing, setEditing] = React.useState<PartnerApp | "new" | null>(null);
  const [shown, setShown] = React.useState<{ made: PartnerAppWithSecret; rotated: boolean } | null>(null);
  const [clubsOf, setClubsOf] = React.useState<PartnerApp | null>(null);

  const columns: DataTableColumn<PartnerApp>[] = [
    {
      key: "app",
      header: "App",
      cell: (a) => (
        <div className="flex min-w-0 items-center gap-2.5">
          {a.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- the partner's own logo, from its address
            <img src={a.logo_url} alt="" className="border-line-soft size-8 shrink-0 rounded-lg border object-cover" />
          ) : (
            <InitialsAvatar name={a.name} size={32} />
          )}
          <div className="min-w-0">
            <p className="m-0 truncate font-medium">{a.name}</p>
            <code className="text-muted-foreground block truncate text-[11px]">{a.client_id}</code>
          </div>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (a) => (
        <div className="flex flex-col items-start gap-0.5">
          <StatusBadge tone={isSuspended(a) ? "warning" : "success"} label={isSuspended(a) ? "Suspended" : "Active"} />
          {isSuspended(a) && a.suspended_reason ? (
            <span className="text-muted-foreground max-w-[180px] truncate text-[11px]" title={a.suspended_reason}>
              {a.suspended_reason}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      key: "scopes",
      header: "May ask for",
      className: "hidden lg:table-cell max-w-[320px]",
      headerClassName: "hidden lg:table-cell",
      cell: (a) => <ScopeTags scopes={a.allowed_scopes} />,
    },
    {
      key: "clubs",
      header: "Clubs",
      cell: (a) => (
        <Button size="xs" variant="ghost" className={pressable} onClick={() => setClubsOf(a)} aria-label={`Clubs connected to ${a.name}`}>
          <BuildingIcon /> {a.clubs_connected}
        </Button>
      ),
    },
    {
      key: "registered",
      header: "Registered",
      className: "hidden md:table-cell",
      headerClassName: "hidden md:table-cell",
      cell: (a) =>
        a.created_at ? (
          <time className="text-muted-foreground text-xs" dateTime={a.created_at} title={formatDateTime(a.created_at)}>
            {formatDate(a.created_at)}
          </time>
        ) : (
          <span className="text-muted-foreground text-xs">--</span>
        ),
    },
    {
      key: "actions",
      header: <span className="block text-right">Action</span>,
      className: "text-right",
      headerClassName: "text-right",
      cell: (a) =>
        manage ? (
          <RowActions app={a} onEdit={() => setEditing(a)} onRotated={(made) => setShown({ made, rotated: true })} onDocs={docs ? () => setClubsOf(a) : undefined} />
        ) : (
          <span className="text-muted-foreground text-xs">--</span>
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <ResourceList
        page={list.data}
        isPending={list.isPending}
        isError={list.isError}
        columns={columns}
        rowKey={(a) => a.id}
        params={params}
        searchPlaceholder="App name or client ID…"
        emptyTitle={status ? "No apps match" : "No partner apps yet"}
        emptyDescription={status ? "Clear the filter to see the rest." : "Register a platform that should work for the clubs that connect it: an event tool, a college system."}
        toolbar={<ListFilters params={params} filters={[{ key: "status", label: "Status", options: STATUS_FILTERS }]} />}
        actions={
          <div className="flex items-center gap-2">
            {canExport ? (
              <ExportButton filename="partner-apps" sheet="Partner apps" columns={PARTNER_COLUMNS} fetchPage={(offset, limit) => fetchPartnerApps({ ...query, offset, limit })} />
            ) : null}
            {manage ? (
              <Button size="sm" className={pressable} onClick={() => setEditing("new")}>
                <PlusIcon /> Register an app
              </Button>
            ) : null}
          </div>
        }
      />
      {editing ? (
        <PartnerDialog
          app={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onCreated={(made) => {
            setEditing(null);
            setShown({ made, rotated: false });
          }}
        />
      ) : null}
      {shown ? <SecretDialog shown={shown} onClose={() => setShown(null)} /> : null}
      <AppSheet app={clubsOf} manage={manage} docs={docs} onClose={() => setClubsOf(null)} />
    </div>
  );
}

function RowActions({ app, onEdit, onRotated, onDocs }: { app: PartnerApp; onEdit: () => void; onRotated: (made: PartnerAppWithSecret) => void; onDocs?: (() => void) | undefined }) {
  const suspend = useSuspendPartnerApp();
  const rotate = useRotatePartnerSecret();
  const [asking, setAsking] = React.useState<"suspend" | "rotate" | null>(null);
  const [reason, setReason] = React.useState("");
  const suspended = isSuspended(app);
  return (
    <div className="flex justify-end gap-1.5">
      <Button size="xs" variant="outline" className={pressable} onClick={onEdit} aria-label={`Change ${app.name}`}>
        <PencilIcon /> Change
      </Button>
      <Button size="xs" variant="outline" className={pressable} onClick={() => setAsking("rotate")} disabled={rotate.isPending} aria-label={`New secret for ${app.name}`}>
        {rotate.isPending ? <Loader2Icon className="animate-spin" /> : <KeyRoundIcon />} New secret
      </Button>
      {onDocs ? (
        <Button size="xs" variant="outline" className={pressable} onClick={onDocs} aria-label={`Docs link for ${app.name}'s developers`}>
          <BookOpenIcon /> Docs link
        </Button>
      ) : null}
      {suspended ? (
        <Button size="xs" variant="outline" className={pressable} onClick={() => suspend.mutate({ appId: app.id, suspend: false })} disabled={suspend.isPending} aria-label={`Resume ${app.name}`}>
          {suspend.isPending ? <Loader2Icon className="animate-spin" /> : <PlayCircleIcon />} Resume
        </Button>
      ) : (
        <Button size="xs" variant="outline" danger className={pressable} onClick={() => setAsking("suspend")} disabled={suspend.isPending} aria-label={`Suspend ${app.name}`}>
          {suspend.isPending ? <Loader2Icon className="animate-spin" /> : <PauseCircleIcon />} Suspend
        </Button>
      )}
      <AlertDialog open={asking !== null} onOpenChange={(open) => !open && setAsking(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{asking === "rotate" ? `New client secret for ${app.name}?` : `Suspend ${app.name}?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {asking === "rotate"
                ? "The new secret is shown once. The old one stops working at once, so the partner can't get new tokens until they have the new one."
                : `Its tokens stop working at once, for every club connected to it (${app.clubs_connected}), and its webhooks stop. Nothing it made is deleted; resuming it lets the same clubs work with it again.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {asking === "suspend" ? (
            <div>
              <label htmlFor={`suspend-${app.id}`} className="eyebrow mb-1.5 block">
                Why (optional, admins only)
              </label>
              <input id={`suspend-${app.id}`} className="input h-10 w-full" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              className={cn(asking === "suspend" && buttonVariants({ variant: "destructive" }))}
              onClick={() => {
                const what = asking;
                setAsking(null);
                if (what === "suspend") suspend.mutate({ appId: app.id, suspend: true, reason: reason.trim() || null });
                else rotate.mutate(app.id, { onSuccess: onRotated });
              }}
            >
              {asking === "rotate" ? "Make a new secret" : "Suspend"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PartnerDialog({ app, onClose, onCreated }: { app: PartnerApp | null; onClose: () => void; onCreated: (made: PartnerAppWithSecret) => void }) {
  const create = useCreatePartnerApp();
  const update = useUpdatePartnerApp();
  const [form, setForm] = React.useState<PartnerAppForm>(app ? partnerFormFrom(app) : EMPTY_PARTNER_FORM);
  const [tried, setTried] = React.useState(false);
  const problems = partnerProblems(form);
  const shown = tried ? problems : {};
  const busy = create.isPending || update.isPending;
  const set = <K extends keyof PartnerAppForm>(key: K, value: PartnerAppForm[K]) => setForm((f) => ({ ...f, [key]: value }));
  // Taking a scope away from an app clubs already connected: say what happens to those clubs.
  const dropped = app ? app.allowed_scopes.filter((s) => !form.scopes.includes(s)) : [];

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (Object.keys(problems).length) return;
    const body = partnerBody(form);
    if (app) update.mutate({ appId: app.id, body }, { onSuccess: onClose });
    else create.mutate(body, { onSuccess: onCreated });
  };

  const text = (key: "name" | "logoUrl" | "website" | "contactEmail" | "description", label: string, placeholder: string, mono = false) => (
    <div>
      <label htmlFor={`partner-${key}`} className="eyebrow mb-1.5 block">
        {label}
      </label>
      <input
        id={`partner-${key}`}
        className={cn("input h-10 w-full", mono && "font-mono text-[12.5px]")}
        value={form[key]}
        placeholder={placeholder}
        onChange={(e) => set(key, e.target.value)}
        aria-invalid={shown[key] ? true : undefined}
      />
      {shown[key] ? <p className="text-refuse m-0 mt-1 text-[12px]">{shown[key]}</p> : null}
    </div>
  );

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{app ? `Change ${app.name}` : "Register a partner app"}</DialogTitle>
          <DialogDescription>Clubs see its name and logo when it asks to connect. It gets a client ID and secret for OAuth with PKCE.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          {text("name", "Name", "EventHub")}
          {text("description", "What it is (clubs see it)", "Event pages and ticketing for colleges")}
          <div className="grid gap-3 sm:grid-cols-2">
            {text("website", "Website", "https://eventhub.example", true)}
            {text("logoUrl", "Logo address", "https://eventhub.example/logo.png", true)}
            {text("contactEmail", "Contact email (admins only)", "dev@eventhub.example")}
            <div>
              <label htmlFor="partner-tier" className="eyebrow mb-1.5 block">
                Rate, per club
              </label>
              <NativeSelect id="partner-tier" className="h-10 w-full" value={form.tier} onChange={(e) => set("tier", e.target.value as RateTier)}>
                {RATE_TIERS.map((t) => (
                  <option key={t} value={t}>
                    {TIER_INFO[t].label}: {TIER_INFO[t].read.toLocaleString("en-IN")} reads, {TIER_INFO[t].write.toLocaleString("en-IN")} changes a minute
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>
          <div>
            <label htmlFor="partner-redirects" className="eyebrow mb-1.5 block">
              Redirect URIs
            </label>
            <textarea
              id="partner-redirects"
              className="input min-h-[80px] w-full py-2 font-mono text-[12.5px]"
              value={form.redirects}
              placeholder={"https://app.eventhub.example/oauth/myotherapp\nhttp://localhost:3000/callback"}
              onChange={(e) => set("redirects", e.target.value)}
              aria-invalid={shown.redirects ? true : undefined}
              aria-describedby="partner-redirects-hint"
            />
            <p id="partner-redirects-hint" className={cn("m-0 mt-1 text-[12px]", shown.redirects ? "text-refuse" : "text-ink-3")}>
              {shown.redirects ?? "One a line, up to ten: where people go back to after allowing it. Matched exactly; http only for localhost while building."}
            </p>
          </div>
          <ScopeChecklist value={form.scopes} onChange={(next) => set("scopes", next)} error={shown.scopes} />
          {dropped.length ? (
            <Notice tone="caution" tag="Taken away">
              Clubs that allowed {dropped.map(scopeLabel).join(", ")} lose it at once.
            </Notice>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" className={pressable} disabled={busy}>
              {busy ? <Loader2Icon className="animate-spin" /> : null}
              {app ? "Save" : "Register"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** The client ID and the secret, the secret this once. */
function SecretDialog({ shown, onClose }: { shown: { made: PartnerAppWithSecret; rotated: boolean }; onClose: () => void }) {
  const { app, client_secret } = shown.made;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[560px]" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{shown.rotated ? `New secret for ${app.name}` : `${app.name} is registered`}</DialogTitle>
          <DialogDescription>{shown.rotated ? "The old secret has stopped working." : "Send both to the partner. Clubs connect it from the partner's own Connect MyOtherApp button."}</DialogDescription>
        </DialogHeader>
        <ShownOnceWarning />
        <SecretOnce label="Client ID" value={app.client_id} testId="client-id" />
        <SecretOnce label="Client secret" value={client_secret} />
        <DialogFooter>
          <Button type="button" onClick={onClose}>
            I&apos;ve copied it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** A partner app's sheet: a docs link for its developers (when they can be made here), and the clubs connected to it. */
function AppSheet({ app, manage, docs, onClose }: { app: PartnerApp | null; manage: boolean; docs: boolean; onClose: () => void }) {
  const detail = usePartnerApp(app?.id ?? null);
  const disconnect = useDisconnectPartnerClub(app?.id ?? "");
  const [asking, setAsking] = React.useState<string | null>(null);
  // While a docs link is on show, a click outside doesn't close the sheet and lose it.
  const [showingLink, setShowingLink] = React.useState(false);
  const list = detail.data?.connections ?? [];
  return (
    <Sheet
      open={app !== null}
      onOpenChange={(open) => {
        if (open) return;
        setShowingLink(false);
        onClose();
      }}
    >
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-[560px]" onInteractOutside={(e) => showingLink && e.preventDefault()}>
        <SheetHeader>
          <SheetTitle>{app?.name}</SheetTitle>
          <SheetDescription>{docs ? "A docs link for its developers, and the clubs connected to it." : "The clubs connected to it."}</SheetDescription>
        </SheetHeader>
        {docs && app ? (
          <div className="px-4 pb-4">
            <AppDocsLink app={app} onShowing={setShowingLink} />
          </div>
        ) : null}
        <div className="px-4 pb-6">
          <h3 className="text-ink m-0 text-[13.5px] font-medium">Clubs connected to {app?.name}</h3>
          <p className="text-ink-3 m-0 mt-0.5 mb-2 text-[12px] leading-[1.5]">
            Each club allowed some or all of what the app may ask for. A club disconnects it from its own dashboard; MyOtherApp can too, here.
          </p>
          {detail.isPending ? (
            <Skeleton className="h-24 rounded-xl" />
          ) : detail.isError ? (
            <Notice tone="refuse" tag="Clubs">
              Couldn&apos;t load them.
            </Notice>
          ) : list.length === 0 ? (
            <EmptyState size="sm" tone="muted" title="No club has connected it yet" />
          ) : (
            <ul className="m-0 flex list-none flex-col p-0">
              {list.map((c) => {
                const name = c.club.name ?? `Club ${c.club.id}`;
                return (
                  <li key={c.id} className="border-line-soft flex flex-col gap-1.5 border-b py-3 last:border-0" aria-label={name}>
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/clubs/${c.club.id}`} className="text-ink text-[13.5px] font-medium hover:underline">
                        {name}
                      </Link>
                      {c.mode === "test" ? <span className="tag text-caution">Test</span> : null}
                      <span className="flex-1" />
                      {manage ? (
                        asking === c.id ? (
                          <span className="flex items-center gap-1.5">
                            <Button
                              size="xs"
                              variant="destructive"
                              className={pressable}
                              disabled={disconnect.isPending}
                              onClick={() => disconnect.mutate({ connectionId: c.id, clubName: name }, { onSettled: () => setAsking(null) })}
                            >
                              {disconnect.isPending ? <Loader2Icon className="animate-spin" /> : null} Disconnect it
                            </Button>
                            <Button size="xs" variant="ghost" onClick={() => setAsking(null)}>
                              Keep
                            </Button>
                          </span>
                        ) : (
                          <Button size="xs" variant="outline" danger className={pressable} onClick={() => setAsking(c.id)} aria-label={`Disconnect ${name}`}>
                            <UnplugIcon /> Disconnect
                          </Button>
                        )
                      ) : null}
                    </div>
                    <ScopeTags scopes={c.scopes} />
                    <p className="text-ink-3 m-0 text-[12px]">
                      {c.connected_at ? `Connected ${formatDate(c.connected_at)}` : "Connected"}
                      {byName(c.connected_by) ? ` by ${byName(c.connected_by)}` : ""}
                      {c.last_used_at ? ` · last used ${relativeTime(c.last_used_at)}` : " · not used yet"}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
