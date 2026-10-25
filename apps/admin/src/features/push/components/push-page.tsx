"use client";

import * as React from "react";
import { BellIcon, SendIcon } from "lucide-react";
import { formatNumber, pct } from "@moa/app-kit";
import { Button, Input, Label, Notice, Skeleton, StatusBadge, Textarea } from "@moa/ui";

import { useCan } from "@/hooks/use-can";
import { ConfirmAction } from "@/features/ops";

import { useAdoption, useDeviceCount, useFirebaseStatus, useSendToEveryone } from "../queries";
import { BODY_MAX, TITLE_MAX, pushInputSchema, type PushInput } from "../schemas";

function Preview({ title, body, image }: { title: string; body: string; image: string }) {
  return (
    <figure aria-label="Preview" className="bg-sunken m-0 flex max-w-sm gap-3 rounded-2xl p-3 shadow-sm">
      <div className="bg-brand text-brand-foreground grid size-9 shrink-0 place-items-center rounded-xl">
        <BellIcon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-ink-3 m-0 text-[11px]">MyOtherApp · now</p>
        <p className="m-0 truncate text-sm font-semibold">{title || "Title"}</p>
        <p className="text-ink-2 m-0 line-clamp-3 text-sm">{body || "The message"}</p>
        {image ? <p className="text-ink-3 m-0 mt-1 truncate text-[11px]">with a picture</p> : null}
      </div>
    </figure>
  );
}

function Health() {
  const firebase = useFirebaseStatus();
  const adoption = useAdoption();
  return (
    <section className="flex flex-col gap-2">
      <h2 className="m-0 text-base">Push health</h2>
      {firebase.isPending ? (
        <Skeleton className="h-16 w-full" />
      ) : firebase.data ? (
        <Notice tone={firebase.data.firebase_initialized ? "admit" : "refuse"} tag="Firebase">
          {firebase.data.firebase_initialized
            ? `Connected${firebase.data.project_id ? ` to ${firebase.data.project_id}` : ""}.`
            : `Not working: ${firebase.data.error ?? (firebase.data.has_path_config || firebase.data.has_base64_config ? "it would not start" : "no service account is set")}.`}
        </Notice>
      ) : (
        <Notice tone="refuse">Could not ask the server about Firebase.</Notice>
      )}
      {adoption.data ? (
        <Notice tone="neutral" tag="Topics">
          {formatNumber(adoption.data.topic_devices)} of {formatNumber(adoption.data.devices)} devices ({pct(adoption.data.topic_devices, adoption.data.devices)}%)
          subscribe to topics. Push by topic is {adoption.data.push_topics ? "on" : "off"}
          {adoption.data.push_topics ? `, and device-by-device sending is ${adoption.data.push_topics_legacy ? "on" : "off"}` : ""}.
        </Notice>
      ) : null}
    </section>
  );
}

/**
 * A push to every device on the platform: what it says, who gets it (every
 * device -- the count), how it looks, and a confirmation that names the count
 * before anything is sent. Owners only and twice an hour, as the server says;
 * it is in the activity log.
 */
export function PushPage() {
  const canSend = useCan("broadcast");
  const devices = useDeviceCount();
  const send = useSendToEveryone();
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [image, setImage] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [ready, setReady] = React.useState<PushInput | null>(null);
  const count = devices.data ?? 0;

  function review(event: React.FormEvent) {
    event.preventDefault();
    const parsed = pushInputSchema.safeParse({ title, body, image_url: image });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Check the message");
    setError(null);
    setReady(parsed.data);
  }

  return (
    <div className="flex flex-col gap-8">
      {!canSend ? <Notice tone="neutral">Only an owner can push to everyone. You can see the health below.</Notice> : null}
      {canSend ? (
        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
          <form className="flex flex-col gap-4" onSubmit={review}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="push-title">Title</Label>
              <Input id="push-title" maxLength={TITLE_MAX} value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="push-body">Message</Label>
              <Textarea id="push-body" rows={3} maxLength={BODY_MAX} value={body} onChange={(e) => setBody(e.target.value)} />
              <p className="text-ink-3 m-0 text-xs">
                {body.length}/{BODY_MAX}
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="push-image">Picture (optional)</Label>
              <Input id="push-image" placeholder="https://…" value={image} onChange={(e) => setImage(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <p className="m-0 text-sm font-medium">Audience</p>
              <p className="text-ink-2 m-0 flex items-center gap-2 text-sm">
                <StatusBadge tone="info" label="Everyone" />
                {devices.isPending ? "counting devices…" : `${formatNumber(count)} registered devices`}
              </p>
            </div>
            {error ? <Notice tone="refuse">{error}</Notice> : null}
            <Button type="submit" className="self-start" disabled={send.isPending || devices.isPending}>
              <SendIcon /> Review and send
            </Button>
          </form>
          <div className="flex flex-col gap-2">
            <p className="text-ink-3 m-0 text-xs font-medium">Preview</p>
            <Preview title={title} body={body} image={image} />
          </div>
        </section>
      ) : null}
      <Health />
      <ConfirmAction
        open={ready !== null}
        onOpenChange={(open) => (open ? null : setReady(null))}
        title={`Send to ${formatNumber(count)} devices?`}
        description="Every device with the app gets it, at once. It cannot be recalled, only two such pushes are allowed an hour, and it is recorded in the activity log against your name."
        confirmLabel={`Send to ${formatNumber(count)} devices`}
        pending={send.isPending}
        onConfirm={() => {
          if (!ready) return;
          send.mutate(ready, {
            onSuccess: (result) => {
              setReady(null);
              if (result.success) {
                setTitle("");
                setBody("");
                setImage("");
              }
            },
          });
        }}
      >
        {ready ? <Preview title={ready.title} body={ready.body} image={ready.image_url ?? ""} /> : null}
      </ConfirmAction>
    </div>
  );
}
