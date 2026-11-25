"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangleIcon, CheckIcon, ImagePlusIcon, Loader2Icon, MonitorIcon, PresentationIcon, Trash2Icon, XIcon } from "lucide-react";
import {
  Button,
  CardLabel,
  Checkbox,
  Chip,
  FigurePanel,
  NativeSelect,
  Notice,
  Segmented,
  Skeleton,
  Switch,
  cn,
} from "@moa/ui";

import { usePick } from "@/features/club";
import { useEventDetail } from "@/features/events/queries";

import {
  useMedia,
  useScreenControl,
  useScreenControlMutation,
  useTheme,
  useThemeCheck,
  useThemeMutations,
  useThemePresets,
} from "../queries";
import {
  BODY_FONTS,
  DISPLAY_FONTS,
  IDLE_SLIDES,
  PRESET_KEYS,
  SCREEN_MODES,
  type IdleSlide,
  type Media,
  type PresetKey,
  type ScreenControl,
  type ScreenMode,
  type ThemeOut,
  type ThemePreset,
  type Verdict,
} from "../schemas";
import {
  ACCENT_MIN,
  BODY_FONT_LABEL,
  DISPLAY_FONT_LABEL,
  PRESET_HINTS,
  PRESET_NAMES,
  SHAPES,
  draftOf,
  isHex,
  judge,
  presetDraft,
  ratio,
  resolveDraft,
  textOn,
  type ThemeDraft,
} from "../theme";
import { useConfirmed } from "./quiz-host";
import { LookPreview } from "./look-preview";

/**
 * The Look tab: how the big screen and the guests' phones draw this event's
 * live room. Everything starts from a preset and changes through a few
 * controls — never free-form styles — and colours that would not read are
 * refused before they reach a projector (CONTRACT 1.2). The preview beside
 * the controls is the real stage.
 *
 * Below it, the big screen's live controls: what it shows, whether results
 * show while a question runs, the ticker, the slides between items.
 */

const LETTERS = "ABCDEF";

export function ColorField({ label, value, onChange, invalid, describe }: { label: string; value: string; onChange: (v: string) => void; invalid?: boolean; describe?: string }) {
  const [text, setText] = React.useState<string | null>(null);
  return (
    <span className="flex items-center gap-1.5">
      <input
        type="color"
        aria-label={`${label} colour picker`}
        className="border-line h-8 w-9 shrink-0 cursor-pointer rounded-md border bg-transparent p-0.5"
        value={isHex(value) ? value : "#000000"}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
      />
      <input
        className={cn("input input-sm h-8 w-[92px] font-mono text-[12px] uppercase", invalid && "border-refuse")}
        aria-label={label}
        aria-invalid={invalid || undefined}
        aria-describedby={describe}
        value={text ?? value}
        maxLength={7}
        onChange={(e) => {
          const v = e.target.value.trim();
          setText(v);
          if (isHex(v)) onChange(v.toUpperCase());
        }}
        onBlur={() => setText(null)}
      />
    </span>
  );
}

