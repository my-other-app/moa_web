"use client";

import * as React from "react";
import { CheckIcon, CopyIcon, ImagePlusIcon, Loader2Icon, RefreshCwIcon, XIcon } from "lucide-react";
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
  FigurePanel,
  NativeSelect,
  Segmented,
  StatusBadge,
  Switch,
  cn,
  toast,
} from "@moa/ui";

import { useFeatureGate } from "@/features/plan";
import { ColorField, contrast, TEXT_MIN } from "@/features/live";

import { errorText } from "../lib/time";
import { useFooterImage, useRotateScreen, useSaveSettings, useScreenLink, useUploadLogo } from "../queries";
import {
  BOARD_LAYOUTS,
  BOARD_ROWS,
  DEFAULT_NAME,
  MEDALS,
  SCREEN_COLOR_KEYS,
  type ScreenColorKey,
  type ScreenColors,
  GAME_FEATURE,
  NAME_MAX,
  THEMES,
  THEME_COLORS,
  THEME_LABEL,
  type BoardLayout,
  type GameKind,
  type GameSettings,
  type SettingsPatch,
  type ThemeKey,
} from "../schemas";
import { GameGateNotice } from "./gate-notice";

const BLURB: Record<GameKind, { off: string; on: string }> = {
  cards: {
    off: "Off: players see no card game. Switch it on once the heroes are ready.",
    on: "Players who are checked in reveal one hero each, then collect more by scanning each other's badges.",
  },
  hunt: {
    off: "Off: players see no hunt. Switch it on once the QR points are placed.",
    on: "Players follow clues to the QR codes you have placed around the venue and score points for each find.",
  },
};

/** The name as it would be saved, and what is wrong with it. */
export function nameProblem(name: string): string | null {
  const n = name.trim();
  if (!n) return "Give it a name.";
  if (n.length > NAME_MAX) return `At most ${NAME_MAX} characters.`;
  return null;
}

function GameSwitch({ eventId, kind, s, canEdit }: { eventId: number; kind: GameKind; s: GameSettings; canEdit: boolean }) {
  const save = useSaveSettings(eventId);
  const gate = useFeatureGate(GAME_FEATURE[kind], { eventId });
  const on = kind === "cards" ? s.cards_on : s.hunt_on;
  const saved = (kind === "cards" ? s.cards_name : s.hunt_name) || DEFAULT_NAME[kind];
  const [name, setName] = React.useState(saved);
  const [seen, setSeen] = React.useState(saved);
  if (saved !== seen) {
    setSeen(saved);
    setName(saved);
  }
  const id = React.useId();
  const problem = nameProblem(name);
  const dirty = name.trim() !== saved;
  const field = kind === "cards" ? "cards_name" : "hunt_name";
  const label = DEFAULT_NAME[kind];
  const editable = canEdit && !gate.locked;

  const toggle = async (next: boolean) => {
    try {
      await save.mutateAsync(kind === "cards" ? { cards_on: next } : { hunt_on: next });
      toast.success(next ? `${saved} is on` : `${saved} is off`, { description: next ? "Checked-in players can play it now." : "Players no longer see it. Scores and cards are kept." });
    } catch (err) {
      toast.error(errorText(err));
    }
  };
  const rename = async () => {
    if (problem || !dirty) return;
    try {
      await save.mutateAsync({ [field]: name.trim() } as SettingsPatch);
      toast.success("Name saved");
    } catch (err) {
      toast.error(errorText(err));
    }
  };

  return (
    <FigurePanel className="p-0">
      <div className="flex items-start justify-between gap-3 p-4">
        <span className="min-w-0">
          <span className="text-ink flex items-center gap-2 text-[15px] font-semibold">
            {label} <StatusBadge tone={on ? "success" : "default"} label={on ? "On" : "Off"} />
          </span>
          <span className="text-ink-3 mt-0.5 block text-[12.5px] leading-[1.5]">{on ? BLURB[kind].on : BLURB[kind].off}</span>
        </span>
        <Switch checked={on} disabled={!editable || save.isPending} aria-label={label} onCheckedChange={(v) => void toggle(v)} />
      </div>
      <form
        className="border-line-soft flex flex-wrap items-end gap-3 border-t p-4"
        onSubmit={(e) => {
          e.preventDefault();
          void rename();
        }}
      >
        <div className="min-w-[220px] flex-1">
          <label htmlFor={`${id}-name`} className="eyebrow mb-1.5 block">
            Name players see
          </label>
          <input id={`${id}-name`} className="input" aria-label={`${label} name`} value={name} maxLength={NAME_MAX + 10} disabled={!editable} onChange={(e) => setName(e.target.value)} />
          <p className={cn("mt-1 text-[11.5px]", problem ? "text-refuse" : "text-ink-3")}>
            {problem ?? `Shown on phones and venue screens. ${name.trim().length} of ${NAME_MAX}.`}
          </p>
        </div>
        {editable ? (
          <Button type="submit" variant="secondary" disabled={!dirty || Boolean(problem) || save.isPending}>
            Save name
          </Button>
        ) : null}
      </form>
      <GameGateNotice kind={kind} eventId={eventId} className="m-4 mt-0" />
    </FigurePanel>
  );
}

