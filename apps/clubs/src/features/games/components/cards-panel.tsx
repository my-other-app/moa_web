"use client";

import * as React from "react";
import { formatNumber } from "@moa/app-kit";
import { Button, FigurePanel, Notice, Segmented, Skeleton, Switch, cn, toast } from "@moa/ui";

import { errorText } from "../lib/time";
import { useCardConfig, useCardLive, useSaveCardConfig } from "../queries";
import {
  FLOOR_MIN,
  PRESETS,
  PRESET_LABEL,
  PRESET_SHARES,
  TIERS,
  TIER_LABEL,
  floorProblem,
  presetOf,
  sharesProblem,
  sharesTotal,
  smallHardWarning,
  type CardConfig,
  type CardConfigPatch,
  type CardLive,
  type PresetKey,
  type Shares,
  type Tier,
} from "../schemas";
import { GameGateNotice } from "./gate-notice";

export interface RulesDraft {
  shares: Record<Tier, string>;
  floor: string;
  pin_required: boolean;
  collect_on: boolean;
  two_way: boolean;
  show_holders: boolean;
}

export const draftOf = (c: CardConfig): RulesDraft => ({
  shares: { common: String(c.shares.common), uncommon: String(c.shares.uncommon), rare: String(c.shares.rare), legendary: String(c.shares.legendary) },
  floor: String(c.legendary_floor),
  pin_required: c.pin_required,
  collect_on: c.collect_on,
  two_way: c.two_way,
  show_holders: c.show_holders,
});

/** The draft's shares as numbers; a blank or odd entry is NaN, which the check refuses. */
export const sharesOf = (d: RulesDraft): Shares => ({
  common: d.shares.common.trim() === "" ? NaN : Number(d.shares.common),
  uncommon: d.shares.uncommon.trim() === "" ? NaN : Number(d.shares.uncommon),
  rare: d.shares.rare.trim() === "" ? NaN : Number(d.shares.rare),
  legendary: d.shares.legendary.trim() === "" ? NaN : Number(d.shares.legendary),
});

/** The preset button's fill: the four shares of Easy, Medium or Hard. */
export function applyPreset(d: RulesDraft, p: PresetKey): RulesDraft {
  const s = PRESET_SHARES[p];
  return { ...d, shares: { common: String(s.common), uncommon: String(s.uncommon), rare: String(s.rare), legendary: String(s.legendary) } };
}

/** What would be sent: only what changed (the shares go together). */
export function rulesPatch(c: CardConfig, d: RulesDraft): CardConfigPatch {
  const out: CardConfigPatch = {};
  const shares = sharesOf(d);
  if (TIERS.some((t) => shares[t] !== c.shares[t])) {
    out.shares = shares;
    out.preset = presetOf(shares);
  }
  const floor = Number(d.floor);
  if (floor !== c.legendary_floor) out.legendary_floor = floor;
  if (d.pin_required !== c.pin_required) out.pin_required = d.pin_required;
  if (d.collect_on !== c.collect_on) out.collect_on = d.collect_on;
  if (d.two_way !== c.two_way) out.two_way = d.two_way;
  if (d.show_holders !== c.show_holders) out.show_holders = d.show_holders;
  return out;
}

export function rulesProblems(d: RulesDraft): { shares: string | null; floor: string | null } {
  return { shares: sharesProblem(sharesOf(d)), floor: floorProblem(Number(d.floor)) };
}

const SWITCHES = [
  { key: "pin_required", label: "Ask for the PIN after a badge scan", hint: "Players without a signed-in phone enter the 4 digits printed on their ID card." },
  { key: "collect_on", label: "Collect by scanning badges", hint: "Players add heroes to their deck by scanning each other's badge QR." },
  { key: "two_way", label: "Two-way collect", hint: "One scan gives both people the other's hero." },
  { key: "show_holders", label: "Show how many hold a hero", hint: "The reveal says roughly how many players share their hero." },
] as const satisfies readonly { key: keyof RulesDraft; label: string; hint: string }[];

