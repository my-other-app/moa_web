"use client";

import * as React from "react";
import Image from "next/image";
import { CameraIcon, GlobeIcon, InstagramIcon, LinkedinIcon, Loader2Icon, PlusIcon, Trash2Icon, XIcon } from "lucide-react";
import { pickImage } from "@moa/app-kit";
import { CardLabel, FigurePanel, IconButton, InitialsAvatar, cn, toast } from "@moa/ui";

import { useCreateTeamMember, useDeleteTeamMember, useUpdateTeamMember, useUpdateTeamMemberPhoto } from "../queries";
import { socialHref, teamMemberFormSchema, type ClubSelf, type ClubTeamMember, type TeamMemberForm } from "../schemas";
import { usePick } from "./use-pick";

/**
 * The team: the people who run the club, shown on the club page. Each is
 * a photo, a name, a role, and where to find them — a handle or a link
 * for Instagram, LinkedIn, X, a site. Rows save on blur, the photo
 * uploads the moment it is picked, and a new person is one row at the
 * bottom with a photo picked before or after.
 */
const field = "input w-full";
const SOCIALS = [
  { key: "instagram", label: "Instagram", Icon: InstagramIcon, placeholder: "@handle" },
  { key: "linkedin", label: "LinkedIn", Icon: LinkedinIcon, placeholder: "linkedin.com/in/…" },
  { key: "x", label: "X", Icon: XMark, placeholder: "@handle" },
  { key: "website", label: "Website", Icon: GlobeIcon, placeholder: "site.in" },
] as const;

function XMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="currentColor">
      <path d="M17.5 3h3l-7.2 8.2L22 21h-6.6l-5.2-6.3L4.3 21h-3l7.7-8.8L1.5 3h6.7l4.7 5.8L17.5 3zm-1.1 16.2h1.7L7.2 4.7H5.4l11 14.5z" />
    </svg>
  );
}

const draftOf = (m?: ClubTeamMember): TeamMemberForm => ({ name: m?.name ?? "", role: m?.role ?? "", instagram: m?.instagram ?? "", linkedin: m?.linkedin ?? "", x: m?.x ?? "", website: m?.website ?? "" });
const same = (a: TeamMemberForm, b: TeamMemberForm) => (Object.keys(a) as (keyof TeamMemberForm)[]).every((k) => a[k] === b[k]);

function Photo({ src, name, pending, onPick, label }: { src: string | null; name: string; pending: boolean; onPick: () => void; label: string }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onPick} disabled={pending} className="border-line group relative size-14 shrink-0 overflow-hidden rounded-full border bg-transparent p-0">
      {src ? <Image src={src} alt="" fill sizes="56px" className="object-cover" unoptimized /> : <InitialsAvatar name={name || "?"} size={54} tone="muted" className="rounded-full" />}
      <span className={cn("absolute inset-0 grid place-items-center bg-black/45 text-white transition-opacity", pending ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100")}>{pending ? <Loader2Icon className="size-4 animate-spin" /> : <CameraIcon className="size-4" />}</span>
    </button>
  );
}

