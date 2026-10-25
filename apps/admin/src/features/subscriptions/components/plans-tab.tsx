"use client";

import * as React from "react";
import {
  CheckCircleIcon,
  CheckIcon,
  CircleIcon,
  CopyIcon,
  Loader2Icon,
  LockIcon,
  PlusIcon,
  SquareCheckIcon,
  SquareIcon,
  Trash2Icon,
  ZapIcon,
} from "lucide-react";
import { formatNumber } from "@moa/app-kit";
import { InlineAlert, Skeleton, cn } from "@moa/ui";

import { useCan } from "@/hooks/use-can";
import { ConfirmDialog } from "@/features/users";
import {
  useArchivePlan,
  useCreatePlan,
  useDuplicatePlan,
  usePlans,
  useSyncPlan,
  useUpdatePlan,
} from "../queries";
import {
  DEFAULT_EMAIL_OVERAGE_PAISE,
  DEFAULT_WHATSAPP_OVERAGE_PAISE,
  FEATURE_LABELS,
  GROUP_LABELS,
  LIMIT_FIELDS,
  toForm,
  yearlyPriceProblem,
  type Plan,
  type PlanFormInput,
} from "../schemas";

/**
 * The plan editor.
 *
 * A limit is either a number or unlimited, and the two need different
 * controls: a box you can type in, and a toggle that empties it. Representing
 * unlimited as a very large number would be simpler and wrong -- the database
 * stores NULL, and 0 is a real value meaning "none allowed".
 */
const BLANK: PlanFormInput = {
  key: "",
  name: "New plan",
  tagline: "",
  price_monthly_rupees: 0,
  price_yearly_rupees: 0,
  trial_days: 0,
  // Hidden, so a half-finished plan cannot be bought off the pricing page.
  visibility: "hidden",
  sort_order: 0,
  featured: false,
  contact_sales: false,
  email_overage_rupees: DEFAULT_EMAIL_OVERAGE_PAISE / 100,
  whatsapp_overage_rupees: DEFAULT_WHATSAPP_OVERAGE_PAISE / 100,
  limits: Object.fromEntries(LIMIT_FIELDS.map((f) => [f.key, null])),
  features: {},
};

function inr(rupeeValue: number): string {
  return `₹${formatNumber(Math.round(rupeeValue))}`;
}

function priceLabel(plan: Plan): string {
  if (plan.price_monthly_paise === 0 && plan.price_yearly_paise === 0) return "Free";
  return `${inr(plan.price_monthly_paise / 100)} a month · ${inr(plan.price_yearly_paise / 100)} a year`;
}

const VISIBILITY_LABEL: Record<string, string> = {
  public: "Public",
  hidden: "Hidden",
  legacy: "Legacy",
};

