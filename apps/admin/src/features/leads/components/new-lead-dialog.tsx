"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2Icon } from "lucide-react";
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Label, NativeSelect, Notice } from "@moa/ui";

import { FOLLOW_UP_KINDS, FOLLOW_UP_LABEL, LEAD_TYPES, LEAD_TYPE_LABEL, localToIso, memberLabel, membersOf, useTeamRights, useTeams, type FollowUpKind } from "@/features/teamwork";

import type { NewLeadInput } from "../api";
import { useCreateLead } from "../queries";
import { DuplicateLeadError, SOURCES, SOURCE_LABEL, type DuplicateMatch, type LeadPrefill } from "../schemas";

function Field({ id, label, children, className }: { id: string; label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className ?? "flex flex-col gap-1.5"}>
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function NewLeadForm({ prefill, onDone }: { prefill: LeadPrefill | null; onDone: () => void }) {
  const router = useRouter();
  const rights = useTeamRights();
  const teams = useTeams();
  const create = useCreateLead();
  const sales = membersOf(teams.data, "sales");
  const [name, setName] = React.useState(prefill?.name ?? "");
  const [type, setType] = React.useState(prefill?.type && (LEAD_TYPES as readonly string[]).includes(prefill.type) ? prefill.type : "club");
  const [city, setCity] = React.useState(prefill?.city ?? "");
  const [website, setWebsite] = React.useState(prefill?.website ?? "");
  const [source, setSource] = React.useState(prefill?.source && (SOURCES as readonly string[]).includes(prefill.source) ? prefill.source : "outreach");
  const [value, setValue] = React.useState("");
  const [close, setClose] = React.useState("");
  const [owner, setOwner] = React.useState("");
  const [contact, setContact] = React.useState({ name: "", role: "", email: "", phone: "" });
  const [fuKind, setFuKind] = React.useState<FollowUpKind>("call");
  const [fuTitle, setFuTitle] = React.useState("");
  const [fuDue, setFuDue] = React.useState("");
  const [matches, setMatches] = React.useState<DuplicateMatch[] | null>(null);
  const ready = name.trim().length > 0 && (!fuTitle.trim() || fuDue);

  const input = (): NewLeadInput => ({
    name: name.trim(),
    type,
    source,
    ...(city.trim() ? { city: city.trim() } : {}),
    ...(website.trim() ? { website: website.trim() } : {}),
    ...(value ? { value_inr: Number(value) } : {}),
    ...(close ? { expected_close: close } : {}),
    ...(owner ? { owner_id: Number(owner) } : {}),
    ...(contact.name.trim()
      ? { contacts: [{ name: contact.name.trim(), role: contact.role.trim() || null, email: contact.email.trim() || null, phone: contact.phone.trim() || null }] }
      : {}),
    ...(fuTitle.trim() && fuDue ? { follow_up: { kind: fuKind, title: fuTitle.trim(), due_at: localToIso(fuDue) } } : {}),
  });

  const submit = (force: boolean) =>
    create.mutate(
      { input: input(), force },
      {
        onSuccess: (lead) => {
          onDone();
          router.push(`/teamwork/leads/${lead.id}`);
        },
        onError: (error) => {
          if (error instanceof DuplicateLeadError) setMatches(error.matches);
        },
      }
    );

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) submit(false);
      }}
    >
      <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
        <Field id="lead-name" label="Organisation">
          <Input
            id="lead-name"
            value={name}
            maxLength={200}
            onChange={(e) => {
              setName(e.target.value);
              setMatches(null);
            }}
          />
        </Field>
        <Field id="lead-type" label="Type">
          <NativeSelect id="lead-type" value={type} onChange={(e) => setType(e.target.value)}>
            {LEAD_TYPES.map((t) => (
              <option key={t} value={t}>
                {LEAD_TYPE_LABEL[t]}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field id="lead-city" label="City">
          <Input
            id="lead-city"
            value={city}
            maxLength={120}
            onChange={(e) => {
              setCity(e.target.value);
              setMatches(null);
            }}
          />
        </Field>
        <Field id="lead-website" label="Website">
          <Input id="lead-website" type="url" inputMode="url" placeholder="https://" value={website} maxLength={300} onChange={(e) => setWebsite(e.target.value)} />
        </Field>
        <Field id="lead-source" label="Where it came from">
          <NativeSelect id="lead-source" value={source} onChange={(e) => setSource(e.target.value)}>
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {SOURCE_LABEL[s]}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field id="lead-value" label="Value (₹ a year)">
          <Input id="lead-value" type="number" min={0} value={value} onChange={(e) => setValue(e.target.value)} />
        </Field>
        <Field id="lead-close" label="Expected close">
          <Input id="lead-close" type="date" value={close} onChange={(e) => setClose(e.target.value)} />
        </Field>
        {rights.reassignLeads && sales.length > 0 ? (
          <Field id="lead-owner" label="Owner">
            <NativeSelect id="lead-owner" value={owner} onChange={(e) => setOwner(e.target.value)}>
              <option value="">Me</option>
              {sales.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {memberLabel(m)}
                </option>
              ))}
            </NativeSelect>
          </Field>
        ) : null}
      </div>
      <fieldset className="border-line-soft flex flex-col gap-2 rounded-xl border p-3">
        <legend className="px-1 text-[12.5px] font-medium">First contact (optional)</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="lead-contact-name" label="Name">
            <Input id="lead-contact-name" value={contact.name} maxLength={120} onChange={(e) => setContact({ ...contact, name: e.target.value })} />
          </Field>
          <Field id="lead-contact-role" label="Role">
            <Input id="lead-contact-role" value={contact.role} maxLength={120} placeholder="Marketing lead, faculty advisor…" onChange={(e) => setContact({ ...contact, role: e.target.value })} />
          </Field>
          <Field id="lead-contact-email" label="Email">
            <Input
              id="lead-contact-email"
              type="email"
              value={contact.email}
              maxLength={254}
              onChange={(e) => {
                setContact({ ...contact, email: e.target.value });
                setMatches(null);
              }}
            />
          </Field>
          <Field id="lead-contact-phone" label="Phone">
            <Input id="lead-contact-phone" inputMode="tel" value={contact.phone} maxLength={30} onChange={(e) => setContact({ ...contact, phone: e.target.value })} />
          </Field>
        </div>
      </fieldset>
      <fieldset className="border-line-soft flex flex-col gap-2 rounded-xl border p-3">
        <legend className="px-1 text-[12.5px] font-medium">Next step (optional)</legend>
        <div className="grid gap-3 sm:grid-cols-[140px_1fr_200px]">
          <Field id="lead-fu-kind" label="What">
            <NativeSelect id="lead-fu-kind" value={fuKind} onChange={(e) => setFuKind(e.target.value as FollowUpKind)}>
              {FOLLOW_UP_KINDS.map((k) => (
                <option key={k} value={k}>
                  {FOLLOW_UP_LABEL[k]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field id="lead-fu-title" label="Next step">
            <Input id="lead-fu-title" value={fuTitle} maxLength={200} placeholder="Intro call" onChange={(e) => setFuTitle(e.target.value)} />
          </Field>
          <Field id="lead-fu-due" label="When">
            <Input id="lead-fu-due" type="datetime-local" value={fuDue} onChange={(e) => setFuDue(e.target.value)} />
          </Field>
        </div>
      </fieldset>
      {matches ? (
        <Notice tone="caution" tag="Already here?">
          <p className="m-0">This may be a lead we already have (same name and city, or the same email domain):</p>
          <ul className="m-0 mt-1 list-disc pl-5">
            {matches.map((m) => (
              <li key={m.id}>
                <Link href={`/teamwork/leads/${m.id}`} className="underline underline-offset-2" onClick={onDone}>
                  {m.name}
                </Link>
                {m.city ? ` · ${m.city}` : ""}
              </li>
            ))}
          </ul>
        </Notice>
      ) : null}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        {matches ? (
          <Button type="button" variant="outline" disabled={create.isPending} onClick={() => submit(true)}>
            {create.isPending ? <Loader2Icon className="animate-spin" /> : null}
            Add it anyway
          </Button>
        ) : (
          <Button type="submit" disabled={!ready || create.isPending}>
            {create.isPending ? <Loader2Icon className="animate-spin" /> : null}
            Add lead
          </Button>
        )}
      </DialogFooter>
    </form>
  );
}

/**
 * A new lead: only the organisation, its type and its owner are needed, the
 * rest when known. A likely duplicate is shown, with "Add it anyway". "Make
 * a lead" on a speaker opens this filled in (`prefill`).
 */
export function NewLeadDialog({ open, onOpenChange, prefill = null }: { open: boolean; onOpenChange: (open: boolean) => void; prefill?: LeadPrefill | null }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New lead</DialogTitle>
          <DialogDescription>A club to bring on, a brand to sponsor, a venue to host, a vendor to recommend.</DialogDescription>
        </DialogHeader>
        {open ? <NewLeadForm prefill={prefill} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}