export function RulesPanel({ eventId, c, attendees, canEdit }: { eventId: number; c: CardConfig; attendees: number | null; canEdit: boolean }) {
  const save = useSaveCardConfig(eventId);
  const [draft, setDraft] = React.useState<RulesDraft>(() => draftOf(c));
  const [seen, setSeen] = React.useState(JSON.stringify(c));
  if (JSON.stringify(c) !== seen) {
    setSeen(JSON.stringify(c));
    setDraft(draftOf(c));
  }
  const id = React.useId();
  const shares = sharesOf(draft);
  const preset = presetOf(shares);
  const problems = rulesProblems(draft);
  const patch = rulesPatch(c, draft);
  const dirty = Object.keys(patch).length > 0;
  const total = sharesTotal(shares);
  // The server's cautions about the saved rules, plus the same one for a draft not saved yet.
  const local = smallHardWarning(preset, attendees);
  const warnings = [...c.warnings.map((w) => w.message).filter(Boolean), ...(local && !c.warnings.some((w) => w.code === "SMALL_EVENT_HARD") ? [local] : [])];
  const blocked = Boolean(problems.shares || problems.floor);

  const submit = async () => {
    if (!dirty || blocked) return;
    try {
      await save.mutateAsync(patch);
      toast.success("Rules saved", { description: "Only players who reveal from now on are affected." });
    } catch (err) {
      toast.error(errorText(err));
    }
  };

  return (
    <FigurePanel className="p-0">
      <div className="p-4">
        <span className="text-ink block text-[15px] font-semibold">Rules</span>
        <span className="text-ink-3 mt-0.5 block text-[12.5px] leading-[1.5]">
          How rare each tier is. Shares are the part of attendees who get that tier, and each tier&apos;s share is split evenly between its heroes. Changing them affects only players who have not revealed yet.
        </span>
      </div>
      <form
        className="border-line-soft grid gap-4 border-t p-4 md:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <fieldset disabled={!canEdit} className="contents">
          <div className="md:col-span-2">
            <span className="eyebrow mb-1.5 block">Difficulty</span>
            <div className="flex flex-wrap items-center gap-3">
              <Segmented
                label="Difficulty"
                value={(preset === "custom" ? "" : preset) as PresetKey}
                options={PRESETS.map((p) => ({ value: p, label: PRESET_LABEL[p] }))}
                onChange={(p) => setDraft((d) => applyPreset(d, p))}
                className="w-fit"
              />
              <span className="text-ink-3 text-[12px]">{preset === "custom" ? "Custom shares" : `${PRESET_LABEL[preset]} fills the four shares below.`}</span>
            </div>
          </div>

          <div className="md:col-span-2">
            <span className="eyebrow mb-1.5 block">Share of attendees per tier</span>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {TIERS.map((t) => (
                <div key={t}>
                  <label htmlFor={`${id}-${t}`} className="text-ink-2 mb-1 block text-[12px]">
                    {TIER_LABEL[t]}
                  </label>
                  <div className="flex items-center gap-1">
                    <input
                      id={`${id}-${t}`}
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min={0}
                      max={100}
                      className="input w-24"
                      aria-label={`${TIER_LABEL[t]} share`}
                      value={draft.shares[t]}
                      onChange={(e) => setDraft((d) => ({ ...d, shares: { ...d.shares, [t]: e.target.value } }))}
                    />
                    <span className="text-ink-3 text-[12px]">%</span>
                  </div>
                </div>
              ))}
            </div>
            <p role="status" className={cn("mt-1.5 text-[12px]", problems.shares ? "text-refuse" : "text-ink-3")}>
              {problems.shares ?? `Total ${total}%.`}
            </p>
          </div>

          <div>
            <label htmlFor={`${id}-floor`} className="eyebrow mb-1.5 block">
              Legendary minimum
            </label>
            <input id={`${id}-floor`} type="number" inputMode="numeric" min={FLOOR_MIN} className="input w-28" value={draft.floor} onChange={(e) => setDraft((d) => ({ ...d, floor: e.target.value }))} />
            <p className={cn("mt-1 text-[11.5px] leading-[1.5]", problems.floor ? "text-refuse" : "text-ink-3")}>
              {problems.floor ?? "At least this many Legendary heroes are pulled, even at a small event: the last reveals are forced Legendary if needed."}
            </p>
          </div>

          <div className="grid content-start gap-3">
            {SWITCHES.map((sw) => (
              <label key={sw.key} className="flex items-start gap-2.5">
                <Switch checked={draft[sw.key]} aria-label={sw.label} onCheckedChange={(v) => setDraft((d) => ({ ...d, [sw.key]: v }))} />
                <span className="min-w-0">
                  <span className="text-ink block text-[13px] font-medium">{sw.label}</span>
                  <span className="text-ink-3 block text-[11.5px] leading-[1.5]">{sw.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {warnings.map((w) => (
          <Notice key={w} tone="caution" tag="Heads up" className="md:col-span-2">
            {w}
          </Notice>
        ))}
        {canEdit ? (
          <div className="border-line-soft flex items-center justify-end gap-2 border-t pt-3 md:col-span-2" role="region" aria-label="Save rules">
            {dirty ? (
              <Button type="button" variant="ghost" onClick={() => setDraft(draftOf(c))}>
                Undo changes
              </Button>
            ) : null}
            <Button type="submit" disabled={!dirty || blocked || save.isPending}>
              {save.isPending ? "Saving…" : "Save rules"}
            </Button>
          </div>
        ) : null}
      </form>
    </FigurePanel>
  );
}

function Figure({ label, value, of, hint }: { label: string; value: number; of?: number; hint?: string }) {
  return (
    <div className="border-line-soft rounded-xl border p-3">
      <p className="text-ink-3 m-0 text-[11.5px]">{label}</p>
      <p className="m-0 mt-0.5 text-[22px] font-semibold tabular-nums tracking-[-0.02em]">
        {formatNumber(value)}
        {of != null ? <span className="text-ink-3 text-[14px] font-normal"> of {formatNumber(of)}</span> : null}
      </p>
      {hint ? <p className="text-ink-3 m-0 mt-0.5 text-[11px]">{hint}</p> : null}
    </div>
  );
}

/** SPEC §8.1's numbers, asked again every five seconds while the page is open. */
export function LiveMonitor({ live }: { live: CardLive }) {
  return (
    <FigurePanel className="p-0">
      <div className="flex items-start justify-between gap-3 p-4">
        <span>
          <span className="text-ink block text-[15px] font-semibold">Live monitor</span>
          <span className="text-ink-3 mt-0.5 block text-[12.5px]">Refreshes every 5 seconds while this page is open.</span>
        </span>
      </div>
      <div className="border-line-soft grid gap-3 border-t p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Figure label="Revealed" value={live.revealed} of={live.checked_in} hint="of players checked in" />
        <Figure label="Legendary revealed" value={live.legendary_revealed} of={live.legendary_target} hint={live.legendary_floor ? `minimum ${live.legendary_floor}` : "against the minimum"} />
        <Figure label="Full decks" value={live.full_decks} hint="players with every hero" />
        <Figure label="Badge-to-badge scans" value={live.collects} />
      </div>
      {live.tiers.length ? (
        <div className="border-line-soft overflow-x-auto border-t p-4">
          <table className="w-full text-[13px]">
            <caption className="text-ink-3 mb-2 text-left text-[11.5px]">Revealed per tier against what the shares expect so far</caption>
            <thead>
              <tr className="text-ink-3 text-left text-[11.5px]">
                <th className="py-1 font-medium">Tier</th>
                <th className="py-1 text-right font-medium">Revealed</th>
                <th className="py-1 text-right font-medium">Expected</th>
              </tr>
            </thead>
            <tbody>
              {live.tiers.map((t) => (
                <tr key={t.tier} className="border-line-soft border-t">
                  <td className="py-1.5">{TIER_LABEL[t.tier]}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatNumber(t.revealed)}</td>
                  <td className="text-ink-2 py-1.5 text-right tabular-nums">{t.expected.toLocaleString("en-IN", { maximumFractionDigits: 1 })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </FigurePanel>
  );
}

/** The Hero Cards tab: rules, then the monitor. */
export function CardsPanel({ eventId, canEdit, locked }: { eventId: number; canEdit: boolean; locked: boolean }) {
  const config = useCardConfig(eventId);
  const live = useCardLive(eventId);
  const editable = canEdit && !locked;
  const attendees = live.data ? (live.data.registered ?? (live.data.checked_in > 0 ? live.data.checked_in : null)) : null;
  return (
    <div className="flex flex-col gap-3.5">
      <GameGateNotice kind="cards" eventId={eventId} />
      {config.isPending ? <Skeleton className="h-[360px] rounded-2xl" /> : config.data ? <RulesPanel eventId={eventId} c={config.data} attendees={attendees} canEdit={editable} /> : <Notice tone="caution">Could not load the rules.</Notice>}
      {live.data ? <LiveMonitor live={live.data} /> : live.isPending ? <Skeleton className="h-[200px] rounded-2xl" /> : null}
    </div>
  );
}