const ROW_OPTIONS = BOARD_ROWS.map((n) => ({ value: String(n), label: n === 0 ? "Everyone (scrolls)" : String(n) }));
const COLOR_LABEL: Record<ScreenColorKey, string> = {
  background: "Background",
  surface: "Rows and cards",
  text: "Text",
  accent: "Accent",
  gold: "1st place",
  silver: "2nd place",
  bronze: "3rd place",
};
const LAYOUT_OPTIONS = [
  { value: "podium", label: "Podium" },
  { value: "list", label: "List" },
] as const satisfies readonly { value: BoardLayout; label: string }[];

interface LookDraft {
  theme: ThemeKey;
  layout: BoardLayout;
  rows: number;
  ticker: boolean;
  join: boolean;
  colors: ScreenColors;
}
const lookOf = (s: GameSettings): LookDraft => ({ theme: s.theme, layout: s.board_layout, rows: s.board_rows, ticker: s.ticker_on, join: s.join_box_on, colors: { ...s.colors } });
const sameColors = (a: ScreenColors, b: ScreenColors) => SCREEN_COLOR_KEYS.every((k) => (a[k] ?? null) === (b[k] ?? null));

/** The colours the screen will draw with: the organiser's, else the theme's. */
export function screenColors(look: Pick<LookDraft, "theme" | "colors">) {
  const c = THEME_COLORS[look.theme];
  const o = look.colors;
  return {
    bg: o.background ?? c.bg,
    panel: o.surface ?? c.panel,
    ink: o.text ?? c.ink,
    accent: o.accent ?? c.accent,
    accent2: c.accent2,
    gold: o.gold ?? MEDALS.gold,
    silver: o.silver ?? MEDALS.silver,
    bronze: o.bronze ?? MEDALS.bronze,
  };
}

/** Text that will be hard to read on the screen (AA, 4.5:1, as the live room checks). */
export function colorWarning(look: Pick<LookDraft, "theme" | "colors">): string | null {
  const c = screenColors(look);
  const low = [c.bg, c.panel].some((fill) => contrast(c.ink, fill) < TEXT_MIN);
  return low ? "The text colour is hard to read on the background or the rows. Pick a lighter or darker text colour." : null;
}

/** What a save of the look would send: only what changed. */
export function lookPatch(s: GameSettings, d: LookDraft): SettingsPatch {
  const out: SettingsPatch = {};
  if (d.theme !== s.theme) out.theme = d.theme;
  if (d.layout !== s.board_layout) out.board_layout = d.layout;
  if (d.rows !== s.board_rows) out.board_rows = d.rows;
  if (d.ticker !== s.ticker_on) out.ticker_on = d.ticker;
  if (d.join !== s.join_box_on) out.join_box_on = d.join;
  if (!sameColors(d.colors, s.colors)) out.colors = SCREEN_COLOR_KEYS.some((k) => d.colors[k]) ? { ...d.colors } : null;
  return out;
}

