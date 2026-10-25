"use client";

import { CheckIcon, MinusIcon } from "lucide-react";
import { formatNumber } from "@moa/app-kit";
import { Skeleton, cn } from "@moa/ui";

import { usePlans } from "../queries";
import { FEATURE_LABELS, GROUP_LABELS, limitFieldsFor, rupees } from "../schemas";

/**
 * Every plan side by side.
 *
 * The question this answers is "is the ladder right" -- whether each step up
 * actually gives more than the one below. A plan that accidentally grants
 * less than a cheaper one is obvious here and invisible in the editor, where
 * you only ever see one plan at a time.
 */
export function CompareTab() {
  const plans = usePlans();

  if (plans.isPending) {
    return <Skeleton className="h-96 w-full rounded-[var(--radius-card)]" />;
  }

  // Legacy plans are withdrawn, so they are not part of the ladder being
  // compared -- including them would make the table wider and less useful.
  const list = (plans.data ?? []).filter((plan) => plan.visibility !== "legacy");

  if (list.length === 0) {
    return (
      <div className="py-10">
        <span className="text-[16px]">No plans to compare</span>
      </div>
    );
  }

  const groups = list[0]?.feature_groups ?? {};
  const template = `minmax(220px,1.6fr) repeat(${list.length}, minmax(120px,1fr))`;

  /** The flagship column, tinted so the eye lands on it. */
  const dearest = list.reduce((best, plan) =>
    plan.price_monthly_paise > best.price_monthly_paise ? plan : best
  );

  function cellTone(planId: number) {
    return planId === dearest.id && list.length > 1
      ? "bg-brand-soft"
      : "";
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[720px]" style={{ display: "grid", gridTemplateColumns: template }}>
        {/* Header */}
        <div className="rule-fade px-3 py-2.5" />
        {list.map((plan) => (
          <div
            key={plan.id}
            className={cn(
              "rule-fade px-3 py-2.5 text-center text-[13px]",
              cellTone(plan.id)
            )}
          >
            {plan.name} ·{" "}
            {plan.price_monthly_paise
              ? `₹${formatNumber(Math.round(rupees(plan.price_monthly_paise)))}/mo`
              : "Free"}
          </div>
        ))}

        {/* Limits */}
        {limitFieldsFor(list).map((field) => (
          <ComparisonRow
            key={field.key}
            label={`${field.label} · ${field.scope}`}
            cells={list.map((plan) => {
              const value = plan.limits[field.key] ?? null;
              return {
                planId: plan.id,
                // Unlimited is the selling point, so it is accented rather
                // than rendered as an empty-looking dash.
                node: value === null ? "Unlimited" : formatNumber(value),
                accent: value === null,
              };
            })}
            tone={cellTone}
          />
        ))}

        {/* Features, grouped as the API groups them */}
        {Object.entries(groups).flatMap(([groupKey, keys]) => [
          <div
            key={`g-${groupKey}`}
            className="micro rule-fade px-3 py-2.5"
            style={{ gridColumn: `1 / -1` }}
          >
            {GROUP_LABELS[groupKey] ?? groupKey}
          </div>,
          ...keys.map((key) => (
            <ComparisonRow
              key={`${groupKey}-${key}`}
              label={FEATURE_LABELS[key] ?? key}
              cells={list.map((plan) => ({
                planId: plan.id,
                node: plan.features[key] ? (
                  <CheckIcon className="mx-auto size-4" />
                ) : (
                  <MinusIcon className="mx-auto size-4" />
                ),
                accent: Boolean(plan.features[key]),
              }))}
              tone={cellTone}
            />
          )),
        ])}
      </div>
    </div>
  );
}

function ComparisonRow({
  label,
  cells,
  tone,
}: {
  label: string;
  cells: ReadonlyArray<{ planId: number; node: React.ReactNode; accent: boolean }>;
  tone: (planId: number) => string;
}) {
  return (
    <>
      <div className="rule-fade px-3 py-2.5 text-[13px] text-ink-2">
        {label}
      </div>
      {cells.map((cell) => (
        <div
          key={cell.planId}
          className={cn(
            "rule-fade px-3 py-2.5 text-center text-[13px]",
            cell.accent
              ? "text-brand"
              : "text-ink-3",
            tone(cell.planId)
          )}
        >
          {cell.node}
        </div>
      ))}
    </>
  );
}
