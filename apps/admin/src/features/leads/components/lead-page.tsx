"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon, ArrowUpRightIcon, CheckIcon, GitMergeIcon, Loader2Icon, PaperclipIcon, PencilIcon, PlusIcon, Trash2Icon, UploadIcon } from "lucide-react";
import { SectionTitle, formatCurrency, formatDate, formatDateTime } from "@moa/app-kit";
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, EmptyState, Input, Label, NativeSelect, Notice, Skeleton, Textarea, cn } from "@moa/ui";

import { FollowUpDialog, LEAD_TYPES, LEAD_TYPE_LABEL, NextFollowUpDialog, followUpLabel, leadTypeLabel, localToIso, memberLabel, membersOf, useCompleteFollowUp, useLostReasons, useTeamRights, useTeams, words } from "@/features/teamwork";

import type { ContactInput } from "../api";
import { useDeleteContact, useLead, useLeads, useLogActivity, useMergeLead, useSaveContact, useUpdateLead, useUploadLeadFile } from "../queries";
import { ACTIVITY_KINDS, ACTIVITY_LABEL, STAGES, STAGE_LABEL, activityLabel, fileHref, sourceLabel, stageLabel, type Contact, type LeadDetail } from "../schemas";
import { useStageMover } from "./stage-mover";

function Panel({ title, action, children, className }: { title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("border-line-soft bg-surface flex flex-col gap-3 rounded-2xl border p-4", className)} aria-label={title}>
      <SectionTitle action={action}>{title}</SectionTitle>
      {children}
    </section>
  );
}