const BOARD_SAMPLE = ["Kavya R.", "Arjun M.", "Nila S.", "Rahul P.", "Diya K.", "Farhan A.", "Ishita B.", "Joseph T.", "Meghna V.", "Player #247"];

/** The venue screen as it will read: theme, layout, rows, ticker and join box, with made-up names. */
export function ScreenPreview({ look, logo }: { look: LookDraft; logo: string | null }) {
  const c = screenColors(look);
  const shown = look.rows === 0 ? BOARD_SAMPLE.length : look.rows;
  const rows = BOARD_SAMPLE.slice(look.layout === "podium" ? 3 : 0, Math.min(shown, BOARD_SAMPLE.length));
  return (
    <div
      data-slot="screen-preview"
      data-theme-key={look.theme}
      role="img"
      aria-label={`Venue screen preview: ${THEME_LABEL[look.theme]}, ${look.layout}, ${look.rows === 0 ? "everyone" : `${look.rows} rows`}`}
      className="relative aspect-video w-full max-w-[420px] overflow-hidden rounded-xl p-3"
      style={{ background: c.bg, color: c.ink, fontFamily: "var(--font-jakarta), system-ui, sans-serif" }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold" style={{ fontFamily: "var(--font-unbounded), system-ui, sans-serif", color: c.accent }}>
          LEADERBOARD
        </span>
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt="" className="size-5 rounded object-cover" />
        ) : null}
      </div>
      {look.layout === "podium" ? (
        <div className="mt-2 flex items-end justify-center gap-1.5">
          {[1, 0, 2].map((i) => (
            <div key={i} className="flex w-14 flex-col items-center rounded-t-md border px-1 pt-1 text-center text-[8px]" style={{ background: c.panel, color: c.ink, borderColor: [c.gold, c.silver, c.bronze][i], height: 34 - i * 6 }}>
              <b style={{ color: [c.gold, c.silver, c.bronze][i] }}>{i + 1}</b>
              <span className="truncate">{BOARD_SAMPLE[i]}</span>
            </div>
          ))}
        </div>
      ) : null}
      <ol className="m-0 mt-1.5 grid list-none gap-px p-0 text-[8px]" style={{ gridTemplateColumns: look.rows > 5 ? "1fr 1fr" : "1fr" }}>
        {rows.map((n, i) => (
          <li key={n} className="flex justify-between rounded px-1.5 py-px" style={{ background: c.panel }}>
            <span>
              {(look.layout === "podium" ? i + 4 : i + 1)}. {n}
            </span>
            <span style={{ color: c.accent }}>{120 - i * 7}</span>
          </li>
        ))}
      </ol>
      {look.rows === 0 ? (
        <span className="mt-0.5 block text-[7px] opacity-70" data-slot="preview-everyone">
          …and everyone else, scrolling
        </span>
      ) : null}
      {look.ticker ? (
        <div className="absolute inset-x-2 bottom-1.5 rounded px-1.5 py-px text-[8px]" style={{ background: c.panel, color: c.ink, borderLeft: `3px solid ${c.accent}` }}>
          Legendary pulled! Someone found Solar Warden.
        </div>
      ) : null}
      {look.join ? (
        <div className="absolute right-2 bottom-6 grid size-8 place-items-center rounded text-[6px] font-bold" style={{ background: "#fff", color: "#000" }} aria-hidden="true">
          SCAN
        </div>
      ) : null}
    </div>
  );
}

