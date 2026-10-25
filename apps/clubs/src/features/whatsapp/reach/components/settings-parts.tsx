"use client";

import * as React from "react";
import { Loader2Icon, LogInIcon } from "lucide-react";
import { CardLabel, FigurePanel, Notice, Switch, toast } from "@moa/ui";

import { isPlanLockError } from "@/features/plan";

import type { Account } from "../../schemas";
import { When } from "../../components/shared";
import { loadFacebookSdk, runEmbeddedSignup } from "../facebook";
import { signupErrorMessage, useConnectWithMeta, useReach, useReportSignupEvent, useSetKinds, useSpend } from "../queries";
import { CATEGORY_LABEL, KIND_KEYS, KIND_LABEL, SIGNUP_STEP_LABEL, money, type KindKey } from "../schemas";

// ─── Which deliveries go from the number ─────────────────────────────────

/**
 * Under "Send tickets, certificates and reminders from this number", each
 * kind on its own. Not shown against a backend without it (a bare 404).
 */
export function RoutingKinds({ a }: { a: Account }) {
  const q = useReach();
  const set = useSetKinds();
  const reach = q.data;
  if (!reach) return null;
  const off = !a.routing;
  const change = (kind: KindKey, on: boolean) =>
    set.mutate(
      { [kind]: on },
      {
        onSuccess: () => toast.success(`${KIND_LABEL[kind]} will go from ${on ? "your number" : "MyOtherApp's number"}.`),
        onError: (e) => {
          if (!isPlanLockError(e)) toast.error(e instanceof Error && e.message ? e.message : "That did not go through. Try again.");
        },
      },
    );
  return (
    <fieldset className="border-line-soft m-0 flex min-w-0 flex-col gap-2 border-0 border-t p-0 pt-3" aria-describedby="wa-kinds-help">
      <legend className="text-ink float-left mb-0.5 text-[13.5px] font-medium">Which ones</legend>
      <p id="wa-kinds-help" className="text-ink-3 clear-both m-0 text-[12px] leading-[1.5]">
        {off ? "Turn on sending from this number to choose which ones." : "One switched off goes from MyOtherApp's number, as for any club."}
      </p>
      {KIND_KEYS.map((k) => (
        <div key={k} className="flex items-center justify-between gap-3">
          <label htmlFor={`wa-kind-${k}`} className="text-ink-2 text-[13px]">
            {KIND_LABEL[k]}
          </label>
          <Switch
            id={`wa-kind-${k}`}
            checked={reach.kinds[k]}
            disabled={!a.can_manage || off || set.isPending}
            onCheckedChange={(on) => change(k, on)}
          />
        </div>
      ))}
    </fieldset>
  );
}

// ─── Connect with Meta ───────────────────────────────────────────────────

/**
 * Meta's Embedded Signup: one click instead of pasting keys. Shown only when
 * the backend says it is on (`embedded_signup` in the reach), to those who
 * manage the number on a plan that has it. The code Meta hands back lasts
 * 30 seconds, so it is posted the moment it arrives.
 */
export function ConnectWithMeta({ a }: { a: Account }) {
  const q = useReach();
  const connect = useConnectWithMeta();
  const report = useReportSignupEvent();
  const [busy, setBusy] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);
  const config = q.data?.embedded_signup;
  if (!config || !a.can_manage || !a.plan_allows || !a.available) return null;

  const start = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const fb = await loadFacebookSdk(config.app_id, config.graph_version);
      const out = await runEmbeddedSignup(fb, config);
      if (out.kind === "finish") {
        const info = out.info;
        const next = await connect.mutateAsync({
          code: out.code,
          phone_number_id: info?.phone_number_id ?? null,
          messaging_account_ids: info?.messaging_account_ids ?? [],
          waba_id: info?.waba_id ?? null,
          business_id: info?.business_id ?? null,
          is_on_biz_app: Boolean(info?.is_on_biz_app),
          event: info?.event || null,
        });
        if (next.status === "active") toast.success(`Connected ${next.display_phone_number ?? "your number"} with Meta.`);
        else toast.error(next.last_error ?? "Connected, but Meta isn't done with the number yet. See below.");
      } else if (out.kind === "error") {
        const i = out.info;
        report.mutate({ event: "ERROR", error_message: i.error_message ?? null, error_code: i.error_code ?? null, session_id: i.session_id ?? null });
        const ref = [i.error_code && `code ${i.error_code}`, i.session_id && `session ${i.session_id}`].filter(Boolean).join(", ");
        setProblem(`Meta's sign-up stopped: ${i.error_message ?? "an error"}${ref ? ` (${ref}, for Meta's support)` : ""}. Nothing was connected.`);
      } else {
        const step = out.info?.current_step ?? null;
        report.mutate({ event: "CANCEL", current_step: step });
        setProblem(
          step
            ? `Meta's sign-up was left while ${SIGNUP_STEP_LABEL[step] ?? step.toLowerCase().replace(/_/g, " ")}. Nothing was connected; start again whenever you like.`
            : "Meta's sign-up was closed before it finished. Nothing was connected.",
        );
      }
    } catch (error) {
      if (!isPlanLockError(error)) setProblem(signupErrorMessage(error));
    } finally {
      setBusy(false);
      // The code leaves memory with the call.
      connect.reset();
    }
  };

  return (
    <div className="bg-sunken flex flex-col gap-2 rounded-xl p-3" role="group" aria-label="Connect with Meta">
      <div className="flex flex-wrap items-center gap-2.5">
        <button type="button" className="btn btn-primary" onClick={() => void start()} disabled={busy}>
          {busy ? <Loader2Icon className="size-4 animate-spin" /> : <LogInIcon className="size-4" />} {busy ? "Connecting with Meta…" : "Connect with Meta"}
        </button>
        <span className="text-ink-2 min-w-0 flex-1 text-[12.5px] leading-[1.5]">
          Sign in with Facebook, pick or create your WhatsApp Business account and number, and it&apos;s connected: no keys to copy.
        </span>
      </div>
      {problem ? (
        <Notice tone="refuse" tag="Not connected">
          {problem}
        </Notice>
      ) : null}
      <p className="text-ink-3 m-0 text-[12px]">Or paste your own Meta app&apos;s keys below.</p>
    </div>
  );
}