function MemberRow({ member }: { member: ClubTeamMember }) {
  const update = useUpdateTeamMember();
  const remove = useDeleteTeamMember();
  const photoUpload = useUpdateTeamMemberPhoto();
  const { open: pickPhoto, preview, input } = usePick((f) => photoUpload.mutate({ id: member.id, file: f }), "photo");
  const photo = preview ?? pickImage(member.photo, ["thumbnail", "medium", "original", "large"]);
  const [draft, setDraft] = React.useState(() => draftOf(member));
  const [confirm, setConfirm] = React.useState(false);
  const set = (k: keyof TeamMemberForm) => (e: React.ChangeEvent<HTMLInputElement>) => setDraft((d) => ({ ...d, [k]: e.target.value }));
  const save = () => {
    if (same(draft, draftOf(member))) return;
    const parsed = teamMemberFormSchema.safeParse(draft);
    if (!parsed.success) return void toast.error(parsed.error.issues[0]?.message ?? "Check the details");
    update.mutate({ id: member.id, form: parsed.data });
  };

  return (
    <li className="border-line-soft flex flex-wrap items-start gap-3 border-t pt-3 first:border-t-0 first:pt-0">
      <Photo src={photo} name={member.name} pending={photoUpload.isPending} onPick={pickPhoto} label={`${photo ? "Replace" : "Add"} ${member.name}'s photo`} />
      {input}
      <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
        <input aria-label={`${member.name} name`} className={field} value={draft.name} onChange={set("name")} onBlur={save} maxLength={100} placeholder="Name" />
        <input aria-label={`${member.name} role`} className={field} value={draft.role} onChange={set("role")} onBlur={save} maxLength={80} placeholder="Role, e.g. Lead" />
        <div className="grid gap-2 sm:col-span-2 sm:grid-cols-4">
          {SOCIALS.map((s) => (
            <label key={s.key} className="relative block">
              <s.Icon className="text-ink-3 pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2" />
              <input aria-label={`${member.name} ${s.label}`} className={cn(field, "input-sm pl-8")} value={draft[s.key]} onChange={set(s.key)} onBlur={save} placeholder={s.placeholder} maxLength={255} />
            </label>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-1 self-center">
        {SOCIALS.filter((s) => member[s.key]).map((s) => (
          <a key={s.key} href={socialHref(s.key, member[s.key] ?? "")} target="_blank" rel="noreferrer" aria-label={`${member.name} on ${s.label}`} className="btn btn-quiet btn-icon btn-xs btn-round">
            <s.Icon className="size-3.5" />
          </a>
        ))}
        {confirm ? (
          <button type="button" className="btn btn-secondary btn-sm btn-round btn-danger" aria-label={`Confirm removing ${member.name}`} onClick={() => remove.mutate(member.id)}>
            Remove?
          </button>
        ) : (
          <IconButton label={`Remove ${member.name}`} danger onClick={() => setConfirm(true)}>
            <Trash2Icon />
          </IconButton>
        )}
      </div>
    </li>
  );
}

export function TeamPanel({ club }: { club: ClubSelf }) {
  const create = useCreateTeamMember();
  const photoUpload = useUpdateTeamMemberPhoto();
  const [adding, setAdding] = React.useState(false);
  const [draft, setDraft] = React.useState<TeamMemberForm>(() => draftOf());
  const [file, setFile] = React.useState<File | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const { open: pickPhoto, preview, input, clear } = usePick((f) => setFile(f), "photo");
  const set = (k: keyof TeamMemberForm) => (e: React.ChangeEvent<HTMLInputElement>) => setDraft((d) => ({ ...d, [k]: e.target.value }));

  const reset = () => {
    setDraft(draftOf());
    setFile(null);
    clear();
    setError(null);
    setAdding(false);
  };
  const add = async () => {
    const parsed = teamMemberFormSchema.safeParse(draft);
    if (!parsed.success) return void setError(parsed.error.issues[0]?.message ?? "Check the details");
    setError(null);
    const made = await create.mutateAsync(parsed.data);
    if (file) await photoUpload.mutateAsync({ id: made.id, file });
    reset();
  };

  return (
    <FigurePanel className="p-4">
      <CardLabel
        right={
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAdding(true)}>
            <PlusIcon /> Add a person
          </button>
        }
      >
        The team
      </CardLabel>
      <p className="text-ink-3 mt-1 text-[12.5px]">The people who run the club, shown on your club page: a photo, a name, a role, and where to find them.</p>
      {club.team.length === 0 && !adding ? (
        <p className="text-ink-3 mt-4 text-[13px]">Nobody on the team yet.</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {club.team.map((m) => (
            <MemberRow key={m.id} member={m} />
          ))}
        </ul>
      )}
      {adding ? (
        <div className="border-line-soft mt-3 flex flex-wrap items-start gap-3 border-t pt-3">
          <Photo src={preview} name={draft.name} pending={create.isPending || photoUpload.isPending} onPick={pickPhoto} label="Add a photo" />
          {input}
          <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
            <input aria-label="New member name" className={field} value={draft.name} onChange={set("name")} placeholder="Name" maxLength={100} autoFocus />
            <input aria-label="New member role" className={field} value={draft.role} onChange={set("role")} placeholder="Role, e.g. Lead" maxLength={80} />
            <div className="grid gap-2 sm:col-span-2 sm:grid-cols-4">
              {SOCIALS.map((s) => (
                <label key={s.key} className="relative block">
                  <s.Icon className="text-ink-3 pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2" />
                  <input aria-label={`New member ${s.label}`} className={cn(field, "input-sm pl-8")} value={draft[s.key]} onChange={set(s.key)} placeholder={s.placeholder} maxLength={255} />
                </label>
              ))}
            </div>
            {error ? <p className="text-refuse text-[12px] sm:col-span-2">{error}</p> : null}
          </div>
          <div className="flex items-center gap-2 self-center">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => void add()} disabled={create.isPending || photoUpload.isPending}>
              {create.isPending || photoUpload.isPending ? <Loader2Icon className="animate-spin" /> : <PlusIcon />} Add
            </button>
            <IconButton label="Cancel" variant="ghost" onClick={reset}>
              <XIcon />
            </IconButton>
          </div>
        </div>
      ) : null}
    </FigurePanel>
  );
}
