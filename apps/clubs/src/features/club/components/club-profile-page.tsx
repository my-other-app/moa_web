"use client";

import * as React from "react";
import { Controller, useForm, useWatch, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Image from "next/image";
import {
  CheckIcon,
  GlobeIcon,
  ImageIcon,
  InstagramIcon,
  LinkedinIcon,
  Loader2Icon,
  PlusIcon,
  UploadIcon,
  XIcon,
  YoutubeIcon,
  type LucideIcon, ImagePlusIcon } from "lucide-react";
import { initials, pickImage } from "@moa/app-kit";
import {
  CardLabel,
  EmptyState,
  FigurePanel,
  InitialsAvatar,
  Skeleton,
  cn,
  toast, Combobox } from "@moa/ui";

import { PinPreview, VenuePicker, pinAt, pinFieldsOf, pinFromDetail, pinOf, type PinState } from "@/features/venue";
import { TopicPicker } from "@/features/topics";
import { PUBLIC_SITE_HOST } from "@/lib/public-site";

import {
  useCreatePartner,
  useDeletePartner,
  useMyClub,
  useOrganizations,
  useUpdateClubCover,
  useUpdateClubLogo,
  useUpdateMyClub,
  useUpdatePartner,
  useUpdatePartnerLogo,
} from "../queries";
import {
  BRAND_PRESETS,
  clubProfileFormSchema,
  partnerFormSchema,
  type ClubPartner,
  type ClubProfileForm as Values,
  type ClubSelf,
} from "../schemas";
import { TeamPanel } from "./team-panel";
import { usePick } from "./use-pick";

/**
 * The club profile: one page, edited in place, saved once.
 *
 * Identity first (logo, name, about, where, which college, what it is
 * about), then brand and appearance (cover, colour, tagline, the handle
 * nobody can edit), then the year-round partners, then the links. The logo
 * and the cover upload the moment they are picked; partners save row by
 * row; everything else waits for Save changes.
 */
const HEX = /^#[0-9a-fA-F]{6}$/;
const CLUB_PAGE = `${PUBLIC_SITE_HOST}/clubs`;

const field = "input w-full";
const label = "eyebrow mb-1.5 block";

function Err({ message }: { message?: string }) {
  return message ? (
    <p className="text-refuse mt-1 text-[12px]">{message}</p>
  ) : null;
}

/** Picks an image file, checks it, and hands it over; the preview shows while it uploads. */
// ─── Identity ────────────────────────────────────────────────────────────

function LogoControl({ club }: { club: ClubSelf }) {
  const upload = useUpdateClubLogo();
  // Handing back the upload's promise lets a refused logo come down again (usePick).
  const { open, preview, input } = usePick((f) => upload.mutateAsync(f), "logo");
  const shown =
    preview ??
    pickImage(club.logo, ["medium", "large", "thumbnail", "original"]);
  return (
    <div className="flex items-center gap-4">
      <div className="bg-brand-soft border-brand-line relative grid size-[72px] shrink-0 place-items-center overflow-hidden rounded-2xl border">
        {shown ? (
          <Image
            src={shown}
            alt=""
            fill
            sizes="72px"
            className="object-cover"
            unoptimized
          />
        ) : (
          <span className="text-brand text-xl font-semibold">
            {initials(club.name)}
          </span>
        )}
        {upload.isPending && (
          <span className="absolute inset-0 grid place-items-center bg-black/40 text-white">
            <Loader2Icon className="size-5 animate-spin" />
          </span>
        )}
      </div>
      <div>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={open}
          disabled={upload.isPending}
        >
          <UploadIcon className="size-4" />{" "}
          {shown ? "Replace logo" : "Add logo"}
        </button>
        <p className="micro text-ink-3 mt-1.5">
          Square PNG or JPG, at least 400 px
        </p>
        {input}
      </div>
    </div>
  );
}

// ─── Brand and appearance ────────────────────────────────────────────────

function CoverControl({ club, colour }: { club: ClubSelf; colour: string }) {
  const upload = useUpdateClubCover();
  const { open, preview, input } = usePick((f) => upload.mutateAsync(f), "cover");
  const shown =
    preview ??
    pickImage(club.cover, ["large", "medium", "original", "thumbnail"]);
  return (
    <div
      className="relative h-[120px] overflow-hidden rounded-xl"
      style={{
        background: `linear-gradient(135deg, ${colour} 0%, color-mix(in srgb, ${colour} 55%, #0b1413) 100%)`,
      }}
    >
      {shown && (
        <Image
          src={shown}
          alt=""
          fill
          sizes="(max-width: 1024px) 100vw, 760px"
          className="object-cover"
          unoptimized
        />
      )}
      <button
        type="button"
        onClick={open}
        disabled={upload.isPending}
        className="btn btn-secondary btn-sm absolute right-3 bottom-3 bg-white/90 text-[#111] hover:bg-white"
      >
        {upload.isPending ? (
          <Loader2Icon className="size-3.5 animate-spin" />
        ) : (
          <ImageIcon className="size-3.5" />
        )}{" "}
        {shown ? "Replace cover" : "Cover banner"}
      </button>
      {input}
    </div>
  );
}

function Swatches({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (hex: string) => void;
  disabled?: boolean;
}) {
  const custom =
    HEX.test(value) &&
    !(BRAND_PRESETS as readonly string[]).includes(value.toLowerCase());
  return (
    <div className="flex flex-wrap items-center gap-2">
      {BRAND_PRESETS.map((hex) => {
        const on = value.toLowerCase() === hex;
        return (
          <button
            key={hex}
            type="button"
            aria-label={`Brand colour ${hex}`}
            aria-pressed={on}
            disabled={disabled}
            onClick={() => onChange(hex)}
            className={cn(
              "grid size-8 place-items-center rounded-full border-2 transition-transform",
              on
                ? "border-ink scale-105"
                : "border-transparent hover:scale-105",
            )}
            style={{ background: hex }}
          >
            {on && <CheckIcon className="size-4 text-white drop-shadow" />}
          </button>
        );
      })}
      <label
        className={cn(
          "relative grid size-8 cursor-pointer place-items-center overflow-hidden rounded-[8px] border-2",
          custom ? "border-ink" : "border-line",
        )}
        style={{ background: HEX.test(value) ? value : "transparent" }}
        title="Pick any colour"
      >
        <span className="sr-only">Pick any colour</span>
        <input
          type="color"
          aria-label="Pick any colour"
          value={HEX.test(value) ? value : "#17a58f"}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
        />
        {!HEX.test(value) && <PlusIcon className="text-ink-3 size-4" />}
      </label>
    </div>
  );
}

// ─── Partners ────────────────────────────────────────────────────────────

type PartnerDraft = { name: string; role: string; since: string };
const draftOf = (p?: ClubPartner): PartnerDraft => ({
  name: p?.name ?? "",
  role: p?.role ?? "",
  since: p?.since ? String(p.since) : "",
});

function PartnerRow({ partner }: { partner: ClubPartner }) {
  const update = useUpdatePartner();
  const remove = useDeletePartner();
  const logoUpload = useUpdatePartnerLogo();
  // As with the club's logo: handing back the upload's promise lets a refused partner logo come down again.
  const {
    open: pickLogo,
    preview,
    input: logoInput,
  } = usePick(
    (f) => logoUpload.mutateAsync({ id: partner.id, file: f }),
    "partner logo",
  );
  const logo =
    preview ??
    pickImage(partner.logo, ["thumbnail", "medium", "original", "large"]);
  const [draft, setDraft] = React.useState(() => draftOf(partner));
  const [confirm, setConfirm] = React.useState(false);
  const set =
    (k: keyof PartnerDraft) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setDraft((d) => ({ ...d, [k]: e.target.value }));
  const dirty =
    draft.name !== draftOf(partner).name ||
    draft.role !== draftOf(partner).role ||
    draft.since !== draftOf(partner).since;

  const save = () => {
    if (!dirty) return;
    const parsed = partnerFormSchema.safeParse(draft);
    if (!parsed.success)
      return void toast.error(
        parsed.error.issues[0]?.message ?? "Check the partner",
      );
    update.mutate({ id: partner.id, form: parsed.data });
  };

  return (
    <li className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        aria-label={`${logo ? "Replace" : "Add"} ${partner.name} logo`}
        title={logo ? "Replace logo" : "Add a logo"}
        onClick={pickLogo}
        disabled={logoUpload.isPending}
        className="border-line relative size-10 shrink-0 overflow-hidden rounded-xl border bg-transparent p-0"
      >
        {logo ? (
          <Image
            src={logo}
            alt=""
            fill
            sizes="40px"
            className="object-cover"
            unoptimized
          />
        ) : (
          <InitialsAvatar
            name={partner.name}
            size={38}
            tone="muted"
            className="rounded-xl"
          />
        )}
        {logoUpload.isPending && (
          <span className="absolute inset-0 grid place-items-center bg-black/40 text-white">
            <Loader2Icon className="size-4 animate-spin" />
          </span>
        )}
      </button>
      {logoInput}
      <input
        aria-label={`${partner.name} name`}
        className={cn(field, "min-w-[160px] flex-[2]")}
        value={draft.name}
        onChange={set("name")}
        onBlur={save}
        maxLength={100}
      />
      <input
        aria-label={`${partner.name} role`}
        className={cn(field, "min-w-[150px] flex-[2]")}
        value={draft.role}
        onChange={set("role")}
        onBlur={save}
        placeholder="Industry partner"
        maxLength={80}
      />
      <input
        aria-label={`${partner.name} since`}
        className={cn(field, "w-[88px]")}
        value={draft.since}
        onChange={set("since")}
        onBlur={save}
        placeholder="Year"
        inputMode="numeric"
      />
      <button
        type="button"
        aria-label={
          confirm
            ? `Confirm removing ${partner.name}`
            : `Remove ${partner.name}`
        }
        className={cn("btn btn-ghost", confirm && "text-refuse")}
        onClick={() => {
          if (confirm) remove.mutate(partner.id);
          setConfirm(!confirm);
        }}
        disabled={remove.isPending}
      >
        {confirm ? (
          <span className="text-[12px]">Remove?</span>
        ) : (
          <XIcon className="size-4" />
        )}
      </button>
    </li>
  );
}

function PartnersPanel({ club }: { club: ClubSelf }) {
  const create = useCreatePartner();
  const [adding, setAdding] = React.useState(false);
  const [draft, setDraft] = React.useState<PartnerDraft>(() => draftOf());
  const [error, setError] = React.useState<string | null>(null);
  const set =
    (k: keyof PartnerDraft) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setDraft((d) => ({ ...d, [k]: e.target.value }));

  const logoUpload = useUpdatePartnerLogo();
  const [newLogo, setNewLogo] = React.useState<File | null>(null);
  const { open: pickNewLogo, preview: newLogoPreview, input: newLogoInput, preparing: logoPreparing, clear: clearNewLogo } = usePick((f) => setNewLogo(f), "partner logo");

  const add = async () => {
    const parsed = partnerFormSchema.safeParse(draft);
    if (!parsed.success)
      return void setError(
        parsed.error.issues[0]?.message ?? "Check the partner",
      );
    setError(null);
    // A refusal is already toasted by the mutation; the row stays for another try.
    const made = await create.mutateAsync(parsed.data).catch(() => null);
    if (!made) return;
    // The partner exists now, so the row closes even if the logo is refused
    // (toasted too): a second Add would list the partner twice.
    if (newLogo) await logoUpload.mutateAsync({ id: made.id, file: newLogo }).catch(() => null);
    setDraft(draftOf());
    setNewLogo(null);
    clearNewLogo();
    setAdding(false);
  };

  return (
    <FigurePanel className="p-4">
      <CardLabel
        right={
          <button
            type="button"
            className="btn btn-ghost btn-sm text-brand"
            onClick={() => setAdding(true)}
          >
            <PlusIcon className="size-3.5" /> Add partner
          </button>
        }
      >
        Club partners
      </CardLabel>
      <p className="text-ink-3 mt-1 text-[12.5px]">
        Year-round partners, shown on your profile and website. Event sponsors
        are added per event.
      </p>
      {club.partners.length === 0 && !adding ? (
        <p className="text-ink-3 mt-4 text-[13px]">No partners yet.</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2.5">
          {club.partners.map((p) => (
            <PartnerRow key={p.id} partner={p} />
          ))}
        </ul>
      )}
      {adding && (
        <div className="border-line-soft mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
          <button type="button" aria-label="Add the new partner's logo" title="Add a logo" onClick={pickNewLogo} className="border-line relative size-10 shrink-0 overflow-hidden rounded-xl border bg-transparent p-0">
            {newLogoPreview ? <Image src={newLogoPreview} alt="" fill sizes="40px" className="object-cover" unoptimized /> : <span className="bg-sunken grid size-full place-items-center"><ImagePlusIcon className="text-ink-3 size-4" /></span>}
          </button>
          {newLogoInput}
          <input
            aria-label="New partner name"
            className={cn(field, "min-w-[160px] flex-[2]")}
            value={draft.name}
            onChange={set("name")}
            placeholder="Partner name"
            maxLength={100}
          />
          <input
            aria-label="New partner role"
            className={cn(field, "min-w-[150px] flex-[2]")}
            value={draft.role}
            onChange={set("role")}
            placeholder="Industry partner"
            maxLength={80}
          />
          <input
            aria-label="New partner since"
            className={cn(field, "w-[88px]")}
            value={draft.since}
            onChange={set("since")}
            placeholder="Year"
            inputMode="numeric"
          />
          <button
            type="button"
            className="btn btn-primary"
            onClick={add}
            disabled={create.isPending || logoPreparing}
          >
            Add
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            aria-label="Cancel adding a partner"
            onClick={() => {
              setAdding(false);
              setError(null);
            }}
          >
            <XIcon className="size-4" />
          </button>
          {error && <p className="text-refuse w-full text-[12px]">{error}</p>}
        </div>
      )}
    </FigurePanel>
  );
}

// ─── The page ────────────────────────────────────────────────────────────

const LINKS: ReadonlyArray<{
  name: "instagram" | "youtube" | "linkedin" | "website";
  label: string;
  placeholder: string;
  icon: LucideIcon;
}> = [
  {
    name: "instagram",
    label: "Instagram",
    placeholder: "https://instagram.com/…",
    icon: InstagramIcon,
  },
  {
    name: "youtube",
    label: "YouTube",
    placeholder: "https://youtube.com/@…",
    icon: YoutubeIcon,
  },
  {
    name: "linkedin",
    label: "LinkedIn",
    placeholder: "https://linkedin.com/company/…",
    icon: LinkedinIcon,
  },
  {
    name: "website",
    label: "Website",
    placeholder: "https://…",
    icon: GlobeIcon,
  },
];

function valuesOf(club: ClubSelf): Values {
  return {
    name: club.name ?? "",
    about: club.about ?? "",
    tagline: club.tagline ?? "",
    org_id: club.org?.id ?? null,
    location_name: club.location_name ?? "",
    location_link: club.location_link ?? "",
    ...pinFromDetail(club),
    contact_email: club.contact_email ?? "",
    contact_phone: club.contact_phone ?? "",
    brand_primary: club.brand_primary ?? "",
    brand_secondary: club.brand_secondary ?? "",
    instagram: club.socials?.instagram ?? "",
    youtube: club.socials?.youtube ?? "",
    linkedin: club.socials?.linkedin ?? "",
    website: club.socials?.website ?? "",
    interest_ids: club.interests.map((i) => i.id),
  };
}

/** Writes a pin into the form's four flat fields, as one change. */
function setPinOn(form: UseFormReturn<Values>, pin: PinState) {
  const v = pinFieldsOf(pin);
  form.setValue("lat", v.lat, { shouldDirty: true });
  form.setValue("lng", v.lng, { shouldDirty: true });
  form.setValue("geo_source", v.geo_source, { shouldDirty: true });
  form.setValue("clear_point", v.clear_point, { shouldDirty: true });
}

/** Where the club is on the map: its pin, where it came from, and its map link. */
function LocationPin({ form, disabled }: { form: UseFormReturn<Values>; disabled: boolean }) {
  const [lat, lng, geoSource, clearPoint, mapLink, place] = useWatch({ control: form.control, name: ["lat", "lng", "geo_source", "clear_point", "location_link", "location_name"] });
  return (
    <PinPreview
      pin={pinOf({ lat, lng, geo_source: geoSource, clear_point: clearPoint })}
      onChange={(pin) => setPinOn(form, pin)}
      mapLink={mapLink ?? ""}
      onMapLinkChange={(link) => form.setValue("location_link", link, { shouldDirty: true })}
      linkError={form.formState.errors.location_link?.message}
      venue={place ?? ""}
      disabled={disabled}
    />
  );
}

function ProfileForm({ club }: { club: ClubSelf }) {
  const { data: orgs } = useOrganizations();
  const update = useUpdateMyClub();
  const form = useForm<Values>({
    resolver: zodResolver(clubProfileFormSchema),
    values: valuesOf(club),
  });
  const control = form.control;
  const orgId = useWatch({ control, name: "org_id" });
  const interestIds = useWatch({ control, name: "interest_ids" }) ?? [];
  const about = useWatch({ control, name: "about" });
  const brandPrimary = useWatch({ control, name: "brand_primary" }) ?? "";
  const brandSecondary = useWatch({ control, name: "brand_secondary" }) ?? "";
  const { errors, isDirty } = form.formState;
  const saving = update.isPending || form.formState.isSubmitting;
  const colour = HEX.test(brandPrimary) ? brandPrimary : "#17a58f";

  const onSubmit = async (values: Values) => {
    await update.mutateAsync(values);
    form.reset(values);
  };

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      noValidate
      className="flex flex-col gap-3.5"
    >
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="page-title m-0 font-semibold tracking-[-0.02em]">
            Club profile
          </h2>
          <p className="text-ink-2 mt-1 text-[13px]">
            Shown on your club page and every event
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="submit"
            className={cn(
              "btn btn-secondary",
              isDirty ? "btn-primary" : "btn-secondary",
            )}
            disabled={saving || !isDirty}
          >
            {saving ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <CheckIcon className="size-4" />
            )}{" "}
            {saving
              ? "Saving…"
              : isDirty
                ? "Save changes"
                : "All changes saved"}
          </button>
        </div>
      </header>

      <FigurePanel className="flex flex-col gap-4 p-4">
        <LogoControl club={club} />
        <div>
          <span className={label}>Club name</span>
          <div className="bg-sunken border-line flex h-10 items-center rounded-[10px] border px-3 text-[14px]">
            <span className="text-ink font-medium" data-testid="club-name">
              {club.name}
            </span>
          </div>
          <p className="micro text-ink-3 mt-1.5">
            The name and the handle stay as they are. To change either, contact
            support.
          </p>
        </div>
        <div>
          <label htmlFor="club-about" className={label}>
            About
          </label>
          <textarea
            id="club-about"
            rows={4}
            maxLength={2000}
            disabled={saving}
            className={cn("input min-h-[96px] w-full py-2")}
            placeholder="What the club does, who it is for, what it runs."
            {...form.register("about")}
          />
          <div className="flex items-baseline justify-between">
            <Err message={errors.about?.message} />
            <p className="micro text-ink-3 mt-1 ml-auto">
              {(about?.length ?? 0).toLocaleString("en-IN")} / 2,000
            </p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="club-location" className={label}>
              Location
            </label>
            <Controller
              control={control}
              name="location_name"
              render={({ field: f }) => (
                <VenuePicker
                  {...f}
                  id="club-location"
                  value={f.value ?? ""}
                  onPick={(place) => setPinOn(form, pinAt(place.point))}
                  disabled={saving}
                  placeholder="Search for your campus, or type the city"
                  aria-invalid={errors.location_name ? true : undefined}
                />
              )}
            />
            <Err message={errors.location_name?.message} />
          </div>
          <div>
            <label htmlFor="club-org" className={label}>
              Organisation
            </label>
            <Combobox
              id="club-org"
              label="Organisation"
              value={orgId ?? null}
              options={(orgs ?? []).map((o) => ({ value: o.id, label: o.name, hint: [o.type, o.address].filter(Boolean).join(" · ") || undefined }))}
              onChange={(v) => form.setValue("org_id", v, { shouldDirty: true })}
              placeholder="Choose the college or organisation"
              emptyText="Not on the list yet — ask support to add it."
              loading={!orgs}
              disabled={saving}
            />
            <p className="micro text-ink-3 mt-1.5">{orgId == null ? "Leave it empty if the club is not part of one." : "On the list."}</p>
          </div>
        </div>
        <div>
          <span className={label}>On the map</span>
          <LocationPin form={form} disabled={saving} />
        </div>
        <div>
          <span className={label}>Interests</span>
          <p className="text-ink-3 m-0 mb-2 text-[12px]">
            What the club is about. People who follow these find it, and the
            club is listed under their topics.
          </p>
          <TopicPicker
            value={interestIds}
            onChange={(next) =>
              form.setValue("interest_ids", next, { shouldDirty: true })
            }
            disabled={saving}
            errorText="Interests could not load just now, so they are left as they are when you save."
          />
        </div>
      </FigurePanel>

      <FigurePanel className="flex flex-col gap-4 p-4">
        <CardLabel
          right={
            <span className="text-ink-3 text-[11px]">
              Used on your page, tickets and website
            </span>
          }
        >
          Brand and appearance
        </CardLabel>
        <CoverControl club={club} colour={colour} />
        <div>
          <span className={label}>Brand colour</span>
          <div className="flex flex-wrap items-center gap-3">
            <Swatches
              value={brandPrimary}
              onChange={(hex) =>
                form.setValue("brand_primary", hex, { shouldDirty: true })
              }
              disabled={saving}
            />
            <input
              aria-label="Brand colour hex"
              className={cn(field, "w-[110px] font-mono text-[12.5px]")}
              placeholder="#17a58f"
              disabled={saving}
              aria-invalid={errors.brand_primary ? true : undefined}
              {...form.register("brand_primary")}
            />
          </div>
          <Err message={errors.brand_primary?.message} />
        </div>
        <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
          <div>
            <label htmlFor="club-brand-secondary" className={label}>
              Second colour
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                aria-label="Pick the second colour"
                value={HEX.test(brandSecondary) ? brandSecondary : "#aaaaaa"}
                onChange={(e) =>
                  form.setValue("brand_secondary", e.target.value, {
                    shouldDirty: true,
                  })
                }
                disabled={saving}
                className="border-line size-9 shrink-0 cursor-pointer rounded-md border bg-transparent p-0.5"
              />
              <input
                id="club-brand-secondary"
                className={cn(field, "font-mono text-[12.5px]")}
                placeholder="#aaaaaa"
                disabled={saving}
                {...form.register("brand_secondary")}
              />
            </div>
            <Err message={errors.brand_secondary?.message} />
          </div>
          <div>
            <label htmlFor="club-tagline" className={label}>
              Tagline
            </label>
            <input
              id="club-tagline"
              className={field}
              maxLength={120}
              disabled={saving}
              placeholder="One line under your name"
              {...form.register("tagline")}
            />
            <Err message={errors.tagline?.message} />
          </div>
        </div>
        <div>
          <span className={label}>Club handle</span>
          <div className="bg-sunken border-line flex h-10 items-center gap-1 rounded-[10px] border px-3 text-[13px]">
            <span className="text-ink-3">{CLUB_PAGE}/</span>
            <span className="text-ink font-medium" data-testid="club-handle">
              {club.slug ?? "—"}
            </span>
          </div>
          <p className="micro text-ink-3 mt-1.5">
            Your page lives at this address. To change the handle, contact
            support.
          </p>
        </div>
      </FigurePanel>

      <PartnersPanel club={club} />
      <TeamPanel club={club} />

      <FigurePanel className="flex flex-col gap-3 p-4">
        <CardLabel>Links</CardLabel>
        {LINKS.map((l) => (
          <div key={l.name} className="flex items-center gap-2">
            <span className="bg-sunken text-ink-2 grid size-10 shrink-0 place-items-center rounded-[10px]">
              <l.icon className="size-4" />
            </span>
            <div className="flex-1">
              <input
                aria-label={l.label}
                className={field}
                type="url"
                inputMode="url"
                placeholder={l.placeholder}
                disabled={saving}
                aria-invalid={errors[l.name] ? true : undefined}
                {...form.register(l.name)}
              />
              <Err message={errors[l.name]?.message} />
            </div>
          </div>
        ))}
      </FigurePanel>

      <FigurePanel className="p-4">
        <CardLabel
          right={
            <span className="text-ink-3 text-[11px]">
              How students reach you
            </span>
          }
        >
          Contact
        </CardLabel>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="club-email" className={label}>
              Contact email
            </label>
            <input
              id="club-email"
              type="email"
              className={field}
              disabled={saving}
              placeholder="club@example.com"
              aria-invalid={errors.contact_email ? true : undefined}
              {...form.register("contact_email")}
            />
            <Err message={errors.contact_email?.message} />
          </div>
          <div>
            <label htmlFor="club-phone" className={label}>
              Contact phone
            </label>
            <input
              id="club-phone"
              inputMode="tel"
              className={field}
              disabled={saving}
              placeholder="9000000000"
              aria-invalid={errors.contact_phone ? true : undefined}
              {...form.register("contact_phone")}
            />
            <Err message={errors.contact_phone?.message} />
          </div>
        </div>
      </FigurePanel>
    </form>
  );
}

export function ClubProfilePage() {
  const { data: club, isPending, isError } = useMyClub();
  if (isPending) {
    return (
      <div className="flex flex-col gap-3.5">
        <Skeleton className="h-10 w-64 rounded-xl" />
        <Skeleton className="h-[420px] rounded-2xl" />
        <Skeleton className="h-[320px] rounded-2xl" />
      </div>
    );
  }
  if (isError || !club) {
    return (
      <EmptyState
        tone="muted"
        title="Could not load your club"
        description="If this keeps happening, your account may not be linked to a club yet."
      />
    );
  }
  return <ProfileForm club={club} />;
}
