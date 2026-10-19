"use client";

import * as React from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ExternalLinkIcon, KeyRoundIcon, Loader2Icon, Trash2Icon } from "lucide-react";
import { ApiError } from "@moa/api";
import { formatDateTime, relativeTime } from "@moa/app-kit";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  CardLabel,
  EmptyState,
  FigurePanel,
  NativeSelect,
  Notice,
  Skeleton,
  StatusBadge,
  buttonVariants,
  cn,
  toast,
} from "@moa/ui";

import { useAiGate, useAiKey, useCanManageAiKey, useRemoveAiKey, useSaveAiKey } from "../queries";
import { AI_KEY_INVALID, AI_PROVIDERS, KEY_HELP, PROVIDER_LONG, PROVIDER_SHORT, aiKeyInputSchema, type AiKey, type AiKeyInput, type AiProvider } from "../schemas";

/**
 * "Your own AI key": a club can run AI assist on its own Gemini or Claude
 * account. The server checks the key with the provider before keeping it
 * (422 AI_KEY_INVALID, the provider's reason in the message), and never
 * gives it back: once saved, the page shows its last four characters and
 * nothing else. With a key, AI actions bill the club's own account and
 * leave the plan's monthly count alone; there is no fallback to ours.
 *
 * Only the club's own account and its admins see it (the server answers
 * 403 to anyone else, which hides it too).
 */
export function AiKeyCard() {
  const gate = useAiGate();
  const canManage = useCanManageAiKey();
  const show = gate.visible && canManage;
  const q = useAiKey(show);
  if (!show) return null;
  if (q.isError && q.error instanceof ApiError && q.error.isForbidden) return null;

  return (
    <section id="ai-key" aria-labelledby="ai-key-title" className="flex scroll-mt-4 flex-col gap-3.5">
      <div className="pt-2">
        <h3 id="ai-key-title" className="text-ink m-0 text-[15px] font-semibold tracking-[-0.01em]">
          Your own AI key
        </h3>
        <p className="text-ink-2 m-0 mt-0.5 text-[13px]">Run AI assist on your club&apos;s own Gemini or Claude account</p>
      </div>
      {q.isError ? (
        <EmptyState tone="muted" title="Could not load your AI key" description="Try reloading the page." />
      ) : !q.data ? (
        <div className="grid gap-3.5 lg:grid-cols-[1.4fr_1fr]">
          <Skeleton className="h-[200px] rounded-2xl" />
          <Skeleton className="h-[200px] rounded-2xl" />
        </div>
      ) : (
        <div className="grid items-start gap-3.5 lg:grid-cols-[1.4fr_1fr]">
          {q.data.connected ? <Connected k={q.data} /> : <NotConnected k={q.data} />}
          <Help />
        </div>
      )}
    </section>
  );
}

function NotConnected({ k }: { k: AiKey }) {
  return (
    <FigurePanel className="flex flex-col gap-3 p-4" role="region" aria-label="Connect an AI key">
      <CardLabel right={<StatusBadge label="Not connected" />}>AI key</CardLabel>
      <p className="text-ink-2 m-0 text-[13px] leading-[1.55]">AI assist uses MyOtherApp&apos;s AI and your plan&apos;s monthly AI actions. Connect your own key to use your account instead.</p>
      <KeyForm k={k} />
    </FigurePanel>
  );
}

function When({ iso }: { iso: string }) {
  const [now] = React.useState(() => new Date());
  return (
    <time dateTime={iso} title={formatDateTime(iso)}>
      {relativeTime(iso, now)}
    </time>
  );
}

