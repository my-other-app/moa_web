"use client";

import * as React from "react";
import { RotateCcwIcon } from "lucide-react";
import { formatDateTime } from "@moa/app-kit";
import { Button, Input, NativeSelect, Notice, Skeleton, StatusBadge, Switch } from "@moa/ui";

import { useCan } from "@/hooks/use-can";

import { useResetSetting, useSettings, useUpdateSetting } from "../queries";
import { grouped, shownValue, type PlatformSetting } from "../schemas";

function BannerInput({ setting, disabled, onSave }: { setting: PlatformSetting; disabled: boolean; onSave: (value: string) => void }) {
  // Keyed by the saved value (SettingRow): a new value starts the box afresh.
  const [text, setText] = React.useState(String(setting.value ?? ""));
  const changed = text.trim() !== String(setting.value ?? "");
  return (
    <form
      className="flex w-full flex-wrap gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(text.trim());
      }}
    >
      <Input aria-label={setting.label} value={text} maxLength={300} disabled={disabled} onChange={(e) => setText(e.target.value)} className="min-w-[240px] flex-1" />
      {!disabled ? (
        <Button type="submit" size="sm" disabled={!changed}>
          Save
        </Button>
      ) : null}
    </form>
  );
}

function SettingRow({ setting, editable }: { setting: PlatformSetting; editable: boolean }) {
  const update = useUpdateSetting();
  const reset = useResetSetting();
  const busy = update.isPending || reset.isPending;
  const save = (value: unknown) => update.mutate({ key: setting.key, value });

  let control: React.ReactNode;
  if (setting.kind === "bool") {
    control = <Switch aria-label={setting.label} checked={setting.value === true} disabled={!editable || busy} onCheckedChange={(v) => save(v)} />;
  } else if (setting.kind === "choice") {
    control = (
      <NativeSelect aria-label={setting.label} size="sm" className="w-auto" value={String(setting.value ?? "")} disabled={!editable || busy} onChange={(e) => save(e.target.value)}>
        {setting.choices.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </NativeSelect>
    );
  } else {
    control = <BannerInput key={String(setting.value ?? "")} setting={setting} disabled={!editable || busy} onSave={save} />;
  }

  return (
    <li className="border-line-soft flex flex-col gap-2 border-b py-3 last:border-b-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="m-0 flex flex-wrap items-center gap-2 text-sm font-medium">
            {setting.label}
            {setting.overridden ? <StatusBadge tone="info" label="Set here" /> : <StatusBadge label={setting.env ? "Server value" : "Default"} />}
            {setting.restart_required ? <StatusBadge tone="warning" label="Needs a restart" /> : null}
          </p>
          <p className="text-ink-3 m-0 text-xs text-pretty">{setting.help}</p>
          {setting.note ? <p className="text-ink-2 m-0 text-xs text-pretty">{setting.note}</p> : null}
          <p className="text-ink-3 m-0 text-[11px]">
            {setting.env_name ? (
              <>
                <code>{setting.env_name}</code> in the server&apos;s .env: {shownValue(setting.server_value)}
              </>
            ) : (
              <>Default: {shownValue(setting.server_value)}</>
            )}
            {setting.overridden && setting.updated_at ? ` · changed ${formatDateTime(setting.updated_at)}${setting.updated_by?.name ? ` by ${setting.updated_by.name}` : ""}` : ""}
          </p>
        </div>
        {setting.kind !== "text" ? <div className="shrink-0">{control}</div> : null}
      </div>
      {setting.kind === "text" ? control : null}
      {editable && setting.overridden ? (
        <Button size="xs" variant="ghost" className="self-start" disabled={busy} onClick={() => reset.mutate(setting.key)}>
          <RotateCcwIcon /> {setting.env ? "Back to the server's value" : "Back to the default"}
        </Button>
      ) : null}
    </li>
  );
}

export function SettingsPage() {
  const { data, isPending, isError, error } = useSettings();
  const owner = useCan("manage_admins");
  if (isPending) return <Skeleton className="h-96 w-full" />;
  if (isError) return <Notice tone="refuse">{error.message || "Could not load the settings"}</Notice>;
  const editable = owner && data.can_edit;

  return (
    <div className="flex flex-col gap-8">
      {!editable ? <Notice tone="neutral">Only an owner can change these. You can see them.</Notice> : null}
      <Notice tone="accent" tag="How">
        A change applies within {data.refresh_seconds} seconds on every server process, with no restart, and is recorded
        in the activity log. Secrets are not here: they stay in the server&apos;s .env, and changing one needs the backend
        rebuilt and restarted.
      </Notice>
      {grouped(data.settings).map(({ group, rows }) => (
        <section key={group} className="flex flex-col gap-1">
          <h2 className="m-0 text-base">{group}</h2>
          <ul className="m-0 list-none p-0">
            {rows.map((s) => (
              <SettingRow key={s.key} setting={s} editable={editable} />
            ))}
          </ul>
        </section>
      ))}
      <section className="flex flex-col gap-2">
        <h2 className="m-0 text-base">Secrets and keys</h2>
        <p className="text-ink-3 m-0 text-xs">Whether each is set and looks right. Values are never shown.</p>
        {grouped(data.secrets).map(({ group, rows }) => (
          <div key={group} className="flex flex-col gap-1">
            <h3 className="text-ink-2 m-0 text-xs font-semibold tracking-wide uppercase">{group}</h3>
            <ul className="m-0 grid list-none gap-1 p-0 sm:grid-cols-2">
              {rows.map((s) => (
                <li key={s.name} className="bg-sunken flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs">
                  <span className="min-w-0">
                    <code className="block truncate">{s.name}</code>
                    {s.problem ? <span className="text-destructive block">{s.problem}</span> : null}
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    {s.mode ? <StatusBadge tone={s.mode === "live" ? "success" : "warning"} label={s.mode} /> : null}
                    <StatusBadge tone={!s.set ? "default" : s.healthy ? "success" : "destructive"} label={!s.set ? "Not set" : s.healthy ? "Set" : "Check"} />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="m-0 text-base">Recent changes</h2>
        {data.history.length === 0 ? (
          <p className="text-ink-3 m-0 text-sm">Nothing changed here yet.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm">
            {data.history.map((h, i) => {
              const label = data.settings.find((s) => s.key === h.key)?.label ?? h.key;
              return (
                <li key={`${h.at}-${i}`}>
                  <span className="text-ink-3 text-xs">{formatDateTime(h.at)}</span> · {h.actor ?? "An admin"}{" "}
                  {h.action.endsWith("reset") ? "put back" : "set"} <strong>{label}</strong>: {shownValue(h.from)} → {shownValue(h.to)}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