export function PlansTab() {
  const canEdit = useCan("manage_money");
  const plans = usePlans();
  const create = useCreatePlan();
  const update = useUpdatePlan();
  const duplicate = useDuplicatePlan();
  const archive = useArchivePlan();
  const sync = useSyncPlan();

  const [selectedId, setSelectedId] = React.useState<number | "new" | null>(null);
  const [draft, setDraft] = React.useState<PlanFormInput | null>(null);
  const [confirmWithdraw, setConfirmWithdraw] = React.useState(false);

  const [showArchived, setShowArchived] = React.useState(false);
  const all = plans.data ?? [];
  // A withdrawn plan nobody is on (Campus, folded into Enterprise) is out of
  // the way unless asked for; one with subscribers stays listed.
  const archived = all.filter((p) => p.visibility === "legacy" && p.subscriber_count === 0);
  const list = showArchived ? all : all.filter((p) => !archived.includes(p));

  // Default to the first plan once they load, without an effect: picking a
  // selection during render avoids a frame showing an empty editor.
  const effectiveId =
    selectedId ?? (list.length > 0 ? list[0]!.id : null);
  const selected =
    effectiveId === "new" ? null : list.find((p) => p.id === effectiveId) ?? null;

  const form = draft ?? (effectiveId === "new" ? BLANK : selected ? toForm(selected) : null);
  const dirty = draft !== null;
  const busy = create.isPending || update.isPending;

  function patch(changes: Partial<PlanFormInput>) {
    if (!form) return;
    setDraft({ ...form, ...changes });
  }

  function setLimit(key: string, value: number | null) {
    if (!form) return;
    setDraft({ ...form, limits: { ...form.limits, [key]: value } });
  }

  function toggleFeature(key: string) {
    if (!form) return;
    setDraft({ ...form, features: { ...form.features, [key]: !form.features[key] } });
  }

  async function save() {
    if (!form) return;
    const problem = yearlyPriceProblem(form);
    if (problem) return;

    try {
      if (effectiveId === "new") {
        const created = await create.mutateAsync(form);
        setSelectedId(created.id);
      } else if (selected) {
        await update.mutateAsync({ planId: selected.id, form });
      }
    } catch {
      // Refused: the hook's onError has said why. The draft stays, unsaved,
      // rather than escaping as an unhandled promise rejection.
      return;
    }
    setDraft(null);
  }

  // The grouping comes from the API so this does not hold a second copy that
  // can drift. Falls back to one flat group if a plan predates it.
  const groups = selected?.feature_groups ?? list[0]?.feature_groups ?? {};
  const priceProblem = form ? yearlyPriceProblem(form) : null;

  if (plans.isPending) {
    return (
      <div className="flex flex-wrap gap-4">
        <Skeleton className="h-64 w-[260px] rounded-[var(--radius-md)]" />
        <Skeleton className="h-96 flex-1 rounded-[var(--radius-card)]" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3.5">
      {!canEdit ? (
        <div className="flex items-center gap-2.5 rounded-[var(--radius-md)] bg-surface px-3.5 py-2.5 text-[13px] text-ink-2 shadow-card">
          <LockIcon className="size-4 text-brand" />
          Only owners can create or change plans. You are seeing them read-only.
        </div>
      ) : null}

      <div className="flex flex-wrap items-start gap-4">
        {/* The catalogue */}
        <div className="flex w-full flex-col gap-2 md:w-[260px] md:shrink-0">
          {list.map((plan) => {
            const active = plan.id === effectiveId;
            return (
              <button
                key={plan.id}
                type="button"
                onClick={() => {
                  setSelectedId(plan.id);
                  setDraft(null);
                }}
                className={cn(
                  "flex flex-col gap-1 rounded-[var(--radius-md)] bg-surface px-3.5 py-3 text-left",
                  active
                    ? "shadow-[inset_0_0_0_1.5px_var(--brand)]"
                    : "shadow-card",
                  plan.visibility === "legacy" && "opacity-60"
                )}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-[15px]">{plan.name}</span>
                  <span
                    className={
                      plan.visibility === "public" ? "tag tag-accent" : "tag tag-neutral"
                    }
                  >
                    {VISIBILITY_LABEL[plan.visibility]}
                  </span>
                </span>
                <span className="text-[13px] text-ink-2">
                  {plan.contact_sales ? "Talk to us" : priceLabel(plan)}
                </span>
                {plan.featured ? (
                  <span className="text-[12px] text-brand">Most popular</span>
                ) : null}
                <span className="flex items-center gap-2 text-[12px] text-ink-3">
                  {plan.subscriber_count} clubs subscribed
                  {/* A paid plan with no Razorpay plan behind it cannot be
                      charged. Said here, not discovered at checkout. */}
                  {!plan.billable ? (
                    <span className="text-brand">· not billable</span>
                  ) : null}
                  {plan.trial_days > 0 ? <span>· {plan.trial_days}-day Razorpay trial</span> : null}
                </span>
              </button>
            );
          })}

          {archived.length ? (
            <button type="button" className="btn btn-ghost btn-sm justify-start" onClick={() => setShowArchived((v) => !v)} aria-pressed={showArchived}>
              {showArchived ? "Hide archived plans" : `Show ${archived.length} archived plan${archived.length === 1 ? "" : "s"}`}
            </button>
          ) : null}

          {canEdit ? (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setSelectedId("new");
                setDraft(BLANK);
              }}
            >
              <PlusIcon className="size-4" />
              New plan
            </button>
          ) : null}
        </div>

        {/* The editor */}
        {form ? (
          <div className="flex min-w-0 flex-1 basis-[520px] flex-col gap-[18px] rounded-[var(--radius-card)] bg-surface p-5 shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <span className="text-[19px]">{form.name || "New plan"}</span>
              <span
                className={cn(
                  "text-[12px]",
                  dirty
                    ? "text-brand"
                    : "text-ink-3"
                )}
              >
                {dirty ? "Unsaved changes" : "Saved"}
              </span>
            </div>

            <div className="grid gap-2.5 sm:grid-cols-2">
              <div className="field sm:col-span-2">
                <label htmlFor="plan-name">Plan name</label>
                <input
                  id="plan-name"
                  className="input"
                  value={form.name}
                  disabled={!canEdit}
                  onChange={(e) => patch({ name: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="plan-key">Key</label>
                <input
                  id="plan-key"
                  className="input"
                  value={form.key}
                  // Fixed once it exists: it is referenced in code and in
                  // Razorpay notes, and changing it orphans both.
                  disabled={!canEdit || effectiveId !== "new"}
                  placeholder="growth"
                  onChange={(e) => patch({ key: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="plan-trial">Razorpay trial (days)</label>
                <input
                  id="plan-trial"
                  className="input"
                  type="number"
                  min={0}
                  value={form.trial_days}
                  disabled={!canEdit}
                  onChange={(e) => patch({ trial_days: Math.max(0, +e.target.value || 0) })}
                  aria-describedby="plan-trial-help"
                />
                <span id="plan-trial-help" className="text-[12px] text-ink-3">
                  Usually 0: every new club already gets 14 days of Pro free, and a plan picked then bills from the trial&apos;s end.
                </span>
              </div>
              <div className="field">
                <label htmlFor="plan-monthly">Monthly price (₹)</label>
                <input
                  id="plan-monthly"
                  className="input"
                  type="number"
                  min={0}
                  value={form.price_monthly_rupees}
                  disabled={!canEdit}
                  onChange={(e) =>
                    patch({ price_monthly_rupees: Math.max(0, +e.target.value || 0) })
                  }
                />
              </div>
              <div className="field">
                <label htmlFor="plan-yearly">Yearly price (₹)</label>
                <input
                  id="plan-yearly"
                  className="input"
                  type="number"
                  min={0}
                  value={form.price_yearly_rupees}
                  disabled={!canEdit}
                  onChange={(e) =>
                    patch({ price_yearly_rupees: Math.max(0, +e.target.value || 0) })
                  }
                />
              </div>
              <div className="field sm:col-span-2">
                <label htmlFor="plan-visibility">Visibility</label>
                <select
                  id="plan-visibility"
                  className="input"
                  value={form.visibility}
                  disabled={!canEdit}
                  onChange={(e) =>
                    patch({ visibility: e.target.value as PlanFormInput["visibility"] })
                  }
                >
                  <option value="public">Public — on the pricing page</option>
                  <option value="hidden">Hidden — by invite only</option>
                  <option value="legacy">Legacy — no new signups</option>
                </select>
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <span className="micro">On the pricing page</span>
                <div className="flex flex-wrap gap-x-5 gap-y-2">
                  {(
                    [
                      ["featured", "Most popular", "Highlighted as the plan to pick"],
                      ["contact_sales", "Talk to us", "Shown instead of a price; clubs cannot check out on it"],
                    ] as const
                  ).map(([name, text, hint]) => {
                    const on = form[name];
                    return (
                      <button
                        key={name}
                        type="button"
                        aria-pressed={on}
                        disabled={!canEdit}
                        onClick={() => patch({ [name]: !on })}
                        className={cn(
                          "flex items-start gap-2 text-left",
                          on ? "text-brand" : "text-ink-2"
                        )}
                      >
                        {on ? (
                          <SquareCheckIcon className="mt-px size-4 shrink-0" />
                        ) : (
                          <SquareIcon className="mt-px size-4 shrink-0" />
                        )}
                        <span className="flex flex-col">
                          <span className="text-[13px]">{text}</span>
                          <span className="text-[11.5px] text-ink-3">{hint}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="field sm:col-span-2">
                <label htmlFor="plan-tagline">Tagline</label>
                <input
                  id="plan-tagline"
                  className="input"
                  value={form.tagline ?? ""}
                  disabled={!canEdit}
                  onChange={(e) => patch({ tagline: e.target.value })}
                />
              </div>
            </div>

            {priceProblem ? (
              <InlineAlert tone="warning" title="Check the yearly price">
                {priceProblem} Yearly billing is a discount for paying up front; the
                API refuses a yearly price above twelve months of the monthly one.
              </InlineAlert>
            ) : null}

            {/* Limits */}
            <div className="flex flex-col gap-2">
              <span className="micro">Limits</span>
              <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
                {LIMIT_FIELDS.map((field) => {
                  const value = form.limits[field.key] ?? null;
                  const unlimited = value === null;
                  return (
                    <div
                      key={field.key}
                      className="rule-fade grid grid-cols-[minmax(0,1fr)_92px_auto] items-center gap-2 py-1.5"
                    >
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-[13px]">{field.label}</span>
                        <span className="truncate text-[11px] text-ink-3">
                          {field.scope}
                        </span>
                      </span>
                      <input
                        className={cn("input min-h-8 text-[13px]", unlimited && "opacity-40")}
                        type="number"
                        min={0}
                        aria-label={`${field.label} limit`}
                        value={unlimited ? "" : value}
                        disabled={!canEdit || unlimited}
                        onChange={(e) =>
                          setLimit(field.key, Math.max(0, +e.target.value || 0))
                        }
                      />
                      <button
                        type="button"
                        aria-pressed={unlimited}
                        aria-label={`${field.label}: no limit`}
                        disabled={!canEdit}
                        // Back to 10 rather than 0 when switching off
                        // unlimited: 0 would forbid the thing outright, which
                        // is rarely what someone means by "set a limit".
                        onClick={() => setLimit(field.key, unlimited ? 10 : null)}
                        className={cn(
                          "flex items-center gap-1.5 text-[12px] whitespace-nowrap",
                          unlimited
                            ? "text-brand"
                            : "text-ink-2"
                        )}
                      >
                        {unlimited ? (
                          <SquareCheckIcon className="size-4" />
                        ) : (
                          <SquareIcon className="size-4" />
                        )}
                        No limit
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* What a message past the monthly limits costs */}
            <div className="flex flex-col gap-2">
              <span className="micro">Extra messages</span>
              <div className="grid gap-2.5 sm:grid-cols-2">
                <div className="field">
                  <label htmlFor="plan-email-overage">Each extra email (₹)</label>
                  <input
                    id="plan-email-overage"
                    className="input"
                    type="number"
                    min={0}
                    step={0.01}
                    value={form.email_overage_rupees}
                    disabled={!canEdit}
                    onChange={(e) => patch({ email_overage_rupees: Math.max(0, +e.target.value || 0) })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="plan-whatsapp-overage">Each extra WhatsApp message (₹)</label>
                  <input
                    id="plan-whatsapp-overage"
                    className="input"
                    type="number"
                    min={0}
                    step={0.01}
                    value={form.whatsapp_overage_rupees}
                    disabled={!canEdit}
                    onChange={(e) => patch({ whatsapp_overage_rupees: Math.max(0, +e.target.value || 0) })}
                  />
                </div>
              </div>
              <span className="text-[12px] text-ink-3">
                Past the monthly email and WhatsApp limits, a plan Razorpay bills keeps sending and the extra goes on the club&apos;s next invoice at these prices.
                Free has no card to charge: past its limit, announcements, campaigns and reminders stop; tickets and certificates still go.
              </span>
            </div>

            {/* Features */}
            {Object.entries(groups).map(([groupKey, keys]) => {
              const on = keys.filter((key) => form.features[key]).length;
              return (
                <div key={groupKey} className="flex flex-col gap-2">
                  <span className="micro">
                    {GROUP_LABELS[groupKey] ?? groupKey} · {on} of {keys.length} on
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {keys.map((key) => {
                      const enabled = Boolean(form.features[key]);
                      return (
                        <button
                          key={key}
                          type="button"
                          aria-pressed={enabled}
                          disabled={!canEdit}
                          onClick={() => toggleFeature(key)}
                          className={cn(
                            "flex items-center gap-1.5 rounded-[999px] border px-2.5 py-1.5 text-[12.5px] whitespace-nowrap transition-colors",
                            enabled
                              ? "border-brand bg-brand-soft text-brand"
                              : "border-line text-ink-2"
                          )}
                        >
                          {enabled ? (
                            <CheckCircleIcon className="size-3.5" />
                          ) : (
                            <CircleIcon className="size-3.5" />
                          )}
                          {FEATURE_LABELS[key] ?? key}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {canEdit ? (
              <div className="flex flex-wrap items-center gap-2 pt-3 shadow-[inset_0_1px_0_var(--line)]">
                <span className="flex-1 basis-[240px] text-[12px] text-ink-3">
                  {selected && selected.subscriber_count > 0
                    ? `Saving applies to ${selected.subscriber_count} subscribed club${
                        selected.subscriber_count > 1 ? "s" : ""
                      } at their next renewal. Lowering a limit never deletes anything they already have.`
                    : "No clubs on this plan yet — changes apply straight away."}
                </span>

                {selected && !selected.billable ? (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={sync.isPending}
                    onClick={() => sync.mutate(selected.id)}
                  >
                    {sync.isPending ? (
                      <Loader2Icon className="size-4 animate-spin" />
                    ) : (
                      <ZapIcon className="size-4" />
                    )}
                    Register with Razorpay
                  </button>
                ) : null}

                {selected ? (
                  <>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={duplicate.isPending}
                      onClick={() => duplicate.mutate(selected.id)}
                    >
                      <CopyIcon className="size-4" />
                      Duplicate
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => setConfirmWithdraw(true)}
                    >
                      <Trash2Icon className="size-4" />
                      {selected.subscriber_count > 0 ? "Archive" : "Delete"}
                    </button>
                  </>
                ) : null}

                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={!dirty || busy}
                  onClick={() => setDraft(null)}
                >
                  Discard
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!dirty || busy || priceProblem !== null}
                  onClick={() => void save()}
                >
                  {busy ? (
                    <Loader2Icon className="size-4 animate-spin" />
                  ) : (
                    <CheckIcon className="size-4" />
                  )}
                  Save plan
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="flex-1 basis-[520px] py-10">
            <span className="text-[16px]">No plans yet</span>
            <p className="mt-2 text-[13px] text-ink-2">
              Until a plan exists every club is unlimited, which is how the platform
              behaved before plans. Create a free plan first — it is the one clubs fall
              back to.
            </p>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmWithdraw}
        title={
          selected && selected.subscriber_count > 0
            ? `Archive ${selected.name}?`
            : `Delete ${selected?.name ?? "this plan"}?`
        }
        body={
          selected && selected.subscriber_count > 0
            ? `It becomes Legacy: the ${selected.subscriber_count} club${
                selected.subscriber_count > 1 ? "s" : ""
              } on it keep it, but nobody new can choose it.`
            : "Nobody is subscribed, so it is removed completely."
        }
        note={
          selected && selected.subscriber_count > 0
            ? "A plan with subscribers cannot be deleted — deleting it would drop them to the free plan without anyone deciding that."
            : "This cannot be undone from the dashboard."
        }
        cta={selected && selected.subscriber_count > 0 ? "Archive plan" : "Delete plan"}
        busy={archive.isPending}
        onCancel={() => setConfirmWithdraw(false)}
        onConfirm={async () => {
          if (selected) await archive.mutateAsync(selected.id);
          setConfirmWithdraw(false);
          setSelectedId(null);
          setDraft(null);
        }}
      />
    </div>
  );
}
