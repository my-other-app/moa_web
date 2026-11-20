"use client";

import * as React from "react";
import Link from "next/link";
import { ImagePlusIcon, Loader2Icon, PaletteIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { fillTemplate, parseV2, POSTER_FORMAT_SPECS, POSTER_FORMATS, type PosterFormat, samplesV2 } from "@moa/layout";
import { formatNumber, plural } from "@moa/app-kit";
import {
  Button,
  CardLabel,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  FigurePanel,
  Input,
  NativeSelect,
  Notice,
  Skeleton,
  StatTile,
  StatusBadge,
  Switch,
  Textarea,
  cn,
  toast,
} from "@moa/ui";

import { useAccess } from "@/features/access";
import { PosterThumb, SAMPLE_SHARE_URL, savedFormatsNote, useDeletePosterVariant, usePosterVariants } from "@/features/designer";
import { useEventDetail } from "@/features/events";

import { usePosterSettings, usePosterStats, useSavePosterSettings } from "../queries";
import {
  CAPTION_MAX,
  MOMENT_INFO,
  MOMENTS,
  type Moment,
  type MomentKey,
  PHRASE_MAX,
  type PosterSettings,
  type PosterStats,
} from "../schemas";

/**
 * Guest posters: each guest whose ticket was sent can make an "I'm
 * attending" picture with their photo and share it with their own link.
 * The organiser's whole side on one page: the switch (off by default) and
 * what guests see; when a guest can make one and what it says (the three
 * moments, each with its phrase and the caption shared with it); the
 * formats offered; the designs, per role and ticket type; and the numbers.
 * Changing anything is for the owner, admins and editors (a co-host's team
 * as the host's); door staff read it.
 */

const errorCopy = (err: unknown) => (err instanceof Error && err.message ? err.message : "Something went wrong.");

type Draft = { formats: PosterFormat[]; moments: Record<MomentKey, Moment> };
const draftOf = (s: PosterSettings): Draft => ({ formats: [...s.formats], moments: structuredClone(s.moments) });

/** Tokens a caption is likely to want, one click each. */
const CAPTION_TOKENS = ["moment_phrase", "event_name", "share_url", "first_name", "event_date", "venue", "club_name"] as const;

/** What is wrong with a moment as written: the phrase's length, the caption's length and tokens. */
export const momentProblems = (m: Moment): { phrase?: string; caption?: string } => {
  const out: { phrase?: string; caption?: string } = {};
  const phrase = m.phrase.trim();
  if (!phrase) out.phrase = "Write a phrase: it is the poster's big line.";
  else if (phrase.length > PHRASE_MAX) out.phrase = `At most ${PHRASE_MAX} characters.`;
  if (m.caption.length > CAPTION_MAX) out.caption = `At most ${CAPTION_MAX} characters.`;
  else {
    const errors = parseV2(m.caption, "poster").errors;
    if (errors.length) out.caption = errors[0];
  }
  return out;
};

/** The caption as a guest's phone would share it, with a sample guest and this event. */
export const captionPreview = (m: Moment, eventName: string | undefined) =>
  fillTemplate(
    m.caption,
    { ...samplesV2("poster"), ...(eventName ? { event_name: eventName } : {}), moment_phrase: m.phrase.trim() || MOMENT_INFO.before.phrase, share_url: SAMPLE_SHARE_URL },
    "poster"
  );

// ─── The switch, and what guests see ─────────────────────────────────────

function SwitchPanel({
  eventId,
  s,
  canEdit,
  previewMoment,
  previewKey,
  eventName,
}: {
  eventId: number;
  s: PosterSettings;
  canEdit: boolean;
  previewMoment: Moment;
  /** Which moment the preview shows: the first one guests reach that is on. */
  previewKey: MomentKey;
  eventName?: string;
}) {
  const save = useSavePosterSettings(eventId);
  const [confirmOff, setConfirmOff] = React.useState(false);
  const format = s.formats[0] ?? "square";
  const set = async (enabled: boolean) => {
    try {
      await save.mutateAsync({ enabled });
      setConfirmOff(false);
      toast.success(enabled ? "Guest posters are on" : "Guest posters are off", {
        description: enabled
          ? "Guests whose ticket was sent can make theirs from their ticket page. Add the poster link to the ticket email so they find it."
          : "Nobody can make or open a poster now. Turning them on again brings everyone's back.",
      });
    } catch (err) {
      toast.error(errorCopy(err));
    }
  };
  const values = React.useMemo(() => ({ moment_phrase: previewMoment.phrase.trim() || MOMENT_INFO.before.phrase, ...(eventName ? { event_name: eventName } : {}) }), [previewMoment.phrase, eventName]);
  return (
    <FigurePanel className="p-0">
      <div className="grid gap-4 p-4 md:grid-cols-[minmax(0,1fr)_220px]">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <span className="min-w-0">
              <span className="text-ink flex items-center gap-2 text-[15px] font-semibold">
                Guest posters <StatusBadge tone={s.enabled ? "success" : "default"} label={s.enabled ? "On" : "Off"} />
              </span>
              <span className="text-ink-3 mt-0.5 block text-[12.5px] leading-[1.5]">
                {s.enabled
                  ? "Guests whose ticket was sent see “Make your poster” on their ticket page and from the link in their ticket email: they add a photo, pick a format, then share it or download it. Each poster carries the guest's own link to the event page."
                  : "Off: guests see nothing about posters and none can be made. Switch it on when the designs are ready; nothing else about the event changes."}
              </span>
            </span>
            <Switch
              checked={s.enabled}
              disabled={!canEdit || save.isPending}
              onCheckedChange={(on) => (on ? void set(true) : setConfirmOff(true))}
              aria-label="Guest posters"
              className="mt-0.5"
            />
          </div>
          <div className="border-line-soft rounded-[var(--radius-md)] border p-3">
            <div className="text-ink-3 font-mono text-[10px] tracking-[0.06em] uppercase">
              Shared with it {MOMENT_INFO[previewKey].title.toLowerCase()}, for a sample guest
            </div>
            <p className="text-ink mt-1 text-[13px] leading-[1.55] break-words whitespace-pre-wrap">{captionPreview(previewMoment, eventName) || "—"}</p>
          </div>
          <p className="text-ink-3 m-0 text-[12px] leading-[1.5]">
            The photo stays private: only the guest and the poster maker see it, never a gallery, and it is deleted 30 days after the event (or when the guest removes it).
          </p>
        </div>
        <figure className="m-0 flex flex-col items-center gap-1.5">
          <PosterThumb eventId={eventId} format={format} width={200} values={values} className="border-line-soft block overflow-hidden rounded-[var(--radius-md)] border" />
          <figcaption className="text-ink-3 text-center text-[11px]">
            Everyone&apos;s {POSTER_FORMAT_SPECS[format].label.toLowerCase()} design, with a sample guest
          </figcaption>
        </figure>
      </div>
      <Dialog open={confirmOff} onOpenChange={(o) => !o && !save.isPending && setConfirmOff(false)}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Switch guest posters off?</DialogTitle>
            <DialogDescription>
              Every guest&apos;s poster page says posters are not available, at once, and the link in a shared poster still opens the event page. Photos are kept until 30
              days after the event, so switching on again brings everyone&apos;s back.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" disabled={save.isPending} onClick={() => setConfirmOff(false)}>
              Keep them on
            </Button>
            <Button variant="destructive" disabled={save.isPending} onClick={() => void set(false)}>
              {save.isPending ? <Loader2Icon className="animate-spin" /> : null} Switch off
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </FigurePanel>
  );
}

// ─── The moments and the formats ─────────────────────────────────────────

function CaptionField({
  id,
  value,
  onChange,
  disabled,
  invalid,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  invalid: boolean;
}) {
  const ref = React.useRef<HTMLTextAreaElement>(null);
  const insert = (token: string) => {
    const el = ref.current;
    const snippet = `{{${token}}}`;
    const at = el ? el.selectionStart : value.length;
    const end = el ? el.selectionEnd : value.length;
    const next = value.slice(0, at) + snippet + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(at + snippet.length, at + snippet.length);
    });
  };
  return (
    <div className="flex flex-col gap-1.5">
      <Textarea
        ref={ref}
        id={id}
        rows={3}
        value={value}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-[76px] text-[13px]"
      />
      {!disabled ? (
        <div className="flex flex-wrap gap-1" role="group" aria-label="Insert into the caption">
          {CAPTION_TOKENS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => insert(t)}
              className="border-line-soft text-ink-2 hover:border-brand-line hover:text-ink rounded-full border px-2 py-0.5 font-mono text-[10.5px]"
            >
              {`{{${t}}}`}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function MomentCard({
  k,
  m,
  onChange,
  disabled,
  eventName,
}: {
  k: MomentKey;
  m: Moment;
  onChange: (m: Moment) => void;
  disabled: boolean;
  eventName?: string;
}) {
  const info = MOMENT_INFO[k];
  const problems = momentProblems(m);
  const id = (f: string) => `poster-${k}-${f}`;
  return (
    <li className={cn("border-line-soft flex flex-col gap-3 border-t px-4 py-4", !m.enabled && "bg-sunken/40")}>
      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="text-ink block text-[13.5px] font-medium">{info.title}</span>
          <span className="text-ink-3 block text-[12px]">{info.when}</span>
        </span>
        <Switch checked={m.enabled} disabled={disabled} onCheckedChange={(enabled) => onChange({ ...m, enabled })} aria-label={`Posters ${info.title.toLowerCase()}`} />
      </div>
      {m.enabled ? (
        <div className="grid gap-3 md:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
          <div className="flex flex-col gap-1">
            <label htmlFor={id("phrase")} className="text-ink-2 text-[12px] font-medium">
              Phrase on the poster
            </label>
            <Input
              id={id("phrase")}
              value={m.phrase}
              maxLength={PHRASE_MAX + 20}
              disabled={disabled}
              aria-invalid={!!problems.phrase || undefined}
              onChange={(e) => onChange({ ...m, phrase: e.target.value })}
            />
            <span className={cn("text-[11.5px]", problems.phrase ? "text-refuse" : "text-ink-3")}>
              {problems.phrase ?? `${m.phrase.trim().length}/${PHRASE_MAX} · what {{moment_phrase}} says`}
            </span>
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <label htmlFor={id("caption")} className="text-ink-2 text-[12px] font-medium">
              Caption shared with it
            </label>
            <CaptionField id={id("caption")} value={m.caption} disabled={disabled} invalid={!!problems.caption} onChange={(caption) => onChange({ ...m, caption })} />
            {problems.caption ? (
              <span className="text-refuse text-[11.5px]">{problems.caption}</span>
            ) : (
              <span className="text-ink-3 text-[11.5px] break-words">
                <span className="text-ink-2">Reads:</span> {captionPreview(m, eventName) || "(nothing)"}
              </span>
            )}
          </div>
        </div>
      ) : (
        <p className="text-ink-3 m-0 text-[12px]">Off: {k === "before" ? "a guest can make a poster only once one of the other moments is reached." : "guests keep the moment before it, if that one is on."}</p>
      )}
    </li>
  );
}

function FormatsField({ value, onChange, disabled }: { value: PosterFormat[]; onChange: (v: PosterFormat[]) => void; disabled: boolean }) {
  return (
    <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-3" aria-label="Formats offered">
      {POSTER_FORMATS.map((f) => {
        const s = POSTER_FORMAT_SPECS[f];
        const on = value.includes(f);
        // The last one stays: guests need at least one format.
        const last = on && value.length === 1;
        const id = `poster-format-${f}`;
        return (
          <li
            key={f}
            className={cn(
              "flex items-start gap-2.5 rounded-[var(--radius-field)] border px-3 py-2",
              on ? "border-brand-line bg-brand-soft" : "border-line",
              (disabled || last) && "opacity-80"
            )}
          >
            <Checkbox
              id={id}
              checked={on}
              disabled={disabled || last}
              onCheckedChange={(v) => onChange(v === true ? POSTER_FORMATS.filter((x) => x === f || value.includes(x)) : value.filter((x) => x !== f))}
              className="mt-0.5"
            />
            <label htmlFor={id} className="min-w-0 cursor-pointer">
              <span className="text-ink block text-[13px] font-medium">{s.label}</span>
              <span className="text-ink-3 block text-[11.5px]">
                {s.width} × {s.height} · {s.use}
                {last ? " · at least one stays" : ""}
              </span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}

function SettingsForm({ eventId, s, canEdit, eventName, onDraft }: { eventId: number; s: PosterSettings; canEdit: boolean; eventName?: string; onDraft: (d: Draft) => void }) {
  const save = useSavePosterSettings(eventId);
  const [draft, setDraft] = React.useState<Draft>(() => draftOf(s));
  const [seen, setSeen] = React.useState(s);
  const savedJson = JSON.stringify(draftOf(s));
  const dirty = JSON.stringify(draft) !== savedJson;
  // Saved elsewhere (or just now): take it, unless there are edits here.
  if (seen !== s) {
    setSeen(s);
    if (!dirty) setDraft(draftOf(s));
  }
  React.useEffect(() => onDraft(draft), [draft, onDraft]);
  const problems = MOMENTS.map((k) => (draft.moments[k].enabled ? momentProblems(draft.moments[k]) : {}));
  const invalid = problems.some((p) => p.phrase || p.caption) || !draft.formats.length;
  const noneOn = MOMENTS.every((k) => !draft.moments[k].enabled);
  const submit = async () => {
    try {
      await save.mutateAsync({
        formats: draft.formats,
        moments: Object.fromEntries(MOMENTS.map((k) => [k, { ...draft.moments[k], phrase: draft.moments[k].phrase.trim() }])) as Draft["moments"],
      });
      toast.success("Poster settings saved", { description: s.enabled ? "Guests' posters follow them from now on." : "They apply once guest posters are switched on." });
    } catch (err) {
      toast.error(errorCopy(err));
    }
  };
  const disabled = !canEdit || save.isPending;
  return (
    <div className="flex flex-col gap-3.5">
      <FigurePanel className="p-0">
        <div className="px-4 pt-4 pb-3">
          <CardLabel>When a guest can make one, and what it says</CardLabel>
          <p className="text-ink-3 mt-1 text-[12.5px] leading-[1.5]">
            A guest gets the latest moment that is on and that they have reached: after the event, else during it, else before. The phrase is the poster&apos;s big line
            ({"{{moment_phrase}}"}); the caption goes with the picture when they share it, and may hold hashtags and {"{{share_url}}"}, their own link.
          </p>
        </div>
        <ul className="m-0 list-none p-0">
          {MOMENTS.map((k) => (
            <MomentCard
              key={k}
              k={k}
              m={draft.moments[k]}
              disabled={disabled}
              eventName={eventName}
              onChange={(m) => setDraft((d) => ({ ...d, moments: { ...d.moments, [k]: m } }))}
            />
          ))}
        </ul>
        {noneOn ? (
          <div className="px-4 pb-4">
            <Notice tone="caution" tag="None on">
              With every moment off, no guest can make a poster even with posters switched on.
            </Notice>
          </div>
        ) : null}
      </FigurePanel>

      <FigurePanel className="p-4">
        <CardLabel>Formats guests can pick</CardLabel>
        <p className="text-ink-3 mt-1 mb-3 text-[12.5px] leading-[1.5]">Each design has a layout for every format; guests choose among the ones on here.</p>
        <FormatsField value={draft.formats} disabled={disabled} onChange={(formats) => setDraft((d) => ({ ...d, formats }))} />
      </FigurePanel>

      {canEdit && (dirty || save.isPending) ? (
        <div
          role="region"
          aria-label="Save"
          className="bg-surface/90 border-line-soft shadow-floating sticky bottom-0 z-20 flex flex-wrap items-center gap-3 rounded-[var(--radius-card)] border px-4 py-3 backdrop-blur-sm"
        >
          <p role="status" className="m-0 min-w-0 flex-1 text-[13px]">
            <span className="text-ink font-medium">Unsaved changes</span>
            {invalid ? <span className="text-refuse"> · fix what is marked first</span> : null}
          </p>
          <Button variant="ghost" disabled={save.isPending} onClick={() => setDraft(draftOf(s))}>
            Discard
          </Button>
          <Button disabled={save.isPending || invalid} onClick={() => void submit()}>
            {save.isPending ? <Loader2Icon className="animate-spin" /> : null} Save
          </Button>
        </div>
      ) : null}
    </div>
  );
}

// ─── The designs ─────────────────────────────────────────────────────────

function DesignsPanel({ eventId, canEdit }: { eventId: number; canEdit: boolean }) {
  const variants = usePosterVariants(eventId);
  const remove = useDeletePosterVariant(eventId);
  const [adding, setAdding] = React.useState("");
  const [dropping, setDropping] = React.useState<{ variant: string; label: string } | null>(null);
  const href = (variant: string) => `/events/${eventId}/design?kind=poster&variant=${encodeURIComponent(variant)}`;
  const v = variants.data;
  const rows = v ? [...v.variants].sort((a, b) => (a.variant === "default" ? -1 : b.variant === "default" ? 1 : 0)) : [];
  const hasDefault = rows.some((r) => r.variant === "default");
  const free = v ? v.options.filter((o) => !rows.some((r) => r.variant === o.variant) && o.variant !== "default") : [];
  return (
    <FigurePanel className="p-0">
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-4 pb-3">
        <div className="min-w-0">
          <CardLabel>Designs</CardLabel>
          <p className="text-ink-3 mt-1 text-[12.5px] leading-[1.5]">
            One design for everyone, and others for a role or a ticket type when they should look different (speakers with their talk, say). A guest gets the design
            for their role first, then their ticket type&apos;s, then everyone&apos;s, then the built-in one.
          </p>
        </div>
        <Button asChild variant="secondary" size="sm">
          <Link href={href("default")}>
            <PaletteIcon /> Open the designs
          </Link>
        </Button>
      </div>
      {variants.isPending ? (
        <Skeleton className="mx-4 mb-4 h-20 rounded-xl" />
      ) : !v ? (
        <p className="text-ink-3 px-4 pb-4 text-[12.5px]">The designs could not be read. Reload to try again.</p>
      ) : (
        <ul className="m-0 list-none p-0">
          {!hasDefault ? (
            <li className="border-line-soft flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3">
              <span className="min-w-0">
                <span className="text-ink block text-[13.5px] font-medium">Everyone</span>
                <span className="text-ink-3 block text-[12px]">The built-in poster, until you choose or make one.</span>
              </span>
              <Button asChild size="sm" variant="secondary">
                <Link href={href("default")}>{canEdit ? "Choose a design" : "Open"}</Link>
              </Button>
            </li>
          ) : null}
          {rows.map((r) => (
            <li key={r.variant} className="border-line-soft flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3">
              <span className="min-w-0">
                <span className="text-ink block text-[13.5px] font-medium">{r.label}</span>
                <span className="text-ink-3 block text-[12px]">{savedFormatsNote(r.formats)}</span>
              </span>
              <span className="flex items-center gap-2">
                <Button asChild size="sm" variant="secondary">
                  <Link href={href(r.variant)}>{canEdit ? "Edit" : "Open"}</Link>
                </Button>
                {canEdit ? (
                  <Button size="sm" variant="ghost" aria-label={`Remove the design for ${r.label}`} onClick={() => setDropping({ variant: r.variant, label: r.label })}>
                    <Trash2Icon />
                  </Button>
                ) : null}
              </span>
            </li>
          ))}
          {canEdit && free.length ? (
            <li className="border-line-soft flex flex-wrap items-center gap-2 border-t px-4 py-3">
              <label htmlFor="poster-add-variant" className="text-ink-2 text-[12.5px] font-medium">
                A design of their own for
              </label>
              <NativeSelect id="poster-add-variant" size="sm" className="w-auto min-w-[180px]" value={adding} onChange={(e) => setAdding(e.target.value)}>
                <option value="">Choose…</option>
                {free.map((o) => (
                  <option key={o.variant} value={o.variant}>
                    {o.label}
                  </option>
                ))}
              </NativeSelect>
              {adding ? (
                <Button asChild size="sm">
                  <Link href={href(adding)}>
                    <PlusIcon /> Design it
                  </Link>
                </Button>
              ) : (
                <Button size="sm" disabled>
                  <PlusIcon /> Design it
                </Button>
              )}
            </li>
          ) : null}
        </ul>
      )}
      <Dialog open={dropping !== null} onOpenChange={(o) => !o && !remove.isPending && setDropping(null)}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>Remove the design for {dropping?.label}?</DialogTitle>
            <DialogDescription>
              Its square, portrait and story layouts are removed; these guests get the next design in line. Their posters are drawn again the next time they open them.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" disabled={remove.isPending} onClick={() => setDropping(null)}>
              Keep it
            </Button>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={async () => {
                if (!dropping) return;
                try {
                  await remove.mutateAsync(dropping.variant);
                  toast.success(`The design for ${dropping.label} is removed`);
                  setDropping(null);
                } catch (err) {
                  toast.error(errorCopy(err));
                }
              }}
            >
              {remove.isPending ? <Loader2Icon className="animate-spin" /> : null} Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </FigurePanel>
  );
}

// ─── The numbers ─────────────────────────────────────────────────────────

const ROLE_LABEL: Record<string, string> = { attendee: "Attendee", speaker: "Speaker", volunteer: "Volunteer", organiser: "Organiser" };

function Numbers({ eventId, st }: { eventId: number; st: PosterStats }) {
  const brought = st.registrations + st.requests;
  return (
    <div className="flex flex-col gap-3.5">
      <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Posters made"
          value={formatNumber(st.posters_made)}
          note={`of ${plural(st.guests_eligible, "guest")} who can make one · ${formatNumber(st.with_photo)} with a photo`}
          scale="hero"
        />
        <StatTile
          label="Shared or saved"
          value={formatNumber(st.shares + st.downloads)}
          note={`${formatNumber(st.shares)} shared · ${formatNumber(st.downloads)} downloaded · ${formatNumber(st.copies)} copied the caption or link (where the phone says so)`}
        />
        <StatTile label="Link clicks" value={formatNumber(st.link_clicks)} note={`${formatNumber(st.link_uniques)} people opened a guest's link`} />
        <StatTile
          label="Registrations brought in"
          value={formatNumber(brought)}
          note={st.requests ? `${formatNumber(st.registrations)} registered · ${formatNumber(st.requests)} asked to join` : "through guests' own links"}
          action={{ label: "In Tracking links as “Guest posters”", href: `/events/${eventId}/links` }}
          linkAs={Link}
        />
      </div>
      <div className="grid items-start gap-3.5 lg:grid-cols-[1fr_1.4fr]">
        <FigurePanel className="p-4">
          <CardLabel>Made</CardLabel>
          <dl className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1.5 text-[12.5px]">
            {MOMENTS.map((k) => (
              <React.Fragment key={k}>
                <dt className="text-ink-2">{MOMENT_INFO[k].title}</dt>
                <dd className="text-ink m-0 text-right font-mono tabular-nums">{formatNumber(st.by_moment[k] ?? 0)}</dd>
              </React.Fragment>
            ))}
            {POSTER_FORMATS.map((f, i) => (
              <React.Fragment key={f}>
                <dt className={cn("text-ink-2", i === 0 && "border-line-soft mt-1 border-t pt-2")}>{POSTER_FORMAT_SPECS[f].label}</dt>
                <dd className={cn("text-ink m-0 text-right font-mono tabular-nums", i === 0 && "border-line-soft mt-1 border-t pt-2")}>{formatNumber(st.by_format[f] ?? 0)}</dd>
              </React.Fragment>
            ))}
          </dl>
        </FigurePanel>
        <FigurePanel className="p-0">
          <div className="px-4 pt-4 pb-2">
            <CardLabel>Who brought the most</CardLabel>
          </div>
          {st.top.length ? (
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-ink-3 font-mono text-[10px] tracking-[0.06em] uppercase">
                  <th className="px-4 py-1.5 text-left font-normal">Guest</th>
                  <th className="px-2 py-1.5 text-right font-normal">Clicks</th>
                  <th className="px-4 py-1.5 text-right font-normal">Brought in</th>
                </tr>
              </thead>
              <tbody>
                {st.top.map((t, i) => (
                  <tr key={`${t.name}-${i}`} className="border-line-soft border-t">
                    <td className="px-4 py-2">
                      <span className="text-ink font-medium">{t.name}</span>
                      {t.role && t.role !== "attendee" ? <span className="text-ink-3"> · {ROLE_LABEL[t.role] ?? t.role}</span> : null}
                    </td>
                    <td className="text-ink-2 px-2 py-2 text-right font-mono tabular-nums">{formatNumber(t.clicks)}</td>
                    <td className="text-ink px-4 py-2 text-right font-mono tabular-nums">{formatNumber(t.registrations + t.requests)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-ink-3 px-4 pb-4 text-[12.5px]">Nobody has been brought in through a guest&apos;s link yet.</p>
          )}
        </FigurePanel>
      </div>
    </div>
  );
}

// ─── The page ────────────────────────────────────────────────────────────

function EmailLink({ eventId, token }: { eventId: number; token: string }) {
  return (
    <Notice
      tone="accent"
      tag="Email"
      action={
        <span className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              void navigator.clipboard?.writeText(token).then(
                () => toast.success("Copied", { description: `Paste ${token} into the ticket email.` }),
                () => toast.error("Could not copy; select it and copy it instead.")
              );
            }}
          >
            Copy {token}
          </Button>
          <Button asChild size="sm" variant="secondary">
            <Link href={`/events/${eventId}/emails`}>Emails</Link>
          </Button>
        </span>
      }
    >
      Put <code className="font-mono text-[12px]">{token}</code> in the ticket email (“Make your I&apos;m-attending poster”): it is each guest&apos;s own link to their poster.
      Their ticket page has it too.
    </Notice>
  );
}

/** Guest posters for one event: the switch, the moments, the formats, the designs and the numbers. */
export function PostersPage({ eventId }: { eventId: number }) {
  const settings = usePosterSettings(eventId);
  const s = settings.data;
  const stats = usePosterStats(eventId, !!s);
  const event = useEventDetail(eventId);
  const { can } = useAccess();
  const canEdit = Boolean(can.edit_events);
  const eventName = event.data?.name;
  // The moment the preview shows: the one being written, as it stands.
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const onDraft = React.useCallback((d: Draft) => setDraft(d), []);
  const moments = draft?.moments ?? s?.moments;
  // What guests see first: the earliest moment that is on (before, during, after).
  const previewKey: MomentKey = (moments && MOMENTS.find((k) => moments[k].enabled)) || "before";
  const previewMoment = moments ? moments[previewKey] : null;
  const st = stats.data;

  return (
    <div className="flex flex-col gap-3.5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="m-0 text-[17px] font-semibold tracking-[-0.02em]">Posters</h2>
          <p className="text-ink-2 mt-1 text-[13px]">
            {s && st && (s.enabled || st.posters_made)
              ? `${formatNumber(st.posters_made)} made · ${formatNumber(st.link_clicks)} link clicks · ${formatNumber(st.registrations + st.requests)} brought in`
              : "“I'm attending” pictures guests make with their photo and share with their own link."}
          </p>
        </div>
        <Button asChild variant="secondary">
          <Link href={`/events/${eventId}/design?kind=poster`}>
            <ImagePlusIcon /> Poster designs
          </Link>
        </Button>
      </header>

      {settings.isPending ? (
        <>
          <Skeleton className="h-[220px] rounded-2xl" />
          <Skeleton className="h-[320px] rounded-2xl" />
        </>
      ) : settings.isError ? (
        <EmptyState
          tone="muted"
          title="Could not load the poster settings"
          description={errorCopy(settings.error)}
          action={
            <Button variant="secondary" size="sm" onClick={() => void settings.refetch()}>
              Try again
            </Button>
          }
        />
      ) : !s ? (
        <EmptyState tone="muted" title="Posters are not here yet" description="Guests' “I'm attending” posters come with the next update of MyOtherApp." />
      ) : (
        <>
          {!canEdit ? (
            <Notice tone="neutral" tag="Read only">
              Your role can see the posters&apos; settings and numbers; changing them is for the club&apos;s owner, admins and editors.
            </Notice>
          ) : null}
          <SwitchPanel eventId={eventId} s={s} canEdit={canEdit} previewMoment={previewMoment!} previewKey={previewKey} eventName={eventName} />
          {s.enabled && canEdit ? <EmailLink eventId={eventId} token={s.poster_url_token} /> : null}
          {st && (s.enabled || st.posters_made > 0) ? <Numbers eventId={eventId} st={st} /> : null}
          <div className="grid items-start gap-3.5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <SettingsForm eventId={eventId} s={s} canEdit={canEdit} eventName={eventName} onDraft={onDraft} />
            <DesignsPanel eventId={eventId} canEdit={canEdit} />
          </div>
        </>
      )}
    </div>
  );
}