function Connected({ k }: { k: AiKey }) {
  const remove = useRemoveAiKey();
  const [replacing, setReplacing] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const provider = k.provider ?? "gemini";

  const confirmRemove = () => {
    setConfirming(false);
    remove.mutate(undefined, {
      onSuccess: () => toast.success("Key removed. AI assist uses your plan's AI actions again."),
      onError: (error) => toast.error(error instanceof ApiError && error.message ? error.message : "Could not remove the key. Try again."),
    });
  };

  return (
    <FigurePanel className="flex flex-col gap-3 p-4" role="region" aria-label="Your AI key">
      <CardLabel right={<StatusBadge label="Connected" tone="success" />}>AI key</CardLabel>
      <div className="flex items-start gap-3">
        <span className="bg-admit-soft text-admit grid size-10 shrink-0 place-items-center rounded-xl">
          <KeyRoundIcon className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-ink m-0 text-[16px] font-semibold tracking-[-0.01em]">Using your own {PROVIDER_SHORT[provider]} key</p>
          <p className="text-ink-2 m-0 mt-0.5 text-[12.5px] leading-[1.5]">AI actions bill your {PROVIDER_SHORT[provider]} account and don&apos;t use your plan&apos;s monthly AI actions.</p>
        </div>
      </div>
      <dl className="m-0 grid gap-x-4 gap-y-2 text-[12.5px] sm:grid-cols-[max-content_1fr]">
        <dt className="eyebrow sm:pt-0.5">Provider</dt>
        <dd className="text-ink m-0">{PROVIDER_LONG[provider]}</dd>
        <dt className="eyebrow sm:pt-0.5">Model</dt>
        <dd className="text-ink m-0 font-mono break-all">{k.model ?? "—"}</dd>
        <dt className="eyebrow sm:pt-0.5">Key</dt>
        <dd className="text-ink m-0 font-mono" aria-label={k.key_last4 ? `Ends in ${k.key_last4.split("").join(" ")}` : "Hidden"}>
          {k.key_last4 ? `•••• ${k.key_last4}` : "••••"}
        </dd>
        <dt className="eyebrow sm:pt-0.5">Checked</dt>
        <dd className="text-ink m-0">{k.verified_at ? <When iso={k.verified_at} /> : "Not yet"}</dd>
      </dl>

      {replacing ? (
        <div className="border-line-soft border-t pt-3">
          <p className="text-ink-2 m-0 mb-2.5 text-[12.5px]">Paste the new key. The current one keeps working until the new one is accepted.</p>
          <KeyForm k={k} replacing onDone={() => setReplacing(false)} />
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setReplacing(true)} disabled={remove.isPending}>
            <KeyRoundIcon className="size-3.5" /> Change key or model
          </button>
          <button type="button" className="btn btn-ghost btn-sm text-refuse" onClick={() => setConfirming(true)} disabled={remove.isPending}>
            {remove.isPending ? <Loader2Icon className="size-3.5 animate-spin" /> : <Trash2Icon className="size-3.5" />} Remove key
          </button>
        </div>
      )}

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove your AI key?</AlertDialogTitle>
            <AlertDialogDescription>
              AI assist goes back to MyOtherApp&apos;s AI and your plan&apos;s monthly AI actions. The key stays valid with {PROVIDER_SHORT[provider]}; revoke it there if you no longer need it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction className={cn(buttonVariants({ variant: "destructive" }))} onClick={confirmRemove}>
              Remove key
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </FigurePanel>
  );
}

const field = "input h-10 w-full";