/** The stage bar: where the lead is, and (for its owner) a click to move it on. */
function StageBar({ lead, canMove, onMove }: { lead: LeadDetail; canMove: boolean; onMove: (to: string) => void }) {
  const at = STAGES.indexOf(lead.stage as (typeof STAGES)[number]);
  return (
    <ol className="m-0 flex list-none flex-wrap gap-1 p-0" aria-label="Stage">
      {STAGES.map((s, i) => {
        const current = s === lead.stage;
        const passed = at >= 0 && i < at && lead.stage !== "lost";
        return (
          <li key={s}>
            <button
              type="button"
              disabled={!canMove || current}
              aria-current={current ? "step" : undefined}
              onClick={() => onMove(s)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-[12.5px] font-medium transition-colors disabled:cursor-default",
                current
                  ? s === "won"
                    ? "border-admit bg-admit text-white"
                    : s === "lost"
                      ? "border-refuse bg-refuse text-white"
                      : "border-brand bg-brand text-brand-foreground"
                  : passed
                    ? "border-brand-line bg-brand-soft text-brand"
                    : "border-line bg-surface text-ink-2",
                canMove && !current && "hover:bg-sunken"
              )}
            >
              {STAGE_LABEL[s]}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function EditLeadDialog({ lead, open, onOpenChange }: { lead: LeadDetail; open: boolean; onOpenChange: (open: boolean) => void }) {
  const update = useUpdateLead();
  const [name, setName] = React.useState(lead.name);
  const [type, setType] = React.useState(lead.type);
  const [city, setCity] = React.useState(lead.city ?? "");
  const [website, setWebsite] = React.useState(lead.website ?? "");
  const [value, setValue] = React.useState(lead.value_inr ? String(lead.value_inr) : "");
  const [close, setClose] = React.useState(lead.expected_close?.slice(0, 10) ?? "");
  const [tags, setTags] = React.useState(lead.tags.join(", "));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit {lead.name}</DialogTitle>
          <DialogDescription className="sr-only">The lead&apos;s details</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            update.mutate(
              {
                id: lead.id,
                patch: {
                  name: name.trim(),
                  type,
                  city: city.trim() || null,
                  website: website.trim() || null,
                  value_inr: value ? Number(value) : null,
                  expected_close: close || null,
                  tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
                },
              },
              { onSuccess: () => onOpenChange(false) }
            );
          }}
        >
          <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-lead-name">Organisation</Label>
              <Input id="edit-lead-name" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-lead-type">Type</Label>
              <NativeSelect id="edit-lead-type" value={type} onChange={(e) => setType(e.target.value)}>
                {LEAD_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {LEAD_TYPE_LABEL[t]}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-lead-city">City</Label>
              <Input id="edit-lead-city" value={city} maxLength={120} onChange={(e) => setCity(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-lead-website">Website</Label>
              <Input id="edit-lead-website" type="url" value={website} maxLength={300} onChange={(e) => setWebsite(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-lead-value">Value (₹ a year)</Label>
              <Input id="edit-lead-value" type="number" min={0} value={value} onChange={(e) => setValue(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-lead-close">Expected close</Label>
              <Input id="edit-lead-close" type="date" value={close} onChange={(e) => setClose(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-lead-tags">Tags (commas between)</Label>
            <Input id="edit-lead-tags" value={tags} onChange={(e) => setTags(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || update.isPending}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ContactDialog({ leadId, contact, open, onOpenChange }: { leadId: number; contact: Contact | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const save = useSaveContact(leadId);
  const [c, setC] = React.useState<ContactInput>({ name: contact?.name ?? "", role: contact?.role ?? "", email: contact?.email ?? "", phone: contact?.phone ?? "", whatsapp: contact?.whatsapp ?? "", preferred_channel: contact?.preferred_channel ?? "" });
  const field = (k: keyof ContactInput, label: string, extra: React.ComponentProps<typeof Input> = {}) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`contact-${k}`}>{label}</Label>
      <Input id={`contact-${k}`} value={c[k] ?? ""} onChange={(e) => setC({ ...c, [k]: e.target.value })} {...extra} />
    </div>
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{contact ? `Edit ${contact.name}` : "Add a contact"}</DialogTitle>
          <DialogDescription>A business contact. Anyone can ask to be removed.</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!c.name.trim()) return;
            const clean = Object.fromEntries(Object.entries(c).map(([k, v]) => [k, typeof v === "string" ? v.trim() || null : v])) as unknown as ContactInput;
            save.mutate({ input: { ...clean, name: c.name.trim() }, ...(contact ? { contactId: contact.id } : {}) }, { onSuccess: () => onOpenChange(false) });
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {field("name", "Name", { maxLength: 120 })}
            {field("role", "Role", { maxLength: 120 })}
            {field("email", "Email", { type: "email", maxLength: 254 })}
            {field("phone", "Phone", { inputMode: "tel", maxLength: 30 })}
            {field("whatsapp", "WhatsApp", { inputMode: "tel", maxLength: 30 })}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="contact-preferred">Prefers</Label>
              <NativeSelect id="contact-preferred" value={c.preferred_channel ?? ""} onChange={(e) => setC({ ...c, preferred_channel: e.target.value })}>
                <option value="">No preference</option>
                <option value="call">A call</option>
                <option value="email">Email</option>
                <option value="whatsapp">WhatsApp</option>
              </NativeSelect>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!c.name.trim() || save.isPending}>
              Save contact
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Contacts({ lead, editable }: { lead: LeadDetail; editable: boolean }) {
  const remove = useDeleteContact(lead.id);
  const [editing, setEditing] = React.useState<Contact | "new" | null>(null);
  return (
    <Panel title="Contacts" action={editable ? <Button size="sm" variant="outline" onClick={() => setEditing("new")}><PlusIcon /> Add</Button> : null}>
      {lead.contacts.length === 0 ? <p className="text-ink-3 m-0 text-sm">No contacts yet.</p> : null}
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {lead.contacts.map((c) => (
          <li key={c.id} className="flex items-start gap-2">
            <div className="min-w-0 flex-1 text-[13px]">
              <p className="m-0 font-medium">
                {c.name}
                {c.role ? <span className="text-ink-3 font-normal"> · {c.role}</span> : null}
              </p>
              <p className="text-ink-3 m-0 text-[12px] [overflow-wrap:anywhere]">{[c.email, c.phone, c.whatsapp ? `WhatsApp ${c.whatsapp}` : null, c.preferred_channel ? `prefers ${words(c.preferred_channel)}` : null].filter(Boolean).join(" · ")}</p>
            </div>
            {editable ? (
              <div className="flex shrink-0">
                <Button size="icon-sm" variant="ghost" aria-label={`Edit ${c.name}`} onClick={() => setEditing(c)}>
                  <PencilIcon />
                </Button>
                <Button size="icon-sm" variant="ghost" className="text-refuse" aria-label={`Remove ${c.name}`} disabled={remove.isPending} onClick={() => remove.mutate(c.id)}>
                  <Trash2Icon />
                </Button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {editable && editing !== null ? <ContactDialog key={editing === "new" ? "new" : editing.id} leadId={lead.id} contact={editing === "new" ? null : editing} open onOpenChange={(o) => (o ? null : setEditing(null))} /> : null}
    </Panel>
  );
}

function FollowUps({ lead, editable }: { lead: LeadDetail; editable: boolean }) {
  const rights = useTeamRights();
  const teams = useTeams();
  const done = useCompleteFollowUp();
  const [adding, setAdding] = React.useState(false);
  const [next, setNext] = React.useState(false);
  const open = lead.follow_ups.filter((f) => !f.done).sort((a, b) => (a.due_at ?? "").localeCompare(b.due_at ?? ""));
  const owners = rights.owner ? membersOf(teams.data, "sales") : undefined;
  return (
    <Panel title="Next follow-up" action={editable ? <Button size="sm" variant="outline" onClick={() => setAdding(true)}><PlusIcon /> Add</Button> : null}>
      {open.length === 0 ? (
        <Notice tone={lead.stage === "won" || lead.stage === "lost" ? "neutral" : "caution"} tag="None">
          {lead.stage === "won" || lead.stage === "lost" ? "Nothing planned." : "Every open lead keeps a next step on a date."}
        </Notice>
      ) : null}
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {open.map((f) => (
          <li key={f.id} className="flex items-center gap-2">
            <div className="min-w-0 flex-1 text-[13px]">
              <p className="m-0 font-medium">
                {followUpLabel(f.kind)} · {f.title}
              </p>
              <p className={cn("m-0 text-[12px]", f.overdue ? "text-refuse font-medium" : "text-ink-3")}>
                {formatDateTime(f.due_at)}
                {f.overdue ? " · overdue" : ""}
                {f.owner?.name ? ` · ${f.owner.name}` : ""}
              </p>
            </div>
            {editable ? (
              <Button size="sm" variant="outline" disabled={done.isPending} aria-label={`Mark "${f.title}" done`} onClick={() => done.mutate(f.id, { onSuccess: (r) => (r.needsNext ? setNext(true) : undefined) })}>
                <CheckIcon /> Done
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {editable ? (
        <>
          <FollowUpDialog open={adding} onOpenChange={setAdding} leadId={lead.id} owners={owners} defaultOwnerId={lead.owner?.id} />
          <NextFollowUpDialog open={next} onOpenChange={setNext} leadId={lead.id} owners={owners} defaultOwnerId={lead.owner?.id} />
        </>
      ) : null}
    </Panel>
  );
}

function LogActivity({ lead }: { lead: LeadDetail }) {
  const log = useLogActivity(lead.id);
  const [kind, setKind] = React.useState<string>("call");
  const [body, setBody] = React.useState("");
  const [when, setWhen] = React.useState("");
  const [contact, setContact] = React.useState("");
  return (
    <form
      className="bg-sunken flex flex-col gap-2 rounded-xl p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!body.trim()) return;
        log.mutate(
          { kind, body: body.trim(), ...(when ? { occurred_at: localToIso(when) } : {}), ...(contact ? { contact_id: Number(contact) } : {}) },
          {
            onSuccess: () => {
              setBody("");
              setWhen("");
            },
          }
        );
      }}
    >
      <div className="flex flex-wrap gap-2">
        <NativeSelect aria-label="What happened" size="sm" className="w-auto" value={kind} onChange={(e) => setKind(e.target.value)}>
          {ACTIVITY_KINDS.map((k) => (
            <option key={k} value={k}>
              {ACTIVITY_LABEL[k]}
            </option>
          ))}
        </NativeSelect>
        {lead.contacts.length > 0 ? (
          <NativeSelect aria-label="With" size="sm" className="w-auto" value={contact} onChange={(e) => setContact(e.target.value)}>
            <option value="">With nobody in particular</option>
            {lead.contacts.map((c) => (
              <option key={c.id} value={c.id}>
                With {c.name}
              </option>
            ))}
          </NativeSelect>
        ) : null}
        <Input aria-label="When it happened" type="datetime-local" className="input-sm h-8 w-auto" value={when} onChange={(e) => setWhen(e.target.value)} />
      </div>
      <Textarea aria-label="What was said" rows={3} maxLength={5000} placeholder="What was said, what was agreed…" value={body} onChange={(e) => setBody(e.target.value)} />
      <Button type="submit" size="sm" className="self-end" disabled={!body.trim() || log.isPending}>
        {log.isPending ? <Loader2Icon className="animate-spin" /> : null}
        Log it
      </Button>
    </form>
  );
}

function Timeline({ lead, editable }: { lead: LeadDetail; editable: boolean }) {
  return (
    <Panel title="Timeline">
      {editable ? <LogActivity lead={lead} /> : null}
      {lead.timeline.length === 0 ? <p className="text-ink-3 m-0 text-sm">Nothing logged yet.</p> : null}
      <ol className="border-line-soft m-0 flex list-none flex-col gap-3 border-l p-0 pl-4">
        {lead.timeline.map((a) => (
          <li key={a.id} className="relative">
            <span aria-hidden="true" className={cn("absolute top-1.5 -left-[21px] size-2.5 rounded-full", a.kind === "stage_change" ? "bg-brand" : a.kind === "system" ? "bg-line" : "bg-ink-3")} />
            <p className="m-0 text-[12px]">
              <span className="font-semibold">{activityLabel(a.kind)}</span>
              <span className="text-ink-3">
                {" · "}
                {formatDateTime(a.occurred_at)}
                {a.author_name ? ` · ${a.author_name}` : ""}
                {(a.contact?.name ?? lead.contacts.find((c) => c.id === a.contact_id)?.name) ? ` · with ${a.contact?.name ?? lead.contacts.find((c) => c.id === a.contact_id)?.name}` : ""}
              </span>
            </p>
            {a.body ? <p className="m-0 mt-0.5 text-[13px] whitespace-pre-wrap [overflow-wrap:anywhere]">{a.body}</p> : null}
          </li>
        ))}
      </ol>
    </Panel>
  );
}

function Files({ lead, editable }: { lead: LeadDetail; editable: boolean }) {
  const upload = useUploadLeadFile(lead.id);
  return (
    <Panel
      title="Files"
      action={
        editable ? (
          <label className="btn btn-secondary btn-sm cursor-pointer">
            {upload.isPending ? <Loader2Icon className="size-4 animate-spin" /> : <UploadIcon className="size-4" aria-hidden="true" />}
            Add
            <input
              type="file"
              className="sr-only"
              aria-label="Add a file"
              onChange={(e) => {
                const file = e.currentTarget.files?.[0];
                e.currentTarget.value = "";
                if (file) upload.mutate(file);
              }}
            />
          </label>
        ) : null
      }
    >
      {lead.files.length === 0 ? <p className="text-ink-3 m-0 text-sm">A proposal, an MoU: nothing yet.</p> : null}
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {lead.files.map((f) => (
          <li key={f.id} className="flex items-center gap-2 text-[13px]">
            <PaperclipIcon className="text-ink-3 size-3.5" aria-hidden="true" />
            {fileHref(f.url) ? (
              <a href={fileHref(f.url)!} target="_blank" rel="noreferrer" className="flex-1 truncate hover:underline">
                {f.name}
              </a>
            ) : (
              <span className="flex-1 truncate">{f.name}</span>
            )}
            <span className="text-ink-3 text-[12px]">{formatDate(f.created_at)}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** What the lead is on the platform: its club and subscription, partners, events at the venue — each with its admin page. */
function Linked({ linked }: { linked: Record<string, unknown> | null }) {
  const sections = Object.entries(linked ?? {}).flatMap(([key, value]) => {
    const rows = (Array.isArray(value) ? value : value && typeof value === "object" ? [value] : []) as Record<string, unknown>[];
    const items = rows
      .map((r) => {
        const name = [r.name, r.title, r.label, r.event_name, r.club_name, r.plan_name].find((v) => typeof v === "string") as string | undefined;
        const path = [r.path, r.admin_path].find((v) => typeof v === "string") as string | undefined;
        const plan = r.subscription && typeof r.subscription === "object" ? (r.subscription as Record<string, unknown>) : null;
        const sub = [r.kind, r.status, r.subtitle, plan ? [plan.plan_name, plan.status].filter((v) => typeof v === "string").join(", ") : null, typeof r.event_datetime === "string" ? formatDate(r.event_datetime) : null]
          .filter((v) => typeof v === "string" && v)
          .join(" · ");
        return name ? { name, sub, path: path && path.startsWith("/") && !path.startsWith("//") ? path : null } : null;
      })
      .filter((x): x is { name: string; sub: string; path: string | null } => x !== null);
    return items.length ? [{ key, items }] : [];
  });
  if (sections.length === 0) return null;
  return (
    <Panel title="On the platform">
      {sections.map((s) => (
        <div key={s.key} className="flex flex-col gap-1">
          <h4 className="text-ink-3 m-0 font-mono text-[10.5px] tracking-[0.08em] uppercase">{words(s.key)}</h4>
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {s.items.map((it, i) => (
              <li key={`${it.name}-${i}`} className="flex items-center gap-2 text-[13px]">
                <span className="min-w-0 flex-1 truncate">
                  {it.name}
                  {it.sub ? <span className="text-ink-3 text-[12px]"> · {it.sub}</span> : null}
                </span>
                {it.path ? (
                  <Link href={it.path} className="text-brand inline-flex items-center gap-0.5 text-[12px]">
                    Open <ArrowUpRightIcon className="size-3" aria-hidden="true" />
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </Panel>
  );
}

function MergeLeadDialog({ lead, open, onOpenChange }: { lead: LeadDetail; open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const merge = useMergeLead(lead.id);
  const [q, setQ] = React.useState("");
  const [into, setInto] = React.useState<number | null>(null);
  const found = useLeads({ view: "table", q: q.trim() || undefined, page: 1, pageSize: 8 }, open && q.trim().length >= 2);
  const options = (found.data?.items ?? []).filter((l) => l.id !== lead.id);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Merge {lead.name} into another lead</DialogTitle>
          <DialogDescription>The lead kept gets this one&apos;s contacts, timeline, files and follow-ups.</DialogDescription>
        </DialogHeader>
        <Input aria-label="Find the lead to keep" placeholder="Organisation name" value={q} onChange={(e) => setQ(e.target.value)} />
        <ul className="m-0 flex max-h-[240px] list-none flex-col gap-1 overflow-y-auto p-0">
          {options.map((o) => (
            <li key={o.id}>
              <label className="hover:bg-sunken flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[13px]">
                <input type="radio" name="merge-lead-into" checked={into === o.id} onChange={() => setInto(o.id)} />
                <span className="flex-1 truncate">{o.name}</span>
                <span className="text-ink-3 text-xs">
                  {leadTypeLabel(o.type)}
                  {o.city ? ` · ${o.city}` : ""}
                </span>
              </label>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={into === null || merge.isPending}
            onClick={() =>
              into !== null &&
              merge.mutate(into, {
                onSuccess: () => {
                  onOpenChange(false);
                  router.push(`/teamwork/leads/${into}`);
                },
              })
            }
          >
            <GitMergeIcon /> Merge
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * One lead: the organisation, its stage bar, the next follow-up, contacts,
 * the timeline (log a call, a meeting, a WhatsApp), files, and what it is on
 * the platform. Its owner and the admin owners change it; everyone reads.
 */
export function LeadPage({ leadId }: { leadId: number }) {
  const { data: lead, isPending, isError, error } = useLead(leadId);
  const rights = useTeamRights();
  const teams = useTeams();
  const reasons = useLostReasons();
  const update = useUpdateLead();
  const mover = useStageMover();
  const [editing, setEditing] = React.useState(false);
  const [merging, setMerging] = React.useState(false);

  if (isPending) return <Skeleton className="h-[480px] w-full" />;
  if (isError || !lead) return <EmptyState tone="muted" title="This lead could not be opened" description={error instanceof Error ? error.message : undefined} />;

  const editable = lead.can_edit ?? rights.workLead(lead.owner?.id);
  const sales = membersOf(teams.data, "sales");
  const lostReason = reasons.data?.find((r) => r.key === lead.lost_reason || r.label === lead.lost_reason)?.label ?? lead.lost_reason;
  return (
    <div className="flex flex-col gap-4">
      <Link href="/teamwork/leads" className="text-ink-3 hover:text-ink inline-flex items-center gap-1 text-[12.5px]">
        <ArrowLeftIcon className="size-3.5" /> Leads
      </Link>
      <header className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="m-0 text-[26px] leading-tight tracking-[-0.01em]">{lead.name}</h1>
          <p className="text-ink-3 m-0 mt-1 text-[13px]">
            {[
              leadTypeLabel(lead.type),
              lead.city,
              lead.source ? `from ${sourceLabel(lead.source).toLowerCase()}` : null,
              lead.value_inr ? `${formatCurrency(lead.value_inr)} a year` : null,
              lead.expected_close ? `closing ${formatDate(lead.expected_close)}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {lead.website && /^https?:\/\//i.test(lead.website) ? (
            <a href={lead.website} target="_blank" rel="noreferrer" className="text-brand text-[12.5px]">
              {lead.website.replace(/^https?:\/\//i, "")}
            </a>
          ) : null}
          {lead.tags.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {lead.tags.map((t) => (
                <span key={t} className="border-line bg-sunken rounded-md border px-1.5 py-0.5 text-[12px]">
                  {t}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {rights.reassignLeads ? (
            <NativeSelect aria-label="Owner" size="sm" className="w-auto" value={lead.owner?.id ? String(lead.owner.id) : ""} disabled={update.isPending} onChange={(e) => update.mutate({ id: lead.id, patch: { owner_id: e.target.value ? Number(e.target.value) : null } })}>
              <option value="">No owner</option>
              {sales.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {memberLabel(m)}
                </option>
              ))}
              {lead.owner && !sales.some((m) => m.user_id === lead.owner?.id) ? <option value={lead.owner.id}>{lead.owner.name}</option> : null}
            </NativeSelect>
          ) : (
            <span className="text-ink-2 text-[13px]">Owner: {lead.owner?.name ?? "nobody"}</span>
          )}
          {!rights.reassignLeads && lead.can_take && rights.meId !== null ? (
            <Button size="sm" variant="outline" disabled={update.isPending} onClick={() => update.mutate({ id: lead.id, patch: { owner_id: rights.meId } })}>
              Take this lead
            </Button>
          ) : null}
          {editable ? (
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              <PencilIcon /> Edit
            </Button>
          ) : null}
          {rights.owner ? (
            <Button size="sm" variant="outline" onClick={() => setMerging(true)}>
              <GitMergeIcon /> Merge
            </Button>
          ) : null}
        </div>
      </header>
      <StageBar lead={lead} canMove={editable} onMove={(to) => mover.request({ id: lead.id, name: lead.name, stage: lead.stage, ownerId: lead.owner?.id }, to)} />
      {lead.stage === "lost" ? (
        <Notice tone="refuse" tag="Lost">
          {lostReason ?? "No reason given"}
          {lead.lost_note ? ` — ${lead.lost_note}` : ""}
          {lead.retry_on ? ` · try again on ${formatDate(lead.retry_on)}` : ""}
        </Notice>
      ) : null}
      {lead.stage === "won" && lead.renewal_on ? <Notice tone="admit" tag="Won">Renewal on {formatDate(lead.renewal_on)}</Notice> : null}
      {lead.case_id ? (
        <p className="text-ink-3 m-0 text-[12.5px]">
          Came from <Link href={`/teamwork/support/${lead.case_id}`} className="underline">a support case</Link>.
        </p>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Timeline lead={lead} editable={editable} />
        </div>
        <div className="flex flex-col gap-4">
          <FollowUps lead={lead} editable={editable} />
          <Contacts lead={lead} editable={editable} />
          <Files lead={lead} editable={editable} />
          <Linked linked={lead.linked} />
          <p className="text-ink-3 m-0 text-[12px]">Stage: {stageLabel(lead.stage)} · updated {formatDateTime(lead.updated_at)}</p>
        </div>
      </div>
      {mover.element}
      {editable && editing ? <EditLeadDialog lead={lead} open onOpenChange={setEditing} /> : null}
      {rights.owner ? <MergeLeadDialog lead={lead} open={merging} onOpenChange={setMerging} /> : null}
    </div>
  );
}
