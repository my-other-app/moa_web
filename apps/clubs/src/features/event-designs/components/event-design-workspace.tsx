"use client";

import * as React from "react";
import { Loader2Icon, RotateCcwIcon, SaveIcon } from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  InlineAlert,
  Skeleton,
  Tabs,
  TabsContent,
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

import {
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
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={kind} onValueChange={(v) => setKind(v as DesignKind)}>
          <TabsList>
            <TabsTrigger value="ticket">Ticket</TabsTrigger>
            <TabsTrigger value="certificate">Certificate</TabsTrigger>
          </TabsList>
        </Tabs>

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
   * The fetched config is re-parsed through the schema, so a design saved by
   * an older client -- or carrying a since-removed key -- opens with valid
   * defaults rather than a half-empty editor.
   */
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
    return <Skeleton className="h-[32rem] w-full" />;
  }

  const source = design.data.source;
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

  const artworkUrl = draft.background_image_url ?? null;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,460px)_1fr]">
      <div className="space-y-4">
        <InlineAlert
          tone={isOwn ? "success" : "info"}
          title={isOwn ? "This event has its own design" : "Not customised yet"}
        >
          {describeSource(source)}
        </InlineAlert>

        <Tabs defaultValue="artwork">
          <TabsList>
            <TabsTrigger value="artwork">Your artwork</TabsTrigger>
            <TabsTrigger value="colors">Colours</TabsTrigger>
            <TabsTrigger value="content">Content</TabsTrigger>
            <TabsTrigger value="layout">Layout</TabsTrigger>
          </TabsList>

          <ArtworkTab
            kind={kind}
            draft={draft}
            artworkUrl={artworkUrl}
            onLayersChange={(layers) => set("layers", layers)}
            onCanvasChange={(canvas) => set("canvas", canvas)}
            onPickArtwork={(file) =>
              saveArtwork.mutate(
                { files: { background_image: file } },
                {
                  // The upload rewrites the config server-side, so the local
                  // changes are dropped rather than merged -- a merge would
                  // keep pointing at the artwork that was just replaced.
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
            uploading={saveArtwork.isPending}
          />

          <ColourTab kind={kind} c={draft} set={set} />
          <ContentTab kind={kind} c={draft} set={set} />
          <LayoutTab kind={kind} c={draft} set={set} />
        </Tabs>
      </div>

      <div className="lg:sticky lg:top-20 lg:self-start">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Preview</CardTitle>
            <CardDescription>
              {/* Honest about fidelity: the PDF is produced by wkhtmltopdf,
                  so fonts and spacing will differ a little. */}
              An approximation — the final PDF is rendered server-side, so
              spacing and fonts may differ slightly.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {kind === "ticket" ? (
              <TicketPreview
                config={draft}
                logoUrl={draft.logo_url ?? null}
                backgroundUrl={artworkUrl}
              />
            ) : (
              <CertificatePreview
                config={draft}
                logoUrl={draft.logo_url ?? null}
                secondaryLogoUrl={draft.secondary_logo_url ?? null}
                backgroundUrl={artworkUrl}
                signature1Url={draft.signature_1_url ?? null}
                signature2Url={draft.signature_2_url ?? null}
              />
            )}

            <Button
              type="button"
              onClick={async () => {
                // No name: the API names a new design after the event it
                // belongs to, which is better than anything guessable here.
                await save.mutateAsync({ config: draft });
                setEdited(null);
              }}
              disabled={save.isPending}
              className={cn("w-full", pressable)}
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
                  : "Save as this event's design"}
            </Button>

            {edited !== null ? (
              <p className="text-muted-foreground text-center text-xs">
                Unsaved changes.
              </p>
            ) : null}

            {isOwn ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() =>
                  reset.mutate(undefined, { onSuccess: () => setEdited(null) })
                }
                disabled={reset.isPending}
                className={cn("w-full", pressable)}
              >
                {reset.isPending ? (
                  <Loader2Icon className="animate-spin" />
                ) : (
                  <RotateCcwIcon />
                )}
                Use my club&apos;s default instead
              </Button>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/**
 * The artwork tab.
 *
 * Separate from the others because artwork is uploaded immediately rather
 * than saved with the config -- an event's design is forked the moment its
 * artwork changes, and the layer editor needs a URL it can actually draw.
 */
function ArtworkTab({
  kind,
  draft,
  artworkUrl,
  onLayersChange,
  onCanvasChange,
  onPickArtwork,
  onRemoveArtwork,
  uploading,
}: {
  kind: DesignKind;
  draft: AnyConfig;
  artworkUrl: string | null;
  onLayersChange: (layers: AnyConfig["layers"]) => void;
  onCanvasChange: (canvas: AnyConfig["canvas"]) => void;
  onPickArtwork: (file: File) => void;
  onRemoveArtwork: () => void;
  uploading: boolean;
}) {
  return (
    <TabsContent value="artwork">
      <Card>
        <CardContent className="space-y-3">
          {uploading ? (
            <InlineAlert tone="info" title="Uploading artwork">
              This replaces the artwork for this event only.
            </InlineAlert>
          ) : null}
          <LayerEditor
            kind={kind}
            artworkUrl={artworkUrl}
            canvas={draft.canvas}
            layers={draft.layers}
            onLayersChange={onLayersChange}
            onCanvasChange={onCanvasChange}
            onPickArtwork={onPickArtwork}
            onRemoveArtwork={onRemoveArtwork}
          />
        </CardContent>
      </Card>
    </TabsContent>
  );
}
