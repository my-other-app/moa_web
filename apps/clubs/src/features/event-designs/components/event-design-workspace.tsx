"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeftIcon, Loader2Icon, RotateCcwIcon, SaveIcon } from "lucide-react";
import {
  Button,
  InlineAlert,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Tabs,
  TabsList,
  TabsTrigger,
  cn,
} from "@moa/ui";
import { pressable } from "@moa/ui/motion";

import {
  CertificatePreview,
  ColourTab,
  ContentTab,
  LayerEditor,
  LayoutTab,
  TicketPreview,
  certificateConfigSchema,
  defaultCertificateConfig,
  defaultTicketConfig,
  ticketConfigSchema,
  type AnyConfig,
} from "@/features/templates";

import { useRegistrations } from "@/features/registrations";

import { renderDesignPreview } from "../api";
import {
  useDesignSample,
  useEventDesign,
  useResetEventDesign,
  useSaveEventArtwork,
  useSaveEventDesign,
} from "../queries";
import { AUDIENCES, describeSource, type Audience, type DesignKind } from "../schemas";

/**
 * Designing one event's ticket or certificate.
 *
 * The club library at /templates is what an event starts from. This is the
 * event's own design: it opens on whatever the event currently resolves to,
 * and the first save forks a copy onto the event. From then on the club
 * template can be edited without reaching back into an event whose tickets
 * are already in people's hands.
 *
 * Audience tabs exist for the clubs that want a speaker's badge to differ
 * from an attendee's. "Everyone" is the default and the common case -- an
 * event with one design has one design, and the other tabs fall back to it
 * until someone deliberately saves a variant.
 */