/** On the connected number: that it was connected with Meta, and when Meta's sign-in runs out. */
export function EmbeddedNote() {
  const reach = useReach().data;
  if (!reach || reach.mode !== "embedded") return null;
  return (
    <p className="text-ink-3 m-0 text-[12px] leading-[1.5]">
      Connected with Meta{reach.on_biz_app ? ", a WhatsApp Business app number" : ""}.{" "}
      {reach.token_expires_at ? (
        <>
          Meta&apos;s sign-in runs out <When iso={reach.token_expires_at} />: connect with Meta again before then.
        </>
      ) : (
        "Meta's sign-in doesn't run out."
      )}
    </p>
  );
}

// ─── This month ──────────────────────────────────────────────────────────

/**
 * Meta's volume and approximate cost this month, by category, as the backend
 * last read it (at most daily: this page never asks Meta), with what went
 * from the number and what fell back to MyOtherApp's, and why.
 */
export function SpendCard() {
  const q = useSpend();
  const s = q.data;
  if (!s) return null;
  const totalSends = s.from_your_number.total;
  return (
    <FigurePanel className="flex flex-col gap-3 p-4" role="region" aria-label="This month">
      <CardLabel
        right={
          <span className="text-ink-3 text-[11.5px]">
            {s.fetched_at ? (
              <>
                Meta&apos;s figure, read <When iso={s.fetched_at} />
              </>
            ) : (
              "Not read from Meta yet this month"
            )}
          </span>
        }
      >
        This month
      </CardLabel>

      {s.categories.length ? (
        <table className="w-full border-collapse text-[12.5px]">
          <caption className="sr-only">What Meta says your number sent this month, and its approximate cost</caption>
          <thead>
            <tr className="text-ink-3 text-left">
              <th scope="col" className="eyebrow pb-1 font-normal">
                Category
              </th>
              <th scope="col" className="eyebrow pb-1 text-right font-normal">
                Messages
              </th>
              <th scope="col" className="eyebrow pb-1 text-right font-normal">
                About
              </th>
            </tr>
          </thead>
          <tbody>
            {s.categories.map((c) => (
              <tr key={c.category} className="border-line-soft border-t">
                <th scope="row" className="text-ink py-1.5 text-left font-normal">
                  {CATEGORY_LABEL[c.category] ?? c.category}
                </th>
                <td className="text-ink py-1.5 text-right tabular-nums">{c.volume.toLocaleString("en-IN")}</td>
                <td className="text-ink py-1.5 text-right tabular-nums">{money(c.cost, s.currency)}</td>
              </tr>
            ))}
            <tr className="border-line border-t">
              <th scope="row" className="text-ink py-1.5 text-left font-semibold">
                Total
              </th>
              <td className="text-ink py-1.5 text-right font-semibold tabular-nums">{s.volume.toLocaleString("en-IN")}</td>
              <td className="text-ink py-1.5 text-right font-semibold tabular-nums">{money(s.cost, s.currency)}</td>
            </tr>
          </tbody>
        </table>
      ) : (
        <p className="text-ink-2 m-0 text-[12.5px]">{s.fetched_at ? "Meta has nothing charged to your number this month." : "Meta's figure is read once a day; it shows here then."}</p>
      )}
      <p className="text-ink-3 m-0 text-[11.5px] leading-[1.5]">{s.note || "Meta's own figure, which it calls approximate."}</p>

      <div className="border-line-soft flex flex-col gap-1.5 border-t pt-3 text-[12.5px]">
        <p className="text-ink m-0">
          From your number: <strong className="font-semibold tabular-nums">{totalSends.toLocaleString("en-IN")}</strong>
          <span className="text-ink-3">
            {" "}
            · {s.from_your_number.deliveries} tickets, certificates and reminders · {s.from_your_number.broadcasts} broadcast · {s.from_your_number.inbox} inbox
            replies
          </span>
        </p>
        {s.fallback_total ? (
          <div>
            <p className="text-caution m-0">
              {s.fallback_total} went from MyOtherApp&apos;s number instead, because:
            </p>
            <ul className="text-ink-2 m-0 mt-1 flex list-disc flex-col gap-0.5 pl-5">
              {s.fallbacks.map((f) => (
                <li key={f.code ?? f.reason ?? "?"}>
                  {f.reason ?? f.code} {f.code && f.reason && !f.reason.includes(f.code) ? <span className="text-ink-3 font-mono">({f.code})</span> : null} ×{" "}
                  {f.count}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-ink-3 m-0">Nothing fell back to MyOtherApp&apos;s number.</p>
        )}
      </div>
    </FigurePanel>
  );
}