function Field({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="grid content-start gap-1.5">
      <span className="text-ink text-[12.5px] font-medium">{label}</span>
      {children}
      {hint ? <span className="text-ink-3 text-[11.5px] leading-snug">{hint}</span> : null}
    </div>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  const id = React.useId();
  return (
    <label className="flex cursor-pointer items-start gap-2.5" htmlFor={id}>
      <Switch id={id} checked={checked} onCheckedChange={onChange} className="mt-0.5" aria-label={label} />
      <span className="leading-tight">
        <span className="text-ink block text-[12.5px] font-medium">{label}</span>
        {hint ? <span className="text-ink-3 block text-[11.5px]">{hint}</span> : null}
      </span>
    </label>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-line-soft grid gap-3.5 border-t pt-4 first:border-t-0 first:pt-0">
      <h3 className="eyebrow">{title}</h3>
      {children}
    </section>
  );
}

/** A colour's text sample: "Aa" in the colour the server would pick for it, with the ratio. */
function Swatch({ fill, label }: { fill: string; label: string }) {
  const ink = isHex(fill) ? (textOn(fill) ?? "#FFFFFF") : "#FFFFFF";
  return (
    <span
      className="inline-grid h-8 min-w-8 place-items-center rounded-md px-1.5 font-semibold"
      style={{ background: isHex(fill) ? fill : "transparent", color: ink, fontSize: 12 }}
      title={isHex(fill) ? `${label}: text ${ink} at ${ratio(ink, fill)}:1` : label}
      aria-hidden="true"
    >
      Aa
    </span>
  );
}

function VerdictLines({ errors, warnings }: { errors: Verdict[]; warnings: Verdict[] }) {
  if (!errors.length && !warnings.length)
    return (
      <p className="text-admit flex items-center gap-1.5 text-[12px]">
        <CheckIcon className="size-3.5" aria-hidden="true" /> Every colour reads: text is picked for each fill to meet WCAG AA.
      </p>
    );
  return (
    <ul className="grid gap-1" aria-live="polite">
      {errors.map((e) => (
        <li key={`${e.field}-${e.code}`} className="text-refuse flex items-start gap-1.5 text-[12px]" role="alert">
          <XIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" /> {e.message}
        </li>
      ))}
      {warnings.map((w) => (
        <li key={`${w.field}-${w.code}`} className="text-caution flex items-start gap-1.5 text-[12px]">
          <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" /> {w.message}
        </li>
      ))}
    </ul>
  );
}

/** A picture for the look: none, the club's logo, one already uploaded, or a new one. */
function PicturePicker({
  eventId,
  kind,
  value,
  onChange,
  library,
  clubLogo,
}: {
  eventId: number;
  kind: "logo" | "background";
  /** A media id, "club", or null. */
  value: string | null;
  onChange: (v: string | null) => void;
  library: Media[];
  clubLogo: Media | null;
}) {
  const { upload, removeMedia } = useThemeMutations(eventId);
  const pick = usePick(
    (file) => upload.mutateAsync({ file, kind }).then((m) => (m.id ? onChange(m.id) : undefined)),
    kind === "logo" ? "logo" : "background picture",
  );
  const mine = library.filter((m) => m.kind === kind && m.id);
  const thumb = (m: Media) => m.thumbnail ?? m.medium ?? m.original ?? undefined;
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label={kind === "logo" ? "Logo" : "Background picture"}>
        <Chip active={value === null} onClick={() => onChange(null)}>
          None
        </Chip>
        {kind === "logo" && clubLogo ? (
          <button
            type="button"
            role="radio"
            aria-checked={value === "club"}
            aria-label="The club's logo"
            onClick={() => onChange("club")}
            className={cn("grid size-12 place-items-center overflow-hidden rounded-lg border bg-white p-1", value === "club" ? "border-brand ring-brand/30 ring-2" : "border-line")}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={thumb(clubLogo)} alt="" className="max-h-full max-w-full object-contain" />
          </button>
        ) : null}
        {mine.map((m) => (
          <span key={m.id} className="group relative">
            <button
              type="button"
              role="radio"
              aria-checked={value === m.id}
              aria-label={`Uploaded ${kind === "logo" ? "logo" : "picture"}`}
              onClick={() => onChange(m.id!)}
              className={cn("grid size-12 place-items-center overflow-hidden rounded-lg border", kind === "logo" ? "bg-white p-1" : "", value === m.id ? "border-brand ring-brand/30 ring-2" : "border-line")}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={thumb(m)} alt="" className={kind === "logo" ? "max-h-full max-w-full object-contain" : "size-full object-cover"} />
            </button>
            <button
              type="button"
              aria-label="Delete this picture"
              className="bg-surface border-line text-ink-3 hover:text-refuse absolute -top-1.5 -right-1.5 hidden size-5 place-items-center rounded-full border group-focus-within:grid group-hover:grid"
              onClick={() => {
                if (value === m.id) onChange(null);
                removeMedia.mutate(m.id!);
              }}
            >
              <Trash2Icon className="size-3" />
            </button>
          </span>
        ))}
        <Button size="sm" variant="outline" onClick={pick.open} disabled={upload.isPending || pick.preparing}>
          {upload.isPending || pick.preparing ? <Loader2Icon className="size-3.5 animate-spin" /> : <ImagePlusIcon className="size-3.5" />}
          {upload.isPending ? "Uploading…" : "Upload"}
        </Button>
        {pick.input}
      </div>
      <span className="text-ink-3 text-[11.5px]">
        {kind === "logo" ? "A PNG with a clear background works best; it is resized for each screen." : "A wide photo (1920 × 1080 is ideal). It is resized for each screen and dimmed under the text."}
      </span>
    </div>
  );
}

const ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];

function ThemeEditor({
  eventId,
  saved,
  presets,
  library,
  eventName,
  control,
}: {
  eventId: number;
  saved: ThemeOut;
  presets: ThemePreset[] | null;
  library: Media[];
  eventName: string;
  control: ScreenControl | null;
}) {
  const detail = useEventDetail(eventId);
  const start = React.useMemo(() => draftOf(saved.theme), [saved.theme]);
  const [draft, setDraft] = React.useState<ThemeDraft>(start);
  const { save, reset } = useThemeMutations(eventId);
  const dirty = JSON.stringify(draft) !== JSON.stringify(start);
  const local = judge(draft);
  // The server's verdict once the editing settles; until it answers, the editor's own.
  const check = useThemeCheck(eventId, dirty || !saved.custom ? draft : null);
  const verdict = check.data && !check.isPlaceholderData ? { errors: check.data.errors, warnings: check.data.warnings } : local;
  const errors = [...local.errors, ...verdict.errors.filter((e) => !local.errors.some((l) => l.field === e.field))];
  const warnings = dirty || !saved.custom ? verdict.warnings : saved.warnings;
  const clubLogo = presets?.find((p) => p.key === "club")?.theme.logo ?? null;
  const media = React.useMemo(() => Object.fromEntries(library.filter((m) => m.id).map((m) => [m.id!, m])), [library]);
  const theme = resolveDraft(draft, media, clubLogo);
  const set = <K extends keyof ThemeDraft>(k: K, v: Partial<ThemeDraft[K]>) =>
    setDraft((d) => ({ ...d, [k]: typeof v === "object" && v !== null && !Array.isArray(v) ? { ...(d[k] as object), ...v } : v }));
  const choosePreset = (key: PresetKey) => {
    const p = presets?.find((x) => x.key === key);
    // Choosing a preset replaces everything with its values (CONTRACT 1.3).
    setDraft(p ? draftOf(p.theme) : presetDraft(key));
  };
  const resetting = useConfirmed(
    {
      title: "Back to the room's own look?",
      body: "The big screen and every phone go back to how the live room always looked. Pictures you uploaded stay in the library.",
      confirm: "Use the room's own look",
    },
    () => reset.mutate(),
  );
  const accentRatio = isHex(draft.colors.accent) && isHex(draft.colors.background) ? ratio(draft.colors.accent, draft.colors.background) : null;
  const fieldError = (f: string) => errors.some((e) => e.field === f || e.field.startsWith(`${f}.`));
  const warnFor = (i: number) => warnings.some((w) => w.field === `colors.answers.${i}`);
  const canSave = (dirty || !saved.custom) && errors.length === 0 && !save.isPending;
  const verdictId = React.useId();

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(360px,430px)_minmax(0,1fr)]">
      <FigurePanel className="grid gap-5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="page-title text-[18px]">The look</h2>
            <p className="text-ink-3 mt-1 text-[12.5px]">
              {saved.custom
                ? "This event has its own look on the big screen and every phone."
                : "This event uses the room's own look. Pick a preset to give it yours."}
            </p>
          </div>
          {saved.custom ? (
            <Button size="sm" variant="ghost" onClick={resetting.ask} disabled={reset.isPending}>
              Use the room&apos;s own look
            </Button>
          ) : null}
        </div>

        <Group title="Start from">
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Preset">
            {PRESET_KEYS.map((key) => {
              const p = presets?.find((x) => x.key === key)?.theme;
              const colors = p?.colors ?? presetDraft(key).colors;
              return (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={draft.preset === key}
                  onClick={() => choosePreset(key)}
                  className={cn(
                    "flex items-center gap-2.5 rounded-[var(--radius-field)] border p-2 text-left transition-colors",
                    draft.preset === key ? "border-brand-line bg-brand-soft" : "border-line hover:bg-sunken",
                  )}
                >
                  <span className="grid size-10 shrink-0 grid-cols-2 gap-0.5 overflow-hidden rounded-md p-1" style={{ background: colors.background }} aria-hidden="true">
                    <span className="rounded-[3px]" style={{ background: colors.accent }} />
                    {colors.answers.slice(0, 3).map((c) => (
                      <span key={c} className="rounded-[3px]" style={{ background: c }} />
                    ))}
                  </span>
                  <span className="min-w-0">
                    <span className="text-ink block text-[12.5px] font-medium">{PRESET_NAMES[key]}</span>
                    <span className="text-ink-3 block truncate text-[11px]">{PRESET_HINTS[key]}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </Group>

        <Group title="Colours">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Background">
              <span className="flex items-center gap-2">
                <ColorField label="Background" value={draft.colors.background} onChange={(background) => set("colors", { background })} invalid={fieldError("colors.background")} describe={verdictId} />
                <Swatch fill={draft.colors.background} label="Background" />
              </span>
            </Field>
            <Field label="Accent" hint={accentRatio !== null ? `${accentRatio}:1 on the background (at least ${ACCENT_MIN}:1)` : undefined}>
              <span className="flex items-center gap-2">
                <ColorField label="Accent" value={draft.colors.accent} onChange={(accent) => set("colors", { accent })} invalid={fieldError("colors.accent")} describe={verdictId} />
                <Swatch fill={draft.colors.accent} label="Accent" />
              </span>
            </Field>
          </div>
          <Field label="Answers" hint="Each answer keeps its colour on the screen and the phones; a shape or letter goes with it for colour-blind players.">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {draft.colors.answers.map((c, i) => (
                <span key={i} className="flex items-center gap-1.5">
                  <span className={cn("w-4 text-center font-mono text-[11px]", warnFor(i) ? "text-caution" : "text-ink-3")} aria-hidden="true">
                    {draft.answers.style === "letters" ? LETTERS[i] : SHAPES[i]}
                  </span>
                  <ColorField
                    label={`Answer ${LETTERS[i]}`}
                    value={c}
                    onChange={(v) => set("colors", { answers: draft.colors.answers.map((a, j) => (j === i ? v : a)) })}
                    invalid={fieldError("colors.answers")}
                    describe={verdictId}
                  />
                </span>
              ))}
            </div>
          </Field>
          <div id={verdictId}>
            <VerdictLines errors={errors} warnings={warnings} />
          </div>
        </Group>

        <Group title="Background">
          <Segmented
            label="Background kind"
            value={draft.background.kind}
            options={[
              { value: "color", label: "Colour" },
              { value: "gradient", label: "Gradient" },
              { value: "image", label: "Picture" },
            ]}
            onChange={(kind) =>
              set("background", {
                kind,
                gradient: kind === "gradient" ? (draft.background.gradient ?? { from: draft.colors.background, to: draft.colors.background, angle: 135 }) : draft.background.gradient,
              })
            }
          />
          {draft.background.kind === "gradient" && draft.background.gradient ? (
            <div className="flex flex-wrap items-center gap-3">
              <ColorField label="Gradient from" value={draft.background.gradient.from} onChange={(from) => set("background", { gradient: { ...draft.background.gradient!, from } })} invalid={fieldError("background.gradient")} />
              <ColorField label="Gradient to" value={draft.background.gradient.to} onChange={(to) => set("background", { gradient: { ...draft.background.gradient!, to } })} invalid={fieldError("background.gradient")} />
              <NativeSelect size="sm" className="w-[110px]" aria-label="Gradient direction" value={draft.background.gradient.angle} onChange={(e) => set("background", { gradient: { ...draft.background.gradient!, angle: Number(e.target.value) } })}>
                {ANGLES.map((a) => (
                  <option key={a} value={a}>
                    {a}°
                  </option>
                ))}
              </NativeSelect>
            </div>
          ) : null}
          {draft.background.kind === "image" ? (
            <>
              <PicturePicker eventId={eventId} kind="background" value={draft.background.image} onChange={(image) => set("background", { image })} library={library} clubLogo={null} />
              <Field label={`Dim the picture under the text: ${Math.round(draft.background.dim * 100)}%`}>
                <input
                  type="range"
                  min={0.3}
                  max={0.8}
                  step={0.05}
                  aria-label="How much the picture is dimmed"
                  value={draft.background.dim}
                  onChange={(e) => set("background", { dim: Math.round(Number(e.target.value) * 100) / 100 })}
                />
              </Field>
            </>
          ) : null}
          <Field label="Phones">
            <Segmented
              label="Phones' background"
              value={draft.guest.background}
              options={[
                { value: "plain", label: "Their own page" },
                { value: "theme", label: "This background" },
              ]}
              onChange={(background) => set("guest", { background })}
            />
          </Field>
        </Group>

        <Group title="Logo">
          <PicturePicker eventId={eventId} kind="logo" value={draft.logo} onChange={(logo) => setDraft((d) => ({ ...d, logo }))} library={library} clubLogo={clubLogo} />
          <div className="flex flex-wrap gap-x-6 gap-y-3">
            <Toggle label="On the big screen" checked={draft.screen.logo} onChange={(logo) => set("screen", { logo })} />
            <Toggle label="On phones" checked={draft.guest.logo} onChange={(logo) => set("guest", { logo })} />
          </div>
        </Group>

        <Group title="Type">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Headings" hint={draft.font.display === "bebas_neue" ? "Capitals only: used for headings, never body text." : undefined}>
              <NativeSelect aria-label="Heading font" value={draft.font.display} onChange={(e) => set("font", { display: e.target.value as ThemeDraft["font"]["display"] })}>
                {DISPLAY_FONTS.map((f) => (
                  <option key={f} value={f}>
                    {DISPLAY_FONT_LABEL[f]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Everything else">
              <NativeSelect aria-label="Body font" value={draft.font.body} onChange={(e) => set("font", { body: e.target.value as ThemeDraft["font"]["body"] })}>
                {BODY_FONTS.map((f) => (
                  <option key={f} value={f}>
                    {BODY_FONT_LABEL[f]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label={`Big screen text: ${Math.round(draft.screen.text_scale * 100)}%`}>
              <input type="range" min={0.8} max={1.6} step={0.05} aria-label="Big screen text size" value={draft.screen.text_scale} onChange={(e) => set("screen", { text_scale: Math.round(Number(e.target.value) * 100) / 100 })} />
            </Field>
            <Field label={`Phone text: ${Math.round(draft.guest.text_scale * 100)}%`}>
              <input type="range" min={0.9} max={1.3} step={0.05} aria-label="Phone text size" value={draft.guest.text_scale} onChange={(e) => set("guest", { text_scale: Math.round(Number(e.target.value) * 100) / 100 })} />
            </Field>
          </div>
        </Group>

        <Group title="Answers and timer">
          <Field label="Answers look like">
            <Segmented
              label="Answer style"
              value={draft.answers.style}
              options={[
                { value: "shapes", label: "Colour + shape" },
                { value: "letters", label: "Colour + letter" },
                { value: "plain", label: "Plain list" },
              ]}
              onChange={(style) => set("answers", { style })}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="On the big screen">
              <Segmented label="Answer layout on the big screen" value={draft.screen.answer_layout} options={[{ value: "grid", label: "Grid" }, { value: "column", label: "Column" }]} onChange={(answer_layout) => set("screen", { answer_layout })} />
            </Field>
            <Field label="On phones">
              <Segmented label="Answer layout on phones" value={draft.guest.answer_layout} options={[{ value: "grid", label: "Grid" }, { value: "column", label: "Column" }]} onChange={(answer_layout) => set("guest", { answer_layout })} />
            </Field>
          </div>
          <Field label="Timer">
            <Segmented
              label="Timer style"
              value={draft.timer}
              options={[
                { value: "bar", label: "Bar" },
                { value: "ring", label: "Ring" },
                { value: "number", label: "Number" },
                { value: "hidden", label: "Hidden" },
              ]}
              onChange={(timer) => setDraft((d) => ({ ...d, timer }))}
            />
          </Field>
        </Group>

        <Group title="Big screen">
          <Field label="Join code and QR" hint={draft.screen.join === "corner" ? "Small in a corner, always — latecomers can still get in." : draft.screen.join === "lobby" ? "Full screen while the quiz waits in its lobby, then gone." : "Never shown: you share the way in yourself."}>
            <Segmented
              label="Join panel"
              value={draft.screen.join}
              options={[
                { value: "corner", label: "In a corner" },
                { value: "lobby", label: "Lobby, full screen" },
                { value: "hidden", label: "Hidden" },
              ]}
              onChange={(join) => set("screen", { join })}
            />
          </Field>
          <Toggle label="Sponsor strip along the bottom" hint="The event's sponsors, from the event's partners." checked={draft.screen.sponsors} onChange={(sponsors) => set("screen", { sponsors })} />
          <Field label="Leaderboard">
            <Segmented
              label="Leaderboard size"
              value={String(draft.leaderboard.size) as "5" | "10"}
              options={[
                { value: "5", label: "Top 5" },
                { value: "10", label: "Top 10" },
              ]}
              onChange={(v) => set("leaderboard", { size: Number(v) as 5 | 10 })}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Toggle label="Podium at the end" hint="The top three on steps." checked={draft.leaderboard.podium} onChange={(podium) => set("leaderboard", { podium })} />
            <Toggle label="Rows slide into place" hint="Always still for anyone who asked their device for less motion." checked={draft.leaderboard.animate} onChange={(animate) => set("leaderboard", { animate })} />
            <Toggle label="Players see their own rank" checked={draft.leaderboard.own_rank} onChange={(own_rank) => set("leaderboard", { own_rank })} />
          </div>
        </Group>

        <div className="border-line-soft bg-surface sticky bottom-0 -mx-5 -mb-5 flex flex-wrap items-center justify-end gap-2 rounded-b-2xl border-t px-5 py-3">
          <span className="text-ink-3 mr-auto text-[12px]" aria-live="polite">
            {save.isPending ? "Saving…" : errors.length ? "Fix the colours above to save." : dirty ? "Unsaved changes" : saved.custom ? "Saved" : "Not in use yet"}
          </span>
          {dirty ? (
            <Button variant="outline" onClick={() => setDraft(start)}>
              Discard
            </Button>
          ) : null}
          <Button onClick={() => save.mutate(draft)} disabled={!canSave}>
            {saved.custom ? "Save look" : "Use this look"}
          </Button>
        </div>
        {resetting.dialog}
      </FigurePanel>

      <div className="grid gap-4 xl:sticky xl:top-4">
        <LookPreview theme={theme} eventName={eventName} event={{ id: eventId, slug: detail.data?.slug }} control={control} />
      </div>
    </div>
  );
}

// --- the big screen's controls ----------------------------------------------------------------------

const MODE_LABEL: Record<ScreenMode, string> = {
  auto: "Whatever is on",
  quiz: "The quiz",
  poll: "The poll",
  qa: "Q&A wall",
  idle: "Slides",
  leaderboard: "Leaderboard",
};
const MODE_HINT: Record<ScreenMode, string> = {
  auto: "A running quiz, else the poll up, else a pinned question, else your slides.",
  quiz: "The current round, even between questions.",
  poll: "The poll up now, or the last one closed.",
  qa: "The pinned question and the most-voted ones.",
  idle: "The slides below, in turn.",
  leaderboard: "The board across the rounds, or the round's.",
};
const SLIDE_LABEL: Record<IdleSlide, string> = { agenda: "What's on now and next", sponsors: "Sponsors", join: "How to join" };

export function ScreenModeSelect({ eventId, className }: { eventId: number; className?: string }) {
  const control = useScreenControl(eventId);
  const put = useScreenControlMutation(eventId);
  if (!control.data) return null;
  return (
    <NativeSelect
      size="sm"
      className={cn("w-[180px]", className)}
      aria-label="What the big screen shows"
      value={control.data.mode}
      onChange={(e) => put.mutate({ mode: e.target.value as ScreenMode })}
      disabled={put.isPending}
    >
      {SCREEN_MODES.map((m) => (
        <option key={m} value={m}>
          Screen: {MODE_LABEL[m]}
        </option>
      ))}
    </NativeSelect>
  );
}

function ScreenControls({ eventId, control }: { eventId: number; control: ScreenControl }) {
  const put = useScreenControlMutation(eventId);
  const change = (c: Partial<ScreenControl>) => put.mutate(c);
  const toggleSlide = (s: IdleSlide, on: boolean) => {
    const next = on ? [...control.idle_slides, s] : control.idle_slides.filter((x) => x !== s);
    change({ idle_slides: IDLE_SLIDES.filter((x) => next.includes(x)) });
  };
  return (
    <FigurePanel className="grid gap-4 p-5">
      <CardLabel
        right={
          <span className="flex gap-2">
            <Link href={`/present/${eventId}`} target="_blank" className="btn btn-secondary btn-xs">
              <PresentationIcon className="size-3.5" /> Present
            </Link>
            <Link href={`/screen/${eventId}`} target="_blank" className="btn btn-secondary btn-xs">
              <MonitorIcon className="size-3.5" /> Big screen
            </Link>
          </span>
        }
      >
        On the big screen now
      </CardLabel>
      <p className="text-ink-3 -mt-2 text-[12px]">These change the screen at once, in any look.</p>
      <Field label="It shows" hint={MODE_HINT[control.mode]}>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="What the big screen shows">
          {SCREEN_MODES.map((m) => (
            <Chip key={m} active={control.mode === m} onClick={() => change({ mode: m })} disabled={put.isPending}>
              {MODE_LABEL[m]}
            </Chip>
          ))}
        </div>
      </Field>
      <Field label="While a question or poll is open" hint={control.results === "live" ? "The answers' counts fill in as the room answers." : "Only the question; the counts wait for the answer or for the poll to close."}>
        <Segmented
          label="Results on the big screen"
          value={control.results}
          options={[
            { value: "live", label: "Show live results" },
            { value: "hidden", label: "Question only" },
          ]}
          onChange={(results) => change({ results })}
        />
      </Field>
      <Toggle label="Updates as a running ticker" hint="Off: the latest update as one strip, as before." checked={control.ticker} onChange={(ticker) => change({ ticker })} />
      <Field label="Slides between items" hint="Shown in turn when nothing else is up (and whenever the screen is set to Slides).">
        <div className="grid gap-2">
          {IDLE_SLIDES.map((s) => (
            <label key={s} className="flex items-center gap-2 text-[12.5px]">
              <Checkbox checked={control.idle_slides.includes(s)} onCheckedChange={(v) => toggleSlide(s, v === true)} aria-label={SLIDE_LABEL[s]} />
              <span className="text-ink">{SLIDE_LABEL[s]}</span>
            </label>
          ))}
        </div>
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Each slide for">
          <NativeSelect size="sm" aria-label="Seconds per slide" value={control.slide_seconds} onChange={(e) => change({ slide_seconds: Number(e.target.value) })}>
            {[5, 8, 10, 12, 15, 20, 30, 45, 60].map((n) => (
              <option key={n} value={n}>
                {n} seconds
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Q&A wall">
          <NativeSelect size="sm" aria-label="Questions on the Q&A wall" value={control.wall_size} onChange={(e) => change({ wall_size: Number(e.target.value) })}>
            {[3, 4, 5, 6, 8, 10, 12].map((n) => (
              <option key={n} value={n}>
                {n} questions
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>
    </FigurePanel>
  );
}

export function LookPanel({ eventId }: { eventId: number }) {
  const theme = useTheme(eventId);
  const presets = useThemePresets(eventId);
  const media = useMedia(eventId);
  const control = useScreenControl(eventId);
  const detail = useEventDetail(eventId);
  if (theme.isPending) return <Skeleton className="h-96" />;
  if (theme.isError) return <Notice tone="refuse">The look could not load. Try again in a moment.</Notice>;
  if (theme.data === null)
    return <Notice tone="neutral">The room&apos;s look can be changed once this server has the update that brings it. Everything else in the live room works as before.</Notice>;
  return (
    <div className="grid gap-5">
      <ThemeEditor
        // A save or a reset elsewhere starts the editor again from what is saved.
        key={`${theme.data.version}:${theme.data.custom}`}
        eventId={eventId}
        saved={theme.data}
        presets={presets.data ?? null}
        library={media.data ?? []}
        eventName={detail.data?.name ?? "Your event"}
        control={control.data ?? null}
      />
      {control.data ? <ScreenControls eventId={eventId} control={control.data} /> : null}
    </div>
  );
}