export function EventDesignWorkspace({ eventId }: { eventId: number }) {
  const [kind, setKind] = React.useState<DesignKind>("ticket");
  const [audience, setAudience] = React.useState<Audience>("event_default");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <Tabs value={kind} onValueChange={(v) => setKind(v as DesignKind)}>
          <TabsList>
            <TabsTrigger value="ticket">Ticket</TabsTrigger>
            <TabsTrigger value="certificate">Certificate</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-[11px] tracking-[0.08em] uppercase">
            Designing
          </span>
          <Tabs value={audience} onValueChange={(v) => setAudience(v as Audience)}>
            <TabsList>
              {AUDIENCES.map((option) => (
                <TabsTrigger key={option.value} value={option.value}>
                  {option.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        <Button variant="ghost" size="sm" asChild className="ml-auto">
          <Link href={`/events/${eventId}`}>
            <ArrowLeftIcon /> Back to event
          </Link>
        </Button>
      </div>

      {/*
       * Keyed so switching kind or audience remounts the editor. Without it
       * the draft state below would carry a ticket design over to the
       * certificate tab, and the first save would write it there.
       */}
      <DesignEditor
        key={`${kind}-${audience}`}
        eventId={eventId}
        kind={kind}
        audience={audience}
      />
    </div>
  );
}

function DesignEditor({
  eventId,
  kind,
  audience,
}: {
  eventId: number;
  kind: DesignKind;
  audience: Audience;
}) {
  const design = useEventDesign(eventId, kind, audience);
  const save = useSaveEventDesign(eventId, kind, audience);
  const saveArtwork = useSaveEventArtwork(eventId, kind, audience);
  const reset = useResetEventDesign(eventId, kind, audience);

  /*
   * The draft is derived, not synchronised. `edited` holds the organiser's
   * changes and null means "showing what the server has", so a save, a reset
   * or an artwork upload only has to clear it -- there is no effect copying
   * server state into local state, and so no window where the two disagree.
   */
  const [edited, setEdited] = React.useState<AnyConfig | null>(null);

  /*
   * Who the preview is of. Null is the sample attendee; otherwise a real
   * registration on this event, whose actual name, code and QR fill the
   * design -- the only way to know a long real name fits before issuing.
   */
  const [previewTicket, setPreviewTicket] = React.useState<string | null>(null);
  const registrations = useRegistrations({ eventId, offset: 0, limit: 100 });
  const sample = useDesignSample(eventId, kind, previewTicket);

  const parse = React.useCallback(
    (raw: Record<string, unknown>): AnyConfig => {
      if (kind === "ticket") {
        const parsed = ticketConfigSchema.safeParse(raw);
        return (parsed.success ? parsed.data : defaultTicketConfig()) as AnyConfig;
      }
      const parsed = certificateConfigSchema.safeParse(raw);
      return (parsed.success ? parsed.data : defaultCertificateConfig()) as AnyConfig;
    },
    [kind]
  );

  const serverConfig = design.data?.config;
  const serverDraft = React.useMemo(
    () => (serverConfig ? parse(serverConfig) : null),
    [serverConfig, parse]
  );
  const draft = edited ?? serverDraft;

  if (design.isError) {
    return (
      <InlineAlert tone="destructive" title="Could not load this design">
        {design.error instanceof Error
          ? design.error.message
          : "Something went wrong."}
      </InlineAlert>
    );
  }

  // Narrowed on the data rather than on isLoading, so a refetch that has not
  // yet produced a config does not fall through to a null draft.
  if (!design.data || draft === null) {
    return <Skeleton className="h-[36rem] w-full" />;
  }

  const isOwn = design.data.is_own;

  const set = (key: string, value: unknown) => {
    /*
     * A change that changes nothing is ignored, so opening the page does not
     * report unsaved work. The layer editor measures the artwork on mount and
     * reports its size back through here, which would otherwise mark the
     * design dirty before the organiser had touched anything.
     */
    const current = (draft as Record<string, unknown>)[key];
    if (JSON.stringify(current) === JSON.stringify(value)) return;
    setEdited({ ...draft, [key]: value } as AnyConfig);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <InlineAlert
            tone={isOwn ? "success" : "info"}
            title={isOwn ? "This event has its own design" : "Not customised yet"}
          >
            {describeSource(design.data.source)}
          </InlineAlert>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {isOwn ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() =>
                reset.mutate(undefined, { onSuccess: () => setEdited(null) })
              }
              disabled={reset.isPending}
              className={pressable}
            >
              {reset.isPending ? (
                <Loader2Icon className="animate-spin" />
              ) : (
                <RotateCcwIcon />
              )}
              Use club default
            </Button>
          ) : null}

          <Button
            type="button"
            onClick={async () => {
              // No name: the API names a new design after the event it
              // belongs to, which is better than anything guessable here.
              await save.mutateAsync({ config: draft });
              setEdited(null);
            }}
            disabled={save.isPending}
            className={cn("min-w-[11rem]", pressable)}
          >
            {save.isPending ? (
              <Loader2Icon className="animate-spin" />
            ) : (
              <SaveIcon />
            )}
            {save.isPending
              ? "Saving…"
              : isOwn
                ? "Save design"
                : "Save for this event"}
          </Button>
        </div>
      </div>

      {edited !== null ? (
        <p className="text-muted-foreground text-xs">Unsaved changes.</p>
      ) : null}

      <LayerEditor
        kind={kind}
        artworkUrl={draft.background_image_url ?? null}
        canvas={draft.canvas}
        layers={draft.layers}
        bgColor={draft.bg_color}
        palette={[
          { label: "Accent", value: draft.accent_color },
          { label: "Text", value: draft.text_color },
          { label: "Muted", value: draft.secondary_text_color },
          { label: "Border", value: draft.border_color },
        ]}
        onLayersChange={(layers) => set("layers", layers)}
        onCanvasChange={(canvas) => set("canvas", canvas)}
        onBgColorChange={(color) => set("bg_color", color)}
        builtIn={
          kind === "ticket" ? (
            <TicketPreview
              config={draft}
              logoUrl={draft.logo_url ?? null}
              backgroundUrl={draft.background_image_url ?? null}
            />
          ) : (
            <CertificatePreview
              config={draft}
              logoUrl={draft.logo_url ?? null}
              secondaryLogoUrl={draft.secondary_logo_url ?? null}
              backgroundUrl={draft.background_image_url ?? null}
              signature1Url={draft.signature_1_url ?? null}
              signature2Url={draft.signature_2_url ?? null}
            />
          )
        }
        sample={
          sample.data
            ? {
                values: sample.data.values,
                qrDataUrl: sample.data.qr_data_url,
                label: sample.data.registration?.full_name || "the sample attendee",
              }
            : null
        }
        samplePicker={
          <Select
            value={previewTicket ?? "__sample__"}
            onValueChange={(v) => setPreviewTicket(v === "__sample__" ? null : v)}
          >
            <SelectTrigger size="sm" aria-label="Preview as" className="w-[16rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__sample__">Sample attendee</SelectItem>
              {(registrations.data?.items ?? []).map((r) => (
                <SelectItem key={r.id} value={r.ticket_id ?? r.id}>
                  <span className="flex flex-col">
                    <span>{r.full_name || r.name || r.email || r.id}</span>
                    <span className="text-muted-foreground font-mono text-[11px]">
                      {r.ticket_id ?? "no ticket"}
                    </span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
        onRenderPreview={() =>
          renderDesignPreview(eventId, kind, audience, draft, previewTicket)
        }
        onPickArtwork={(file) =>
          saveArtwork.mutate(
            { files: { background_image: file } },
            {
              // The upload rewrites the config server-side, so the local
              // changes are dropped rather than merged -- a merge would keep
              // pointing at the artwork that was just replaced.
              onSuccess: () => setEdited(null),
            }
          )
        }
        onRemoveArtwork={() =>
          saveArtwork.mutate(
            { files: {}, removals: ["background_image"] },
            { onSuccess: () => setEdited(null) }
          )
        }
      />

      {/*
       * The built-in layout, kept but out of the way. It styles the design
       * the renderer falls back to when a design has no layers, which is what
       * every template did before the canvas existed -- so it still matters
       * to the clubs using it, and matters to nobody who has placed a layer.
       */}
      <details className="rounded-xl border">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
          Built-in layout
          <span className="text-muted-foreground ml-2 text-xs font-normal">
            colours, wording and options for the design used when the canvas is
            empty
          </span>
        </summary>
        <div className="border-t p-4">
          <Tabs defaultValue="colors">
            <TabsList>
              <TabsTrigger value="colors">Colours</TabsTrigger>
              <TabsTrigger value="content">Content</TabsTrigger>
              <TabsTrigger value="layout">Layout</TabsTrigger>
            </TabsList>
            <ColourTab kind={kind} c={draft} set={set} />
            <ContentTab kind={kind} c={draft} set={set} />
            <LayoutTab kind={kind} c={draft} set={set} />
          </Tabs>
        </div>
      </details>
    </div>
  );
}