/** Provider, key and model. Connecting has the server check the key with the provider first; its refusal shows here. */
function KeyForm({ k, replacing = false, onDone }: { k: AiKey; replacing?: boolean; onDone?: () => void }) {
  const save = useSaveAiKey();
  const ids = React.useId();
  const initial = (k.provider ?? "gemini") as AiProvider;
  const form = useForm<AiKeyInput>({
    resolver: zodResolver(aiKeyInputSchema),
    defaultValues: { provider: initial, api_key: "", model: (replacing && k.model) || k.models[initial][0] || "" },
  });
  // The two selects are controlled: the model list follows the provider, so both are read here.
  const [provider, model] = useWatch({ control: form.control, name: ["provider", "model"] });
  const models = k.models[provider] ?? [];
  const { errors } = form.formState;
  const [problem, setProblem] = React.useState<string | null>(null);
  const busy = save.isPending || form.formState.isSubmitting;

  const submit = async (values: AiKeyInput) => {
    setProblem(null);
    try {
      await save.mutateAsync(values);
      // The key leaves the page with the save: it is never shown again.
      form.reset({ provider: values.provider, api_key: "", model: values.model });
      toast.success(`Connected. AI assist now runs on your ${PROVIDER_SHORT[values.provider]} key.`);
      onDone?.();
    } catch (error) {
      if (error instanceof ApiError && error.errorCode === AI_KEY_INVALID) setProblem(error.message || `${PROVIDER_SHORT[values.provider]} didn't accept that key.`);
      else if (error instanceof ApiError && error.isForbidden) setProblem("Only the club's owner or an admin can change the AI key.");
      else setProblem(error instanceof Error && error.message ? error.message : "Could not save the key. Try again.");
    }
  };

  return (
    <form onSubmit={form.handleSubmit(submit)} noValidate className="flex flex-col gap-3" aria-label={replacing ? "Change the AI key" : "Connect an AI key"}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${ids}-provider`} className="eyebrow mb-1.5 block">
            Provider
          </label>
          <NativeSelect
            id={`${ids}-provider`}
            className="h-10 w-full"
            disabled={busy}
            value={provider}
            onChange={(e) => {
              const next = e.target.value as AiProvider;
              form.setValue("provider", next);
              // Each provider has its own models: start on its first.
              form.setValue("model", k.models[next]?.[0] ?? "", { shouldValidate: form.formState.isSubmitted });
            }}
          >
            {AI_PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {PROVIDER_LONG[p]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div>
          <label htmlFor={`${ids}-model`} className="eyebrow mb-1.5 block">
            Model
          </label>
          {models.length ? (
            <NativeSelect
              id={`${ids}-model`}
              className="h-10 w-full font-mono"
              disabled={busy}
              value={model}
              onChange={(e) => form.setValue("model", e.target.value, { shouldValidate: form.formState.isSubmitted })}
              aria-invalid={Boolean(errors.model) || undefined}
            >
              {models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </NativeSelect>
          ) : (
            <input
              id={`${ids}-model`}
              className={cn(field, "font-mono")}
              disabled={busy}
              spellCheck={false}
              value={model}
              onChange={(e) => form.setValue("model", e.target.value, { shouldValidate: form.formState.isSubmitted })}
              aria-invalid={Boolean(errors.model) || undefined}
            />
          )}
          {errors.model ? <p className="text-refuse mt-1 text-[12px]">{errors.model.message}</p> : null}
        </div>
      </div>
      <div>
        <label htmlFor={`${ids}-key`} className="eyebrow mb-1.5 block">
          API key
        </label>
        <input
          id={`${ids}-key`}
          type="password"
          autoComplete="off"
          spellCheck={false}
          className={cn(field, "font-mono")}
          placeholder={provider === "anthropic" ? "sk-ant-…" : "AIza…"}
          disabled={busy}
          aria-invalid={Boolean(errors.api_key) || Boolean(problem) || undefined}
          aria-describedby={`${ids}-key-help`}
          {...form.register("api_key")}
        />
        {errors.api_key ? <p className="text-refuse mt-1 text-[12px]">{errors.api_key.message}</p> : null}
        <p id={`${ids}-key-help`} className="text-ink-3 m-0 mt-1 text-[12px]">
          Never shown again once saved: only its last four characters.
        </p>
      </div>

      {problem ? (
        <Notice tone="refuse" tag="Not saved">
          {problem}
        </Notice>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? <Loader2Icon className="size-4 animate-spin" /> : <KeyRoundIcon className="size-4" />} {busy ? `Checking with ${PROVIDER_SHORT[provider]}…` : replacing ? "Save new key" : "Connect"}
        </button>
        {replacing ? (
          <button type="button" className="btn btn-ghost" onClick={onDone} disabled={busy}>
            Keep current key
          </button>
        ) : null}
      </div>
    </form>
  );
}

function Help() {
  return (
    <FigurePanel className="flex flex-col gap-3 p-4" role="region" aria-label="About AI keys">
      <CardLabel>Help</CardLabel>
      <section>
        <h4 className="text-ink m-0 text-[13.5px] font-semibold">Where to get a key</h4>
        <ul className="text-ink-2 m-0 mt-1.5 flex list-disc flex-col gap-1 pl-5 text-[12.5px] leading-[1.5]">
          {AI_PROVIDERS.map((p) => (
            <li key={p}>
              {PROVIDER_LONG[p]}: create one in{" "}
              <a className="text-brand inline-flex items-center gap-0.5 underline-offset-2 hover:underline" href={KEY_HELP[p].href} target="_blank" rel="noopener noreferrer">
                {KEY_HELP[p].where}
                <ExternalLinkIcon className="size-3" aria-hidden="true" />
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
              .
            </li>
          ))}
        </ul>
      </section>
      <section className="border-line-soft border-t pt-3">
        <h4 className="text-ink m-0 text-[13.5px] font-semibold">Who pays</h4>
        <p className="text-ink-2 m-0 mt-1 text-[12.5px] leading-[1.5]">
          With your own key, every AI action bills your account with the provider, and none of them count against your plan&apos;s monthly AI actions. If the key runs out of credit, AI assist stops
          until you top it up or remove the key.
        </p>
      </section>
    </FigurePanel>
  );
}