function ScreenLinkRow({ eventId, canEdit }: { eventId: number; canEdit: boolean }) {
  const link = useScreenLink(eventId, true);
  const rotate = useRotateScreen(eventId);
  const [ask, setAsk] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const url = link.data?.url ?? "";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Could not copy. Select the address and copy it by hand.");
    }
  };
  return (
    <div>
      <span className="eyebrow mb-1.5 block">Venue screen link</span>
      <div className="flex flex-wrap items-center gap-2">
        <input readOnly aria-label="Venue screen address" className="input min-w-[240px] flex-1 font-mono text-[12px]" value={url} placeholder={link.isPending ? "Loading…" : "No address yet"} onFocus={(e) => e.currentTarget.select()} />
        <Button type="button" variant="secondary" disabled={!url} onClick={() => void copy()}>
          {copied ? <CheckIcon /> : <CopyIcon />} {copied ? "Copied" : "Copy link"}
        </Button>
        {canEdit ? (
          <Button type="button" variant="ghost" disabled={rotate.isPending} onClick={() => setAsk(true)}>
            <RefreshCwIcon /> Make a new link
          </Button>
        ) : null}
      </div>
      <p className="text-ink-3 mt-1 text-[11.5px] leading-[1.5]">Open it on the projector. Nobody needs to sign in, and it only shows the boards.</p>
      <AlertDialog open={ask} onOpenChange={setAsk}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Make a new screen link?</AlertDialogTitle>
            <AlertDialogDescription>The current link stops working at once, so any screen already open on it goes blank. Open the new link on each screen.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="secondary">Keep this link</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={(e) => {
                e.preventDefault();
                rotate.mutate(undefined, {
                  onSuccess: () => {
                    setAsk(false);
                    toast.success("New screen link made");
                  },
                  onError: (err) => toast.error(errorText(err)),
                });
              }}
            >
              Make a new link
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Theme, logo, board layout and rows, ticker, join box, and the venue screen link. */
export function LookPanel({ eventId, s, canEdit }: { eventId: number; s: GameSettings; canEdit: boolean }) {
  const save = useSaveSettings(eventId);
  const upload = useUploadLogo(eventId);
  const [draft, setDraft] = React.useState<LookDraft>(() => lookOf(s));
  const [seen, setSeen] = React.useState(s.updated_at);
  if (s.updated_at !== seen) {
    setSeen(s.updated_at);
    setDraft(lookOf(s));
  }
  const fileRef = React.useRef<HTMLInputElement>(null);
  const set = <K extends keyof LookDraft>(k: K, v: LookDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const patch = lookPatch(s, draft);
  const warning = colorWarning(draft);
  const dirty = Object.keys(patch).length > 0;

  const submit = async () => {
    if (!dirty) return;
    try {
      await save.mutateAsync(patch);
      toast.success("Look saved", { description: "Open venue screens and phones pick it up within a few seconds." });
    } catch (err) {
      toast.error(errorText(err));
    }
  };
  const pickLogo = async (file: File | undefined) => {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) return void toast.error("Use a PNG, JPG or WebP logo.");
    if (file.size > 2 * 1024 * 1024) return void toast.error("The logo is over 2 MB.");
    try {
      await upload.mutateAsync(file);
      toast.success("Logo saved");
    } catch (err) {
      toast.error(errorText(err));
    }
  };

  return (
    <FigurePanel className="p-0">
      <div className="p-4">
        <span className="text-ink block text-[15px] font-semibold">Look and screens</span>
        <span className="text-ink-3 mt-0.5 block text-[12.5px] leading-[1.5]">One look for both games, on phones and on the venue screen.</span>
      </div>
      <form
        className="border-line-soft grid gap-5 border-t p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <fieldset disabled={!canEdit} className="contents">
          <div className="grid content-start gap-4">
            <div>
              <span className="eyebrow mb-1.5 block">Theme</span>
              <div role="radiogroup" aria-label="Theme" className="grid grid-cols-2 gap-2">
                {THEMES.map((t) => {
                  const c = THEME_COLORS[t];
                  const picked = draft.theme === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      role="radio"
                      aria-checked={picked}
                      onClick={() => set("theme", t)}
                      className={cn("flex items-center gap-2 rounded-xl border px-2.5 py-2 text-left text-[13px] transition-colors", picked ? "border-brand bg-brand-soft" : "border-line hover:border-line-strong")}
                    >
                      <span className="flex shrink-0" aria-hidden="true">
                        {[c.bg, c.accent, c.accent2].map((col) => (
                          <span key={col} className="-ml-1 size-4 rounded-full border border-white/20 first:ml-0" style={{ background: col }} />
                        ))}
                      </span>
                      <span className="min-w-0 truncate">
                        {THEME_LABEL[t]}
                        {t === "neon_arcade" ? <span className="text-ink-3"> · default</span> : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <span className="eyebrow mb-1.5 block">Logo</span>
              <div className="flex items-center gap-3">
                <span className="bg-sunken grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl">
                  {s.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.logo_url} alt="Logo" className="size-full object-cover" />
                  ) : (
                    <ImagePlusIcon className="text-ink-3 size-5" aria-hidden="true" />
                  )}
                </span>
                <div className="flex flex-wrap gap-2">
                  <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label="Logo file" onChange={(e) => void pickLogo(e.target.files?.[0])} />
                  <Button type="button" variant="secondary" disabled={upload.isPending} onClick={() => fileRef.current?.click()}>
                    {upload.isPending ? <Loader2Icon className="animate-spin" /> : <ImagePlusIcon />} {s.logo_url ? "Change logo" : "Upload logo"}
                  </Button>
                  {s.logo_url ? (
                    <Button type="button" variant="ghost" disabled={save.isPending} onClick={() => save.mutate({ logo_url: null })}>
                      <XIcon /> Remove
                    </Button>
                  ) : null}
                </div>
              </div>
              <p className="text-ink-3 mt-1 text-[11.5px]">Square works best. PNG, JPG or WebP, up to 2 MB.</p>
            </div>

            <FooterImageField eventId={eventId} url={s.footer_image_url ?? null} />

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <span className="eyebrow mb-1.5 block">Board layout</span>
                <Segmented label="Board layout" value={draft.layout} options={LAYOUT_OPTIONS} onChange={(v) => set("layout", v)} />
                <p className="text-ink-3 mt-1 text-[11.5px] leading-[1.5]">{draft.layout === "podium" ? "The top three on a podium, then the rest." : "One list from first place down."}</p>
              </div>
              <div>
                <label htmlFor="games-rows" className="eyebrow mb-1.5 block">
                  Rows on the board
                </label>
                <NativeSelect id="games-rows" value={String(draft.rows)} onChange={(e) => set("rows", Number(e.target.value))} className="w-auto">
                  {ROW_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="eyebrow block">Screen colours</span>
                {SCREEN_COLOR_KEYS.some((k) => draft.colors[k]) ? (
                  <Button type="button" variant="ghost" size="sm" onClick={() => set("colors", { background: null, surface: null, text: null, accent: null, gold: null, silver: null, bronze: null })}>
                    Use the theme&apos;s colours
                  </Button>
                ) : null}
              </div>
              <div className="grid gap-2 sm:grid-cols-2" data-slot="screen-colors">
                {SCREEN_COLOR_KEYS.map((k) => {
                  const theme = screenColors({ theme: draft.theme, colors: { ...draft.colors, [k]: null } });
                  const fallback = { background: theme.bg, surface: theme.panel, text: theme.ink, accent: theme.accent, gold: theme.gold, silver: theme.silver, bronze: theme.bronze }[k];
                  return (
                    <div key={k} className="flex items-center justify-between gap-2">
                      <span className="text-ink-2 min-w-0 truncate text-[12.5px]">{COLOR_LABEL[k]}</span>
                      <span className="flex items-center gap-1">
                        <ColorField label={`${COLOR_LABEL[k]} colour`} value={draft.colors[k] ?? fallback} onChange={(v) => set("colors", { ...draft.colors, [k]: v })} invalid={k === "text" && warning != null} describe={warning ? "games-color-warning" : undefined} />
                        {draft.colors[k] ? (
                          <Button type="button" variant="ghost" size="icon-sm" aria-label={`${COLOR_LABEL[k]}: use the theme's`} onClick={() => set("colors", { ...draft.colors, [k]: null })}>
                            <XIcon />
                          </Button>
                        ) : null}
                      </span>
                    </div>
                  );
                })}
              </div>
              {warning ? (
                <p id="games-color-warning" role="status" className="text-caution mt-1.5 text-[11.5px] leading-[1.5]">
                  {warning}
                </p>
              ) : (
                <p className="text-ink-3 mt-1.5 text-[11.5px] leading-[1.5]">For the venue screen only, over the theme. Leave one as it is to keep the theme&apos;s.</p>
              )}
            </div>

            <div className="flex flex-wrap gap-x-6 gap-y-3">
              <label className="flex items-start gap-2.5">
                <Switch checked={draft.ticker} aria-label="Ticker" onCheckedChange={(v) => set("ticker", v)} />
                <span className="min-w-0">
                  <span className="text-ink block text-[13px] font-medium">Ticker</span>
                  <span className="text-ink-3 block text-[11.5px] leading-[1.5]">The latest three moments, like a Legendary pull.</span>
                </span>
              </label>
              <label className="flex items-start gap-2.5">
                <Switch checked={draft.join} aria-label="Join box" onCheckedChange={(v) => set("join", v)} />
                <span className="min-w-0">
                  <span className="text-ink block text-[13px] font-medium">Join box</span>
                  <span className="text-ink-3 block text-[11.5px] leading-[1.5]">A &quot;scan to join&quot; code on the screen.</span>
                </span>
              </label>
            </div>
          </div>

          <div className="grid content-start gap-2">
            <span className="eyebrow">Preview</span>
            <ScreenPreview look={draft} logo={s.logo_url} />
          </div>
        </fieldset>

        <div className="lg:col-span-2">
          <ScreenLinkRow eventId={eventId} canEdit={canEdit} />
        </div>
        {canEdit ? (
          <div className="border-line-soft flex items-center justify-end gap-2 border-t pt-3 lg:col-span-2" role="region" aria-label="Save look">
            {dirty ? (
              <Button type="button" variant="ghost" onClick={() => setDraft(lookOf(s))}>
                Undo changes
              </Button>
            ) : null}
            <Button type="submit" disabled={!dirty || save.isPending}>
              {save.isPending ? "Saving…" : "Save look"}
            </Button>
          </div>
        ) : null}
      </form>
    </FigurePanel>
  );
}

export function SetupPanel({ eventId, s, canEdit }: { eventId: number; s: GameSettings; canEdit: boolean }) {
  return (
    <div className="flex flex-col gap-3.5">
      <GameSwitch eventId={eventId} kind="cards" s={s} canEdit={canEdit} />
      <GameSwitch eventId={eventId} kind="hunt" s={s} canEdit={canEdit} />
      <LookPanel eventId={eventId} s={s} canEdit={canEdit} />
    </div>
  );
}

/** One wide picture along the venue screen's foot in place of the host and partner logos. */
function FooterImageField({ eventId, url }: { eventId: number; url: string | null }) {
  const set = useFooterImage(eventId);
  const ref = React.useRef<HTMLInputElement>(null);
  return (
    <div>
      <span className="eyebrow mb-1.5 block">Footer image</span>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="Footer image" className="bg-sunken mb-2 h-12 w-full rounded-lg object-contain" />
      ) : null}
      <div className="flex flex-wrap gap-2">
        <input
          ref={ref}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          aria-label="Footer image file"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) set.mutate(file);
            e.target.value = "";
          }}
        />
        <Button type="button" variant="secondary" disabled={set.isPending} onClick={() => ref.current?.click()}>
          {set.isPending ? <Loader2Icon className="animate-spin" /> : <ImagePlusIcon />} {url ? "Change footer image" : "Upload footer image"}
        </Button>
        {url ? (
          <Button type="button" variant="ghost" disabled={set.isPending} onClick={() => set.mutate(null)}>
            <XIcon /> Use the logos
          </Button>
        ) : null}
      </div>
      <p className="text-ink-3 mt-1 text-[11.5px]">Optional. One wide picture (about 3000 x 300) shown along the bottom of the venue screen instead of the host and partner logos.</p>
    </div>
  );
}
